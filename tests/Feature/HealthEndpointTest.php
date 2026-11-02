<?php

declare(strict_types=1);

namespace UniTest\Tests\Feature;

use PHPUnit\Framework\TestCase;
use UniTest\Support\Request;

final class HealthEndpointTest extends TestCase
{
    public function testHealthEndpointReturnsJsonStatus(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';

        $request = new Request(
            method: 'GET',
            path: '/api/v1/health',
            query: [],
            server: ['HTTP_ACCEPT' => 'application/json'],
            rawBody: null,
        );

        $response = $app->handle($request);
        $payload = json_decode($response->content(), true);

        $this->assertSame(200, $response->status());
        $this->assertIsArray($payload);
        $this->assertSame('ok', $payload['status']);
        $this->assertTrue($payload['checks']['app']['ok']);
        $this->assertTrue($payload['checks']['database']['ok']);
        $this->assertTrue($payload['checks']['extensions']['ok']);
    }

    public function testHomePageRenders(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';

        $request = new Request(
            method: 'GET',
            path: '/',
            query: [],
            server: [],
            rawBody: null,
        );

        $response = $app->handle($request);

        $this->assertSame(200, $response->status());
        $this->assertStringContainsString('UniTest', $response->content());
        $this->assertStringContainsString('/api/v1/health', $response->content());
    }
}
