<?php

declare(strict_types=1);

namespace UniTest\Services;

/**
 * Какие нативные плееры опубликованы для автономного экспорта.
 */
final class PlatformCatalog
{
    public const PLATFORMS = ['windows', 'macos', 'linux'];

    /**
     * @return array{
     *   host_os: string,
     *   web: array{available: bool, note: string},
     *   windows: array{available: bool, binary: ?string, note: string, label: string},
     *   macos: array{available: bool, binary: ?string, note: string, label: string},
     *   linux: array{available: bool, binary: ?string, note: string, label: string},
     *   autonomous: list<array{id: string, label: string, available: bool, note: string}>,
     *   build_hosts: array<string, string>
     * }
     */
    public function describe(): array
    {
        $webOk = is_file(dirname(__DIR__, 2) . '/dist/standalone-runtime/player.js');
        $platforms = [];
        foreach (self::PLATFORMS as $id) {
            $binary = $this->binaryPath($id);
            // macOS: на Windows-сервере Tauri .app не собрать — доступен .app.zip на базе веб-плеера.
            $available = $binary !== null || ($id === 'macos' && $webOk && $this->macosAppTemplatePublished());
            $mode = $binary !== null ? 'native' : ($id === 'macos' && $available ? 'app-zip' : 'missing');
            $platforms[$id] = [
                'available' => $available,
                'binary' => $binary,
                'mode' => $mode,
                'exe' => $id === 'windows' ? $binary : null,
                'label' => $this->label($id, $mode),
                'note' => match ($mode) {
                    'native' => 'Базовый плеер найден — один файл со вшитым тестом',
                    'app-zip' => 'macOS .app.zip (веб-плеер в оболочке .app). Нативный Mach-O — с Mac/CI',
                    default => 'Нет dist/native/' . $id . '/. Админ: npm run native:' . $id . ' (docs/NATIVE_PLAYER.md)',
                },
            ];
        }

        $autonomous = [];
        foreach (self::PLATFORMS as $id) {
            $autonomous[] = [
                'id' => $id,
                'label' => $platforms[$id]['label'],
                'available' => $platforms[$id]['available'],
                'note' => $platforms[$id]['note'],
                'mode' => $platforms[$id]['mode'],
            ];
        }

        return [
            'host_os' => PHP_OS_FAMILY,
            'web' => [
                'available' => $webOk,
                'note' => 'ZIP с index.html — браузер на Windows, macOS и Linux',
            ],
            'windows' => $platforms['windows'],
            'macos' => $platforms['macos'],
            'linux' => $platforms['linux'],
            'autonomous' => $autonomous,
            'build_hosts' => [
                'windows' => 'Windows + MSVC + WebView2 → npm run native:windows',
                'macos' => 'npm run native:macos:publish (шаблон .app) или CI macos-latest для Mach-O',
                'linux' => 'npm run native:linux:docker (на Windows) или native:linux на Linux/CI',
            ],
        ];
    }

    public function macosAppTemplatePublished(): bool
    {
        $base = dirname(__DIR__, 2) . '/dist/native/macos';
        return is_file($base . '/manifest.json') || is_file($base . '/unitest-player');
    }

    public function binaryPath(string $platform): ?string
    {
        $platform = strtolower($platform);
        if (!in_array($platform, self::PLATFORMS, true)) {
            return null;
        }

        $envKey = match ($platform) {
            'windows' => 'UNITEST_TAURI_EXE',
            'macos' => 'UNITEST_TAURI_MACOS',
            'linux' => 'UNITEST_TAURI_LINUX',
        };
        $env = getenv($envKey);
        if (is_string($env) && $env !== '' && is_file($env)) {
            return $env;
        }

        $base = dirname(__DIR__, 2);
        $name = $platform === 'windows' ? 'unitest-player.exe' : 'unitest-player';
        $candidates = [
            $base . '/dist/native/' . $platform . '/' . $name,
            $base . '/src-tauri/target/release/' . $name,
        ];
        foreach ($candidates as $path) {
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    /** @deprecated */
    public function windowsExePath(): ?string
    {
        return $this->binaryPath('windows');
    }

    public function label(string $platform, string $mode = 'native'): string
    {
        return match ($platform) {
            'windows' => 'Windows (.exe)',
            'macos' => $mode === 'app-zip' ? 'macOS (.app.zip)' : 'macOS',
            'linux' => 'Linux',
            default => $platform,
        };
    }

    public function outputExtension(string $platform, string $mode = 'native'): string
    {
        if ($platform === 'windows') {
            return '.exe';
        }
        if ($platform === 'macos' && $mode === 'app-zip') {
            return '.zip';
        }

        return '';
    }
}
