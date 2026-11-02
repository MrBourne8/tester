<?php

declare(strict_types=1);

use UniTest\Support\Application;
use UniTest\Support\Env;

require dirname(__DIR__) . '/vendor/autoload.php';

Env::load(dirname(__DIR__));

$app = Application::create(dirname(__DIR__));

return $app;
