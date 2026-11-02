<?php

declare(strict_types=1);

use UniTest\Support\Database;
use UniTest\Support\Migrator;

$app = require dirname(__DIR__) . '/bootstrap/app.php';

$migrator = new Migrator(
    Database::connection(),
    $app->basePath . '/database/migrations',
);

$pending = $migrator->pending();
if ($pending === []) {
    fwrite(STDOUT, "Нет ожидающих миграций.\n");
    exit(0);
}

fwrite(STDOUT, 'Найдено миграций: ' . count($pending) . PHP_EOL);
$applied = $migrator->run();
foreach ($applied as $name) {
    fwrite(STDOUT, "  ✓ {$name}\n");
}
fwrite(STDOUT, "Готово.\n");
