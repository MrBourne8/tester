<?php

declare(strict_types=1);

namespace UniTest\Services;

use RuntimeException;
use ZipArchive;

/**
 * Загрузка и проверка пакета .quiz (ZIP + JSON).
 * Не исполняет код из архива.
 */
final class QuizPackageService
{
    private const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
    private const MAX_FILE_BYTES = 20 * 1024 * 1024;
    private const ALLOWED_RESOURCE_EXTENSIONS = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
        'mp3', 'ogg', 'wav', 'pdf', 'txt',
    ];

    /**
     * @return array{manifest: array, quiz: array, checksums: array, files: list<string>}
     */
    public function loadFromFile(string $path): array
    {
        if (!is_file($path)) {
            throw new RuntimeException('Файл теста не найден');
        }

        $size = filesize($path);
        if ($size === false || $size > self::MAX_ARCHIVE_BYTES) {
            throw new RuntimeException('Файл теста слишком большой или недоступен');
        }

        $zip = new ZipArchive();
        $opened = $zip->open($path, ZipArchive::RDONLY);
        if ($opened !== true) {
            throw new RuntimeException('Некорректный ZIP-контейнер .quiz');
        }

        try {
            return $this->readPackage($zip);
        } finally {
            $zip->close();
        }
    }

    /**
     * @return array{manifest: array, quiz: array, checksums: array, files: list<string>, resourceBlobs: array<string, string>}
     */
    public function readPackage(ZipArchive $zip): array
    {
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === false) {
                continue;
            }
            $this->assertSafePath($name);
            $stat = $zip->statIndex($i);
            if ($stat !== false && ($stat['size'] ?? 0) > self::MAX_FILE_BYTES) {
                throw new RuntimeException('Вложение превышает допустимый размер: ' . $name);
            }
            if (!str_ends_with($name, '/')) {
                $files[] = $name;
            }
        }

        $manifestRaw = $this->readJsonEntry($zip, 'manifest.json');
        $manifest = $this->validateManifest($manifestRaw);

        $contentFile = (string) $manifest['contentFile'];
        $this->assertSafePath($contentFile);
        $quiz = $this->validateQuizDocument($this->readJsonEntry($zip, $contentFile));

        $checksums = [];
        if (in_array('checksums.json', $files, true)) {
            $checksums = $this->readJsonEntry($zip, 'checksums.json');
            $this->verifyChecksums($zip, $checksums);
        }

        /** @var array<string, string> $resourceBlobs path => raw bytes */
        $resourceBlobs = [];
        foreach ($files as $file) {
            if (str_starts_with($file, 'resources/')) {
                $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                if ($ext !== '' && !in_array($ext, self::ALLOWED_RESOURCE_EXTENSIONS, true)) {
                    throw new RuntimeException('Недопустимый тип ресурса: ' . $file);
                }
                $raw = $zip->getFromName($file);
                if ($raw !== false) {
                    $resourceBlobs[$file] = $raw;
                }
            }
        }

        $quiz = $this->hydrateResources($quiz, $resourceBlobs);

        return [
            'manifest' => $manifest,
            'quiz' => $quiz,
            'checksums' => $checksums,
            'files' => $files,
            'resourceBlobs' => $resourceBlobs,
        ];
    }

    /**
     * Создаёт файл .quiz (ZIP) из документа теста.
     *
     * @param array<string, mixed> $quiz
     */
    public function createPackage(array $quiz, string $targetPath): string
    {
        $quiz = $this->validateQuizDocument($quiz);
        [$quizForZip, $binaryFiles] = $this->extractResourceBinaries($quiz);

        $quizJson = json_encode($quizForZip, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($quizJson === false) {
            throw new RuntimeException('Не удалось сериализовать quiz.json');
        }

        $manifest = [
            'schemaVersion' => (string) ($quiz['schemaVersion'] ?? '1.0'),
            'format' => 'unitest-quiz',
            'quizId' => (string) $quiz['id'],
            'title' => (string) $quiz['title'],
            'description' => (string) ($quiz['description'] ?? ''),
            'author' => (string) ($quiz['author'] ?? ''),
            'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'updatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'contentFile' => 'quiz.json',
            'engineMinVersion' => '1.0.0',
            'scoringVersion' => '1.0.0',
        ];
        $manifest = $this->validateManifest($manifest);
        $manifestJson = json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($manifestJson === false) {
            throw new RuntimeException('Не удалось сериализовать manifest.json');
        }

        $checksumFiles = [
            'manifest.json' => hash('sha256', $manifestJson),
            'quiz.json' => hash('sha256', $quizJson),
        ];
        foreach ($binaryFiles as $path => $bytes) {
            $checksumFiles[$path] = hash('sha256', $bytes);
        }
        $checksums = [
            'algorithm' => 'sha256',
            'files' => $checksumFiles,
        ];
        $checksumsJson = json_encode($checksums, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $dir = dirname($targetPath);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Не удалось создать каталог для экспорта');
        }

        $zip = new ZipArchive();
        if ($zip->open($targetPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Не удалось создать файл .quiz');
        }
        $zip->addFromString('manifest.json', $manifestJson);
        $zip->addFromString('quiz.json', $quizJson);
        $zip->addFromString('checksums.json', (string) $checksumsJson);
        foreach ($binaryFiles as $path => $bytes) {
            $zip->addFromString($path, $bytes);
        }
        $zip->close();

        return $targetPath;
    }

    /**
     * Убирает dataBase64 из quiz.json и возвращает бинарники для ZIP.
     *
     * @param array<string, mixed> $quiz
     * @return array{0: array<string, mixed>, 1: array<string, string>}
     */
    private function extractResourceBinaries(array $quiz): array
    {
        $binaryFiles = [];
        $resources = [];
        foreach ($quiz['resources'] ?? [] as $resource) {
            if (!is_array($resource)) {
                continue;
            }
            $id = (string) ($resource['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $path = (string) ($resource['path'] ?? ('resources/images/' . $id . '.bin'));
            $this->assertSafePath($path);
            if (!str_starts_with(str_replace('\\', '/', $path), 'resources/')) {
                $path = 'resources/images/' . basename($path);
            }
            $mime = (string) ($resource['mime'] ?? 'application/octet-stream');
            $entry = [
                'id' => $id,
                'path' => $path,
                'mime' => $mime,
            ];
            if (!empty($resource['name']) && is_string($resource['name'])) {
                $entry['name'] = $resource['name'];
            }
            if (!empty($resource['dataBase64']) && is_string($resource['dataBase64'])) {
                $bytes = base64_decode($resource['dataBase64'], true);
                if ($bytes === false) {
                    throw new RuntimeException('Некорректный dataBase64 ресурса: ' . $id);
                }
                if (strlen($bytes) > self::MAX_FILE_BYTES) {
                    throw new RuntimeException('Ресурс слишком большой: ' . $id);
                }
                $binaryFiles[$path] = $bytes;
            }
            $resources[] = $entry;
        }

        $quiz['resources'] = $resources;
        return [$quiz, $binaryFiles];
    }

    /**
     * @param array<string, mixed> $quiz
     * @param array<string, string> $resourceBlobs
     * @return array<string, mixed>
     */
    private function hydrateResources(array $quiz, array $resourceBlobs): array
    {
        $resources = [];
        foreach ($quiz['resources'] ?? [] as $resource) {
            if (!is_array($resource)) {
                continue;
            }
            $path = (string) ($resource['path'] ?? '');
            if ($path !== '' && isset($resourceBlobs[$path]) && empty($resource['dataBase64'])) {
                $resource['dataBase64'] = base64_encode($resourceBlobs[$path]);
            }
            $resources[] = $resource;
        }
        $quiz['resources'] = $resources;
        return $quiz;
    }

    /**
     * @param array<string, mixed> $manifest
     * @return array<string, mixed>
     */
    public function validateManifest(array $manifest): array
    {
        $errors = [];
        if (($manifest['format'] ?? null) !== 'unitest-quiz') {
            $errors[] = 'format должен быть unitest-quiz';
        }
        if (($manifest['schemaVersion'] ?? null) !== '1.0') {
            $errors[] = 'поддерживается schemaVersion 1.0';
        }
        foreach (['quizId', 'title', 'contentFile'] as $field) {
            if (!isset($manifest[$field]) || !is_string($manifest[$field]) || $manifest[$field] === '') {
                $errors[] = "поле {$field} обязательно";
            }
        }
        if ($errors !== []) {
            throw new RuntimeException('manifest.json некорректен: ' . implode('; ', $errors));
        }

        return $manifest;
    }

    /**
     * @param array<string, mixed> $quiz
     * @return array<string, mixed>
     */
    public function validateQuizDocument(array $quiz): array
    {
        $errors = [];
        if (!isset($quiz['id']) || !is_string($quiz['id']) || $quiz['id'] === '') {
            $errors[] = 'id обязателен';
        }
        if (!isset($quiz['title']) || !is_string($quiz['title']) || $quiz['title'] === '') {
            $errors[] = 'title обязателен';
        }
        if (!isset($quiz['questions']) || !is_array($quiz['questions'])) {
            $errors[] = 'questions должен быть массивом';
        }
        if ($errors !== []) {
            throw new RuntimeException('quiz.json некорректен: ' . implode('; ', $errors));
        }

        $ids = [];
        foreach ($quiz['questions'] as $index => $question) {
            if (!is_array($question)) {
                $errors[] = "questions[{$index}] должен быть объектом";
                continue;
            }
            $qid = $question['id'] ?? null;
            if (!is_string($qid) || $qid === '') {
                $errors[] = "questions[{$index}].id обязателен";
            } elseif (isset($ids[$qid])) {
                $errors[] = "дублирующий id вопроса: {$qid}";
            } else {
                $ids[$qid] = true;
            }
            if (!isset($question['type']) || !is_string($question['type'])) {
                $errors[] = "questions[{$index}].type обязателен";
            }
        }

        if ($errors !== []) {
            throw new RuntimeException('quiz.json некорректен: ' . implode('; ', $errors));
        }

        return $quiz;
    }

    private function assertSafePath(string $path): void
    {
        $normalized = str_replace('\\', '/', $path);
        if ($normalized === '' || str_starts_with($normalized, '/') || str_contains($normalized, '..')) {
            throw new RuntimeException('Небезопасный путь в архиве: ' . $path);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function readJsonEntry(ZipArchive $zip, string $name): array
    {
        $raw = $zip->getFromName($name);
        if ($raw === false) {
            throw new RuntimeException('В пакете отсутствует файл: ' . $name);
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Некорректный JSON: ' . $name);
        }
        return $decoded;
    }

    /**
     * @param array<string, mixed> $checksums
     */
    private function verifyChecksums(ZipArchive $zip, array $checksums): void
    {
        $algo = strtolower((string) ($checksums['algorithm'] ?? 'sha256'));
        if ($algo !== 'sha256') {
            throw new RuntimeException('Поддерживается только sha256');
        }
        $files = $checksums['files'] ?? null;
        if (!is_array($files)) {
            throw new RuntimeException('checksums.json: files обязателен');
        }

        foreach ($files as $name => $expected) {
            if (!is_string($name) || !is_string($expected)) {
                throw new RuntimeException('checksums.json: некорректная запись');
            }
            if ($name === 'checksums.json') {
                continue;
            }
            $this->assertSafePath($name);
            $raw = $zip->getFromName($name);
            if ($raw === false) {
                throw new RuntimeException('checksums: файл отсутствует: ' . $name);
            }
            $actual = hash('sha256', $raw);
            if (!hash_equals(strtolower($expected), $actual)) {
                throw new RuntimeException('Контрольная сумма не совпала: ' . $name);
            }
        }
    }
}
