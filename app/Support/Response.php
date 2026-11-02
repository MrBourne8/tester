<?php

declare(strict_types=1);

namespace UniTest\Support;

final class Response
{
    public function __construct(
        private string $content,
        private int $status = 200,
        private array $headers = ['Content-Type' => 'text/html; charset=UTF-8'],
    ) {
    }

    public static function html(string $content, int $status = 200): self
    {
        return new self($content, $status, ['Content-Type' => 'text/html; charset=UTF-8']);
    }

    public static function json(array $data, int $status = 200): self
    {
        return new self(
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $status,
            ['Content-Type' => 'application/json; charset=UTF-8'],
        );
    }

    public static function view(string $name, array $data = [], int $status = 200): self
    {
        $path = dirname(__DIR__, 2) . '/resources/views/' . $name . '.php';
        if (!is_file($path)) {
            return self::html('Представление не найдено: ' . htmlspecialchars($name), 500);
        }

        extract($data, EXTR_SKIP);
        ob_start();
        include $path;
        $html = (string) ob_get_clean();

        return self::html($html, $status);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }
        echo $this->content;
    }

    public function status(): int
    {
        return $this->status;
    }

    public function content(): string
    {
        return $this->content;
    }

    /**
     * @return array<string, string>
     */
    public function headers(): array
    {
        return $this->headers;
    }
}
