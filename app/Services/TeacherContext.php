<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use UniTest\Support\Database;

/**
 * Временный контекст преподавателя до полноценной авторизации (Этап 5+).
 * Гарантирует наличие пользователя role=teacher.
 */
final class TeacherContext
{
    public function currentTeacherId(): int
    {
        $pdo = Database::connection();
        $id = $pdo->query("SELECT id FROM users WHERE role = 'teacher' ORDER BY id ASC LIMIT 1")
            ->fetchColumn();

        if ($id !== false) {
            return (int) $id;
        }

        $now = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare(
            'INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            'Преподаватель',
            'teacher@unitest.local',
            password_hash('changeme', PASSWORD_DEFAULT),
            'teacher',
            $now,
            $now,
        ]);

        return (int) $pdo->lastInsertId();
    }
}
