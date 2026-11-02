<?php

declare(strict_types=1);

namespace UniTest\Tests\Feature;

use PHPUnit\Framework\TestCase;
use UniTest\Support\Database;
use UniTest\Support\Request;

final class QuizApiTest extends TestCase
{
    protected function setUp(): void
    {
        $pdo = Database::connection();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach (['imported_results', 'attempt_answers', 'attempts', 'participants', 'sessions', 'quiz_versions', 'quizzes', 'users'] as $table) {
            $pdo->exec('DELETE FROM ' . $table);
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    }

    public function testQuizCrudSaveAndReopen(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';

        $content = [
            'schemaVersion' => '1.0',
            'id' => 'quiz_api_1',
            'title' => 'API тест',
            'description' => 'Описание',
            'author' => 'Teacher',
            'settings' => ['passThresholdPercent' => 70, 'shuffleQuestions' => true],
            'questions' => [
                [
                    'id' => 'q1',
                    'type' => 'single_choice',
                    'prompt' => '2+2?',
                    'points' => 1,
                    'options' => [
                        ['id' => 'a', 'text' => '4', 'correct' => true],
                        ['id' => 'b', 'text' => '5', 'correct' => false],
                    ],
                ],
                [
                    'id' => 'q2',
                    'type' => 'numeric',
                    'prompt' => 'π',
                    'points' => 1,
                    'correctValue' => 3.14,
                    'tolerance' => 0.01,
                ],
            ],
            'resources' => [],
        ];

        $create = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            json_encode(['content' => $content], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(201, $create->status());
        $created = json_decode($create->content(), true);
        $id = (int) $created['data']['id'];
        $this->assertSame('API тест', $created['data']['title']);
        $this->assertSame(1, $created['data']['version_number']);
        $this->assertCount(2, $created['data']['content']['questions']);

        $content['title'] = 'API тест обновлён';
        $content['questions'][] = [
            'id' => 'q3',
            'type' => 'info',
            'prompt' => 'Инфо',
            'points' => 0,
        ];

        $update = $app->handle(new Request(
            'PUT',
            '/api/v1/quizzes/' . $id,
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            json_encode(['content' => $content], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(200, $update->status());
        $updated = json_decode($update->content(), true);
        $this->assertSame(2, $updated['data']['version_number']);
        $this->assertSame('API тест обновлён', $updated['data']['title']);
        $this->assertCount(3, $updated['data']['content']['questions']);

        $show = $app->handle(new Request(
            'GET',
            '/api/v1/quizzes/' . $id,
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            null,
        ));
        $this->assertSame(200, $show->status());
        $loaded = json_decode($show->content(), true);
        $this->assertSame('API тест обновлён', $loaded['data']['content']['title']);
        $this->assertTrue($loaded['data']['content']['settings']['shuffleQuestions']);
        $this->assertSame('q3', $loaded['data']['content']['questions'][2]['id']);
    }

    public function testExportAndImportRoundtrip(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';

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
        $id = (int) json_decode($create->content(), true)['data']['id'];

        $export = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes/' . $id . '/export',
            [],
            ['HTTP_ACCEPT' => 'application/octet-stream'],
            null,
        ));
        $this->assertSame(200, $export->status());
        $this->assertNotSame('', $export->content());

        $tmp = tempnam(sys_get_temp_dir(), 'quiz') . '.quiz';
        file_put_contents($tmp, $export->content());

        try {
            $service = new \UniTest\Services\QuizService();
            $imported = $service->importFromFile($tmp);
            $this->assertSame('Демонстрационный тест', $imported['title']);
            $this->assertCount(3, $imported['content']['questions']);
        } finally {
            @unlink($tmp);
        }
    }
}
