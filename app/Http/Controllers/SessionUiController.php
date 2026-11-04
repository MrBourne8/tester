<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;
use UniTest\Support\Vite;

final class SessionUiController extends Controller
{
    public function teacher(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/session/main.js');

        return Response::view('session', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
            'sessionId' => isset($params['id']) ? (int) $params['id'] : null,
        ]);
    }

    public function join(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/join/main.js');

        return Response::view('join', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
            'code' => (string) ($request->query['code'] ?? ''),
            'slug' => '',
        ]);
    }
}
