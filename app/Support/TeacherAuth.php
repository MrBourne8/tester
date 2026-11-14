<?php

declare(strict_types=1);

namespace UniTest\Support;

use UniTest\Services\SpoSsoService;

/**
 * Требование входа преподавателя через СПО-ПРОГРЕСС.
 */
final class TeacherAuth
{
    public static function spoLaunchUrl(): string
    {
        $base = rtrim(trim((string) Env::get('SPO_BASE_URL', '')), '/');
        if ($base === '') {
            return '';
        }

        return $base . '/teacher/testoria.php';
    }

    public static function isPublicPath(string $path): bool
    {
        if ($path === '/sso/spo' || $path === '/api/v1/health') {
            return true;
        }

        $prefixes = [
            '/p/',
            '/join',
            '/player',
            '/api/v1/p/',
            '/api/v1/join',
            '/api/v1/participant/',
            '/api/v1/attempts/',
        ];

        foreach ($prefixes as $prefix) {
            if ($path === rtrim($prefix, '/') || str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public static function requireTeacher(Request $request): ?Response
    {
        if (self::isPublicPath($request->path)) {
            return null;
        }

        $sso = new SpoSsoService();
        if ($sso->currentTeacherId() !== null) {
            return null;
        }

        $launch = self::spoLaunchUrl();
        if ($launch !== '') {
            if ($request->wantsJson() || str_starts_with($request->path, '/api/')) {
                return Response::json([
                    'error' => [
                        'code' => 'unauthorized',
                        'message' => 'Войдите через СПО-ПРОГРЕСС',
                        'login_url' => $launch,
                    ],
                ], 401);
            }

            return Response::redirect($launch);
        }

        if ($request->wantsJson() || str_starts_with($request->path, '/api/')) {
            return Response::json([
                'error' => [
                    'code' => 'unauthorized',
                    'message' => 'Задайте SPO_BASE_URL в .env и войдите через СПО-ПРОГРЕСС',
                ],
            ], 401);
        }

        return Response::html(
            '<h1>Нужен вход через СПО-ПРОГРЕСС</h1>'
            . '<p>Откройте Тесторию из панели преподавателя или задайте SPO_BASE_URL в .env.</p>',
            401
        );
    }
}
