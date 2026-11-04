<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use RuntimeException;
use UniTest\Services\AttemptService;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class AttemptController extends Controller
{
    public function __construct(
        private readonly AttemptService $attempts = new AttemptService(),
    ) {
    }

    public function start(Request $request, array $params = []): Response
    {
        try {
            $token = $this->participantToken($request);
            $body = $request->json();
            $client = is_array($body['client'] ?? null) ? $body['client'] : null;

            return Response::json(['data' => $this->attempts->start($token, $client)], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function answers(Request $request, array $params = []): Response
    {
        try {
            $token = $this->participantToken($request);
            $body = $request->json();
            $answers = is_array($body['answers'] ?? null) ? $body['answers'] : $body;
            unset($answers['participant_token'], $answers['focusEvents'], $answers['questionTiming'], $answers['client']);
            $focusEvents = is_array($body['focusEvents'] ?? null) ? $body['focusEvents'] : null;
            $questionTiming = is_array($body['questionTiming'] ?? null) ? $body['questionTiming'] : null;

            return Response::json([
                'data' => $this->attempts->saveAnswers(
                    (int) $params['id'],
                    $token,
                    $answers,
                    $focusEvents,
                    $questionTiming,
                ),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function submit(Request $request, array $params = []): Response
    {
        try {
            $token = $this->participantToken($request);
            $body = $request->json();
            $final = is_array($body['answers'] ?? null) ? $body['answers'] : null;

            return Response::json([
                'data' => $this->attempts->submit((int) $params['id'], $token, $final),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function showAnswers(Request $request, array $params = []): Response
    {
        try {
            $token = $this->participantToken($request);
            return Response::json([
                'data' => $this->attempts->getAnswers((int) $params['id'], $token),
            ]);
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
