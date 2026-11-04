<?php

declare(strict_types=1);

namespace UniTest\Http\Controllers;

use RuntimeException;
use UniTest\Services\AutonomousExportService;
use UniTest\Services\PlatformCatalog;
use UniTest\Services\QuizService;
use UniTest\Support\ContentDisposition;
use UniTest\Support\Request;
use UniTest\Support\Response;

final class QuizController extends Controller
{
    public function __construct(
        private readonly QuizService $quizzes = new QuizService(),
        private readonly AutonomousExportService $autonomous = new AutonomousExportService(),
        private readonly PlatformCatalog $platforms = new PlatformCatalog(),
    ) {
    }

    public function exportPlatforms(Request $request, array $params = []): Response
    {
        return Response::json(['data' => $this->platforms->describe()]);
    }

    public function index(Request $request, array $params = []): Response
    {
        return Response::json(['data' => $this->quizzes->listForTeacher()]);
    }

    public function show(Request $request, array $params = []): Response
    {
        try {
            $quiz = $this->quizzes->get((int) $params['id']);
            return Response::json(['data' => $quiz]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function store(Request $request, array $params = []): Response
    {
        try {
            $quiz = $this->quizzes->create($request->json());
            return Response::json(['data' => $quiz], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function update(Request $request, array $params = []): Response
    {
        try {
            $quiz = $this->quizzes->update((int) $params['id'], $request->json());
            return Response::json(['data' => $quiz]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function destroy(Request $request, array $params = []): Response
    {
        try {
            $this->quizzes->delete((int) $params['id']);
            return Response::json(['data' => ['deleted' => true]]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function setFolder(Request $request, array $params = []): Response
    {
        try {
            $body = $request->json();
            $folderId = array_key_exists('folder_id', $body)
                ? ($body['folder_id'] === null || $body['folder_id'] === '' ? null : (int) $body['folder_id'])
                : null;
            $quiz = $this->quizzes->setFolder((int) $params['id'], $folderId);
            return Response::json(['data' => $quiz]);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function duplicate(Request $request, array $params = []): Response
    {
        try {
            $quiz = $this->quizzes->duplicate((int) $params['id']);
            return Response::json(['data' => $quiz], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function export(Request $request, array $params = []): Response
    {
        try {
            $id = (int) $params['id'];
            $quiz = $this->quizzes->get($id);
            $safeName = preg_replace('/[^\p{L}\p{N}\-_]+/u', '_', (string) $quiz['title']) ?: 'quiz';
            $path = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'unitest_' . $id . '_' . bin2hex(random_bytes(4)) . '.quiz';
            $this->quizzes->exportToFile($id, $path);
            $binary = (string) file_get_contents($path);
            @unlink($path);

            return new Response(
                $binary,
                200,
                [
                    'Content-Type' => 'application/octet-stream',
                    'Content-Disposition' => ContentDisposition::attachment($safeName . '.quiz'),
                    'Content-Length' => (string) strlen($binary),
                ],
            );
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function exportStandalone(Request $request, array $params = []): Response
    {
        try {
            $id = (int) $params['id'];
            $body = $request->json();
            $platform = (string) ($request->query['platform'] ?? $body['platform'] ?? 'windows');
            $options = $this->exportOptions($request, $body);
            $package = $this->autonomous->exportNative($id, $platform, null, $options);
            $binary = (string) file_get_contents($package['path']);
            @unlink($package['path']);
            $isZip = str_ends_with(strtolower($package['filename']), '.zip');

            return new Response(
                $binary,
                200,
                [
                    'Content-Type' => $isZip ? 'application/zip' : 'application/octet-stream',
                    'Content-Disposition' => ContentDisposition::attachment($package['filename']),
                    'Content-Length' => (string) strlen($binary),
                    'X-UniTest-Export-Format' => $package['format'],
                    'X-UniTest-Platforms' => implode(',', $package['platforms']),
                ],
            );
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function exportWeb(Request $request, array $params = []): Response
    {
        try {
            $id = (int) $params['id'];
            $body = $request->json();
            $options = $this->exportOptions($request, is_array($body) ? $body : []);
            $package = $this->autonomous->exportWebPackage($id, null, $options);
            $binary = (string) file_get_contents($package['path']);
            @unlink($package['path']);

            return new Response(
                $binary,
                200,
                [
                    'Content-Type' => 'application/zip',
                    'Content-Disposition' => ContentDisposition::attachment($package['filename']),
                    'Content-Length' => (string) strlen($binary),
                    'X-UniTest-Export-Format' => $package['format'],
                    'X-UniTest-Platforms' => implode(',', $package['platforms']),
                ],
            );
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    public function import(Request $request, array $params = []): Response
    {
        try {
            $file = $_FILES['file'] ?? null;
            if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                return Response::json([
                    'error' => [
                        'code' => 'validation_error',
                        'message' => 'Загрузите файл .quiz',
                    ],
                ], 422);
            }

            $tmp = (string) $file['tmp_name'];
            $name = (string) ($file['name'] ?? '');
            if (!str_ends_with(strtolower($name), '.quiz') && !str_ends_with(strtolower($name), '.zip')) {
                return Response::json([
                    'error' => [
                        'code' => 'validation_error',
                        'message' => 'Ожидается файл с расширением .quiz',
                    ],
                ], 422);
            }

            $quiz = $this->quizzes->importFromFile($tmp);
            return Response::json(['data' => $quiz], 201);
        } catch (RuntimeException $e) {
            return $this->error($e);
        }
    }

    /**
     * @param array<string, mixed> $body
     * @return array{valid_days?: int|null}
     */
    private function exportOptions(Request $request, array $body): array
    {
        $raw = $request->query['valid_days'] ?? $body['valid_days'] ?? null;
        if ($raw === null || $raw === '' || $raw === false) {
            return [];
        }

        return ['valid_days' => (int) $raw];
    }

    private function error(RuntimeException $e): Response
    {
        $code = $e->getCode();
        $status = is_int($code) && $code >= 400 && $code < 600 ? $code : 422;
        return Response::json([
            'error' => [
                'code' => $status === 404 ? 'not_found' : 'validation_error',
                'message' => $e->getMessage(),
            ],
        ], $status);
    }
}
