<?php

declare(strict_types=1);

namespace UniTest\Support;

final class Vite
{
    /**
     * @return array{js: ?string, css: ?string}
     */
    public static function entry(string $entryKey): array
    {
        $base = dirname(__DIR__, 2);
        $manifestPath = $base . '/public/build/.vite/manifest.json';
        if (!is_file($manifestPath)) {
            $manifestPath = $base . '/public/build/manifest.json';
        }

        $js = null;
        $css = null;

        if (!is_file($manifestPath)) {
            return ['js' => null, 'css' => null];
        }

        $manifest = json_decode((string) file_get_contents($manifestPath), true) ?: [];
        $candidates = [
            $entryKey,
            'resources/' . $entryKey,
        ];

        // keyed by rollup input name fallbacks
        if ($entryKey === 'js/app.js') {
            $candidates[] = 'app';
        }
        if ($entryKey === 'js/editor/main.js' || $entryKey === 'js/editor.js') {
            $candidates[] = 'js/editor/main.js';
            $candidates[] = 'editor/main.js';
            $candidates[] = 'editor';
        }
        if ($entryKey === 'js/player/main.js' || $entryKey === 'js/player.js') {
            $candidates[] = 'js/player/main.js';
            $candidates[] = 'player/main.js';
            $candidates[] = 'player';
        }

        $entry = null;
        foreach ($candidates as $key) {
            if (isset($manifest[$key]) && is_array($manifest[$key])) {
                $entry = $manifest[$key];
                break;
            }
        }

        // last resort: search by src ending
        if ($entry === null) {
            foreach ($manifest as $item) {
                if (!is_array($item) || empty($item['isEntry'])) {
                    continue;
                }
                $src = (string) ($item['src'] ?? '');
                if ($src !== '' && str_ends_with(str_replace('\\', '/', $src), basename(str_replace('\\', '/', $entryKey)))) {
                    // prefer exact path match when possible
                    if (str_contains(str_replace('\\', '/', $src), str_replace('\\', '/', $entryKey))
                        || basename($src) === basename($entryKey)) {
                        $entry = $item;
                        if (str_contains($src, 'editor') === str_contains($entryKey, 'editor')) {
                            break;
                        }
                    }
                }
            }
        }

        if (is_array($entry)) {
            if (isset($entry['file'])) {
                $js = '/build/' . $entry['file'];
            }
            if (isset($entry['css'][0])) {
                $css = '/build/' . $entry['css'][0];
            }
        }

        return ['js' => $js, 'css' => $css];
    }
}
