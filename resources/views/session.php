<?php
/** @var string $appName */
/** @var string|null $assetJs */
/** @var string|null $assetCss */
/** @var int|null $sessionId */
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Сессия — <?= htmlspecialchars($appName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></title>
    <?php if ($assetCss): ?>
        <link rel="stylesheet" href="<?= htmlspecialchars($assetCss, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
    <?php endif; ?>
</head>
<body>
<div id="session-app" data-session-id="<?= $sessionId !== null ? (int) $sessionId : '' ?>">
    <p class="muted">Загрузка панели сессии…</p>
</div>
<?php if ($assetJs): ?>
    <script type="module" src="<?= htmlspecialchars($assetJs, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"></script>
<?php else: ?>
    <p class="error" style="padding:1rem">Сборка frontend не найдена. Выполните <code>npm run build</code>.</p>
<?php endif; ?>
</body>
</html>
