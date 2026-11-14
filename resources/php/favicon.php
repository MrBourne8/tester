<?php
$base = rtrim((string) (\UniTest\Support\Env::get('APP_BASE_PATH', '') ?: ''), '/');
$ico = ($base === '' ? '' : $base) . '/favicon.ico';
$svg = ($base === '' ? '' : $base) . '/favicon.svg';
$apple = ($base === '' ? '' : $base) . '/apple-touch-icon.png';
?>
<link rel="icon" href="<?= htmlspecialchars($ico, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" sizes="any">
<link rel="icon" href="<?= htmlspecialchars($svg, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="<?= htmlspecialchars($apple, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
<link rel="shortcut icon" href="<?= htmlspecialchars($ico, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
