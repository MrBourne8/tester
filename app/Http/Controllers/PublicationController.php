<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use RuntimeException;
use UniTest\Services\PublicationService;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class PublicationController extends Controller
{
    public function __construct(
        private readonly PublicationService $publications = new PublicationService(),
    ) {
    }

    public function index(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->listForTeacher(),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function showPublication(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->getById((int) $params['id']),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function publicationResults(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->resultsByPublicationId((int) $params['id']),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function show(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->getForQuiz((int) $params['id']),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function publish(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $hours = (int) ($body['duration_hours'] ?? 24);
            return Response::json([
                'data' => $this->publications->publish((int) $params['id'], $hours),
            ], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function republish(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $hours = (int) ($body['duration_hours'] ?? 24);
            return Response::json([
                'data' => $this->publications->republish((int) $params['id'], $hours),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function updateDuration(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $hours = (int) ($body['duration_hours'] ?? 24);
            return Response::json([
                'data' => $this->publications->updateDuration((int) $params['id'], $hours),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function revoke(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->revoke((int) $params['id']),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function results(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->results((int) $params['id']),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function publicInfo(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->publications->publicInfo((string) ($params['slug'] ?? '')),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function join(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $name = (string) ($body['display_name'] ?? '');
            $ip = (string) ($request->server['REMOTE_ADDR'] ?? '0.0.0.0');
            return Response::json([
                'data' => $this->publications->join((string) ($params['slug'] ?? ''), $name, $ip),
            ], 201);
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
