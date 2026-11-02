<?php

declare(strict_types=1);

namespace UniTest\Tests\Unit;

use PHPUnit\Framework\TestCase;
use UniTest\Services\PlatformCatalog;

final class PlatformCatalogTest extends TestCase
{
    public function testDescribeContainsWebAndAutonomousList(): void
    {
        $catalog = (new PlatformCatalog())->describe();
        $this->assertArrayHasKey('web', $catalog);
        $this->assertArrayHasKey('windows', $catalog);
        $this->assertArrayHasKey('macos', $catalog);
        $this->assertArrayHasKey('linux', $catalog);
        $this->assertArrayHasKey('autonomous', $catalog);
        $this->assertSame(PHP_OS_FAMILY, $catalog['host_os']);
        $this->assertCount(3, $catalog['autonomous']);
        $ids = array_column($catalog['autonomous'], 'id');
        $this->assertSame(['windows', 'macos', 'linux'], $ids);
    }
}
