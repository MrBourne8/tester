<?php

declare(strict_types=1);

namespace UniTest\Services;

/**
 * Серверный scoring, совместимый с resources/js/core/quiz-engine/scoring.js.
 */
final class ScoringService
{
    public const SCORING_VERSION = '1.0.0';

    /**
     * @param list<array<string, mixed>> $questions
     * @param array<string, mixed> $answers
     * @param array<string, mixed> $meta settings (passThresholdPercent, gradingScale)
     * @return array<string, mixed>
     */
    public function grade(array $questions, array $answers, array $meta = []): array
    {
        $scored = $this->scoreAttempt($questions, $answers);
        $threshold = isset($meta['passThresholdPercent']) ? (float) $meta['passThresholdPercent'] : 50.0;
        $grade = $this->resolveGrade($scored['percentage'], $meta['gradingScale'] ?? null);
        $stats = $this->summarize($scored['perQuestion']);

        return array_merge($scored, [
            'engineVersion' => '1.0.0',
            'passed' => $scored['percentage'] >= $threshold,
            'passThresholdPercent' => $threshold,
            'grade' => $grade,
            'stats' => $stats,
        ]);
    }

    /**
     * @param list<array<string, mixed>> $questions
     * @param array<string, mixed> $answers
     * @return array{scoringVersion: string, score: float, maxScore: float, percentage: float, perQuestion: list<array<string, mixed>>}
     */
    public function scoreAttempt(array $questions, array $answers): array
    {
        $perQuestion = [];
        $score = 0.0;
        $maxScore = 0.0;

        foreach ($questions as $question) {
            $id = (string) ($question['id'] ?? '');
            $result = $this->scoreQuestion($question, $answers[$id] ?? null);
            $score += $result['awarded'];
            $maxScore += $result['max'];
            $perQuestion[] = [
                'questionId' => $id,
                'type' => $question['type'] ?? null,
                'awarded' => $result['awarded'],
                'max' => $result['max'],
                'isCorrect' => $result['isCorrect'],
                'detail' => $result['detail'] ?? null,
            ];
        }

        $score = round($score, 2);
        $maxScore = round($maxScore, 2);
        $percentage = $maxScore === 0.0 ? 0.0 : round(($score / $maxScore) * 100, 2);

        return [
            'scoringVersion' => self::SCORING_VERSION,
            'score' => $score,
            'maxScore' => $maxScore,
            'percentage' => $percentage,
            'perQuestion' => $perQuestion,
        ];
    }

    /**
     * @param array<string, mixed> $question
     * @return array{awarded: float, max: float, isCorrect: bool|null, detail?: array<string, mixed>}
     */
    public function scoreQuestion(array $question, mixed $answer): array
    {
        $max = isset($question['points']) && is_numeric($question['points']) ? (float) $question['points'] : 1.0;
        $type = (string) ($question['type'] ?? '');

        return match ($type) {
            'info' => ['awarded' => 0.0, 'max' => 0.0, 'isCorrect' => null],
            'single_choice', 'true_false' => $this->scoreSingle($question, $answer, $max),
            'multiple_choice' => $this->scoreMultiple($question, $answer, $max),
            'text' => $this->scoreText($question, $answer, $max),
            'numeric' => $this->scoreNumeric($question, $answer, $max),
            'matching' => $this->scoreMatching($question, $answer, $max),
            'ordering' => $this->scoreOrdering($question, $answer, $max),
            'fill_blanks' => $this->scoreFillBlanks($question, $answer, $max),
            'image' => isset($question['innerQuestion']) && is_array($question['innerQuestion'])
                ? $this->scoreQuestion($question['innerQuestion'], $answer)
                : ['awarded' => 0.0, 'max' => 0.0, 'isCorrect' => null],
            default => ['awarded' => 0.0, 'max' => $max, 'isCorrect' => false, 'detail' => ['reason' => 'unknown_type']],
        };
    }

    /**
     * @param list<array<string, mixed>> $perQuestion
     * @return array{correct: int, incorrect: int, partial: int, skipped: int, info: int}
     */
    public function summarize(array $perQuestion): array
    {
        $correct = $incorrect = $partial = $skipped = $info = 0;
        foreach ($perQuestion as $item) {
            if (($item['type'] ?? null) === 'info' || (float) ($item['max'] ?? 0) === 0.0) {
                $info++;
                continue;
            }
            $awarded = (float) ($item['awarded'] ?? 0);
            $max = (float) ($item['max'] ?? 0);
            if (($item['isCorrect'] ?? false) === true || ($max > 0 && $awarded >= $max)) {
                $correct++;
            } elseif ($awarded > 0 && $awarded < $max) {
                $partial++;
            } elseif ($awarded === 0.0 && !array_key_exists('isCorrect', $item)) {
                $skipped++;
            } else {
                $incorrect++;
            }
        }

        return compact('correct', 'incorrect', 'partial', 'skipped', 'info');
    }

