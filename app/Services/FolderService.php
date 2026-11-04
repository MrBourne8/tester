<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;

final class FolderService
{
    public function __construct(
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
            'SELECT f.id, f.name, f.sort_order, f.created_at, f.updated_at,
                    COUNT(q.id) AS quizzes_count
             FROM quiz_folders f
             LEFT JOIN quizzes q ON q.folder_id = f.id AND q.owner_id = f.owner_id
             WHERE f.owner_id = ?
             GROUP BY f.id, f.name, f.sort_order, f.created_at, f.updated_at
             ORDER BY f.sort_order ASC, f.name ASC, f.id ASC'
        );
        $stmt->execute([$teacherId]);

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'sort_order' => (int) $row['sort_order'],
                'quizzes_count' => (int) $row['quizzes_count'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    /**
     * @return array<string, mixed>
     */
    public function create(string $name, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $name = $this->normalizeName($name);
        $pdo = Database::connection();
        $now = date('Y-m-d H:i:s');
        $sortStmt = $pdo->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quiz_folders WHERE owner_id = ?'
        );
        $sortStmt->execute([$teacherId]);
        $sort = (int) $sortStmt->fetchColumn();

        $stmt = $pdo->prepare(
            'INSERT INTO quiz_folders (owner_id, name, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$teacherId, $name, $sort, $now, $now]);

        return $this->get((int) $pdo->lastInsertId(), $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function update(int $id, string $name, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $this->requireOwned($id, $teacherId);
        $name = $this->normalizeName($name);
        $pdo = Database::connection();
        $pdo->prepare('UPDATE quiz_folders SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$name, date('Y-m-d H:i:s'), $id, $teacherId]);

        return $this->get($id, $teacherId);
    }

    public function delete(int $id, ?int $teacherId = null): void
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $this->requireOwned($id, $teacherId);
        $pdo = Database::connection();
        $pdo->prepare('UPDATE quizzes SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?')
            ->execute([$id, $teacherId]);
        $pdo->prepare('DELETE FROM quiz_folders WHERE id = ? AND owner_id = ?')
            ->execute([$id, $teacherId]);
    }

    /**
     * @return array<string, mixed>
     */
    public function get(int $id, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT f.id, f.name, f.sort_order, f.created_at, f.updated_at,
                    (SELECT COUNT(*) FROM quizzes q WHERE q.folder_id = f.id) AS quizzes_count
             FROM quiz_folders f
             WHERE f.id = ? AND f.owner_id = ?
             LIMIT 1'
        );
        $stmt->execute([$id, $teacherId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Папка не найдена', 404);
        }

        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'sort_order' => (int) $row['sort_order'],
            'quizzes_count' => (int) $row['quizzes_count'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }

    public function assertOwned(?int $folderId, int $teacherId): void
    {
        if ($folderId === null) {
            return;
        }
        $this->requireOwned($folderId, $teacherId);
    }

    private function requireOwned(int $id, int $teacherId): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id FROM quiz_folders WHERE id = ? AND owner_id = ? LIMIT 1');
        $stmt->execute([$id, $teacherId]);
        if (!$stmt->fetchColumn()) {
            throw new RuntimeException('Папка не найдена', 404);
        }
    }

    private function normalizeName(string $name): string
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
        if ($name === '' || mb_strlen($name) > 120) {
            throw new RuntimeException('Название папки: 1–120 символов', 422);
        }
        return $name;
    }
}
