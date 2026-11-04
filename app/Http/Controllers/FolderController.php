<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use RuntimeException;
use UniTest\Services\FolderService;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class FolderController extends Controller
{
    public function __construct(
        private readonly FolderService $folders = new FolderService(),
    ) {
    }

    public function index(Request $request, array $params = []): Response
    {
        return Response::json(['data' => $this->folders->listForTeacher()]);
    }

    public function store(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $folder = $this->folders->create((string) ($body['name'] ?? ''));
            return Response::json(['data' => $folder], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function update(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $folder = $this->folders->update((int) $params['id'], (string) ($body['name'] ?? ''));
            return Response::json(['data' => $folder]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function destroy(Request $request, array $params = []): Response
    {
        try {
            $this->folders->delete((int) $params['id']);
            return Response::json(['data' => ['deleted' => true]]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    private function error(RuntimeException $e): Response
    {
        $code = $e->getCode();
        $status = is_int($code) && $code >= 400 && $code < 600 ? $code : 400;
        return Response::json([
            'error' => ['message' => $e->getMessage()],
        ], $status);
    }
}
