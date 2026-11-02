<?php

declare(strict_types=1);

namespace UniTest\Services;

use RuntimeException;

/**
 * Вшивает quiz-data.js в конец Windows EXE (overlay), без пересборки Rust.
 * Хвост файла: [payload UTF-8][magic UNITSTQ1][u64 LE длина payload]
 */
final class ExeQuizEmbedder
{
    public const MAGIC = 'UNITSTQ1';

    /**
     * Копирует базовый EXE и дописывает payload. Старый overlay снимается.
     */
    public function embed(string $baseExePath, string $quizDataJs, string $targetExePath): string
    {
        if (!is_file($baseExePath)) {
            throw new RuntimeException('Базовый unitest-player.exe не найден');
        }
        if ($quizDataJs === '') {
            throw new RuntimeException('Пустой quiz-data.js');
        }

        $raw = file_get_contents($baseExePath);
        if ($raw === false) {
            throw new RuntimeException('Не удалось прочитать базовый EXE');
        }

        $raw = $this->stripOverlay($raw);
        $len = strlen($quizDataJs);
        if ($len > 64 * 1024 * 1024) {
            throw new RuntimeException('Тест слишком большой для встраивания в EXE');
        }

        $dir = dirname($targetExePath);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Не удалось создать каталог для EXE');
        }

        $out = $raw . $quizDataJs . self::MAGIC . $this->packUint64Le($len);
        if (file_put_contents($targetExePath, $out) === false) {
            throw new RuntimeException('Не удалось записать EXE со встроенным тестом');
        }

        return $targetExePath;
    }

    public function stripOverlay(string $binary): string
    {
        $extracted = $this->extractPayload($binary);
        if ($extracted === null) {
            return $binary;
        }

        $tailLen = $extracted['length'] + strlen(self::MAGIC) + 8;
        $cut = strlen($binary) - $tailLen;
        if ($cut < 1) {
            return $binary;
        }

        return substr($binary, 0, $cut);
    }

    /**
     * @return array{payload: string, length: int}|null
     */
    public function extractPayload(string $binary): ?array
    {
        $magicLen = strlen(self::MAGIC);
        $minTail = $magicLen + 8;
        if (strlen($binary) < $minTail + 1) {
            return null;
        }

        $magic = substr($binary, -8 - $magicLen, $magicLen);
        if ($magic !== self::MAGIC) {
            return null;
        }

        $length = $this->unpackUint64Le(substr($binary, -8));
        if ($length < 1 || $length > 64 * 1024 * 1024) {
            return null;
        }

        $totalTail = $length + $magicLen + 8;
        if (strlen($binary) < $totalTail) {
            return null;
        }

        $payload = substr($binary, -$totalTail, $length);
        if ($payload === false || strlen($payload) !== $length) {
            return null;
        }

        return ['payload' => $payload, 'length' => $length];
    }

    private function packUint64Le(int $value): string
    {
        $hi = intdiv($value, 0x100000000);
        $lo = $value % 0x100000000;

        return pack('V2', $lo, $hi);
    }

    private function unpackUint64Le(string $bytes): int
    {
        if (strlen($bytes) !== 8) {
            return 0;
        }
        $parts = unpack('Vlo/Vhi', $bytes);
        if ($parts === false) {
            return 0;
        }

        return ((int) $parts['hi'] * 0x100000000) + (int) $parts['lo'];
    }
}
