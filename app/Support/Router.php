<?php

declare(strict_types=1);

namespace UniTest\Support;

use Closure;
use UniTest\Http\Controllers\Controller;

final class Router
{
    /** @var array<int, array{methods: array<string>, path: string, handler: mixed}> */
    private array $routes = [];

    public function get(string $path, mixed $handler): void
    {
        $this->add(['GET'], $path, $handler);
    }

    public function post(string $path, mixed $handler): void
    {
        $this->add(['POST'], $path, $handler);
    }

    public function put(string $path, mixed $handler): void
    {
        $this->add(['PUT'], $path, $handler);
    }

    public function delete(string $path, mixed $handler): void
    {
        $this->add(['DELETE'], $path, $handler);
    }

    public function add(array $methods, string $path, mixed $handler): void
    {
        $this->routes[] = [
            'methods' => array_map('strtoupper', $methods),
            'path' => $path,
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): Response
    {
        $methodMatchedPath = false;

        foreach ($this->routes as $route) {
            $params = $this->match($route['path'], $request->path);
            if ($params === null) {
                continue;
            }

            if (!in_array($request->method, $route['methods'], true)) {
                $methodMatchedPath = true;
                continue;
            }

            return $this->invoke($route['handler'], $request, $params);
        }

        if ($methodMatchedPath) {
            return Response::json([
                'error' => [
                    'code' => 'method_not_allowed',
                    'message' => 'Метод не поддерживается',
                ],
            ], 405);
        }

        if ($request->wantsJson()) {
            return Response::json([
                'error' => [
                    'code' => 'not_found',
                    'message' => 'Маршрут не найден',
                ],
            ], 404);
        }

        return Response::html('<h1>404</h1><p>Страница не найдена</p>', 404);
    }

    /**
     * @return array<string, string>|null
     */
    private function match(string $pattern, string $path): ?array
    {
        $regex = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $pattern);
        $regex = '#^' . $regex . '$#';

        if (!preg_match($regex, $path, $matches)) {
            return null;
        }

        $params = [];
        foreach ($matches as $key => $value) {
            if (is_string($key)) {
                $params[$key] = $value;
            }
        }

        return $params;
    }

    /**
     * @param array<string, string> $params
     */
    private function invoke(mixed $handler, Request $request, array $params): Response
    {
        if ($handler instanceof Closure) {
            $result = $handler($request, $params);
            return $result instanceof Response ? $result : Response::html((string) $result);
        }

        if (is_array($handler) && count($handler) === 2) {
            [$class, $method] = $handler;
            /** @var Controller $controller */
            $controller = new $class();
            $result = $controller->{$method}($request, $params);
            return $result instanceof Response ? $result : Response::html((string) $result);
        }

        return Response::json([
            'error' => [
                'code' => 'invalid_handler',
                'message' => 'Некорректный обработчик маршрута',
            ],
        ], 500);
    }
}
