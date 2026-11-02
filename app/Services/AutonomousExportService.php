<?php

declare(strict_types=1);

namespace UniTest\Services;

use RuntimeException;
use ZipArchive;

/**
 * Автономный нативный плеер (Windows / macOS / Linux) и отдельный веб-пакет.
 */
final class AutonomousExportService
{
    public function __construct(
        private readonly QuizService $quizzes = new QuizService(),
        private readonly PlatformCatalog $platforms = new PlatformCatalog(),
        private readonly ExeQuizEmbedder $embedder = new ExeQuizEmbedder(),
    ) {
    }

    /**
     * @return array{path: string, filename: string, format: string, platforms: list<string>, notes: list<string>, catalog: array}
     */
    public function exportNative(int $quizId, string $platform, ?int $teacherId = null): array
    {
        $platform = strtolower(trim($platform));
        if (!in_array($platform, PlatformCatalog::PLATFORMS, true)) {
            throw new RuntimeException('Неизвестная ОС: укажите windows, macos или linux', 422);
        }

        $quiz = $this->quizzes->get($quizId, $teacherId);
        if ($quiz['content'] === []) {
            throw new RuntimeException('У теста нет сохранённого содержимого');
        }

        $catalog = $this->platforms->describe();
        $binary = $this->platforms->binaryPath($platform);
        $mode = $catalog[$platform]['mode'] ?? 'missing';

        if ($platform === 'macos' && $binary === null && $mode === 'app-zip') {
            return $this->exportMacOsAppZip($quiz, $catalog);
        }

        if ($binary === null) {
            throw new RuntimeException(
                'Автономный плеер для ' . $platform . ' недоступен: нет файла в dist/native/' . $platform . '/. '
                . 'Админ: npm run native:' . $platform . ' или артефакт CI (docs/NATIVE_PLAYER.md)',
                503
            );
        }

        $safeTitle = preg_replace('/[^\p{L}\p{N}\-_]+/u', '_', (string) $quiz['title']) ?: 'quiz';
        $ext = $this->platforms->outputExtension($platform, 'native');
        $filename = $safeTitle . '_' . $platform . $ext;
        $target = sys_get_temp_dir() . DIRECTORY_SEPARATOR
            . 'unitest_native_' . $platform . '_' . $quizId . '_' . bin2hex(random_bytes(4)) . $ext;

        $this->embedder->embed($binary, $this->quizDataJs($quiz), $target);
        if ($platform !== 'windows') {
            @chmod($target, 0755);
        }

        return [
            'path' => $target,
            'filename' => $filename,
            'format' => 'standalone-' . $platform,
            'platforms' => [$platform],
            'notes' => [
                'Один файл для ' . $this->platforms->label($platform) . '. Тест вшит внутрь бинарника (overlay).',
                $platform === 'macos'
                    ? 'На macOS: снять quarantine при необходимости: xattr -cr ./файл'
                    : ($platform === 'linux'
                        ? 'На Linux нужен webkit2gtk (зависимости Tauri). chmod +x уже выставлен.'
                        : 'Нужен WebView2 Runtime (обычно есть в Windows 10/11).'),
            ],
            'catalog' => $catalog,
        ];
    }

