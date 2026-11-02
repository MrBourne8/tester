<?php

declare(strict_types=1);

namespace UniTest\Services;

use RuntimeException;

/**
 * Контрольная сумма .result, совместимая с resources/js/player/result.js.
 */
final class ResultChecksum
{
    /**
     * @param array<string, mixed> $payload
     */
    public function verify(array $payload): void
    {
        if (($payload['format'] ?? null) !== 'unitest-result') {
            throw new RuntimeException('Неверный format результата', 422);
        }
        if (($payload['schemaVersion'] ?? null) !== '1.0') {
            throw new RuntimeException('Неподдерживаемая schemaVersion результата', 422);
        }

        $given = strtolower((string) ($payload['checksum'] ?? ''));
        if ($given === '' || !preg_match('/^[a-f0-9]{64}$/', $given)) {
            throw new RuntimeException('В файле нет корректной контрольной суммы', 422);
        }

        $expected = $this->checksum($payload);
        if (!hash_equals($expected, $given)) {
            throw new RuntimeException('Контрольная сумма результата не совпала', 422);
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function checksum(array $payload): string
    {
        $copy = $payload;
        unset($copy['checksum']);

        return hash('sha256', $this->canonicalJson($copy));
    }

    /**
     * @param mixed $value
     */
    public function canonicalJson(mixed $value): string
    {
        $sorted = $this->sortKeys($value);
        $json = json_encode($sorted, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Не удалось сериализовать результат', 500);
        }

        return $json;
    }

    /**
     * @param mixed $value
     * @return mixed
     */
    private function sortKeys(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            return array_map(fn ($item) => $this->sortKeys($item), $value);
        }

        $keys = array_keys($value);
        sort($keys, SORT_STRING);
        $out = [];
        foreach ($keys as $key) {
            $out[$key] = $this->sortKeys($value[$key]);
        }

        return $out;
    }
}
