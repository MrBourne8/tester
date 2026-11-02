<?php

declare(strict_types=1);

namespace UniTest\Services;

/**
 * Убирает правильные ответы из снимка теста для клиента ученика.
 * В тренировочном режиме ключи оставляем — нужна мгновенная проверка и пояснения.
 */
final class QuizSanitize
{
    /**
     * @param array<string, mixed> $quiz
     * @return array<string, mixed>
     */
    public function forParticipant(array $quiz, bool $keepAnswerKeys = false): array
    {
        if ($keepAnswerKeys) {
            return $quiz;
        }

        $copy = $quiz;
        $questions = [];
        foreach ($quiz['questions'] ?? [] as $question) {
            if (!is_array($question)) {
                continue;
            }
            $questions[] = $this->sanitizeQuestion($question);
        }
        $copy['questions'] = $questions;

        return $copy;
    }

    /**
     * @param array<string, mixed> $question
     * @return array<string, mixed>
     */
    private function sanitizeQuestion(array $question): array
    {
        $out = $question;
        unset(
            $out['acceptedAnswers'],
            $out['correctValue'],
            $out['tolerance'],
            $out['explanation'],
        );

        if (isset($out['options']) && is_array($out['options'])) {
            $out['options'] = array_map(static function ($option) {
                if (!is_array($option)) {
                    return $option;
                }
                unset($option['correct']);
                return $option;
            }, $out['options']);
        }

        if (isset($out['blanks']) && is_array($out['blanks'])) {
            $out['blanks'] = array_map(static function ($blank) {
                if (!is_array($blank)) {
                    return $blank;
                }
                unset($blank['acceptedAnswers']);
                return $blank;
            }, $out['blanks']);
        }

        if (isset($out['innerQuestion']) && is_array($out['innerQuestion'])) {
            $out['innerQuestion'] = $this->sanitizeQuestion($out['innerQuestion']);
        }

        return $out;
    }
}
