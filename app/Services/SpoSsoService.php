<?php

declare(strict_types=1);

namespace UniTest\Services;

use PDO;
use UniTest\Support\Database;
use UniTest\Support\Env;

final class SpoSsoService
{
    public function sharedSecret(): string
    {
        $fromEnv = trim((string) Env::get('SPO_SSO_SECRET', ''));
        if ($fromEnv !== '') {
            return $fromEnv;
        }

        $file = $this->sharedSecretFilePath();
        if (is_file($file)) {
            $secret = trim((string) file_get_contents($file));
            if ($secret !== '') {
                return $secret;
            }
        }

        $secret = bin2hex(random_bytes(32));
        $dir = dirname($file);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        file_put_contents($file, $secret . PHP_EOL);

        return $secret;
    }

    public function sharedSecretFilePath(): string
    {
        // domains/localhost/.spo_testoria_sso_secret (рядом с kpk2.0 и testoria/tester)
        return dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . '.spo_testoria_sso_secret';
    }

    /**
     * @return array{uid:int,name:string,email:string,phone:string,role:string}|null
     */
    public function parseTicket(string $ticket): ?array
    {
        $ticket = trim($ticket);
        $parts = explode('.', $ticket, 2);
        if (count($parts) !== 2) {
            return null;
        }

        [$body, $sig] = $parts;
        $expected = hash_hmac('sha256', $body, $this->sharedSecret());
        if (!hash_equals($expected, $sig)) {
            return null;
        }

        $json = base64_decode(strtr($body, '-_', '+/'), true);
        if ($json === false) {
            return null;
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }

        $uid = (int) ($data['uid'] ?? 0);
        $exp = (int) ($data['exp'] ?? 0);
        if ($uid <= 0 || $exp < time()) {
            return null;
        }

        return [
            'uid' => $uid,
            'name' => trim((string) ($data['name'] ?? '')),
            'email' => trim((string) ($data['email'] ?? '')),
            'phone' => trim((string) ($data['phone'] ?? '')),
            'role' => 'teacher',
        ];
    }

    /**
     * @param array{uid:int,name:string,email:string,phone:string,role:string} $identity
     */
    public function loginFromSpo(array $identity): int
    {
        $pdo = Database::connection();
        $spoId = $identity['uid'];

        $stmt = $pdo->prepare('SELECT id FROM users WHERE spo_user_id = ? LIMIT 1');
        $stmt->execute([$spoId]);
        $existing = $stmt->fetchColumn();
        if ($existing !== false) {
            $teacherId = (int) $existing;
            $pdo->prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
                ->execute([
                    $identity['name'] !== '' ? $identity['name'] : 'Преподаватель',
                    date('Y-m-d H:i:s'),
                    $teacherId,
                ]);
            $this->startSession($teacherId);

            return $teacherId;
        }

        $email = $identity['email'] !== ''
            ? $identity['email']
            : ('spo_' . $spoId . '@unitest.local');
        $now = date('Y-m-d H:i:s');

        $checkEmail = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $checkEmail->execute([$email]);
        $byEmail = $checkEmail->fetchColumn();
        if ($byEmail !== false) {
            $teacherId = (int) $byEmail;
            $pdo->prepare('UPDATE users SET spo_user_id = ?, name = ?, role = ?, updated_at = ? WHERE id = ?')
                ->execute([
                    $spoId,
                    $identity['name'] !== '' ? $identity['name'] : 'Преподаватель',
                    'teacher',
                    $now,
                    $teacherId,
                ]);
            $this->startSession($teacherId);

            return $teacherId;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO users (name, email, password_hash, role, spo_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $identity['name'] !== '' ? $identity['name'] : 'Преподаватель',
            $email,
            password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
            'teacher',
            $spoId,
            $now,
            $now,
        ]);

        $teacherId = (int) $pdo->lastInsertId();
        $this->startSession($teacherId);

        return $teacherId;
    }

    public function startSession(int $teacherId): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        session_regenerate_id(true);
        $_SESSION['unitest_teacher_id'] = $teacherId;
    }

    public function currentTeacherId(): ?int
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $id = (int) ($_SESSION['unitest_teacher_id'] ?? 0);

        return $id > 0 ? $id : null;
    }

    /**
     * @return array{id:int,name:string}|null
     */
    public function currentTeacher(): ?array
    {
        $id = $this->currentTeacherId();
        if ($id === null) {
            return null;
        }

        $stmt = Database::connection()->prepare(
            'SELECT id, name FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'name' => (string) ($row['name'] ?? ''),
        ];
    }
}
