<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;
use UniTest\Support\Vite;

final class HomeController extends Controller
{
    public function index(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/home/main.js');
        return Response::view('home', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
        ]);
    }
}
