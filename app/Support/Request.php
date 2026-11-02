<?php

declare(strict_types=1);

namespace UniTest\Support;

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $server,
        public readonly ?string $rawBody,
    ) {
    }

    public static function fromGlobals(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        // Поддержка method override для HTML-форм при необходимости
        if ($method === 'POST' && isset($_POST['_method'])) {
            $method = strtoupper((string) $_POST['_method']);
        }

        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $path = rawurldecode($path);

        // php://input для multipart недоступен после разбора — это нормально
        $raw = null;
        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
        if (!str_starts_with(strtolower($contentType), 'multipart/form-data')) {
            $raw = file_get_contents('php://input') ?: null;
        }

        return new self(
            $method,
            $path,
            $_GET,
            $_SERVER,
            $raw,
        );
    }

    public function json(): array
    {
        if ($this->rawBody === null || $this->rawBody === '') {
            return [];
        }

        $decoded = json_decode($this->rawBody, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function wantsJson(): bool
    {
        $accept = $this->server['HTTP_ACCEPT'] ?? '';
        return str_contains($accept, 'application/json')
            || str_starts_with($this->path, '/api/');
    }
}
