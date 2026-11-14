<?php

declare(strict_types=1);

namespace UniTest\Services;

use RuntimeException;

/**
 * Контекст преподавателя только из SSO-сессии СПО-ПРОГРЕСС.
 */
final class TeacherContext
{
    public function currentTeacherId(): int
    {
        $sso = new SpoSsoService();
        $fromSession = $sso->currentTeacherId();
        if ($fromSession !== null) {
            return $fromSession;
        }

        throw new RuntimeException('Требуется вход через СПО-ПРОГРЕСС');
    }
}
