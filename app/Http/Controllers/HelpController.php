<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;
use UniTest\Support\Vite;

final class HelpController extends Controller
{
    public function index(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/help/main.js');
        return Response::view('help', [
            'appName' => (string) Env::get('APP_NAME', 'Тестория'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
        ]);
    }
}
