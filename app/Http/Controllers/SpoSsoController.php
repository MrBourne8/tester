<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Services\SpoSsoService;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class SpoSsoController extends Controller
{
    public function consume(Request $request, array $params = []): Response
    {
        $ticket = trim((string) ($request->query['ticket'] ?? ''));
        if ($ticket === '') {
            return Response::html('<h1>Ошибка SSO</h1><p>Не передан билет авторизации.</p>', 400);
        }

        $sso = new SpoSsoService();
        $identity = $sso->parseTicket($ticket);
        if ($identity === null) {
            return Response::html(
                '<h1>Ошибка SSO</h1><p>Билет недействителен или истёк. Откройте Тесторию снова из панели преподавателя.</p>',
                403
            );
        }

        $sso->loginFromSpo($identity);

        return Response::redirect('/');
    }
}
