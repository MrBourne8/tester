<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Services\ExeQuizEmbedder;

final class ExeQuizEmbedderTest extends TestCase
{
    public function testEmbedExtractAndReembed(): void
    {
        $base = sys_get_temp_dir() . '/unitest_base_' . bin2hex(random_bytes(3)) . '.exe';
        $out1 = sys_get_temp_dir() . '/unitest_out1_' . bin2hex(random_bytes(3)) . '.exe';
        $out2 = sys_get_temp_dir() . '/unitest_out2_' . bin2hex(random_bytes(3)) . '.exe';

        // Минимальный «бинарник» (не настоящий PE — для overlay этого достаточно)
        file_put_contents($base, "MZ-FAKE-EXE-BODY\0\0\0");

        $payload1 = "window.__UNITEST_QUIZ__ = {\"id\":\"a\"};\n";
        $payload2 = "window.__UNITEST_QUIZ__ = {\"id\":\"b\",\"title\":\"X\"};\n";

        $embedder = new ExeQuizEmbedder();
        try {
            $embedder->embed($base, $payload1, $out1);
            $raw1 = (string) file_get_contents($out1);
            $extracted = $embedder->extractPayload($raw1);
            $this->assertNotNull($extracted);
            $this->assertSame($payload1, $extracted['payload']);

            // Повторный embed поверх уже вшитого — старый хвост снимается
            $embedder->embed($out1, $payload2, $out2);
            $raw2 = (string) file_get_contents($out2);
            $extracted2 = $embedder->extractPayload($raw2);
            $this->assertNotNull($extracted2);
            $this->assertSame($payload2, $extracted2['payload']);
            $this->assertSame(1, substr_count($raw2, ExeQuizEmbedder::MAGIC));
        } finally {
            @unlink($base);
            @unlink($out1);
            @unlink($out2);
        }
    }
}
