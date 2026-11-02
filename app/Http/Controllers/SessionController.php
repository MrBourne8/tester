<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use RuntimeException;
use UniTest\Services\SessionService;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class SessionController extends Controller
{
    public function __construct(
        private readonly SessionService $sessions = new SessionService(),
    ) {
    }

    public function store(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $quizId = (int) ($body['quiz_id'] ?? 0);
            if ($quizId <= 0) {
                throw new RuntimeException('Укажите quiz_id', 422);
            }
            $settings = is_array($body['settings'] ?? null) ? $body['settings'] : [];
            $session = $this->sessions->createFromQuiz($quizId, $settings);

            return Response::json(['data' => $session], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function show(Request $request, array $params = []): Response
    {
        try {
            return Response::json(['data' => $this->sessions->getForTeacher((int) $params['id'])]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function start(Request $request, array $params = []): Response
    {
        try {
            return Response::json(['data' => $this->sessions->start((int) $params['id'])]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function pause(Request $request, array $params = []): Response
    {
        try {
            return Response::json(['data' => $this->sessions->pause((int) $params['id'])]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function finish(Request $request, array $params = []): Response
    {
        try {
            return Response::json(['data' => $this->sessions->finish((int) $params['id'])]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function close(Request $request, array $params = []): Response
    {
        try {
            return Response::json(['data' => $this->sessions->close((int) $params['id'])]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function updateAccess(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $raw = $body['public_base_url'] ?? null;
            $url = is_string($raw) ? $raw : null;

            return Response::json([
                'data' => $this->sessions->updateAccess((int) $params['id'], $url),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function results(Request $request, array $params = []): Response
    {
        try {
            return Response::json(['data' => $this->sessions->results((int) $params['id'])]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function liveMonitor(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->sessions->liveMonitor(
                    (int) $params['id'],
                    (int) $params['participantId'],
                ),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function join(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $ip = (string) ($request->server['REMOTE_ADDR'] ?? '0.0.0.0');
            $result = $this->sessions->join(
                (string) ($body['code'] ?? ''),
                (string) ($body['display_name'] ?? $body['name'] ?? ''),
                $ip,
            );

            return Response::json(['data' => $result], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function participantSession(Request $request, array $params = []): Response
    {
        try {
            $token = $this->participantToken($request);
            return Response::json(['data' => $this->sessions->participantSession($token)]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    private function participantToken(Request $request): string
    {
        $auth = (string) ($request->server['HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/^Bearer\s+(\S+)/i', $auth, $m)) {
            return $m[1];
        }
        $header = (string) ($request->server['HTTP_X_PARTICIPANT_TOKEN'] ?? '');
        if ($header !== '') {
            return $header;
        }
        $body = $request->json();

        return (string) ($body['participant_token'] ?? '');
    }

    private function error(RuntimeException $e): Response
    {
        $code = $e->getCode();
        $status = is_int($code) && $code >= 400 && $code < 600 ? $code : 422;
        $map = [
            401 => 'unauthorized',
            403 => 'forbidden',
            404 => 'not_found',
            429 => 'rate_limited',
        ];

        return Response::json([
            'error' => [
                'code' => $map[$status] ?? 'validation_error',
                'message' => $e->getMessage(),
            ],
        ], $status);
    }
}
