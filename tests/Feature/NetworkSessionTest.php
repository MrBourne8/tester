<?php

declare(strict_types=1);

namespace UniTest\Tests\Feature;

use PHPUnit\Framework\TestCase;
use UniTest\Support\Database;
use UniTest\Support\Request;

final class NetworkSessionTest extends TestCase
{
    protected function setUp(): void
    {
        $pdo = Database::connection();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach ([
            'imported_results', 'attempt_answers', 'attempts', 'participants',
            'sessions', 'quiz_versions', 'quizzes', 'users',
        ] as $table) {
            $pdo->exec('DELETE FROM ' . $table);
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    }

    public function testSessionJoinAttemptSubmitFlow(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';

        $content = [
            'schemaVersion' => '1.0',
            'id' => 'net_quiz_1',
            'title' => 'Сетевой тест',
            'description' => '',
            'author' => 'Teacher',
            'settings' => [
                'passThresholdPercent' => 50,
                'showScore' => true,
                'showCorrectAnswers' => true,
                'shuffleQuestions' => false,
            ],
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
            ],
            'resources' => [],
        ];

        $createQuiz = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            json_encode(['content' => $content], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(201, $createQuiz->status());
        $quizId = (int) json_decode($createQuiz->content(), true)['data']['id'];

        $createSession = $app->handle(new Request(
            'POST',
            '/api/v1/sessions',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            json_encode(['quiz_id' => $quizId], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(201, $createSession->status());
        $session = json_decode($createSession->content(), true)['data'];
        $this->assertSame('open', $session['status']);
        $this->assertNotEmpty($session['session_code']);
        $this->assertNotEmpty($session['join_urls']);

        $join = $app->handle(new Request(
            'POST',
            '/api/v1/join',
            [],
            ['HTTP_ACCEPT' => 'application/json', 'REMOTE_ADDR' => '127.0.0.1'],
            json_encode([
                'code' => $session['session_code'],
                'display_name' => 'Ученик 1',
            ], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(201, $join->status());
        $joined = json_decode($join->content(), true)['data'];
        $token = $joined['participantToken'];
        $this->assertNotEmpty($token);

        $startBlocked = $app->handle(new Request(
            'POST',
            '/api/v1/attempts/start',
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
            ],
            '{}',
        ));
        $this->assertSame(403, $startBlocked->status());

        $startSession = $app->handle(new Request(
            'POST',
            '/api/v1/sessions/' . $session['id'] . '/start',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            '{}',
        ));
        $this->assertSame(200, $startSession->status());
        $this->assertSame('running', json_decode($startSession->content(), true)['data']['status']);

        $participantView = $app->handle(new Request(
            'GET',
            '/api/v1/participant/session',
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
            ],
            null,
        ));
        $this->assertSame(200, $participantView->status());
        $view = json_decode($participantView->content(), true)['data'];
        $this->assertNotNull($view['quiz']);
        $this->assertArrayNotHasKey('correct', $view['quiz']['questions'][0]['options'][0]);

        $startAttempt = $app->handle(new Request(
            'POST',
            '/api/v1/attempts/start',
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
            ],
            '{}',
        ));
        $this->assertSame(201, $startAttempt->status());
        $attemptId = (int) json_decode($startAttempt->content(), true)['data']['id'];

        $save = $app->handle(new Request(
            'POST',
            '/api/v1/attempts/' . $attemptId . '/answers',
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
            ],
            json_encode(['answers' => ['q1' => ['optionId' => 'a']]], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(200, $save->status());

        // Idempotent overwrite
        $save2 = $app->handle(new Request(
            'POST',
            '/api/v1/attempts/' . $attemptId . '/answers',
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
            ],
            json_encode(['answers' => ['q1' => ['optionId' => 'a']]], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(200, $save2->status());

        $submit = $app->handle(new Request(
            'POST',
            '/api/v1/attempts/' . $attemptId . '/submit',
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
            ],
            '{}',
        ));
        $this->assertSame(200, $submit->status());
        $result = json_decode($submit->content(), true)['data']['attempt'];
        $this->assertEquals(1, $result['score']);
        $this->assertEquals(100, $result['percentage']);
        $this->assertTrue($result['passed']);

        $results = $app->handle(new Request(
            'GET',
            '/api/v1/sessions/' . $session['id'] . '/results',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            null,
        ));
        $this->assertSame(200, $results->status());
        $rows = json_decode($results->content(), true)['data'];
        $this->assertCount(1, $rows);
        $this->assertSame('Ученик 1', $rows[0]['display_name']);
        $this->assertEquals(100, $rows[0]['percentage']);

        $live = $app->handle(new Request(
            'GET',
            '/api/v1/sessions/' . $session['id'] . '/participants/' . $joined['participant']['id'] . '/live',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            null,
        ));
        $this->assertSame(200, $live->status());
        $monitor = json_decode($live->content(), true)['data'];
        $this->assertSame('Ученик 1', $monitor['participant']['display_name']);
        $this->assertSame('correct', $monitor['questions'][0]['status']);
        $this->assertSame('4', $monitor['questions'][0]['given']);
    }
}
