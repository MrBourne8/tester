<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;

final class QuizService
{
    public function __construct(
        private readonly QuizPackageService $packages = new QuizPackageService(),
        private readonly TeacherContext $teachers = new TeacherContext(),
    ) {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listForTeacher(?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT q.id, q.title, q.description, q.schema_version, q.current_version_id,
                    q.created_at, q.updated_at,
                    v.version_number,
                    JSON_LENGTH(v.content_json, \'$.questions\') AS questions_count
             FROM quizzes q
             LEFT JOIN quiz_versions v ON v.id = q.current_version_id
             WHERE q.owner_id = ?
             ORDER BY q.updated_at DESC'
        );
        $stmt->execute([$teacherId]);

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'title' => $row['title'],
                'description' => $row['description'],
                'schema_version' => $row['schema_version'],
                'current_version_id' => $row['current_version_id'] !== null ? (int) $row['current_version_id'] : null,
                'version_number' => $row['version_number'] !== null ? (int) $row['version_number'] : null,
                'questions_count' => $row['questions_count'] !== null ? (int) $row['questions_count'] : 0,
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    /**
     * @return array<string, mixed>
     */
    public function get(int $id, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT q.*, v.version_number, v.content_json, v.content_hash, v.id AS joined_version_id
             FROM quizzes q
             LEFT JOIN quiz_versions v ON v.id = q.current_version_id
             WHERE q.id = ? AND q.owner_id = ?
             LIMIT 1'
        );
        $stmt->execute([$id, $teacherId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Тест не найден', 404);
        }

        // Если current_version_id сброшен — берём последнюю версию и чиним ссылку
        if (empty($row['content_json'])) {
            $fallback = $pdo->prepare(
                'SELECT id, version_number, content_json, content_hash
                 FROM quiz_versions WHERE quiz_id = ? ORDER BY version_number DESC LIMIT 1'
            );
            $fallback->execute([$id]);
            $latest = $fallback->fetch(PDO::FETCH_ASSOC);
            if ($latest) {
                $row['joined_version_id'] = $latest['id'];
                $row['version_number'] = $latest['version_number'];
                $row['content_json'] = $latest['content_json'];
                $row['content_hash'] = $latest['content_hash'];
                $row['current_version_id'] = $latest['id'];
                $pdo->prepare('UPDATE quizzes SET current_version_id = ? WHERE id = ? AND current_version_id IS NULL')
                    ->execute([(int) $latest['id'], $id]);
            }
        }

        $content = [];
        if (!empty($row['content_json'])) {
            $decoded = json_decode((string) $row['content_json'], true);
            $content = is_array($decoded) ? $decoded : [];
        }

        return [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'schema_version' => $row['schema_version'],
            'current_version_id' => $row['current_version_id'] !== null ? (int) $row['current_version_id'] : null,
            'version_number' => $row['version_number'] !== null ? (int) $row['version_number'] : null,
            'content_hash' => $row['content_hash'] ?? null,
            'content' => $content,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function create(array $payload, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $content = $this->normalizeContent($payload['content'] ?? $payload);
        $this->packages->validateQuizDocument($content);

        $pdo = Database::connection();
        $now = date('Y-m-d H:i:s');

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO quizzes (owner_id, title, description, schema_version, current_version_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, NULL, ?, ?)'
            );
            $stmt->execute([
                $teacherId,
                $content['title'],
                $content['description'] ?? null,
                $content['schemaVersion'] ?? '1.0',
                $now,
                $now,
            ]);
            $quizId = (int) $pdo->lastInsertId();
            $this->insertVersion($pdo, $quizId, $content, 1, $now);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $this->get($quizId, $teacherId);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function update(int $id, array $payload, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $existing = $this->get($id, $teacherId);
        $content = $this->normalizeContent($payload['content'] ?? $payload);
        // Сохраняем стабильный content id, если клиент не прислал
        if (empty($content['id']) && !empty($existing['content']['id'])) {
            $content['id'] = $existing['content']['id'];
        }
        $this->packages->validateQuizDocument($content);

        $pdo = Database::connection();
        $now = date('Y-m-d H:i:s');
        $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(version_number), 0) FROM quiz_versions WHERE quiz_id = ?');
        $maxStmt->execute([$id]);
        $nextVersion = ((int) $maxStmt->fetchColumn()) + 1;

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'UPDATE quizzes SET title = ?, description = ?, schema_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?'
            );
            $stmt->execute([
                $content['title'],
                $content['description'] ?? null,
                $content['schemaVersion'] ?? '1.0',
                $now,
                $id,
                $teacherId,
            ]);
            $this->insertVersion($pdo, $id, $content, $nextVersion, $now);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $this->get($id, $teacherId);
    }

    public function delete(int $id, ?int $teacherId = null): void
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();

        $owned = $pdo->prepare('SELECT id FROM quizzes WHERE id = ? AND owner_id = ?');
        $owned->execute([$id, $teacherId]);
        if (!$owned->fetchColumn()) {
            throw new RuntimeException('Тест не найден', 404);
        }

        $pdo->beginTransaction();
        try {
            $versionIds = $pdo->prepare('SELECT id FROM quiz_versions WHERE quiz_id = ?');
            $versionIds->execute([$id]);
            $ids = array_map('intval', $versionIds->fetchAll(PDO::FETCH_COLUMN) ?: []);

            if ($ids !== []) {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));

                // attempts → attempt_answers / imported_results (CASCADE)
                $pdo->prepare("DELETE FROM attempts WHERE quiz_version_id IN ($placeholders)")
                    ->execute($ids);

                // sessions → participants (CASCADE); attempts.session_id SET NULL уже снесены выше
                $pdo->prepare("DELETE FROM sessions WHERE quiz_version_id IN ($placeholders)")
                    ->execute($ids);
            }

            $pdo->prepare('UPDATE quizzes SET current_version_id = NULL WHERE id = ? AND owner_id = ?')
                ->execute([$id, $teacherId]);

            // quiz_versions CASCADE
            $stmt = $pdo->prepare('DELETE FROM quizzes WHERE id = ? AND owner_id = ?');
            $stmt->execute([$id, $teacherId]);
            if ($stmt->rowCount() === 0) {
                throw new RuntimeException('Тест не найден', 404);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function duplicate(int $id, ?int $teacherId = null): array
    {
        $source = $this->get($id, $teacherId);
        $content = $source['content'];
        $content['id'] = $this->newContentId();
        $content['title'] = ($content['title'] ?? 'Тест') . ' (копия)';
        return $this->create(['content' => $content], $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function importFromFile(string $path, ?int $teacherId = null): array
    {
        $package = $this->packages->loadFromFile($path);
        $content = $package['quiz'];
        if (empty($content['schemaVersion'])) {
            $content['schemaVersion'] = $package['manifest']['schemaVersion'] ?? '1.0';
        }
        return $this->create(['content' => $content], $teacherId);
    }

    public function exportToFile(int $id, string $targetPath, ?int $teacherId = null): string
    {
        $quiz = $this->get($id, $teacherId);
        if ($quiz['content'] === []) {
            throw new RuntimeException('У теста нет сохранённого содержимого');
        }
        return $this->packages->createPackage($quiz['content'], $targetPath);
    }

    /**
     * @param array<string, mixed> $content
     * @return array<string, mixed>
     */
    private function normalizeContent(array $content): array
    {
        if (!isset($content['id']) || !is_string($content['id']) || $content['id'] === '') {
            $content['id'] = $this->newContentId();
        }
        if (!isset($content['schemaVersion'])) {
            $content['schemaVersion'] = '1.0';
        }
        if (!isset($content['questions']) || !is_array($content['questions'])) {
            $content['questions'] = [];
        }
        if (!isset($content['settings']) || !is_array($content['settings'])) {
            $content['settings'] = [];
        }
        if (!isset($content['resources']) || !is_array($content['resources'])) {
            $content['resources'] = [];
        }
        if (!isset($content['questionGroups']) || !is_array($content['questionGroups'])) {
            $content['questionGroups'] = [];
        }
        if (!isset($content['description'])) {
            $content['description'] = '';
        }
        if (!isset($content['author'])) {
            $content['author'] = '';
        }

        return $content;
    }

    /**
     * @param array<string, mixed> $content
     */
    private function insertVersion(PDO $pdo, int $quizId, array $content, int $versionNumber, string $now): void
    {
        $json = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Не удалось сериализовать содержимое теста');
        }
        $hash = hash('sha256', $json);

        $stmt = $pdo->prepare(
            'INSERT INTO quiz_versions (quiz_id, version_number, content_json, content_hash, created_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$quizId, $versionNumber, $json, $hash, $now]);
        $versionId = (int) $pdo->lastInsertId();

        $pdo->prepare('UPDATE quizzes SET current_version_id = ?, updated_at = ? WHERE id = ?')
            ->execute([$versionId, $now, $quizId]);
    }

    private function newContentId(): string
    {
        return 'quiz_' . bin2hex(random_bytes(8));
    }
}
