<?php
/** @var string $appName */
/** @var string|null $assetJs */
/** @var string|null $assetCss */
/** @var string $code */
/** @var string $slug */
$slug = $slug ?? '';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?= $slug !== '' ? 'Прохождение' : 'Подключение' ?> — <?= htmlspecialchars($appName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></title>
    <?php require __DIR__ . '/../php/favicon.php'; ?>
    <?php if ($assetCss): ?>
        <link rel="stylesheet" href="<?= htmlspecialchars($assetCss, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
    <?php endif; ?>
</head>
<body>
<div
    id="join-app"
    data-code="<?= htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"
    data-slug="<?= htmlspecialchars($slug, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"
>
    <p class="muted">Загрузка…</p>
</div>
<?php if ($assetJs): ?>
    <script type="module" src="<?= htmlspecialchars($assetJs, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"></script>
<?php else: ?>
    <p class="error" style="padding:1rem">Сборка frontend не найдена. Выполните <code>npm run build</code>.</p>
<?php endif; ?>
</body>
</html>
