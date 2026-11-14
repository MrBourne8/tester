<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use UniTest\Services\SpoSsoService;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class MeController extends Controller
{
    public function __invoke(Request $request, array $params = []): Response
    {
        $teacher = (new SpoSsoService())->currentTeacher();
        if ($teacher === null) {
            return Response::json([
                'error' => [
                    'code' => 'unauthorized',
                    'message' => 'Не авторизован',
                ],
            ], 401);
        }

        return Response::json([
            'data' => [
                'id' => $teacher['id'],
                'name' => $teacher['name'],
            ],
        ]);
    }
}
