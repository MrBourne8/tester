<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use RuntimeException;
use UniTest\Support\Database;
use UniTest\Support\Env;

final class PublicationService
{
    public function __construct(
        private readonly TeacherContext $teachers = new TeacherContext(),
        private readonly QuizService $quizzes = new QuizService(),
        private readonly SessionService $sessions = new SessionService(),
        private readonly NetworkAddressService $addresses = new NetworkAddressService(),
        private readonly JoinRateLimiter $rateLimiter = new JoinRateLimiter(),
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function getForQuiz(int $quizId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $quiz = $this->quizzes->get($quizId, $teacherId);
        $pub = $this->findLatestForQuiz($quizId, $teacherId);
        if ($pub) {
            $pub = $this->refreshExpiryStatus($pub);
        }

        return [
            'quiz' => [
                'id' => (int) $quiz['id'],
                'title' => $quiz['title'],
                'version_number' => $quiz['version_number'] ?? null,
            ],
            'publication' => $pub ? $this->present($pub) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publish(int $quizId, int $durationHours, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $quiz = $this->quizzes->get($quizId, $teacherId);
        if (empty($quiz['current_version_id'])) {
            throw new RuntimeException('У теста нет сохранённой версии', 422);
        }

        $durationHours = $this->normalizeDuration($durationHours);
        $existing = $this->findLatestForQuiz($quizId, $teacherId);
        if ($existing) {
            $existing = $this->refreshExpiryStatus($existing);
            if (($existing['status'] ?? '') === 'active') {
                throw new RuntimeException('Публикация уже активна. Измените срок или отзовите её.', 409);
            }
        }

        return $this->createPublication($quizId, $teacherId, $durationHours, $existing['public_slug'] ?? null);
    }

    /**
     * @return array<string, mixed>
     */
    public function republish(int $quizId, int $durationHours, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $this->quizzes->get($quizId, $teacherId);
        $existing = $this->findLatestForQuiz($quizId, $teacherId);
        if (!$existing) {
            return $this->publish($quizId, $durationHours, $teacherId);
        }

        $existing = $this->refreshExpiryStatus($existing);
        if (($existing['status'] ?? '') === 'active') {
            $this->revokeInternal($existing);
        }

        $durationHours = $this->normalizeDuration($durationHours);
        return $this->createPublication($quizId, $teacherId, $durationHours, (string) $existing['public_slug']);
    }

    /**
     * @return array<string, mixed>
     */
    public function updateDuration(int $quizId, int $durationHours, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pub = $this->requireLatest($quizId, $teacherId);
        $pub = $this->refreshExpiryStatus($pub);
        if (($pub['status'] ?? '') !== 'active') {
            throw new RuntimeException('Активной публикации нет — опубликуйте тест заново', 409);
        }

        $durationHours = $this->normalizeDuration($durationHours);
        $expiresAt = date('Y-m-d H:i:s', time() + $durationHours * 3600);
        $now = date('Y-m-d H:i:s');
        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE quiz_publications SET duration_hours = ?, expires_at = ?, updated_at = ? WHERE id = ?'
        )->execute([$durationHours, $expiresAt, $now, (int) $pub['id']]);

        $pdo->prepare('UPDATE sessions SET ends_at = ? WHERE id = ?')
            ->execute([$expiresAt, (int) $pub['session_id']]);

        return $this->getForQuiz($quizId, $teacherId);
    }

    /**
     * @return array<string, mixed>
     */
    public function revoke(int $quizId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pub = $this->requireLatest($quizId, $teacherId);
        $this->revokeInternal($pub);
        return $this->getForQuiz($quizId, $teacherId);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function results(int $quizId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pub = $this->findLatestForQuiz($quizId, $teacherId);
        if (!$pub) {
            return [];
        }
        try {
            return $this->sessions->results((int) $pub['session_id'], $teacherId);
        } catch (RuntimeException) {
            return [];
        }
    }

    /**
     * Все публикации преподавателя (включая истёкшие/отозванные) со сводкой.
     *
     * @return list<array<string, mixed>>
     */
    public function listForTeacher(?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT qp.*, q.title AS quiz_title,
                    (SELECT COUNT(*) FROM participants p WHERE p.session_id = qp.session_id) AS participants_count,
                    (SELECT COUNT(*) FROM attempts a
                      WHERE a.session_id = qp.session_id AND a.status = \'submitted\') AS submitted_count,
                    (SELECT AVG(a.percentage) FROM attempts a
                      WHERE a.session_id = qp.session_id AND a.status = \'submitted\') AS avg_percentage
             FROM quiz_publications qp
             INNER JOIN quizzes q ON q.id = qp.quiz_id
             WHERE qp.teacher_id = ?
             ORDER BY qp.created_at DESC, qp.id DESC'
        );
        $stmt->execute([$teacherId]);

        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $row = $this->refreshExpiryStatus($row);
            $presented = $this->present($row);
            $presented['quiz_title'] = (string) ($row['quiz_title'] ?? 'Тест');
            $presented['participants_count'] = (int) ($row['participants_count'] ?? 0);
            $presented['submitted_count'] = (int) ($row['submitted_count'] ?? 0);
            $avg = $row['avg_percentage'] ?? null;
            $presented['avg_percentage'] = $avg !== null ? round((float) $avg, 1) : null;
            $out[] = $presented;
        }

        return $out;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function resultsByPublicationId(int $publicationId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pub = $this->findOwnedPublication($publicationId, $teacherId);
        try {
            return $this->sessions->results((int) $pub['session_id'], $teacherId);
        } catch (RuntimeException) {
            return [];
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function getById(int $publicationId, ?int $teacherId = null): array
    {
        $teacherId ??= $this->teachers->currentTeacherId();
        $pub = $this->findOwnedPublication($publicationId, $teacherId);
        $pub = $this->refreshExpiryStatus($pub);

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id, title FROM quizzes WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $pub['quiz_id']]);
        $quiz = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['id' => $pub['quiz_id'], 'title' => 'Тест'];

        return [
            'quiz' => [
                'id' => (int) $quiz['id'],
                'title' => (string) ($quiz['title'] ?? 'Тест'),
            ],
            'publication' => $this->present($pub),
        ];
    }

    /**
     * Публичные данные по slug (без авторизации преподавателя).
     *
     * @return array<string, mixed>
     */
    public function publicInfo(string $slug): array
    {
        $pub = $this->findBySlug($slug);
        if (!$pub) {
            throw new RuntimeException('Публикация не найдена', 404);
        }
        $pub = $this->refreshExpiryStatus($pub);
        if (($pub['status'] ?? '') !== 'active') {
            throw new RuntimeException('Срок действия ссылки истёк или публикация отозвана', 403);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT title FROM quizzes WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $pub['quiz_id']]);
        $title = (string) ($stmt->fetchColumn() ?: 'Тест');

        return [
            'slug' => $pub['public_slug'],
            'title' => $title,
            'expires_at' => $pub['expires_at'],
            'status' => 'active',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function join(string $slug, string $displayName, string $clientIp): array
    {
        $this->rateLimiter->assertAllowed($clientIp);
        $pub = $this->findBySlug($slug);
        if (!$pub) {
            throw new RuntimeException('Публикация не найдена', 404);
        }
        $pub = $this->refreshExpiryStatus($pub);
        if (($pub['status'] ?? '') !== 'active') {
            throw new RuntimeException('Срок действия ссылки истёк', 403);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT session_code FROM sessions WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $pub['session_id']]);
        $code = (string) ($stmt->fetchColumn() ?: '');
        if ($code === '') {
            throw new RuntimeException('Сессия публикации недоступна', 404);
        }

        $joined = $this->sessions->join($code, $displayName, $clientIp);
        $joined['session']['mode'] = 'published';
        $joined['publication'] = [
            'slug' => $pub['public_slug'],
            'expires_at' => $pub['expires_at'],
        ];
        return $joined;
    }

    /**
     * @param array<string, mixed> $pub
     * @return array<string, mixed>
     */
    private function createPublication(int $quizId, int $teacherId, int $durationHours, ?string $keepSlug): array
    {
        $session = $this->sessions->createFromQuiz($quizId, [
            'mode' => 'published',
        ], $teacherId);
        $sessionId = (int) $session['id'];
        $this->sessions->start($sessionId, $teacherId);

        $expiresAt = date('Y-m-d H:i:s', time() + $durationHours * 3600);
        $pdo = Database::connection();
        $pdo->prepare('UPDATE sessions SET ends_at = ? WHERE id = ?')
            ->execute([$expiresAt, $sessionId]);

        $slug = $keepSlug && preg_match('/^[a-zA-Z0-9]{8,32}$/', $keepSlug)
            ? $keepSlug
            : $this->generateSlug($pdo);
        $now = date('Y-m-d H:i:s');

        // Освобождаем slug у прошлых записей, чтобы сохранить историю сессий.
        if ($keepSlug) {
            $arch = $pdo->prepare(
                'SELECT id, public_slug FROM quiz_publications
                 WHERE teacher_id = ? AND public_slug = ?'
            );
            $arch->execute([$teacherId, $slug]);
            foreach ($arch->fetchAll(PDO::FETCH_ASSOC) ?: [] as $old) {
                $archivedSlug = 'arch' . (int) $old['id'];
                $pdo->prepare(
                    'UPDATE quiz_publications SET public_slug = ?, updated_at = ? WHERE id = ?'
                )->execute([$archivedSlug, $now, (int) $old['id']]);
            }
        }

        $pdo->prepare(
            'INSERT INTO quiz_publications
             (quiz_id, teacher_id, session_id, public_slug, status, duration_hours, expires_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, \'active\', ?, ?, ?, ?)'
        )->execute([$quizId, $teacherId, $sessionId, $slug, $durationHours, $expiresAt, $now, $now]);

        return $this->getForQuiz($quizId, $teacherId);
    }

    /**
     * @param array<string, mixed> $pub
     */
    private function revokeInternal(array $pub): void
    {
        $pdo = Database::connection();
        $now = date('Y-m-d H:i:s');
        $pdo->prepare(
            'UPDATE quiz_publications SET status = \'revoked\', updated_at = ? WHERE id = ?'
        )->execute([$now, (int) $pub['id']]);
        try {
            $this->sessions->close((int) $pub['session_id'], (int) $pub['teacher_id']);
        } catch (RuntimeException) {
            // already closed
        }
    }

    /**
     * @param array<string, mixed> $pub
     * @return array<string, mixed>
     */
    private function refreshExpiryStatus(array $pub): array
    {
        if (($pub['status'] ?? '') !== 'active') {
            return $pub;
        }
        if (strtotime((string) $pub['expires_at']) > time()) {
            return $pub;
        }

        $pdo = Database::connection();
        $now = date('Y-m-d H:i:s');
        $pdo->prepare(
            'UPDATE quiz_publications SET status = \'expired\', updated_at = ? WHERE id = ? AND status = \'active\''
        )->execute([$now, (int) $pub['id']]);
        try {
            $this->sessions->close((int) $pub['session_id'], (int) $pub['teacher_id']);
        } catch (RuntimeException) {
        }
        $pub['status'] = 'expired';
        $pub['updated_at'] = $now;
        return $pub;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findLatestForQuiz(int $quizId, int $teacherId): ?array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT * FROM quiz_publications
             WHERE quiz_id = ? AND teacher_id = ?
             ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$quizId, $teacherId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * @return array<string, mixed>
     */
    private function findOwnedPublication(int $publicationId, int $teacherId): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT * FROM quiz_publications WHERE id = ? AND teacher_id = ? LIMIT 1'
        );
        $stmt->execute([$publicationId, $teacherId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Публикация не найдена', 404);
        }
        return $row;
    }

    /**
     * @return array<string, mixed>
     */
    private function requireLatest(int $quizId, int $teacherId): array
    {
        $pub = $this->findLatestForQuiz($quizId, $teacherId);
        if (!$pub) {
            throw new RuntimeException('Публикация не найдена', 404);
        }
        return $pub;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findBySlug(string $slug): ?array
    {
        $slug = preg_replace('/[^a-zA-Z0-9]/', '', $slug) ?? '';
        if ($slug === '') {
            return null;
        }
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM quiz_publications WHERE public_slug = ? LIMIT 1');
        $stmt->execute([$slug]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $pub
     * @return array<string, mixed>
     */
    private function present(array $pub): array
    {
        $slug = (string) $pub['public_slug'];
        $path = '/p/' . $slug;
        $base = $this->addresses->configuredPublicBaseUrl()
            ?: rtrim((string) Env::get('APP_URL', ''), '/');
        if ($base === '') {
            $base = null;
        }
        $absolute = $base ? ($base . $path) : $path;
        $remaining = max(0, strtotime((string) $pub['expires_at']) - time());

        return [
            'id' => (int) $pub['id'],
            'quiz_id' => (int) $pub['quiz_id'],
            'session_id' => (int) $pub['session_id'],
            'slug' => $slug,
            'status' => $pub['status'],
            'duration_hours' => (int) $pub['duration_hours'],
            'expires_at' => $pub['expires_at'],
            'remaining_seconds' => $remaining,
            'path' => $path,
            'url' => $absolute,
            'created_at' => $pub['created_at'],
            'updated_at' => $pub['updated_at'],
        ];
    }

    private function normalizeDuration(int $hours): int
    {
        $allowed = [1, 6, 12, 24, 72, 168, 720];
        if (!in_array($hours, $allowed, true)) {
            throw new RuntimeException('Допустимая длительность: 1, 6, 12, 24, 72, 168 или 720 часов', 422);
        }
        return $hours;
    }

    private function generateSlug(PDO $pdo): string
    {
        for ($i = 0; $i < 12; $i++) {
            $slug = bin2hex(random_bytes(8));
            $check = $pdo->prepare('SELECT id FROM quiz_publications WHERE public_slug = ? LIMIT 1');
            $check->execute([$slug]);
            if (!$check->fetchColumn()) {
                return $slug;
            }
        }
        throw new RuntimeException('Не удалось создать ссылку публикации', 500);
    }
}
