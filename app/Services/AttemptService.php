<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;

final class AttemptService
{
    public function __construct(
        private readonly SessionService $sessions = new SessionService(),
        private readonly ScoringService $scoring = new ScoringService(),
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function start(string $participantToken): array
    {
        $participant = $this->sessions->requireParticipant($participantToken);
        $session = $this->sessions->fetchSessionRow((int) $participant['session_id']);
        if (!$session) {
            throw new RuntimeException('Сессия не найдена', 404);
        }
        if ($session['status'] !== 'running') {
            throw new RuntimeException('Тестирование ещё не начато преподавателем', 403);
        }

        $existing = $this->latestAttempt((int) $participant['id']);
        if ($existing && $existing['status'] === 'in_progress') {
            return $this->presentAttempt($existing, true);
        }
        if ($existing && $existing['status'] === 'submitted') {
            throw new RuntimeException('Попытка уже отправлена', 422);
        }

        $quiz = $this->sessions->loadQuizContent((int) $session['quiz_version_id']);
        $seed = random_int(1, 2_147_483_647);
        $prepared = $this->prepareOrder($quiz, $seed);
        $now = date('Y-m-d H:i:s');
        $meta = json_encode([
            'seed' => $seed,
            'questionOrder' => $prepared['questionOrder'],
            'optionOrder' => $prepared['optionOrder'],
        ], JSON_UNESCAPED_UNICODE);

        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO attempts (
                    quiz_version_id, session_id, participant_id, attempt_token_hash,
                    attempt_meta, status, started_at, submitted_at, score, max_score,
                    percentage, result_payload, created_at
                 ) VALUES (?, ?, ?, NULL, ?, \'in_progress\', ?, NULL, NULL, NULL, NULL, NULL, ?)'
            );
            $stmt->execute([
                (int) $session['quiz_version_id'],
                (int) $session['id'],
                (int) $participant['id'],
                $meta,
                $now,
                $now,
            ]);
            $attemptId = (int) $pdo->lastInsertId();

            $pdo->prepare('UPDATE participants SET status = \'in_progress\', last_seen_at = ? WHERE id = ?')
                ->execute([$now, (int) $participant['id']]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $row = $this->findAttempt($attemptId);
        return $this->presentAttempt($row, true);
    }

    /**
     * @param array<string, mixed> $answers map questionId => answer
     * @param array<string, mixed>|null $focusEvents map questionId => list of events
     * @return array<string, mixed>
     */
    public function saveAnswers(
        int $attemptId,
        string $participantToken,
        array $answers,
        ?array $focusEvents = null,
    ): array {
        $participant = $this->sessions->requireParticipant($participantToken);
        $attempt = $this->findAttempt($attemptId);
        $this->assertOwnsInProgress($attempt, $participant);

        $session = $this->sessions->fetchSessionRow((int) $attempt['session_id']);
        if (!$session || !in_array($session['status'], ['running', 'paused'], true)) {
            throw new RuntimeException('Сессия не принимает ответы', 403);
        }

        $now = date('Y-m-d H:i:s');
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $upsert = $pdo->prepare(
                'INSERT INTO attempt_answers (attempt_id, question_id, answer_json, awarded_score, is_correct, answered_at)
                 VALUES (?, ?, ?, NULL, NULL, ?)
                 ON DUPLICATE KEY UPDATE answer_json = VALUES(answer_json), answered_at = VALUES(answered_at)'
            );

            $saved = 0;
            foreach ($answers as $questionId => $answer) {
                $qid = (string) $questionId;
                if ($qid === '' || str_starts_with($qid, '_')) {
                    continue;
                }
                $json = json_encode($answer, JSON_UNESCAPED_UNICODE);
                if ($json === false) {
                    continue;
                }
                $upsert->execute([$attemptId, $qid, $json, $now]);
                $saved++;
            }

            if ($focusEvents !== null) {
                $meta = $this->decodeMeta($attempt);
                $meta['focusEvents'] = $this->mergeFocusEvents(
                    is_array($meta['focusEvents'] ?? null) ? $meta['focusEvents'] : [],
                    $focusEvents,
                );
                $encoded = json_encode($meta, JSON_UNESCAPED_UNICODE);
                $pdo->prepare('UPDATE attempts SET attempt_meta = ? WHERE id = ?')
                    ->execute([$encoded === false ? '{}' : $encoded, $attemptId]);
            }

            $pdo->prepare('UPDATE participants SET last_seen_at = ?, status = \'in_progress\' WHERE id = ?')
                ->execute([$now, (int) $participant['id']]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return [
            'attempt_id' => $attemptId,
            'saved' => $saved,
            'server_time' => date('c'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function submit(int $attemptId, string $participantToken, ?array $finalAnswers = null): array
    {
        $participant = $this->sessions->requireParticipant($participantToken);
        $attempt = $this->findAttempt($attemptId);
        $this->assertOwnsInProgress($attempt, $participant);

        $session = $this->sessions->fetchSessionRow((int) $attempt['session_id']);
        if (!$session) {
            throw new RuntimeException('Сессия не найдена', 404);
        }
        if (!in_array($session['status'], ['running', 'paused', 'finished'], true)) {
            throw new RuntimeException('Сессия закрыта', 403);
        }

        if (is_array($finalAnswers) && $finalAnswers !== []) {
            $this->saveAnswers($attemptId, $participantToken, $finalAnswers);
            $attempt = $this->findAttempt($attemptId);
        }

        $quiz = $this->sessions->loadQuizContent((int) $attempt['quiz_version_id']);
        $answers = $this->loadAnswers($attemptId);
        $graded = $this->scoring->grade($quiz['questions'] ?? [], $answers, $quiz['settings'] ?? []);

        $meta = [];
        if (!empty($attempt['attempt_meta'])) {
            $decoded = json_decode((string) $attempt['attempt_meta'], true);
            $meta = is_array($decoded) ? $decoded : [];
        }

        $payload = array_merge($graded, [
            'quizId' => $quiz['id'] ?? null,
            'title' => $quiz['title'] ?? null,
            'seed' => $meta['seed'] ?? null,
            'questionOrder' => $meta['questionOrder'] ?? null,
            'optionOrder' => $meta['optionOrder'] ?? null,
            'mode' => 'network',
            'submittedAt' => date('c'),
        ]);

        $now = date('Y-m-d H:i:s');
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            foreach ($graded['perQuestion'] as $item) {
                $pdo->prepare(
                    'UPDATE attempt_answers
                     SET awarded_score = ?, is_correct = ?
                     WHERE attempt_id = ? AND question_id = ?'
                )->execute([
                    $item['awarded'],
                    $item['isCorrect'] === null ? null : ($item['isCorrect'] ? 1 : 0),
                    $attemptId,
                    $item['questionId'],
                ]);
            }

            $pdo->prepare(
                'UPDATE attempts SET status = \'submitted\', submitted_at = ?, score = ?, max_score = ?,
                    percentage = ?, result_payload = ? WHERE id = ?'
            )->execute([
                $now,
                $graded['score'],
                $graded['maxScore'],
                $graded['percentage'],
                json_encode($payload, JSON_UNESCAPED_UNICODE),
                $attemptId,
            ]);

            $pdo->prepare('UPDATE participants SET status = \'submitted\', last_seen_at = ? WHERE id = ?')
                ->execute([$now, (int) $participant['id']]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $showCorrect = !empty($quiz['settings']['showCorrectAnswers']);
        $result = [
            'attempt' => [
                'id' => $attemptId,
                'status' => 'submitted',
                'score' => $graded['score'],
                'maxScore' => $graded['maxScore'],
                'percentage' => $graded['percentage'],
                'passed' => $graded['passed'],
                'grade' => $graded['grade'],
                'stats' => $graded['stats'],
                'submitted_at' => $now,
            ],
        ];

        if ($showCorrect || !empty($quiz['settings']['showScore'])) {
            $result['attempt']['perQuestion'] = $graded['perQuestion'];
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    public function getAnswers(int $attemptId, string $participantToken): array
    {
        $participant = $this->sessions->requireParticipant($participantToken);
        $attempt = $this->findAttempt($attemptId);
        if ((int) $attempt['participant_id'] !== (int) $participant['id']) {
            throw new RuntimeException('Чужая попытка', 403);
        }

        return [
            'attempt_id' => $attemptId,
            'status' => $attempt['status'],
            'answers' => $this->loadAnswers($attemptId),
        ];
    }

    /**
     * @param array<string, mixed> $quiz
     * @return array{questionOrder: list<string>, optionOrder: array<string, list<string>>}
     */
    private function prepareOrder(array $quiz, int $seed): array
    {
        $questions = is_array($quiz['questions'] ?? null) ? $quiz['questions'] : [];
        $settings = is_array($quiz['settings'] ?? null) ? $quiz['settings'] : [];
        $groups = is_array($quiz['questionGroups'] ?? null) ? $quiz['questionGroups'] : [];

        if ($groups !== []) {
            $ids = $this->selectIdsFromGroups($questions, $groups, $seed, !empty($settings['shuffleQuestions']));
        } else {
            $ids = array_map(static fn ($q) => (string) ($q['id'] ?? ''), $questions);
            $ids = array_values(array_filter($ids, static fn ($id) => $id !== ''));
            if (!empty($settings['shuffleQuestions'])) {
                $ids = $this->seededShuffle($ids, $seed);
            }
        }

        $optionOrder = [];
        if (!empty($settings['shuffleOptions'])) {
            foreach ($questions as $i => $question) {
                if (!is_array($question) || empty($question['options']) || !is_array($question['options'])) {
                    continue;
                }
                $optIds = array_map(static fn ($o) => (string) ($o['id'] ?? ''), $question['options']);
                $optIds = array_values(array_filter($optIds, static fn ($id) => $id !== ''));
                $optionOrder[(string) $question['id']] = $this->seededShuffle($optIds, $seed + $i + 1);
                if (isset($question['innerQuestion']) && is_array($question['innerQuestion'])
                    && !empty($question['innerQuestion']['options']) && is_array($question['innerQuestion']['options'])) {
                    $innerOpts = array_map(static fn ($o) => (string) ($o['id'] ?? ''), $question['innerQuestion']['options']);
                    $innerOpts = array_values(array_filter($innerOpts, static fn ($id) => $id !== ''));
                    $optionOrder[(string) $question['innerQuestion']['id']] = $this->seededShuffle($innerOpts, $seed + $i + 100);
                }
            }
        }

        return ['questionOrder' => $ids, 'optionOrder' => $optionOrder];
    }

    /**
     * @param list<array<string, mixed>> $questions
     * @param list<array<string, mixed>> $groups
     * @return list<string>
     */
    private function selectIdsFromGroups(array $questions, array $groups, int $seed, bool $shuffleUngrouped): array
    {
        $byId = [];
        foreach ($questions as $question) {
            if (!is_array($question)) {
                continue;
            }
            $id = (string) ($question['id'] ?? '');
            if ($id !== '') {
                $byId[$id] = $question;
            }
        }

        $inGroups = [];
        $selected = [];
        $groupSeed = $seed;
        foreach ($groups as $group) {
            if (!is_array($group)) {
                continue;
            }
            $pool = [];
            foreach ($group['questionIds'] ?? [] as $qid) {
                $qid = (string) $qid;
                $inGroups[$qid] = true;
                if (isset($byId[$qid])) {
                    $pool[] = $qid;
                }
            }
            if (($group['shuffle'] ?? true) !== false) {
                $pool = $this->seededShuffle($pool, $groupSeed++);
            }
            $pick = isset($group['pick']) && is_numeric($group['pick'])
                ? max(0, (int) $group['pick'])
                : count($pool);
            $chosen = array_slice($pool, 0, min($pick, count($pool)));
            foreach ($chosen as $qid) {
                $selected[] = $qid;
            }
        }

        $rest = [];
        foreach (array_keys($byId) as $qid) {
            if (!isset($inGroups[$qid])) {
                $rest[] = $qid;
            }
        }
        if ($shuffleUngrouped) {
            $rest = $this->seededShuffle($rest, $groupSeed);
        }

        return array_merge($selected, $rest);
    }

    /**
     * @param list<string> $items
     * @return list<string>
     */
    private function seededShuffle(array $items, int $seed): array
    {
        $out = array_values($items);
        $n = count($out);
        $state = $seed;
        for ($i = $n - 1; $i > 0; $i--) {
            $state = ($state * 1103515245 + 12345) & 0x7fffffff;
            $j = $state % ($i + 1);
            [$out[$i], $out[$j]] = [$out[$j], $out[$i]];
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    private function findAttempt(int $id): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM attempts WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Попытка не найдена', 404);
        }

        return $row;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function latestAttempt(int $participantId): ?array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM attempts WHERE participant_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$participantId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $attempt
     * @param array<string, mixed> $participant
     */
    private function assertOwnsInProgress(array $attempt, array $participant): void
    {
        if ((int) $attempt['participant_id'] !== (int) $participant['id']) {
            throw new RuntimeException('Чужая попытка', 403);
        }
        if ($attempt['status'] !== 'in_progress') {
            throw new RuntimeException('Попытка уже завершена', 422);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function loadAnswers(int $attemptId): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT question_id, answer_json FROM attempt_answers WHERE attempt_id = ?');
        $stmt->execute([$attemptId]);
        $answers = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $decoded = json_decode((string) $row['answer_json'], true);
            $answers[(string) $row['question_id']] = $decoded;
        }

        return $answers;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function presentAttempt(array $row, bool $withAnswers = false): array
    {
        $meta = [];
        if (!empty($row['attempt_meta'])) {
            $decoded = json_decode((string) $row['attempt_meta'], true);
            $meta = is_array($decoded) ? $decoded : [];
        }

        $out = [
            'id' => (int) $row['id'],
            'status' => $row['status'],
            'started_at' => $row['started_at'],
            'submitted_at' => $row['submitted_at'],
            'score' => $row['score'] !== null ? (float) $row['score'] : null,
            'max_score' => $row['max_score'] !== null ? (float) $row['max_score'] : null,
            'percentage' => $row['percentage'] !== null ? (float) $row['percentage'] : null,
            'meta' => $meta,
            'server_time' => date('c'),
        ];

        if ($withAnswers) {
            $out['answers'] = $this->loadAnswers((int) $row['id']);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $attempt
     * @return array<string, mixed>
     */
    private function decodeMeta(array $attempt): array
    {
        if (empty($attempt['attempt_meta'])) {
            return [];
        }
        $decoded = json_decode((string) $attempt['attempt_meta'], true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, mixed> $existing
     * @param array<string, mixed> $incoming
     * @return array<string, list<array<string, mixed>>>
     */
    private function mergeFocusEvents(array $existing, array $incoming): array
    {
        $out = $existing;
        foreach ($incoming as $questionId => $events) {
            $qid = (string) $questionId;
            if ($qid === '' || !is_array($events)) {
                continue;
            }
            if (!isset($out[$qid]) || !is_array($out[$qid])) {
                $out[$qid] = [];
            }
            foreach ($events as $event) {
                if (!is_array($event)) {
                    continue;
                }
                $at = (string) ($event['at'] ?? '');
                $type = (string) ($event['type'] ?? '');
                if ($at === '' || ($type !== 'blur' && $type !== 'hidden')) {
                    continue;
                }
                $dup = false;
                foreach ($out[$qid] as $prev) {
                    if (($prev['at'] ?? '') === $at && ($prev['type'] ?? '') === $type) {
                        $dup = true;
                        break;
                    }
                }
                if (!$dup) {
                    $out[$qid][] = ['at' => $at, 'type' => $type];
                }
            }
            if (count($out[$qid]) > 40) {
                $out[$qid] = array_slice($out[$qid], -40);
            }
        }

        return $out;
    }
}
