<?php

declare(strict_types=1);

namespace UniTest\Support;

use Throwable;

final class Application
{
    private Router $router;

    private function __construct(
        public readonly string $basePath,
    ) {
        $this->router = new Router();
    }

    public static function create(string $basePath): self
    {
        $app = new self($basePath);
        $app->loadRoutes();
        return $app;
    }

    public function router(): Router
    {
        return $this->router;
    }

    public function handle(Request $request): Response
    {
        try {
            return $this->router->dispatch($request);
        } catch (Throwable $e) {
            $debug = (bool) Env::get('APP_DEBUG', false);
            $payload = [
                'error' => [
                    'code' => 'server_error',
                    'message' => $debug ? $e->getMessage() : 'Внутренняя ошибка сервера',
                ],
            ];

            if ($debug) {
                $payload['error']['type'] = $e::class;
            }

            $this->log($e);

            if ($request->wantsJson()) {
                return Response::json($payload, 500);
            }

            $message = htmlspecialchars($payload['error']['message'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            return Response::html('<h1>Ошибка</h1><p>' . $message . '</p>', 500);
        }
    }

    private function loadRoutes(): void
    {
        $router = $this->router;
        require $this->basePath . '/routes/web.php';
        require $this->basePath . '/routes/api.php';
    }

    private function log(Throwable $e): void
    {
        $dir = $this->basePath . '/storage/logs';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $line = sprintf(
            "[%s] %s: %s in %s:%d\n",
            date('c'),
            $e::class,
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
        );

        file_put_contents($dir . '/app.log', $line, FILE_APPEND);
    }
}
