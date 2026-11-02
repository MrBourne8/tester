<?php

declare(strict_types=1);

namespace UniTest\Services;

use RuntimeException;

final class JoinRateLimiter
{
    public function __construct(
        private readonly string $storageDir = '',
        private readonly int $maxAttempts = 20,
        private readonly int $windowSeconds = 60,
    ) {
    }

    public function assertAllowed(string $ip): void
    {
        $dir = $this->storageDir !== '' ? $this->storageDir : dirname(__DIR__, 2) . '/storage/rate';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $key = hash('sha256', $ip);
        $file = $dir . '/join_' . $key . '.json';
        $now = time();
        $entries = [];

        if (is_file($file)) {
            $decoded = json_decode((string) file_get_contents($file), true);
            if (is_array($decoded)) {
                $window = $this->windowSeconds;
                $entries = array_values(array_filter(
                    $decoded,
                    static fn ($ts) => is_int($ts) && $ts > $now - $window
                ));
            }
        }

        if (count($entries) >= $this->maxAttempts) {
            throw new RuntimeException('Слишком много попыток подключения. Подождите минуту.', 429);
        }

        $entries[] = $now;
        file_put_contents($file, json_encode($entries), LOCK_EX);
    }
}
