<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;

final class ResultImportService
{
    public function __construct(
        private readonly TeacherContext $teachers = new TeacherContext(),
        private readonly ResultChecksum $checksum = new ResultChecksum(),
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function importFile(string $path, ?string $originalName = null, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        if (!is_file($path)) {
            throw new RuntimeException('Файл не найден', 422);
        }

        $raw = (string) file_get_contents($path);
        if ($raw === '') {
            throw new RuntimeException('Пустой файл результата', 422);
        }

        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            throw new RuntimeException('Файл .result должен быть JSON-объектом', 422);
        }

        return $this->importPayload($payload, $raw, $teacherId, $originalName);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function importPayload(
        array $payload,
        ?string $rawForHash = null,
        ?int $teacherId = null,
        ?string $originalName = null,
    ): array {
        $teacherId ??= $this->teachers->currentTeacherId();
        $this->checksum->verify($payload);

        $sourceHash = hash('sha256', $rawForHash ?? $this->checksum->canonicalJson($payload));
        $pdo = Database::connection();

        $dup = $pdo->prepare(
            'SELECT attempt_id FROM imported_results WHERE teacher_id = ? AND source_file_hash = ? LIMIT 1'
        );
        $dup->execute([$teacherId, $sourceHash]);
        $existingAttemptId = $dup->fetchColumn();
        if ($existingAttemptId !== false) {
            throw new RuntimeException(
                'Этот файл уже импортирован (попытка #' . (int) $existingAttemptId . ')',
                409
            );
        }

        $version = $this->resolveQuizVersion($pdo, $payload, $teacherId);
        $now = date('Y-m-d H:i:s');
        $startedAt = $this->toMysqlDatetime($payload['startedAt'] ?? null) ?? $now;
        $submittedAt = $this->toMysqlDatetime($payload['submittedAt'] ?? null) ?? $now;

        $resultPayload = array_merge($payload, [
            'mode' => 'imported',
            'importedAt' => date('c'),
            'originalFileName' => $originalName,
            'sourceFileHash' => $sourceHash,
        ]);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO attempts (
                    quiz_version_id, session_id, participant_id, attempt_token_hash, attempt_meta,
                    status, started_at, submitted_at, score, max_score, percentage, result_payload, created_at
                 ) VALUES (?, NULL, NULL, NULL, ?, \'submitted\', ?, ?, ?, ?, ?, ?, ?)'
            );
            $meta = json_encode([
                'seed' => $payload['seed'] ?? null,
                'questionOrder' => $payload['questionOrder'] ?? [],
                'optionOrder' => $payload['optionOrder'] ?? [],
                'attemptIdExternal' => $payload['attemptId'] ?? null,
                'studentName' => $payload['studentName'] ?? null,
            ], JSON_UNESCAPED_UNICODE);

            $stmt->execute([
                (int) $version['id'],
                $meta,
                $startedAt,
                $submittedAt,
                isset($payload['score']) ? (float) $payload['score'] : null,
                isset($payload['maxScore']) ? (float) $payload['maxScore'] : null,
                isset($payload['percentage']) ? (float) $payload['percentage'] : null,
                json_encode($resultPayload, JSON_UNESCAPED_UNICODE),
                $now,
            ]);
            $attemptId = (int) $pdo->lastInsertId();

            $answers = is_array($payload['answers'] ?? null) ? $payload['answers'] : [];
            $perQuestion = [];
            foreach ($payload['perQuestion'] ?? [] as $item) {
                if (is_array($item) && isset($item['questionId'])) {
                    $perQuestion[(string) $item['questionId']] = $item;
                }
            }

            $upsert = $pdo->prepare(
                'INSERT INTO attempt_answers (attempt_id, question_id, answer_json, awarded_score, is_correct, answered_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE answer_json = VALUES(answer_json), awarded_score = VALUES(awarded_score),
                    is_correct = VALUES(is_correct), answered_at = VALUES(answered_at)'
            );

            foreach ($answers as $questionId => $answer) {
                $qid = (string) $questionId;
                $detail = $perQuestion[$qid] ?? null;
                $isCorrect = null;
                $awarded = null;
                if (is_array($detail)) {
                    $awarded = isset($detail['awarded']) ? (float) $detail['awarded'] : null;
                    if (array_key_exists('isCorrect', $detail)) {
                        $isCorrect = $detail['isCorrect'] === null ? null : ($detail['isCorrect'] ? 1 : 0);
                    }
                }
                $upsert->execute([
                    $attemptId,
                    $qid,
                    json_encode($answer, JSON_UNESCAPED_UNICODE),
                    $awarded,
                    $isCorrect,
                    $submittedAt,
                ]);
            }

            $pdo->prepare(
                'INSERT INTO imported_results (teacher_id, source_file_hash, attempt_id, imported_at)
                 VALUES (?, ?, ?, ?)'
            )->execute([$teacherId, $sourceHash, $attemptId, $now]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return [
            'attempt_id' => $attemptId,
            'source_file_hash' => $sourceHash,
            'quiz_version_id' => (int) $version['id'],
            'quiz_title' => $version['title'],
            'student_name' => $payload['studentName'] ?? null,
            'score' => isset($payload['score']) ? (float) $payload['score'] : null,
            'percentage' => isset($payload['percentage']) ? (float) $payload['percentage'] : null,
            'imported_at' => $now,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{id: int, title: string}
     */
    private function resolveQuizVersion(PDO $pdo, array $payload, int $teacherId): array
    {
        $contentHash = isset($payload['contentHash']) ? (string) $payload['contentHash'] : '';
        if ($contentHash !== '') {
            $stmt = $pdo->prepare(
                'SELECT v.id, q.title
                 FROM quiz_versions v
                 INNER JOIN quizzes q ON q.id = v.quiz_id
                 WHERE v.content_hash = ? AND q.owner_id = ?
                 ORDER BY v.id DESC
                 LIMIT 1'
            );
            $stmt->execute([$contentHash, $teacherId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return ['id' => (int) $row['id'], 'title' => (string) $row['title']];
            }
        }

        $quizContentId = (string) ($payload['quizId'] ?? '');
        if ($quizContentId !== '') {
            $stmt = $pdo->prepare(
                'SELECT v.id, q.title
                 FROM quiz_versions v
                 INNER JOIN quizzes q ON q.id = v.quiz_id
                 WHERE q.owner_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(v.content_json, \'$.id\')) = ?
                 ORDER BY v.version_number DESC
                 LIMIT 1'
            );
            $stmt->execute([$teacherId, $quizContentId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return ['id' => (int) $row['id'], 'title' => (string) $row['title']];
            }
        }

        throw new RuntimeException(
            'Не найден тест преподавателя для этого результата. Сначала импортируйте или сохраните соответствующий .quiz.',
            422
        );
    }

    private function toMysqlDatetime(mixed $iso): ?string
    {
        if (!is_string($iso) || trim($iso) === '') {
            return null;
        }
        try {
            $dt = new \DateTimeImmutable($iso);

            return $dt->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return null;
        }
    }
}
