<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Support\ContentDisposition;

final class ContentDispositionTest extends TestCase
{
    public function testUtf8FilenameStarAndAsciiFallback(): void
    {
        $header = ContentDisposition::attachment('Тест_деловых_windows.exe');
        $this->assertStringContainsString("filename*=UTF-8''", $header);
        $this->assertStringContainsString(rawurlencode('Тест_деловых_windows.exe'), $header);
        $this->assertMatchesRegularExpression('/filename="[A-Za-z0-9._-]+"/', $header);
        $this->assertStringNotContainsString('Тест', explode('filename*=', $header)[0]);
    }
}
