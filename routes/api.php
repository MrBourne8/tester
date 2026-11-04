<?php

declare(strict_types=1);

use UniTest\Http\Controllers\AttemptController;
use UniTest\Http\Controllers\FolderController;
use UniTest\Http\Controllers\HealthController;
use UniTest\Http\Controllers\PublicationController;
use UniTest\Http\Controllers\QuizController;
use UniTest\Http\Controllers\ReportController;
use UniTest\Http\Controllers\SessionController;
use UniTest\Support\Router;

/** @var Router $router */

$router->get('/api/v1/health', [HealthController::class, '__invoke']);

$router->get('/api/v1/folders', [FolderController::class, 'index']);
$router->post('/api/v1/folders', [FolderController::class, 'store']);
$router->put('/api/v1/folders/{id}', [FolderController::class, 'update']);
$router->delete('/api/v1/folders/{id}', [FolderController::class, 'destroy']);

$router->get('/api/v1/quizzes', [QuizController::class, 'index']);
$router->post('/api/v1/quizzes', [QuizController::class, 'store']);
$router->get('/api/v1/quizzes/{id}', [QuizController::class, 'show']);
$router->put('/api/v1/quizzes/{id}', [QuizController::class, 'update']);
$router->delete('/api/v1/quizzes/{id}', [QuizController::class, 'destroy']);
$router->post('/api/v1/quizzes/{id}/duplicate', [QuizController::class, 'duplicate']);
$router->put('/api/v1/quizzes/{id}/folder', [QuizController::class, 'setFolder']);
$router->post('/api/v1/quizzes/{id}/export', [QuizController::class, 'export']);
$router->post('/api/v1/quizzes/{id}/export-standalone', [QuizController::class, 'exportStandalone']);
$router->post('/api/v1/quizzes/{id}/export-web', [QuizController::class, 'exportWeb']);
$router->get('/api/v1/export/platforms', [QuizController::class, 'exportPlatforms']);
$router->post('/api/v1/quizzes/import', [QuizController::class, 'import']);

$router->get('/api/v1/publications', [PublicationController::class, 'index']);
$router->get('/api/v1/publications/{id}', [PublicationController::class, 'showPublication']);
$router->get('/api/v1/publications/{id}/results', [PublicationController::class, 'publicationResults']);

$router->get('/api/v1/quizzes/{id}/publication', [PublicationController::class, 'show']);
$router->post('/api/v1/quizzes/{id}/publication', [PublicationController::class, 'publish']);
$router->post('/api/v1/quizzes/{id}/publication/republish', [PublicationController::class, 'republish']);
$router->put('/api/v1/quizzes/{id}/publication', [PublicationController::class, 'updateDuration']);
$router->delete('/api/v1/quizzes/{id}/publication', [PublicationController::class, 'revoke']);
$router->get('/api/v1/quizzes/{id}/publication/results', [PublicationController::class, 'results']);
$router->get('/api/v1/p/{slug}', [PublicationController::class, 'publicInfo']);
$router->post('/api/v1/p/{slug}/join', [PublicationController::class, 'join']);

$router->post('/api/v1/sessions', [SessionController::class, 'store']);
$router->get('/api/v1/sessions/{id}', [SessionController::class, 'show']);
$router->post('/api/v1/sessions/{id}/start', [SessionController::class, 'start']);
$router->post('/api/v1/sessions/{id}/pause', [SessionController::class, 'pause']);
$router->post('/api/v1/sessions/{id}/finish', [SessionController::class, 'finish']);
$router->post('/api/v1/sessions/{id}/close', [SessionController::class, 'close']);
$router->post('/api/v1/sessions/{id}/access', [SessionController::class, 'updateAccess']);
$router->get('/api/v1/sessions/{id}/results', [SessionController::class, 'results']);
$router->get('/api/v1/sessions/{id}/participants/{participantId}/live', [SessionController::class, 'liveMonitor']);

$router->post('/api/v1/join', [SessionController::class, 'join']);
$router->get('/api/v1/participant/session', [SessionController::class, 'participantSession']);

$router->post('/api/v1/attempts/start', [AttemptController::class, 'start']);
$router->post('/api/v1/attempts/{id}/answers', [AttemptController::class, 'answers']);
$router->get('/api/v1/attempts/{id}/answers', [AttemptController::class, 'showAnswers']);
$router->post('/api/v1/attempts/{id}/submit', [AttemptController::class, 'submit']);

$router->get('/api/v1/reports/attempts', [ReportController::class, 'attempts']);
$router->get('/api/v1/reports/attempts/{id}', [ReportController::class, 'showAttempt']);
$router->get('/api/v1/reports/stats', [ReportController::class, 'stats']);
$router->get('/api/v1/reports/export.csv', [ReportController::class, 'exportCsv']);
$router->post('/api/v1/results/import', [ReportController::class, 'importResult']);
