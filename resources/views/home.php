<?php
/** @var string $appName */
/** @var string $appEnv */
/** @var string $phpVersion */

use UniTest\Support\Vite;

$assets = Vite::entry('js/app.js');
$assetCss = $assets['css'];
$assetJs = $assets['js'];
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($appName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></title>
    <?php if ($assetCss): ?>
        <link rel="stylesheet" href="<?= htmlspecialchars($assetCss, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
    <?php endif; ?>
</head>
<body>
<main class="page">
    <header class="hero">
        <p class="brand"><?= htmlspecialchars($appName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></p>
        <h1>Система тестирования</h1>
        <p class="lead">Создание тестов, автономный и сетевой режимы на едином формате .quiz.</p>
        <p style="margin-top:1.15rem">
            <a class="btn-like" href="/editor">Открыть редактор</a>
        </p>
    </header>

    <section class="panel" aria-labelledby="status-title">
        <h2 id="status-title">Состояние</h2>
        <ul class="meta">
            <li>Окружение: <strong><?= htmlspecialchars($appEnv, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong></li>
            <li>PHP: <strong><?= htmlspecialchars($phpVersion, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong></li>
            <li>Проверка: <a href="/api/v1/health"><code>/api/v1/health</code></a></li>
            <li>Редактор: <a href="/editor"><code>/editor</code></a></li>
            <li>Сетевой вход: <a href="/join"><code>/join</code></a></li>
            <li>Отчёты: <a href="/reports"><code>/reports</code></a></li>
        </ul>
        <pre id="health-output" class="health" aria-live="polite">Загрузка…</pre>
    </section>
</main>
<?php if ($assetJs): ?>
    <script type="module" src="<?= htmlspecialchars($assetJs, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"></script>
<?php else: ?>
    <script type="module">
        async function loadHealth() {
            const output = document.getElementById('health-output');
            try {
                const response = await fetch('/api/v1/health', { headers: { Accept: 'application/json' } });
                const data = await response.json();
                output.textContent = JSON.stringify(data, null, 2);
                output.classList.toggle('is-ok', data.status === 'ok');
                output.classList.toggle('is-bad', data.status !== 'ok');
            } catch (error) {
                output.textContent = 'Не удалось получить /api/v1/health: ' + String(error);
                output.classList.add('is-bad');
            }
        }
        loadHealth();
    </script>
<?php endif; ?>
</body>
</html>
