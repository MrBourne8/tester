<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Support\Database;
use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class HealthController extends Controller
{
    public function __invoke(Request $request, array $params = []): Response
    {
        $checks = [
            'app' => [
                'ok' => true,
                'name' => (string) Env::get('APP_NAME', 'Тестория'),
                'env' => (string) Env::get('APP_ENV', 'local'),
                'php' => PHP_VERSION,
            ],
            'database' => $this->databaseCheck(),
            'extensions' => $this->extensionsCheck(),
        ];

        $ok = $checks['database']['ok'] && $checks['extensions']['ok'];

        return Response::json([
            'status' => $ok ? 'ok' : 'degraded',
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'checks' => $checks,
        ], $ok ? 200 : 503);
    }

    private function databaseCheck(): array
    {
        try {
            $ping = Database::ping();
            return [
                'ok' => true,
                'driver' => 'mysql',
                'version' => $ping['version'],
                'latency_ms' => $ping['latency_ms'],
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    private function extensionsCheck(): array
    {
        $required = ['pdo_mysql', 'mbstring', 'openssl', 'zip', 'json', 'fileinfo'];
        $missing = [];

        foreach ($required as $ext) {
            if (!extension_loaded($ext)) {
                $missing[] = $ext;
            }
        }

        return [
            'ok' => $missing === [],
            'required' => $required,
            'missing' => $missing,
        ];
    }
}
