<?php

declare(strict_types=1);

namespace UniTest\Support;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $host = (string) Env::get('DB_HOST', '127.0.0.1');
        $port = (string) Env::get('DB_PORT', '3306');
        $database = (string) Env::get('DB_DATABASE', 'unitest');
        $username = (string) Env::get('DB_USERNAME', 'root');
        $password = (string) Env::get('DB_PASSWORD', '');

        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $database);

        try {
            self::$pdo = new PDO($dsn, $username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            throw new RuntimeException('Не удалось подключиться к MySQL: ' . $e->getMessage(), 0, $e);
        }

        return self::$pdo;
    }

    public static function reset(): void
    {
        self::$pdo = null;
    }

    public static function ping(): array
    {
        $started = microtime(true);
        $pdo = self::connection();
        $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
        $elapsedMs = round((microtime(true) - $started) * 1000, 2);

        return [
            'ok' => true,
            'version' => $version,
            'latency_ms' => $elapsedMs,
        ];
    }
}
