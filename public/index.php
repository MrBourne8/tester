<?php

declare(strict_types=1);

use UniTest\Support\Request;

$app = require dirname(__DIR__) . '/bootstrap/app.php';
$response = $app->handle(Request::fromGlobals());
$response->send();
