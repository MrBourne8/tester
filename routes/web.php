<?php

declare(strict_types=1);

use UniTest\Http\Controllers\EditorController;
use UniTest\Http\Controllers\HomeController;
use UniTest\Http\Controllers\PlayerController;
use UniTest\Http\Controllers\ReportController;
use UniTest\Http\Controllers\SessionUiController;
use UniTest\Support\Router;

/** @var Router $router */

$router->get('/', [HomeController::class, 'index']);
$router->get('/editor', [EditorController::class, 'index']);
$router->get('/editor/{id}', [EditorController::class, 'index']);
$router->get('/player', [PlayerController::class, 'show']);
$router->get('/player/{id}', [PlayerController::class, 'show']);
$router->get('/session/{id}', [SessionUiController::class, 'teacher']);
$router->get('/join', [SessionUiController::class, 'join']);
$router->get('/reports', [ReportController::class, 'page']);
