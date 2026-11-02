<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use RuntimeException;
use UniTest\Services\ReportService;
use UniTest\Services\ResultImportService;
use UniTest\Support\Env;
use UniTest\Support\Request;
use UniTest\Support\Response;
use UniTest\Support\Vite;

final class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports = new ReportService(),
        private readonly ResultImportService $imports = new ResultImportService(),
    ) {
    }

    public function page(Request $request, array $params = []): Response
    {
        $assets = Vite::entry('js/reports/main.js');

        return Response::view('reports', [
            'appName' => (string) Env::get('APP_NAME', 'UniTest'),
            'assetJs' => $assets['js'],
            'assetCss' => $assets['css'],
        ]);
    }

    public function attempts(Request $request, array $params = []): Response
    {
        try {
            $filters = [
                'quiz_id' => $request->query['quiz_id'] ?? null,
                'q' => $request->query['q'] ?? null,
                'from' => $request->query['from'] ?? null,
                'to' => $request->query['to'] ?? null,
                'source' => $request->query['source'] ?? null,
            ];

            return Response::json([
                'data' => [
                    'attempts' => $this->reports->listAttempts($filters),
                    'quizzes' => $this->reports->quizzesForFilter(),
                ],
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function showAttempt(Request $request, array $params = []): Response
    {
        try {
            return Response::json([
                'data' => $this->reports->getAttempt((int) $params['id']),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function stats(Request $request, array $params = []): Response
    {
        try {
            $filters = [
                'quiz_id' => $request->query['quiz_id'] ?? null,
                'q' => $request->query['q'] ?? null,
                'from' => $request->query['from'] ?? null,
                'to' => $request->query['to'] ?? null,
                'source' => $request->query['source'] ?? null,
            ];

            return Response::json([
                'data' => $this->reports->questionStats($filters),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function exportCsv(Request $request, array $params = []): Response
    {
        try {
            $filters = [
                'quiz_id' => $request->query['quiz_id'] ?? null,
                'q' => $request->query['q'] ?? null,
                'from' => $request->query['from'] ?? null,
                'to' => $request->query['to'] ?? null,
                'source' => $request->query['source'] ?? null,
            ];
            $csv = $this->reports->exportCsv($filters);
            $filename = 'unitest_reports_' . date('Y-m-d_His') . '.csv';

            return new Response($csv, 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="' . $filename . '"',
                'Content-Length' => (string) strlen($csv),
            ]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function importResult(Request $request, array $params = []): Response
    {
        try {
            $file = $_FILES['file'] ?? null;
            if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                return Response::json([
                    'error' => [
                        'code' => 'validation_error',
                        'message' => 'Загрузите файл .result',
                    ],
                ], 422);
            }

            $name = (string) ($file['name'] ?? '');
            if ($name !== '' && !str_ends_with(strtolower($name), '.result') && !str_ends_with(strtolower($name), '.json')) {
                return Response::json([
                    'error' => [
                        'code' => 'validation_error',
                        'message' => 'Ожидается файл с расширением .result',
                    ],
                ], 422);
            }

            $imported = $this->imports->importFile((string) $file['tmp_name'], $name);

            return Response::json(['data' => $imported], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    private function error(RuntimeException $e): Response
    {
        $code = $e->getCode();
        $status = is_int($code) && $code >= 400 && $code < 600 ? $code : 422;
        $map = [
            404 => 'not_found',
            409 => 'conflict',
        ];

        return Response::json([
            'error' => [
                'code' => $map[$status] ?? 'validation_error',
                'message' => $e->getMessage(),
            ],
        ], $status);
    }
}
