<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;
use UniTest\Support\Vite;

final class PublishUiController extends Controller
{
    public function teacher(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/publish/main.js');
        return Response::view('publish', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
            'quizId' => isset($params['id']) ? (int) $params['id'] : null,
        ]);
    }

    public function archive(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/published/main.js');
        return Response::view('published', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
        ]);
    }

    public function take(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/join/main.js');
        return Response::view('join', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
            'code' => '',
            'slug' => (string) ($params['slug'] ?? ''),
        ]);
    }
}
