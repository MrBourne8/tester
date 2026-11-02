<?php

declare(strict_types=1);

namespace UniTest\Support;

use PDO;

final class Migrator
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly string $migrationsPath,
    ) {
    }

    public function ensureMigrationsTable(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS migrations (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                migration VARCHAR(255) NOT NULL,
                applied_at DATETIME NOT NULL,
                UNIQUE KEY migrations_migration_unique (migration)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    /**
     * @return list<string>
     */
    public function pending(): array
    {
        $this->ensureMigrationsTable();
        $applied = $this->pdo->query('SELECT migration FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        $applied = array_map('strval', $applied ?: []);

        $files = glob($this->migrationsPath . '/*.php') ?: [];
        sort($files);

        $pending = [];
        foreach ($files as $file) {
            $name = basename($file);
            if (!in_array($name, $applied, true)) {
                $pending[] = $file;
            }
        }

        return $pending;
    }

    /**
     * @return list<string>
     */
    public function run(): array
    {
        $appliedNow = [];

        foreach ($this->pending() as $file) {
            $migration = require $file;
            if (!is_object($migration) || !method_exists($migration, 'up')) {
                throw new \RuntimeException('Миграция должна возвращать объект с методом up(): ' . basename($file));
            }

            // MySQL DDL делает неявный COMMIT — транзакции вокруг CREATE TABLE ненадёжны.
            $migration->up($this->pdo);
            $stmt = $this->pdo->prepare('INSERT INTO migrations (migration, applied_at) VALUES (?, ?)');
            $stmt->execute([basename($file), date('Y-m-d H:i:s')]);
            $appliedNow[] = basename($file);
        }

        return $appliedNow;
    }
}
