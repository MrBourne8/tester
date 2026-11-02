<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Services\QuizPackageService;

final class QuizPackageCreateTest extends TestCase
{
    public function testCreatePackageRoundtrip(): void
    {
        $quiz = [
            'schemaVersion' => '1.0',
            'id' => 'pack-1',
            'title' => 'Пакет',
            'questions' => [
                [
                    'id' => 'q1',
                    'type' => 'text',
                    'prompt' => 'Столица',
                    'acceptedAnswers' => ['Москва'],
                ],
            ],
        ];

        $path = sys_get_temp_dir() . '/unitest_create_' . bin2hex(random_bytes(3)) . '.quiz';
        $service = new QuizPackageService();
        $service->createPackage($quiz, $path);

        try {
            $loaded = $service->loadFromFile($path);
            $this->assertSame('pack-1', $loaded['manifest']['quizId']);
            $this->assertSame('Пакет', $loaded['quiz']['title']);
            $this->assertNotEmpty($loaded['checksums']['files']);
        } finally {
            @unlink($path);
        }
    }

    public function testCreatePackageEmbedsImageResources(): void
    {
        $png = base64_encode("\x89PNG\r\n\x1a\nunitest-test-bytes");
        $quiz = [
            'schemaVersion' => '1.0',
            'id' => 'pack-img',
            'title' => 'С картинкой',
            'resources' => [
                [
                    'id' => 'res1',
                    'path' => 'resources/images/res1.png',
                    'mime' => 'image/png',
                    'dataBase64' => $png,
                ],
            ],
            'questions' => [
                [
                    'id' => 'q1',
                    'type' => 'image',
                    'prompt' => 'Что на рисунке?',
                    'imageResourceId' => 'res1',
                    'innerQuestion' => [
                        'id' => 'q1i',
                        'type' => 'text',
                        'prompt' => 'Ответ',
                        'acceptedAnswers' => ['кот'],
                    ],
                ],
            ],
        ];

        $path = sys_get_temp_dir() . '/unitest_img_' . bin2hex(random_bytes(3)) . '.quiz';
        $service = new QuizPackageService();
        $service->createPackage($quiz, $path);

        try {
            $zip = new \ZipArchive();
            $this->assertTrue($zip->open($path));
            $this->assertNotFalse($zip->locateName('resources/images/res1.png'));
            $quizJson = $zip->getFromName('quiz.json');
            $this->assertIsString($quizJson);
            $this->assertStringNotContainsString('dataBase64', $quizJson);
            $zip->close();

            $loaded = $service->loadFromFile($path);
            $this->assertNotEmpty($loaded['quiz']['resources'][0]['dataBase64'] ?? null);
            $this->assertSame('res1', $loaded['quiz']['resources'][0]['id']);
        } finally {
            @unlink($path);
        }
    }
}
