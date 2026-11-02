<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;

final class ReportService
{
    public function __construct(
        private readonly TeacherContext $teachers = new TeacherContext(),
    ) {
    }

    /**
     * @param array<string, mixed> $filters
     * @return list<array<string, mixed>>
     */
    public function listAttempts(array $filters = [], ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();

        $where = ['q.owner_id = ?'];
        $params = [$teacherId];

        if (!empty($filters['quiz_id'])) {
            $where[] = 'q.id = ?';
            $params[] = (int) $filters['quiz_id'];
        }
        if (!empty($filters['from'])) {
            $where[] = 'COALESCE(a.submitted_at, a.created_at) >= ?';
            $params[] = $this->dayStart((string) $filters['from']);
        }
        if (!empty($filters['to'])) {
            $where[] = 'COALESCE(a.submitted_at, a.created_at) <= ?';
            $params[] = $this->dayEnd((string) $filters['to']);
        }
        if (!empty($filters['q'])) {
            $where[] = '(
                p.display_name LIKE ?
                OR JSON_UNQUOTE(JSON_EXTRACT(a.result_payload, \'$.studentName\')) LIKE ?
                OR JSON_UNQUOTE(JSON_EXTRACT(a.attempt_meta, \'$.studentName\')) LIKE ?
                OR q.title LIKE ?
            )';
            $like = '%' . $filters['q'] . '%';
            array_push($params, $like, $like, $like, $like);
        }
        if (($filters['source'] ?? '') === 'network') {
            $where[] = 'a.session_id IS NOT NULL';
        } elseif (($filters['source'] ?? '') === 'import') {
            $where[] = 'EXISTS (SELECT 1 FROM imported_results ir WHERE ir.attempt_id = a.id)';
        } elseif (($filters['source'] ?? '') === 'standalone') {
            $where[] = 'a.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM imported_results ir WHERE ir.attempt_id = a.id)';
        }

        $where[] = "a.status = 'submitted'";

        $sql = 'SELECT a.id, a.status, a.score, a.max_score, a.percentage, a.started_at, a.submitted_at,
                       a.session_id, a.quiz_version_id, a.result_payload, a.attempt_meta,
                       q.id AS quiz_id, q.title AS quiz_title, v.version_number,
                       p.display_name AS participant_name,
                       s.session_code,
                       ir.id AS import_id
                FROM attempts a
                INNER JOIN quiz_versions v ON v.id = a.quiz_version_id
                INNER JOIN quizzes q ON q.id = v.quiz_id
                LEFT JOIN participants p ON p.id = a.participant_id
                LEFT JOIN sessions s ON s.id = a.session_id
                LEFT JOIN imported_results ir ON ir.attempt_id = a.id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY COALESCE(a.submitted_at, a.created_at) DESC, a.id DESC
                LIMIT 500';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return array_map(fn (array $row) => $this->presentListRow($row), $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    /**
     * @return array<string, mixed>
     */
    public function getAttempt(int $attemptId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT a.*, q.id AS quiz_id, q.title AS quiz_title, v.version_number, v.content_hash,
                    p.display_name AS participant_name, s.session_code, ir.source_file_hash, ir.imported_at
             FROM attempts a
             INNER JOIN quiz_versions v ON v.id = a.quiz_version_id
             INNER JOIN quizzes q ON q.id = v.quiz_id
             LEFT JOIN participants p ON p.id = a.participant_id
             LEFT JOIN sessions s ON s.id = a.session_id
             LEFT JOIN imported_results ir ON ir.attempt_id = a.id
             WHERE a.id = ? AND q.owner_id = ?
             LIMIT 1'
        );
        $stmt->execute([$attemptId, $teacherId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Попытка не найдена', 404);
        }

        $answersStmt = $pdo->prepare(
            'SELECT question_id, answer_json, awarded_score, is_correct, answered_at
             FROM attempt_answers WHERE attempt_id = ? ORDER BY id ASC'
        );
        $answersStmt->execute([$attemptId]);
        $answers = [];
        foreach ($answersStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $answer) {
            $answers[] = [
                'question_id' => $answer['question_id'],
                'answer' => json_decode((string) $answer['answer_json'], true),
                'awarded_score' => $answer['awarded_score'] !== null ? (float) $answer['awarded_score'] : null,
                'is_correct' => $answer['is_correct'] === null ? null : ((int) $answer['is_correct'] === 1),
                'answered_at' => $answer['answered_at'],
            ];
        }

        $payload = $this->decodeJson($row['result_payload'] ?? null);
        $meta = $this->decodeJson($row['attempt_meta'] ?? null);

        return [
            'id' => (int) $row['id'],
            'status' => $row['status'],
            'source' => $this->resolveSource($row),
            'quiz_id' => (int) $row['quiz_id'],
            'quiz_title' => $row['quiz_title'],
            'version_number' => (int) $row['version_number'],
            'content_hash' => $row['content_hash'],
            'session_id' => $row['session_id'] !== null ? (int) $row['session_id'] : null,
            'session_code' => $row['session_code'],
            'student_name' => $this->studentName($row, $payload, $meta),
            'score' => $row['score'] !== null ? (float) $row['score'] : null,
            'max_score' => $row['max_score'] !== null ? (float) $row['max_score'] : null,
            'percentage' => $row['percentage'] !== null ? (float) $row['percentage'] : null,
            'grade' => $payload['grade'] ?? null,
            'stats' => $payload['stats'] ?? null,
            'passed' => $payload['passed'] ?? null,
            'started_at' => $row['started_at'],
            'submitted_at' => $row['submitted_at'],
            'imported_at' => $row['imported_at'] ?? null,
            'source_file_hash' => $row['source_file_hash'] ?? null,
            'result_payload' => $payload,
            'answers' => $answers,
            'per_question' => $payload['perQuestion'] ?? [],
        ];
    }

    /**
     * @param array<string, mixed> $filters
     */
    public function exportCsv(array $filters = [], ?int $teacherId = null): string
    {
        $rows = $this->listAttempts($filters, $teacherId);
        $fh = fopen('php://temp', 'r+');
        if ($fh === false) {
            throw new RuntimeException('Не удалось создать CSV', 500);
        }

        // Excel-friendly UTF-8 BOM
        fwrite($fh, "\xEF\xBB\xBF");
        fputcsv($fh, [
            'ID', 'Источник', 'Тест', 'Версия', 'Ученик', 'Баллы', 'Макс', '%', 'Оценка',
            'Статус', 'Код сессии', 'Начало', 'Сдача',
        ], ';');

        foreach ($rows as $row) {
            fputcsv($fh, [
                $row['id'],
                $row['source'],
                $row['quiz_title'],
                $row['version_number'],
                $row['student_name'],
                $row['score'],
                $row['max_score'],
                $row['percentage'],
                $row['grade_label'],
                $row['status'],
                $row['session_code'],
                $row['started_at'],
                $row['submitted_at'],
            ], ';');
        }

        rewind($fh);
        $csv = stream_get_contents($fh) ?: '';
        fclose($fh);

        return $csv;
    }

    /**
     * @return list<array{id: int, title: string}>
     */
    public function quizzesForFilter(?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, title FROM quizzes WHERE owner_id = ? ORDER BY title ASC'
        );
        $stmt->execute([$teacherId]);

        return array_map(static fn (array $row) => [
            'id' => (int) $row['id'],
            'title' => (string) $row['title'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    /**
     * Сводка по вопросам: доля верных ответов по сданным попыткам.
     *
     * @param array<string, mixed> $filters
     * @return array{attempts_count: int, questions: list<array<string, mixed>>}
     */
    public function questionStats(array $filters = [], ?int $teacherId = null): array
    {
        $attempts = $this->listAttempts($filters, $teacherId);
        $attemptIds = array_map(static fn (array $row) => (int) $row['id'], $attempts);
        if ($attemptIds === []) {
            return ['attempts_count' => 0, 'questions' => []];
        }

        $pdo = Database::connection();
        $placeholders = implode(',', array_fill(0, count($attemptIds), '?'));
        $stmt = $pdo->prepare(
            "SELECT question_id,
                    COUNT(*) AS answers_count,
                    SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                    SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS incorrect_count,
                    SUM(CASE WHEN is_correct IS NULL THEN 1 ELSE 0 END) AS unknown_count,
                    AVG(awarded_score) AS avg_score
             FROM attempt_answers
             WHERE attempt_id IN ({$placeholders})
             GROUP BY question_id
             ORDER BY question_id ASC"
        );
        $stmt->execute($attemptIds);
        $questions = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $total = (int) $row['answers_count'];
            $correct = (int) $row['correct_count'];
            $questions[] = [
                'question_id' => (string) $row['question_id'],
                'answers_count' => $total,
                'correct_count' => $correct,
                'incorrect_count' => (int) $row['incorrect_count'],
                'unknown_count' => (int) $row['unknown_count'],
                'correct_percent' => $total > 0 ? round(($correct / $total) * 100, 1) : null,
                'avg_score' => $row['avg_score'] !== null ? round((float) $row['avg_score'], 2) : null,
            ];
        }

        return [
            'attempts_count' => count($attemptIds),
            'questions' => $questions,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function presentListRow(array $row): array
    {
        $payload = $this->decodeJson($row['result_payload'] ?? null);
        $meta = $this->decodeJson($row['attempt_meta'] ?? null);

        return [
            'id' => (int) $row['id'],
            'status' => $row['status'],
            'source' => $this->resolveSource($row),
            'quiz_id' => (int) $row['quiz_id'],
            'quiz_title' => $row['quiz_title'],
            'version_number' => (int) $row['version_number'],
            'student_name' => $this->studentName($row, $payload, $meta),
            'score' => $row['score'] !== null ? (float) $row['score'] : null,
            'max_score' => $row['max_score'] !== null ? (float) $row['max_score'] : null,
            'percentage' => $row['percentage'] !== null ? (float) $row['percentage'] : null,
            'grade_label' => is_array($payload['grade'] ?? null) ? ($payload['grade']['label'] ?? null) : null,
            'session_id' => $row['session_id'] !== null ? (int) $row['session_id'] : null,
            'session_code' => $row['session_code'],
            'started_at' => $row['started_at'],
            'submitted_at' => $row['submitted_at'],
            'imported' => !empty($row['import_id']),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $meta
     */
    private function studentName(array $row, array $payload, array $meta): string
    {
        if (!empty($row['participant_name'])) {
            return (string) $row['participant_name'];
        }
        if (!empty($payload['studentName'])) {
            return (string) $payload['studentName'];
        }
        if (!empty($meta['studentName'])) {
            return (string) $meta['studentName'];
        }

        return '—';
    }

    /**
     * @param array<string, mixed> $row
     */
    private function resolveSource(array $row): string
    {
        if (!empty($row['import_id']) || !empty($row['source_file_hash']) || !empty($row['imported_at'])) {
            return 'import';
        }
        if (!empty($row['session_id'])) {
            return 'network';
        }

        return 'standalone';
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJson(mixed $value): array
    {
        if (!is_string($value) || $value === '') {
            return [];
        }
        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function dayStart(string $date): string
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date . ' 00:00:00' : $date;
    }

    private function dayEnd(string $date): string
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date . ' 23:59:59' : $date;
    }
}
