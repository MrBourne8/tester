<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Services\QuizPackageService;
use ZipArchive;

final class QuizPackageServiceTest extends TestCase
{
    private string $tempFile;

    protected function setUp(): void
    {
        $this->tempFile = tempnam(sys_get_temp_dir(), 'quiz') . '.quiz';
    }

    protected function tearDown(): void
    {
        if (is_file($this->tempFile)) {
            unlink($this->tempFile);
        }
    }

    public function testLoadsValidQuizPackage(): void
    {
        $quiz = [
            'schemaVersion' => '1.0',
            'id' => 'q-1',
            'title' => 'Тест',
            'questions' => [
                [
                    'id' => 'q1',
                    'type' => 'single_choice',
                    'prompt' => '?',
                    'options' => [
                        ['id' => 'a', 'text' => '1', 'correct' => true],
                        ['id' => 'b', 'text' => '2', 'correct' => false],
                    ],
                ],
            ],
        ];
        $manifest = [
            'schemaVersion' => '1.0',
            'format' => 'unitest-quiz',
            'quizId' => 'q-1',
            'title' => 'Тест',
            'contentFile' => 'quiz.json',
            'engineMinVersion' => '1.0.0',
            'scoringVersion' => '1.0.0',
        ];

        $quizJson = json_encode($quiz, JSON_UNESCAPED_UNICODE);
        $manifestJson = json_encode($manifest, JSON_UNESCAPED_UNICODE);
        $checksums = [
            'algorithm' => 'sha256',
            'files' => [
                'manifest.json' => hash('sha256', $manifestJson),
                'quiz.json' => hash('sha256', $quizJson),
            ],
        ];

        $zip = new ZipArchive();
        $this->assertTrue($zip->open($this->tempFile, ZipArchive::CREATE | ZipArchive::OVERWRITE));
        $zip->addFromString('manifest.json', $manifestJson);
        $zip->addFromString('quiz.json', $quizJson);
        $zip->addFromString('checksums.json', json_encode($checksums));
        $zip->close();

        $service = new QuizPackageService();
        $loaded = $service->loadFromFile($this->tempFile);

        $this->assertSame('q-1', $loaded['manifest']['quizId']);
        $this->assertSame('Тест', $loaded['quiz']['title']);
        $this->assertCount(1, $loaded['quiz']['questions']);
    }

    public function testRejectsPathTraversal(): void
    {
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($this->tempFile, ZipArchive::CREATE | ZipArchive::OVERWRITE));
        $zip->addFromString('../evil.txt', 'nope');
        $zip->addFromString('manifest.json', json_encode([
            'schemaVersion' => '1.0',
            'format' => 'unitest-quiz',
            'quizId' => 'x',
            'title' => 'x',
            'contentFile' => 'quiz.json',
        ]));
        $zip->addFromString('quiz.json', json_encode([
            'id' => 'x',
            'title' => 'x',
            'questions' => [],
        ]));
        $zip->close();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Небезопасный путь');
        (new QuizPackageService())->loadFromFile($this->tempFile);
    }
}
