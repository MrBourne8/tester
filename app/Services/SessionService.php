<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;

final class SessionService
{
    public function __construct(
        private readonly TeacherContext $teachers = new TeacherContext(),
        private readonly QuizService $quizzes = new QuizService(),
        private readonly NetworkAddressService $addresses = new NetworkAddressService(),
        private readonly JoinRateLimiter $rateLimiter = new JoinRateLimiter(),
        private readonly QuizSanitize $sanitize = new QuizSanitize(),
        private readonly ScoringService $scoring = new ScoringService(),
    ) {
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public function createFromQuiz(int $quizId, array $settings = [], ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $quiz = $this->quizzes->get($quizId, $teacherId);
        if (empty($quiz['current_version_id'])) {
            throw new RuntimeException('У теста нет сохранённой версии', 422);
        }

        $pdo = Database::connection();
        $now = date('Y-m-d H:i:s');
        $code = $this->generateUniqueCode($pdo);
        $settingsJson = json_encode($settings, JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare(
            'INSERT INTO sessions (quiz_version_id, teacher_id, session_code, status, settings_json, starts_at, ends_at, created_at)
             VALUES (?, ?, ?, \'open\', ?, NULL, NULL, ?)'
        );
        $stmt->execute([
            (int) $quiz['current_version_id'],
            $teacherId,
            $code,
            $settingsJson === false ? null : $settingsJson,
            $now,
        ]);

        return $this->getForTeacher((int) $pdo->lastInsertId(), $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function getForTeacher(int $sessionId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $row = $this->fetchSessionRow($sessionId);
        if (!$row || (int) $row['teacher_id'] !== $teacherId) {
            throw new RuntimeException('Сессия не найдена', 404);
        }

        return $this->presentTeacherSession($row);
    }

    /**
     * @return array<string, mixed>
     */
    public function start(int $sessionId, ?int $teacherId = null): array
    {
        return $this->transition($sessionId, ['open', 'paused'], 'running', [
            'starts_at' => date('Y-m-d H:i:s'),
        ], $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function pause(int $sessionId, ?int $teacherId = null): array
    {
        return $this->transition($sessionId, ['running'], 'paused', [], $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function finish(int $sessionId, ?int $teacherId = null): array
    {
        return $this->transition($sessionId, ['open', 'running', 'paused'], 'finished', [
            'ends_at' => date('Y-m-d H:i:s'),
        ], $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function close(int $sessionId, ?int $teacherId = null): array
    {
        return $this->transition($sessionId, ['draft', 'open', 'running', 'paused', 'finished'], 'closed', [
            'ends_at' => date('Y-m-d H:i:s'),
        ], $teacherId);
    }

    /**
     * Публичный URL для доступа через интернет (туннель / домен).
     *
     * @return array<string, mixed>
     */
    public function updateAccess(int $sessionId, ?string $publicBaseUrl, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $row = $this->fetchSessionRow($sessionId);
        if (!$row || (int) $row['teacher_id'] !== $teacherId) {
            throw new RuntimeException('Сессия не найдена', 404);
        }
        if (in_array((string) $row['status'], ['closed', 'finished'], true)) {
            throw new RuntimeException('Сессия уже завершена', 403);
        }

        $normalized = $publicBaseUrl === null || trim($publicBaseUrl) === ''
            ? null
            : $this->addresses->normalizePublicBase($publicBaseUrl);

        if ($publicBaseUrl !== null && trim($publicBaseUrl) !== '' && $normalized === null) {
            throw new RuntimeException(
                'Укажите публичный адрес вида https://example.com или URL туннеля (не localhost)',
                422
            );
        }

        $settings = $this->decodeJson($row['settings_json'] ?? null);
        if (!is_array($settings)) {
            $settings = [];
        }
        if ($normalized === null) {
            unset($settings['public_base_url']);
        } else {
            $settings['public_base_url'] = $normalized;
        }

        $encoded = json_encode($settings, JSON_UNESCAPED_UNICODE);
        $pdo = Database::connection();
        $pdo->prepare('UPDATE sessions SET settings_json = ? WHERE id = ?')
            ->execute([$encoded === false ? '{}' : $encoded, $sessionId]);

        return $this->getForTeacher($sessionId, $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function join(string $code, string $displayName, string $clientIp): array
    {
        $this->rateLimiter->assertAllowed($clientIp);

        $name = trim($displayName);
        if ($name === '' || mb_strlen($name) > 80) {
            throw new RuntimeException('Укажите имя (1–80 символов)', 422);
        }

        $normalized = strtoupper(preg_replace('/\s+/', '', $code) ?? '');
        if ($normalized === '') {
            throw new RuntimeException('Укажите код занятия', 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT * FROM sessions WHERE session_code = ? LIMIT 1'
        );
        $stmt->execute([$normalized]);
        $session = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$session) {
            throw new RuntimeException('Сессия с таким кодом не найдена', 404);
        }

        if (!in_array($session['status'], ['open', 'running'], true)) {
            throw new RuntimeException('Регистрация в эту сессию закрыта', 403);
        }

        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $now = date('Y-m-d H:i:s');

        $insert = $pdo->prepare(
            'INSERT INTO participants (session_id, display_name, external_identifier, joined_at, status, token_hash, last_seen_at)
             VALUES (?, ?, NULL, ?, \'joined\', ?, ?)'
        );
        $insert->execute([(int) $session['id'], $name, $now, $tokenHash, $now]);

        return [
            'participantToken' => $token,
            'participant' => [
                'id' => (int) $pdo->lastInsertId(),
                'display_name' => $name,
                'status' => 'joined',
                'session_id' => (int) $session['id'],
            ],
            'session' => $this->presentPublicSession($session),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function participantSession(string $token): array
    {
        $participant = $this->requireParticipant($token);
        $session = $this->fetchSessionRow((int) $participant['session_id']);
        if (!$session) {
            throw new RuntimeException('Сессия не найдена', 404);
        }

        $quiz = $this->loadQuizContent((int) $session['quiz_version_id']);
        $safeQuiz = null;
        if (in_array($session['status'], ['running', 'paused'], true)) {
            $settings = is_array($quiz['settings'] ?? null) ? $quiz['settings'] : [];
            $keepKeys = !empty($settings['trainingMode']);
            $safeQuiz = $this->sanitize->forParticipant($quiz, $keepKeys);
        }

        $attempt = $this->findActiveAttempt((int) $participant['id']);

        return [
            'participant' => [
                'id' => (int) $participant['id'],
                'display_name' => $participant['display_name'],
                'status' => $participant['status'],
            ],
            'session' => $this->presentPublicSession($session),
            'quiz' => $safeQuiz,
            'attempt' => $attempt,
            'serverTime' => date('c'),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function results(int $sessionId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $row = $this->fetchSessionRow($sessionId);
        if (!$row || (int) $row['teacher_id'] !== $teacherId) {
            throw new RuntimeException('Сессия не найдена', 404);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT p.id AS participant_id, p.display_name, p.status AS participant_status,
                    a.id AS attempt_id, a.status AS attempt_status, a.score, a.max_score,
                    a.percentage, a.started_at, a.submitted_at, a.result_payload
             FROM participants p
             LEFT JOIN attempts a ON a.participant_id = p.id AND a.session_id = p.session_id
             WHERE p.session_id = ?
             ORDER BY p.joined_at ASC, a.id ASC'
        );
        $stmt->execute([$sessionId]);

        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $item) {
            $payload = null;
            if (!empty($item['result_payload'])) {
                $decoded = json_decode((string) $item['result_payload'], true);
                $payload = is_array($decoded) ? $decoded : null;
            }
            $out[] = [
                'participant_id' => (int) $item['participant_id'],
                'display_name' => $item['display_name'],
                'participant_status' => $item['participant_status'],
                'attempt_id' => $item['attempt_id'] !== null ? (int) $item['attempt_id'] : null,
                'attempt_status' => $item['attempt_status'],
                'score' => $item['score'] !== null ? (float) $item['score'] : null,
                'max_score' => $item['max_score'] !== null ? (float) $item['max_score'] : null,
                'percentage' => $item['percentage'] !== null ? (float) $item['percentage'] : null,
                'grade' => is_array($payload) ? ($payload['grade'] ?? null) : null,
                'started_at' => $item['started_at'],
                'submitted_at' => $item['submitted_at'],
            ];
        }

        return $out;
    }

    /**
     * Живой монитор ответов участника для панели преподавателя.
     *
     * @return array<string, mixed>
     */
    public function liveMonitor(int $sessionId, int $participantId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $session = $this->fetchSessionRow($sessionId);
        if (!$session || (int) $session['teacher_id'] !== $teacherId) {
            throw new RuntimeException('Сессия не найдена', 404);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT * FROM participants WHERE id = ? AND session_id = ? LIMIT 1'
        );
        $stmt->execute([$participantId, $sessionId]);
        $participant = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$participant) {
            throw new RuntimeException('Участник не найден', 404);
        }

        $attemptStmt = $pdo->prepare(
            'SELECT * FROM attempts WHERE participant_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1'
        );
        $attemptStmt->execute([$participantId, $sessionId]);
        $attempt = $attemptStmt->fetch(PDO::FETCH_ASSOC);

        $quiz = $this->loadQuizContent((int) $session['quiz_version_id']);
        $questions = is_array($quiz['questions'] ?? null) ? $quiz['questions'] : [];
        $answers = [];
        $answeredAt = [];
        $focusByQuestion = [];

        if ($attempt) {
            $ansStmt = $pdo->prepare(
                'SELECT question_id, answer_json, answered_at FROM attempt_answers WHERE attempt_id = ?'
            );
            $ansStmt->execute([(int) $attempt['id']]);
            foreach ($ansStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
                $qid = (string) $row['question_id'];
                $decoded = json_decode((string) $row['answer_json'], true);
                $answers[$qid] = $decoded;
                $answeredAt[$qid] = $row['answered_at'];
            }

            if (!empty($attempt['attempt_meta'])) {
                $meta = json_decode((string) $attempt['attempt_meta'], true);
                if (is_array($meta) && is_array($meta['focusEvents'] ?? null)) {
                    $focusByQuestion = $meta['focusEvents'];
                }
            }
        }

        $items = [];
        $answeredCount = 0;
        $correctCount = 0;
        $incorrectCount = 0;
        $liveScore = 0.0;
        $liveMax = 0.0;

        foreach ($questions as $index => $question) {
            if (!is_array($question)) {
                continue;
            }
            $qid = (string) ($question['id'] ?? '');
            $type = (string) ($question['type'] ?? '');
            $hasAnswer = array_key_exists($qid, $answers);
            $answer = $hasAnswer ? $answers[$qid] : null;
            $scored = $this->scoring->scoreQuestion($question, $answer);
            $liveMax += (float) $scored['max'];

            $focusInfo = $this->summarizeFocus($focusByQuestion[$qid] ?? null);

            if ($type === 'info' || (float) $scored['max'] === 0.0) {
                $items[] = [
                    'index' => $index + 1,
                    'question_id' => $qid,
                    'type' => $type,
                    'prompt' => (string) ($question['prompt'] ?? ''),
                    'status' => 'info',
                    'answered' => false,
                    'given' => null,
                    'expected' => null,
                    'awarded' => 0.0,
                    'max' => 0.0,
                    'answered_at' => null,
                    'focus_loss' => $focusInfo,
                ];
                continue;
            }

            if (!$hasAnswer || $this->isEmptyAnswer($type, $answer)) {
                $items[] = [
                    'index' => $index + 1,
                    'question_id' => $qid,
                    'type' => $type,
                    'prompt' => (string) ($question['prompt'] ?? ''),
                    'status' => 'pending',
                    'answered' => false,
                    'given' => null,
                    'expected' => $this->formatExpected($question),
                    'awarded' => 0.0,
                    'max' => (float) $scored['max'],
                    'answered_at' => null,
                    'focus_loss' => $focusInfo,
                ];
                continue;
            }

            $answeredCount++;
            $liveScore += (float) $scored['awarded'];
            $isCorrect = $scored['isCorrect'] === true
                || ((float) $scored['max'] > 0 && (float) $scored['awarded'] >= (float) $scored['max']);
            $isPartial = !$isCorrect && (float) $scored['awarded'] > 0;
            if ($isCorrect) {
                $correctCount++;
                $status = 'correct';
            } elseif ($isPartial) {
                $incorrectCount++;
                $status = 'partial';
            } else {
                $incorrectCount++;
                $status = 'incorrect';
            }

            $items[] = [
                'index' => $index + 1,
                'question_id' => $qid,
                'type' => $type,
                'prompt' => (string) ($question['prompt'] ?? ''),
                'status' => $status,
                'answered' => true,
                'given' => $this->formatGiven($question, $answer),
                'expected' => $this->formatExpected($question),
                'awarded' => (float) $scored['awarded'],
                'max' => (float) $scored['max'],
                'answered_at' => $answeredAt[$qid] ?? null,
                'focus_loss' => $focusInfo,
            ];
        }

        $liveScore = round($liveScore, 2);
        $liveMax = round($liveMax, 2);
        $livePercent = $liveMax > 0 ? round(($liveScore / $liveMax) * 100, 2) : 0.0;

        return [
            'participant' => [
                'id' => (int) $participant['id'],
                'display_name' => $participant['display_name'],
                'status' => $participant['status'],
                'last_seen_at' => $participant['last_seen_at'],
            ],
            'attempt' => $attempt ? [
                'id' => (int) $attempt['id'],
                'status' => $attempt['status'],
                'started_at' => $attempt['started_at'],
                'submitted_at' => $attempt['submitted_at'],
                'score' => $attempt['score'] !== null ? (float) $attempt['score'] : null,
                'max_score' => $attempt['max_score'] !== null ? (float) $attempt['max_score'] : null,
                'percentage' => $attempt['percentage'] !== null ? (float) $attempt['percentage'] : null,
            ] : null,
            'live' => [
                'score' => $liveScore,
                'max_score' => $liveMax,
                'percentage' => $livePercent,
                'answered' => $answeredCount,
                'correct' => $correctCount,
                'incorrect' => $incorrectCount,
                'total' => count(array_filter($items, static fn ($i) => ($i['status'] ?? '') !== 'info')),
            ],
            'questions' => $items,
            'server_time' => date('c'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function requireParticipant(string $token): array
    {
        if ($token === '') {
            throw new RuntimeException('Нет токена участника', 401);
        }

        $hash = hash('sha256', $token);
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM participants WHERE token_hash = ? LIMIT 1');
        $stmt->execute([$hash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Участник не найден', 401);
        }

        $touch = $pdo->prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?');
        $touch->execute([date('Y-m-d H:i:s'), (int) $row['id']]);

        return $row;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function fetchSessionRow(int $sessionId): ?array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM sessions WHERE id = ? LIMIT 1');
        $stmt->execute([$sessionId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * @return array<string, mixed>
     */
    public function loadQuizContent(int $quizVersionId): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT content_json, version_number, content_hash, quiz_id
             FROM quiz_versions WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$quizVersionId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Версия теста не найдена', 404);
        }
        $content = json_decode((string) $row['content_json'], true);
        if (!is_array($content)) {
            throw new RuntimeException('Повреждённый снимок теста', 500);
        }
        $content['_meta'] = [
            'quiz_id' => (int) $row['quiz_id'],
            'version_number' => (int) $row['version_number'],
            'content_hash' => $row['content_hash'],
            'quiz_version_id' => $quizVersionId,
        ];

        return $content;
    }

    private function generateUniqueCode(PDO $pdo): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $code = '';
            for ($i = 0; $i < 8; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $check = $pdo->prepare('SELECT id FROM sessions WHERE session_code = ? LIMIT 1');
            $check->execute([$code]);
            if (!$check->fetchColumn()) {
                return $code;
            }
        }

        throw new RuntimeException('Не удалось сгенерировать код сессии', 500);
    }

    /**
     * @param list<string> $from
     * @param array<string, string|null> $extra
     * @return array<string, mixed>
     */
    private function transition(
        int $sessionId,
        array $from,
        string $to,
        array $extra = [],
        ?int $teacherId = null,
    ): array {
        $teacherId ??= $this->teachers->currentTeacherId();
        $row = $this->fetchSessionRow($sessionId);
        if (!$row || (int) $row['teacher_id'] !== $teacherId) {
            throw new RuntimeException('Сессия не найдена', 404);
        }
        if (!in_array($row['status'], $from, true)) {
            throw new RuntimeException(
                sprintf('Нельзя перевести сессию из «%s» в «%s»', $row['status'], $to),
                422
            );
        }

        $sets = ['status = ?'];
        $params = [$to];
        foreach ($extra as $column => $value) {
            $sets[] = $column . ' = ?';
            $params[] = $value;
        }
        $params[] = $sessionId;

        $pdo = Database::connection();
        $sql = 'UPDATE sessions SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $pdo->prepare($sql)->execute($params);

        return $this->getForTeacher($sessionId, $teacherId);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function presentTeacherSession(array $row): array
    {
        $port = $this->addresses->detectServerPort();
        $quiz = $this->loadQuizContent((int) $row['quiz_version_id']);
        $participants = $this->listParticipants((int) $row['id']);
        $settings = $this->decodeJson($row['settings_json'] ?? null);
        if (!is_array($settings)) {
            $settings = [];
        }
        $sessionPublic = isset($settings['public_base_url'])
            ? (string) $settings['public_base_url']
            : null;
        $effectivePublic = $this->addresses->normalizePublicBase($sessionPublic)
            ?? $this->addresses->configuredPublicBaseUrl();
        $joinBases = $this->addresses->joinBaseUrls($port, $sessionPublic);

        return [
            'id' => (int) $row['id'],
            'quiz_version_id' => (int) $row['quiz_version_id'],
            'quiz_title' => (string) ($quiz['title'] ?? 'Тест'),
            'session_code' => $row['session_code'],
            'status' => $row['status'],
            'settings' => $settings,
            'starts_at' => $row['starts_at'],
            'ends_at' => $row['ends_at'],
            'created_at' => $row['created_at'],
            'listen_port' => $port,
            'listen_addresses' => $this->addresses->listenAddresses(),
            'public_base_url' => $effectivePublic,
            'internet_enabled' => $effectivePublic !== null,
            'join_urls' => $joinBases,
            'join_urls_with_code' => array_map(
                fn (string $url) => $url . '?code=' . urlencode((string) $row['session_code']),
                $joinBases
            ),
            'participants' => $participants,
            'participants_count' => count($participants),
            'server_time' => date('c'),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function presentPublicSession(array $row): array
    {
        $quiz = $this->loadQuizContent((int) $row['quiz_version_id']);

        return [
            'id' => (int) $row['id'],
            'session_code' => $row['session_code'],
            'status' => $row['status'],
            'quiz_title' => (string) ($quiz['title'] ?? 'Тест'),
            'starts_at' => $row['starts_at'],
            'ends_at' => $row['ends_at'],
            'server_time' => date('c'),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function listParticipants(int $sessionId): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT p.id, p.display_name, p.status, p.joined_at, p.last_seen_at,
                    a.id AS attempt_id, a.status AS attempt_status, a.score, a.percentage, a.submitted_at
             FROM participants p
             LEFT JOIN attempts a ON a.participant_id = p.id
                AND a.id = (
                    SELECT MAX(a2.id) FROM attempts a2 WHERE a2.participant_id = p.id
                )
             WHERE p.session_id = ?
             ORDER BY p.joined_at ASC'
        );
        $stmt->execute([$sessionId]);

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'display_name' => $row['display_name'],
                'status' => $row['status'],
                'joined_at' => $row['joined_at'],
                'last_seen_at' => $row['last_seen_at'],
                'attempt_id' => $row['attempt_id'] !== null ? (int) $row['attempt_id'] : null,
                'attempt_status' => $row['attempt_status'],
                'score' => $row['score'] !== null ? (float) $row['score'] : null,
                'percentage' => $row['percentage'] !== null ? (float) $row['percentage'] : null,
                'submitted_at' => $row['submitted_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findActiveAttempt(int $participantId): ?array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, status, started_at, submitted_at, score, max_score, percentage, attempt_meta
             FROM attempts WHERE participant_id = ? ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$participantId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'status' => $row['status'],
            'started_at' => $row['started_at'],
            'submitted_at' => $row['submitted_at'],
            'score' => $row['score'] !== null ? (float) $row['score'] : null,
            'max_score' => $row['max_score'] !== null ? (float) $row['max_score'] : null,
            'percentage' => $row['percentage'] !== null ? (float) $row['percentage'] : null,
            'meta' => $this->decodeJson($row['attempt_meta'] ?? null),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJson(mixed $value): array
    {
        if (!is_string($value) || $value === '') {
            return [];
        }
        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param mixed $events
     * @return array{count: int, last_at: string|null}|null
     */
    private function summarizeFocus(mixed $events): ?array
    {
        if (!is_array($events) || $events === []) {
            return null;
        }
        $count = 0;
        $lastAt = null;
        foreach ($events as $event) {
            if (!is_array($event)) {
                continue;
            }
            $count++;
            $at = (string) ($event['at'] ?? '');
            if ($at !== '') {
                $lastAt = $at;
            }
        }
        if ($count === 0) {
            return null;
        }

        return [
            'count' => $count,
            'last_at' => $lastAt,
        ];
    }

    private function isEmptyAnswer(string $type, mixed $answer): bool
    {
        if ($answer === null) {
            return true;
        }
        if (!is_array($answer)) {
            return $answer === '' || $answer === [];
        }

        return match ($type) {
            'single_choice', 'true_false' => empty($answer['optionId']),
            'multiple_choice' => empty($answer['optionIds']),
            'text' => trim((string) ($answer['text'] ?? '')) === '',
            'numeric' => !isset($answer['value']) || $answer['value'] === '' || (is_float($answer['value']) && is_nan($answer['value'])),
            'ordering' => empty($answer['order']),
            'fill_blanks' => empty($answer['blanks']),
            'matching' => empty($answer['matches']),
            default => $answer === [],
        };
    }

    /**
     * @param array<string, mixed> $question
     */
    private function formatGiven(array $question, mixed $answer): string
    {
        $type = (string) ($question['type'] ?? '');
        if (!is_array($answer)) {
            return (string) $answer;
        }

        return match ($type) {
            'single_choice', 'true_false' => $this->optionText($question, (string) ($answer['optionId'] ?? '')),
            'multiple_choice' => implode(', ', array_map(
                fn ($id) => $this->optionText($question, (string) $id),
                is_array($answer['optionIds'] ?? null) ? $answer['optionIds'] : []
            )) ?: '—',
            'text' => (string) ($answer['text'] ?? ''),
            'numeric' => isset($answer['value']) && !is_nan((float) $answer['value'])
                ? (string) $answer['value'] : '—',
            'ordering' => implode(' → ', array_map(
                fn ($id) => $this->itemText($question, (string) $id),
                is_array($answer['order'] ?? null) ? $answer['order'] : []
            )) ?: '—',
            'fill_blanks' => $this->formatMap($answer['blanks'] ?? []),
            'matching' => $this->formatMatchingGiven($question, $answer['matches'] ?? []),
            default => json_encode($answer, JSON_UNESCAPED_UNICODE) ?: '—',
        };
    }

    /**
     * @param array<string, mixed> $question
     */
    private function formatExpected(array $question): string
    {
        $type = (string) ($question['type'] ?? '');

        return match ($type) {
            'single_choice', 'true_false' => $this->correctOptionTexts($question),
            'multiple_choice' => $this->correctOptionTexts($question),
            'text' => implode(' / ', array_map('strval', $question['acceptedAnswers'] ?? [])) ?: '—',
            'numeric' => isset($question['correctValue'])
                ? (string) $question['correctValue']
                    . (isset($question['tolerance']) && (float) $question['tolerance'] > 0
                        ? ' ±' . $question['tolerance'] : '')
                : '—',
            'ordering' => implode(' → ', array_map(
                static fn ($item) => (string) ($item['text'] ?? $item['id'] ?? ''),
                $question['items'] ?? []
            )) ?: '—',
            'fill_blanks' => implode('; ', array_map(
                static function ($blank) {
                    $id = (string) ($blank['id'] ?? '');
                    $answers = implode('|', array_map('strval', $blank['acceptedAnswers'] ?? []));

                    return $id . '=' . $answers;
                },
                $question['blanks'] ?? []
            )) ?: '—',
            'matching' => implode('; ', array_map(
                static fn ($p) => ($p['leftText'] ?? $p['leftId'] ?? '') . ' → ' . ($p['rightText'] ?? $p['rightId'] ?? ''),
                $question['pairs'] ?? []
            )) ?: '—',
            default => '—',
        };
    }

    /** @param array<string, mixed> $question */
    private function optionText(array $question, string $optionId): string
    {
        foreach ($question['options'] ?? [] as $option) {
            if ((string) ($option['id'] ?? '') === $optionId) {
                return (string) ($option['text'] ?? $optionId);
            }
        }

        return $optionId !== '' ? $optionId : '—';
    }

    /** @param array<string, mixed> $question */
    private function itemText(array $question, string $itemId): string
    {
        foreach ($question['items'] ?? [] as $item) {
            if ((string) ($item['id'] ?? '') === $itemId) {
                return (string) ($item['text'] ?? $itemId);
            }
        }

        return $itemId !== '' ? $itemId : '—';
    }

    /** @param array<string, mixed> $question */
    private function correctOptionTexts(array $question): string
    {
        $texts = [];
        foreach ($question['options'] ?? [] as $option) {
            if (!empty($option['correct'])) {
                $texts[] = (string) ($option['text'] ?? $option['id'] ?? '');
            }
        }

        return $texts !== [] ? implode(', ', $texts) : '—';
    }

    /** @param mixed $map */
    private function formatMap(mixed $map): string
    {
        if (!is_array($map) || $map === []) {
            return '—';
        }
        $parts = [];
        foreach ($map as $key => $value) {
            $parts[] = $key . '=' . (string) $value;
        }

        return implode('; ', $parts);
    }

    /**
     * @param array<string, mixed> $question
     * @param mixed $matches
     */
    private function formatMatchingGiven(array $question, mixed $matches): string
    {
        if (!is_array($matches) || $matches === []) {
            return '—';
        }
        $rightLabels = [];
        foreach ($question['pairs'] ?? [] as $pair) {
            $rightLabels[(string) ($pair['rightId'] ?? '')] = (string) ($pair['rightText'] ?? $pair['rightId'] ?? '');
        }
        $leftLabels = [];
        foreach ($question['pairs'] ?? [] as $pair) {
            $leftLabels[(string) ($pair['leftId'] ?? '')] = (string) ($pair['leftText'] ?? $pair['leftId'] ?? '');
        }
        $parts = [];
        foreach ($matches as $leftId => $rightId) {
            $left = $leftLabels[(string) $leftId] ?? (string) $leftId;
            $right = $rightLabels[(string) $rightId] ?? (string) $rightId;
            $parts[] = $left . ' → ' . $right;
        }

        return implode('; ', $parts);
    }
}
