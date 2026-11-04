<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;
use UniTest\Support\Vite;

final class PlayerController extends Controller
{
    public function show(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/player/main.js');
        return Response::view('player', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
            'quizId' => isset($params['id']) ? (int) $params['id'] : null,
        ]);
    }
}
