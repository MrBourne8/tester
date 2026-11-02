<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Services\ScoringService;

final class ScoringServiceTest extends TestCase
{
    public function testScoresCoreQuestionTypesLikeJsEngine(): void
    {
        $scoring = new ScoringService();
        $questions = [
            [
                'id' => 'q1',
                'type' => 'single_choice',
                'points' => 1,
                'options' => [
                    ['id' => 'a', 'correct' => true],
                    ['id' => 'b', 'correct' => false],
                ],
            ],
            [
                'id' => 'q2',
                'type' => 'numeric',
                'points' => 1,
                'correctValue' => 10,
                'tolerance' => 0.5,
            ],
            [
                'id' => 'q3',
                'type' => 'text',
                'points' => 2,
                'acceptedAnswers' => ['Москва', 'moscow'],
            ],
        ];

        $graded = $scoring->grade($questions, [
            'q1' => ['optionId' => 'a'],
            'q2' => ['value' => 10.2],
            'q3' => ['text' => 'москва'],
        ], ['passThresholdPercent' => 60, 'gradingScale' => [
            ['label' => '5', 'minPercent' => 90],
            ['label' => '4', 'minPercent' => 70],
            ['label' => '3', 'minPercent' => 50],
            ['label' => '2', 'minPercent' => 0],
        ]]);

        $this->assertSame(4.0, $graded['score']);
        $this->assertSame(4.0, $graded['maxScore']);
        $this->assertSame(100.0, $graded['percentage']);
        $this->assertTrue($graded['passed']);
        $this->assertSame('5', $graded['grade']['label']);
        $this->assertSame(3, $graded['stats']['correct']);
    }
}
