<?php

declare(strict_types=1);

namespace UniTest\Tests\Feature;

use PHPUnit\Framework\TestCase;
use UniTest\Services\ResultChecksum;
use UniTest\Support\Database;
use UniTest\Support\Request;

final class ReportsImportTest extends TestCase
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

    public function testImportResultAndListInReports(): void
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';

        $content = [
            'schemaVersion' => '1.0',
            'id' => 'report_quiz_1',
            'title' => 'Тест для отчётов',
            'description' => '',
            'author' => 'Teacher',
            'settings' => ['passThresholdPercent' => 50],
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

        $create = $app->handle(new Request(
            'POST',
            '/api/v1/quizzes',
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            json_encode(['content' => $content], JSON_UNESCAPED_UNICODE),
        ));
        $this->assertSame(201, $create->status());
        $quiz = json_decode($create->content(), true)['data'];
        $contentHash = $quiz['content_hash'];

        $checksum = new ResultChecksum();
        $payload = [
            'format' => 'unitest-result',
            'schemaVersion' => '1.0',
            'checksumAlgorithm' => 'sha256',
            'quizId' => 'report_quiz_1',
            'quizTitle' => 'Тест для отчётов',
            'quizVersionNumber' => 1,
            'contentHash' => $contentHash,
            'attemptId' => 'attempt_report_1',
            'studentName' => 'Мария',
            'startedAt' => '2026-10-26T08:00:00.000Z',
            'submittedAt' => '2026-10-26T08:10:00.000Z',
            'seed' => 7,
            'questionOrder' => ['q1'],
            'optionOrder' => [],
            'answers' => ['q1' => ['optionId' => 'a']],
            'score' => 1,
            'maxScore' => 1,
            'percentage' => 100,
            'passed' => true,
            'passThresholdPercent' => 50,
            'durationSeconds' => 600,
            'grade' => ['label' => '5', 'minPercent' => 90, 'color' => '#0f6b4c'],
            'stats' => ['correct' => 1, 'incorrect' => 0, 'partial' => 0, 'skipped' => 0, 'info' => 0],
            'engineVersion' => '1.0.0',
            'scoringVersion' => '1.0.0',
            'perQuestion' => [[
                'questionId' => 'q1',
                'type' => 'single_choice',
                'awarded' => 1,
                'max' => 1,
                'isCorrect' => true,
            ]],
        ];
        $payload['checksum'] = $checksum->checksum($payload);
        $raw = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $tmp = tempnam(sys_get_temp_dir(), 'unitest_result_');
        file_put_contents($tmp, $raw);

        $_FILES['file'] = [
            'name' => 'maria.result',
            'type' => 'application/json',
            'tmp_name' => $tmp,
            'error' => UPLOAD_ERR_OK,
            'size' => strlen($raw),
        ];

        $import = $app->handle(new Request(
            'POST',
            '/api/v1/results/import',
            [],
            ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'multipart/form-data'],
            null,
        ));
        unset($_FILES['file']);
        @unlink($tmp);

        $this->assertSame(201, $import->status(), $import->content());
        $imported = json_decode($import->content(), true)['data'];
        $this->assertSame('Мария', $imported['student_name']);
        $attemptId = (int) $imported['attempt_id'];

        // Anti-duplicate
        $tmp2 = tempnam(sys_get_temp_dir(), 'unitest_result_');
        file_put_contents($tmp2, $raw);
        $_FILES['file'] = [
            'name' => 'maria.result',
            'type' => 'application/json',
            'tmp_name' => $tmp2,
            'error' => UPLOAD_ERR_OK,
            'size' => strlen($raw),
        ];
        $dup = $app->handle(new Request(
            'POST',
            '/api/v1/results/import',
            [],
            ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'multipart/form-data'],
            null,
        ));
        unset($_FILES['file']);
        @unlink($tmp2);
        $this->assertSame(409, $dup->status());

        $list = $app->handle(new Request(
            'GET',
            '/api/v1/reports/attempts',
            ['source' => 'import', 'q' => 'Мария'],
            ['HTTP_ACCEPT' => 'application/json'],
            null,
        ));
        $this->assertSame(200, $list->status());
        $rows = json_decode($list->content(), true)['data']['attempts'];
        $this->assertCount(1, $rows);
        $this->assertSame('import', $rows[0]['source']);
        $this->assertSame($attemptId, $rows[0]['id']);

        $show = $app->handle(new Request(
            'GET',
            '/api/v1/reports/attempts/' . $attemptId,
            [],
            ['HTTP_ACCEPT' => 'application/json'],
            null,
        ));
        $this->assertSame(200, $show->status());
        $detail = json_decode($show->content(), true)['data'];
        $this->assertSame('Мария', $detail['student_name']);
        $this->assertSame('5', $detail['grade']['label']);

        $csv = $app->handle(new Request(
            'GET',
            '/api/v1/reports/export.csv',
            ['source' => 'import'],
            ['HTTP_ACCEPT' => 'text/csv'],
            null,
        ));
        $this->assertSame(200, $csv->status());
        $this->assertStringContainsString('Мария', $csv->content());
        $this->assertStringContainsString('Тест для отчётов', $csv->content());
    }
}