    /**
     * @param mixed $scale
     * @return array{label: string, minPercent: float, color: string, scale: list<array<string, mixed>>}
     */
    public function resolveGrade(float $percentage, mixed $scale): array
    {
        $bands = $this->normalizeGradingScale($scale);
        $matched = $bands[count($bands) - 1];
        foreach ($bands as $band) {
            if ($percentage >= (float) $band['minPercent']) {
                $matched = $band;
                break;
            }
        }

        return [
            'label' => (string) $matched['label'],
            'minPercent' => (float) $matched['minPercent'],
            'color' => (string) ($matched['color'] ?? '#0f6b4c'),
            'scale' => $bands,
        ];
    }

    /**
     * @return list<array{label: string, minPercent: float, color?: string}>
     */
    public function normalizeGradingScale(mixed $scale): array
    {
        if (!is_array($scale) || $scale === []) {
            return $this->defaultGradingScale();
        }

        $bands = [];
        foreach ($scale as $band) {
            if (!is_array($band)) {
                continue;
            }
            $bands[] = [
                'label' => trim((string) ($band['label'] ?? '')) ?: '—',
                'minPercent' => max(0.0, min(100.0, (float) ($band['minPercent'] ?? 0))),
                'color' => isset($band['color']) && is_string($band['color']) ? $band['color'] : null,
            ];
        }

        usort($bands, static fn ($a, $b) => $b['minPercent'] <=> $a['minPercent']);

        return $bands !== [] ? $bands : $this->defaultGradingScale();
    }

    /**
     * @return list<array{label: string, minPercent: float, color: string}>
     */
    public function defaultGradingScale(): array
    {
        return [
            ['label' => '5', 'minPercent' => 90.0, 'color' => '#0f6b4c'],
            ['label' => '4', 'minPercent' => 70.0, 'color' => '#2f7d4f'],
            ['label' => '3', 'minPercent' => 50.0, 'color' => '#b7791f'],
            ['label' => '2', 'minPercent' => 0.0, 'color' => '#9b2c2c'],
        ];
    }

    /** @param array<string, mixed> $question */
    private function scoreSingle(array $question, mixed $answer, float $max): array
    {
        $correct = null;
        foreach ($question['options'] ?? [] as $option) {
            if (!empty($option['correct'])) {
                $correct = $option['id'] ?? null;
                break;
            }
        }
        $selected = is_array($answer) ? ($answer['optionId'] ?? null) : $answer;
        $ok = $correct !== null && $selected === $correct;

        return ['awarded' => $ok ? $max : 0.0, 'max' => $max, 'isCorrect' => $ok];
    }

    /** @param array<string, mixed> $question */
    private function scoreMultiple(array $question, mixed $answer, float $max): array
    {
        $correctIds = [];
        foreach ($question['options'] ?? [] as $option) {
            if (!empty($option['correct'])) {
                $correctIds[] = (string) $option['id'];
            }
        }
        $selected = [];
        if (is_array($answer) && isset($answer['optionIds']) && is_array($answer['optionIds'])) {
            $selected = array_map('strval', $answer['optionIds']);
        } elseif (is_array($answer) && array_is_list($answer)) {
            $selected = array_map('strval', $answer);
        }
        $selected = array_values(array_unique($selected));
        $mode = ($question['scoringMode'] ?? '') === 'partial' ? 'partial' : 'all_or_nothing';

        if ($mode === 'all_or_nothing') {
            $ok = count($selected) === count($correctIds)
                && count(array_diff($correctIds, $selected)) === 0;
            return ['awarded' => $ok ? $max : 0.0, 'max' => $max, 'isCorrect' => $ok];
        }

        $hits = 0;
        $misses = 0;
        foreach ($selected as $id) {
            if (in_array($id, $correctIds, true)) {
                $hits++;
            } else {
                $misses++;
            }
        }
        $ratio = count($correctIds) === 0 ? 0.0 : max(0, $hits - $misses) / count($correctIds);
        $awarded = round($ratio * $max, 2);

        return [
            'awarded' => $awarded,
            'max' => $max,
            'isCorrect' => $awarded === $max && $misses === 0,
            'detail' => ['hits' => $hits, 'misses' => $misses, 'mode' => $mode],
        ];
    }

