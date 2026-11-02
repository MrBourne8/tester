<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Support\Env;

final class EnvTest extends TestCase
{
    public function testEnvReturnsDefaultWhenMissing(): void
    {
        $this->assertSame('fallback', Env::get('UNITEST_MISSING_KEY_FOR_TEST', 'fallback'));
    }
}
