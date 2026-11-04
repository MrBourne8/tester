<?php
/** @var string $appName */
/** @var string|null $assetJs */
/** @var string|null $assetCss */
/** @var int|null $quizId */
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Плеер — <?= htmlspecialchars($appName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></title>
    <?php require __DIR__ . '/../php/favicon.php'; ?>
    <?php if ($assetCss): ?>
        <link rel="stylesheet" href="<?= htmlspecialchars($assetCss, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
    <?php endif; ?>
</head>
<body>
<div
    id="player-app"
    data-quiz-id="<?= $quizId !== null ? (int) $quizId : '' ?>"
>
    <p class="muted" style="padding:1rem;color:#5b6b63">Загрузка плеера…</p>
</div>
<?php if ($assetJs): ?>
    <script type="module" src="<?= htmlspecialchars($assetJs, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"></script>
<?php else: ?>
    <p style="padding:1rem;color:#9b2c2c">Сборка плеера не найдена. Выполните <code>npm run build</code>.</p>
<?php endif; ?>
</body>
</html>
