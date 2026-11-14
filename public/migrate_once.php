<?php

declare(strict_types=1);

/**
 * Одноразовый запуск миграций из браузера (хостинг без SSH).
 * После успеха УДАЛИТЕ этот файл с сервера.
 *
 * URL: https://testoria.../migrate_once.php?key=ВАШ_КЛЮЧ
 * Ключ: MIGRATE_KEY в .env (или тот же, что SPO_SSO_SECRET).
 */

use UniTest\Support\Database;
use UniTest\Support\Env;
use UniTest\Support\Migrator;

header('Content-Type: text/plain; charset=utf-8');

$app = require dirname(__DIR__) . '/bootstrap/app.php';

$key = (string) ($_GET['key'] ?? '');
$expected = trim((string) Env::get('MIGRATE_KEY', ''));
if ($expected === '') {
    $expected = trim((string) Env::get('SPO_SSO_SECRET', ''));
}
if ($expected === '') {
    $file = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.spo_testoria_sso_secret';
    if (is_file($file)) {
        $expected = trim((string) file_get_contents($file));
    }
}

if ($expected === '' || $key === '' || !hash_equals($expected, $key)) {
    http_response_code(403);
    echo "Forbidden. Add MIGRATE_KEY to .env and open ?key=...\n";
    exit;
}

try {
    $migrator = new Migrator(
        Database::connection(),
        $app->basePath . '/database/migrations',
    );
    $pending = $migrator->pending();
    if ($pending === []) {
        echo "Нет ожидающих миграций.\n";
        echo "Удалите public/migrate_once.php с сервера.\n";
        exit;
    }

    echo 'Найдено миграций: ' . count($pending) . "\n";
    $applied = $migrator->run();
    foreach ($applied as $name) {
        echo '  OK ' . $name . "\n";
    }
    echo "Готово.\n";
    echo "УДАЛИТЕ файл public/migrate_once.php с сервера.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo 'Ошибка: ' . $e->getMessage() . "\n";
}
