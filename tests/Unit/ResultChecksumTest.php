<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Services\ResultChecksum;

final class ResultChecksumTest extends TestCase
{
    public function testChecksumStableAndDetectsTampering(): void
    {
        $service = new ResultChecksum();
        $payload = [
            'format' => 'unitest-result',
            'schemaVersion' => '1.0',
            'checksumAlgorithm' => 'sha256',
            'quizId' => 'quiz_1',
            'quizTitle' => 'Demo',
            'studentName' => 'Иван',
            'score' => 1,
            'maxScore' => 1,
            'percentage' => 100,
            'passed' => true,
            'answers' => ['q1' => ['optionId' => 'a']],
            'questionOrder' => ['q1'],
            'optionOrder' => [],
            'perQuestion' => [],
        ];

        $payload['checksum'] = $service->checksum($payload);
        $service->verify($payload);

        $tampered = $payload;
        $tampered['score'] = 99;
        $this->expectException(\RuntimeException::class);
        $service->verify($tampered);
    }
}