    /** @param array<string, mixed> $question */
    private function scoreText(array $question, mixed $answer, float $max): array
    {
        $raw = is_string($answer) ? $answer : (is_array($answer) ? (string) ($answer['text'] ?? '') : '');
        $mode = [
            'caseSensitive' => !empty($question['caseSensitive']),
            'trim' => ($question['trim'] ?? true) !== false,
            'collapseWhitespace' => ($question['collapseWhitespace'] ?? true) !== false,
        ];
        $normalized = $this->normalizeText($raw, $mode);
        $accepted = array_map(
            fn ($a) => $this->normalizeText((string) $a, $mode),
            $question['acceptedAnswers'] ?? []
        );
        $ok = in_array($normalized, $accepted, true);

        return ['awarded' => $ok ? $max : 0.0, 'max' => $max, 'isCorrect' => $ok];
    }

    /** @param array<string, mixed> $question */
    private function scoreNumeric(array $question, mixed $answer, float $max): array
    {
        $value = is_numeric($answer) ? (float) $answer : (is_array($answer) ? (float) ($answer['value'] ?? NAN) : NAN);
        if (is_nan($value)) {
            return ['awarded' => 0.0, 'max' => $max, 'isCorrect' => false];
        }
        $tolerance = isset($question['tolerance']) && is_numeric($question['tolerance'])
            ? (float) $question['tolerance'] : 0.0;
        $ok = abs($value - (float) ($question['correctValue'] ?? 0)) <= $tolerance;

        return ['awarded' => $ok ? $max : 0.0, 'max' => $max, 'isCorrect' => $ok];
    }

    /** @param array<string, mixed> $question */
    private function scoreMatching(array $question, mixed $answer, float $max): array
    {
        $pairs = $question['pairs'] ?? [];
        $map = is_array($answer) ? ($answer['matches'] ?? $answer) : [];
        if (!is_array($map)) {
            $map = [];
        }
        $correctCount = 0;
        foreach ($pairs as $pair) {
            $left = (string) ($pair['leftId'] ?? '');
            if ($left !== '' && ($map[$left] ?? null) === ($pair['rightId'] ?? null)) {
                $correctCount++;
            }
        }
        $ratio = count($pairs) === 0 ? 0.0 : $correctCount / count($pairs);
        $awarded = round($ratio * $max, 2);

        return [
            'awarded' => $awarded,
            'max' => $max,
            'isCorrect' => $correctCount === count($pairs),
            'detail' => ['correctCount' => $correctCount, 'total' => count($pairs)],
        ];
    }

    /** @param array<string, mixed> $question */
    private function scoreOrdering(array $question, mixed $answer, float $max): array
    {
        $expected = array_map(
            static fn ($item) => (string) ($item['id'] ?? ''),
            $question['items'] ?? []
        );
        $actual = is_array($answer) && isset($answer['order']) && is_array($answer['order'])
            ? array_map('strval', $answer['order'])
            : (is_array($answer) && array_is_list($answer) ? array_map('strval', $answer) : []);
        $ok = count($expected) === count($actual)
            && $expected === $actual;

        return ['awarded' => $ok ? $max : 0.0, 'max' => $max, 'isCorrect' => $ok];
    }

    /** @param array<string, mixed> $question */
    private function scoreFillBlanks(array $question, mixed $answer, float $max): array
    {
        $blanks = $question['blanks'] ?? [];
        $values = is_array($answer) ? ($answer['blanks'] ?? $answer) : [];
        if (!is_array($values)) {
            $values = [];
        }
        $mode = ['caseSensitive' => !empty($question['caseSensitive']), 'trim' => true, 'collapseWhitespace' => true];
        $correctCount = 0;
        foreach ($blanks as $blank) {
            $id = (string) ($blank['id'] ?? '');
            $given = $this->normalizeText((string) ($values[$id] ?? ''), $mode);
            $accepted = array_map(
                fn ($a) => $this->normalizeText((string) $a, $mode),
                $blank['acceptedAnswers'] ?? []
            );
            if (in_array($given, $accepted, true)) {
                $correctCount++;
            }
        }
        $ratio = count($blanks) === 0 ? 0.0 : $correctCount / count($blanks);
        $awarded = round($ratio * $max, 2);

        return [
            'awarded' => $awarded,
            'max' => $max,
            'isCorrect' => $correctCount === count($blanks),
            'detail' => ['correctCount' => $correctCount, 'total' => count($blanks)],
        ];
    }

    /** @param array{caseSensitive?: bool, trim?: bool, collapseWhitespace?: bool} $mode */
    private function normalizeText(string $value, array $mode): string
    {
        $out = $value;
        if (($mode['trim'] ?? true) !== false) {
            $out = trim($out);
        }
        if (($mode['collapseWhitespace'] ?? true) !== false) {
            $out = (string) preg_replace('/\s+/u', ' ', $out);
        }
        if (empty($mode['caseSensitive'])) {
            $out = mb_strtolower($out, 'UTF-8');
        }

        return $out;
    }
}