    /**
     * macOS без Mach-O: ZIP с .app (веб-плеер + quiz внутри).
     *
     * @param array<string, mixed> $quiz
     * @param array<string, mixed> $catalog
     * @return array{path: string, filename: string, format: string, platforms: list<string>, notes: list<string>, catalog: array}
     */
    private function exportMacOsAppZip(array $quiz, array $catalog): array
    {
        $runtime = $this->resolveStandaloneRuntime();
        $safeTitle = preg_replace('/[^\p{L}\p{N}\-_]+/u', '_', (string) $quiz['title']) ?: 'quiz';
        $filename = $safeTitle . '_macos.zip';
        $target = sys_get_temp_dir() . DIRECTORY_SEPARATOR
            . 'unitest_mac_' . bin2hex(random_bytes(4)) . '.zip';

        $app = 'UniTest.app';
        $res = $app . '/Contents/Resources';
        $mac = $app . '/Contents/MacOS';
        $quizDataJs = $this->quizDataJs($quiz);
        $indexHtml = $this->buildIndexHtml($runtime['hasCss']);
        $launcher = <<<'SH'
#!/bin/bash
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
cd "$DIR"
open "./index.html"
SH;
        $plist = <<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>unitest-player</string>
  <key>CFBundleIdentifier</key><string>local.unitest.player</string>
  <key>CFBundleName</key><string>UniTest</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
</dict></plist>
XML;

        $zip = new ZipArchive();
        if ($zip->open($target, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Не удалось создать macOS .app.zip');
        }
        $zip->addFromString($app . '/Contents/Info.plist', $plist);
        $zip->addFromString($mac . '/unitest-player', $launcher);
        $zip->addFromString($res . '/index.html', $indexHtml);
        $zip->addFromString($res . '/quiz-data.js', $quizDataJs);
        $zip->addFile($runtime['jsPath'], $res . '/player.js');
        if ($runtime['cssPath'] !== null) {
            $zip->addFile($runtime['cssPath'], $res . '/player.css');
        }
        $zip->addFromString(
            'README.txt',
            "UniTest macOS\r\n\r\n1. Распакуйте ZIP\r\n2. При блокировке Gatekeeper: xattr -cr UniTest.app\r\n3. Запустите UniTest.app\r\n"
        );
        $zip->close();

        return [
            'path' => $target,
            'filename' => $filename,
            'format' => 'standalone-macos-app-zip',
            'platforms' => ['macos'],
            'notes' => [
                'macOS .app.zip на базе веб-плеера (нативный Mach-O собирается только на Mac/CI).',
                'После распаковки: xattr -cr UniTest.app при необходимости.',
            ],
            'catalog' => $catalog,
        ];
    }

    /**
     * @return array{path: string, filename: string, format: string, platforms: list<string>, notes: list<string>, catalog: array}
     */
    public function exportWindowsExe(int $quizId, ?int $teacherId = null): array
    {
        return $this->exportNative($quizId, 'windows', $teacherId);
    }

    /**
     * @return array{path: string, filename: string, format: string, platforms: list<string>, notes: list<string>, catalog: array}
     */
    public function exportWebPackage(int $quizId, ?int $teacherId = null): array
    {
        $quiz = $this->quizzes->get($quizId, $teacherId);
        if ($quiz['content'] === []) {
            throw new RuntimeException('У теста нет сохранённого содержимого');
        }

        $runtime = $this->resolveStandaloneRuntime();
        $catalog = $this->platforms->describe();
        $safeTitle = preg_replace('/[^\p{L}\p{N}\-_]+/u', '_', (string) $quiz['title']) ?: 'quiz';
        $filename = $safeTitle . '_web.zip';
        $target = sys_get_temp_dir() . DIRECTORY_SEPARATOR
            . 'unitest_web_' . $quizId . '_' . bin2hex(random_bytes(4)) . '.zip';

        $quizDataJs = $this->quizDataJs($quiz);
        $indexHtml = $this->buildIndexHtml($runtime['hasCss']);

        $zip = new ZipArchive();
        if ($zip->open($target, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Не удалось создать веб-пакет');
        }

        $zip->addFromString('index.html', $indexHtml);
        $zip->addFromString('quiz-data.js', $quizDataJs);
        $zip->addFile($runtime['jsPath'], 'player.js');
        if ($runtime['cssPath'] !== null) {
            $zip->addFile($runtime['cssPath'], 'player.css');
        }
        $zip->addFromString(
            'README.txt',
            "UniTest — веб-пакет\r\n"
            . 'Тест: ' . $quiz['title'] . "\r\n\r\n"
            . "Откройте index.html в браузере (Windows / macOS / Linux).\r\n"
            . "PHP и MySQL не нужны.\r\n"
            . "После прохождения скачайте .result и передайте преподавателю.\r\n"
        );
        $zip->close();

        return [
            'path' => $target,
            'filename' => $filename,
            'format' => 'standalone-web-zip',
            'platforms' => ['web'],
            'notes' => [
                'Кроссплатформенный пакет для браузера.',
                'Для нативного файла используйте «Автономный тест» и выбор ОС.',
            ],
            'catalog' => $catalog,
        ];
    }

    /**
     * @deprecated
     * @return array{path: string, filename: string, format: string, platforms: list<string>, notes: list<string>, catalog: array}
     */
    public function exportEmbedded(int $quizId, ?int $teacherId = null): array
    {
        return $this->exportWindowsExe($quizId, $teacherId);
    }

    /**
     * @param array<string, mixed> $quiz
     */
    private function quizDataJs(array $quiz): string
    {
        $meta = [
            'versionNumber' => $quiz['version_number'],
            'contentHash' => $quiz['content_hash'],
            'exportedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'format' => 'unitest-standalone',
            'schemaVersion' => '1.0',
        ];
        $quizJson = json_encode($quiz['content'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($quizJson === false || $metaJson === false) {
            throw new RuntimeException('Не удалось сериализовать данные теста');
        }

        return "window.__UNITEST_QUIZ__ = {$quizJson};\nwindow.__UNITEST_META__ = {$metaJson};\n";
    }

    /**
     * @return array{jsPath: string, cssPath: ?string, hasCss: bool}
     */
    private function resolveStandaloneRuntime(): array
    {
        $base = dirname(__DIR__, 2);
        $jsPath = $base . '/dist/standalone-runtime/player.js';
        $cssPath = $base . '/dist/standalone-runtime/player.css';

        if (!is_file($jsPath)) {
            throw new RuntimeException(
                'Веб-runtime не собран. Выполните: npm run build:standalone',
                503
            );
        }

        return [
            'jsPath' => $jsPath,
            'cssPath' => is_file($cssPath) ? $cssPath : null,
            'hasCss' => is_file($cssPath),
        ];
    }

    private function buildIndexHtml(bool $hasCss): string
    {
        $cssLink = $hasCss ? '<link rel="stylesheet" href="./player.css">' : '';

        return <<<HTML
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UniTest — веб-тест</title>
  {$cssLink}
</head>
<body>
  <div id="player-app"><p>Загрузка…</p></div>
  <script src="./quiz-data.js"></script>
  <script src="./player.js"></script>
</body>
</html>
HTML;
    }
}
