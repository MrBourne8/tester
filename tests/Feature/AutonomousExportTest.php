<?php

declare(strict_types=1);

namespace UniTest\Tests\Feature;

use PHPUnit\Framework\TestCase;
use UniTest\Support\Database;
use UniTest\Support\Request;
use ZipArchive;

final class AutonomousExportTest extends TestCase
{
    protected function setUp(): void
    {
        $runtime = dirname(__DIR__, 2) . '/dist/standalone-runtime/player.js';
        if (!is_file($runtime)) {
            $this->markTestSkipped('Сначала выполните npm run build:standalone');
        }

        $pdo = Database::connection();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach (['imported_results', 'attempt_answers', 'attempts', 'participants', 'sessions', 'quiz_versions', 'quizzes', 'users'] as $table) {
            $pdo->exec('DELETE FROM ' . $table);
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    }

    public function testWebExportIsBrowserZipOnly(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';
        $id = $this->createSampleQuiz($app);

        $export = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes/' . $id . '/export-web',
            [],
            ['HTTP_ACCEPT' => 'application/zip'],
            null,
        ));
        $this->assertSame(200, $export->status());
        $this->assertSame('standalone-web-zip', $export->headers()['X-UniTest-Export-Format'] ?? null);

        $tmp = tempnam(sys_get_temp_dir(), 'web') . '.zip';
        file_put_contents($tmp, $export->content());
        try {
            $zip = new ZipArchive();
            $this->assertTrue($zip->open($tmp));
            $this->assertNotFalse($zip->locateName('index.html'));
            $this->assertNotFalse($zip->locateName('player.js'));
            $this->assertNotFalse($zip->locateName('quiz-data.js'));
            $this->assertFalse($zip->locateName('windows/unitest-player.exe'));
            $quizData = $zip->getFromName('quiz-data.js');
            $this->assertIsString($quizData);
            $this->assertStringContainsString('__UNITEST_QUIZ__', $quizData);
            $zip->close();
        } finally {
            @unlink($tmp);
        }
    }

    public function testStandaloneExportIsWindowsExeOnly(): void
    {
        $exe = dirname(__DIR__, 2) . '/dist/native/windows/unitest-player.exe';
        if (!is_file($exe)) {
            $exe = dirname(__DIR__, 2) . '/src-tauri/target/release/unitest-player.exe';
        }
        if (!is_file($exe)) {
            $this->markTestSkipped('Нет unitest-player.exe — npm run native:windows');
        }

        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';
        $id = $this->createSampleQuiz($app);

        $export = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes/' . $id . '/export-standalone',
            ['platform' => 'windows'],
            ['HTTP_ACCEPT' => 'application/octet-stream'],
            null,
        ));
        $this->assertSame(200, $export->status());
        $this->assertSame('standalone-windows', $export->headers()['X-UniTest-Export-Format'] ?? null);

        $bin = $export->content();
        $this->assertStringContainsString('UNITSTQ1', $bin);
        $this->assertStringContainsString('__UNITEST_QUIZ__', $bin);
        $this->assertStringContainsString('Демонстрационный тест', $bin);
    }

    /**
     * @param object $app
     */
    private function createSampleQuiz($app): int
    {
        $content = json_decode(
            (string) file_get_contents(dirname(__DIR__, 2) . '/fixtures/sample-quiz.json'),
            true,
        );
        $create = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            json_encode(['content' => $content], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(201, $create->status());

        return (int) json_decode($create->content(), true)['data']['id'];
    }
}
