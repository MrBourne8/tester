<?php

declare(strict_types=1);

namespace UniTest\Services;

use UniTest\Support\Env;

final class NetworkAddressService
{
    /**
     * Локальные IPv4 для показа ученикам (LAN + loopback).
     *
     * @return list<string>
     */
    public function listenAddresses(): array
    {
        $found = ['127.0.0.1'];

        if (function_exists('net_get_interfaces')) {
            foreach (net_get_interfaces() ?: [] as $iface) {
                foreach ($iface['unicast'] ?? [] as $addr) {
                    $ip = (string) ($addr['address'] ?? '');
                    if ($this->isUsableIpv4($ip)) {
                        $found[] = $ip;
                    }
                }
            }
        }

        $host = gethostname();
        if (is_string($host) && $host !== '') {
            $resolved = gethostbyname($host);
            if (is_string($resolved) && $this->isUsableIpv4($resolved)) {
                $found[] = $resolved;
            }
            foreach (gethostbynamel($host) ?: [] as $ip) {
                if ($this->isUsableIpv4((string) $ip)) {
                    $found[] = (string) $ip;
                }
            }
        }

        $unique = [];
        foreach ($found as $ip) {
            $unique[$ip] = true;
        }

        $list = array_keys($unique);
        usort($list, static function (string $a, string $b): int {
            if ($a === '127.0.0.1') {
                return 1;
            }
            if ($b === '127.0.0.1') {
                return -1;
            }
            return strcmp($a, $b);
        });

        return $list;
    }

    /**
     * Публичный базовый URL из env (для доступа через интернет / туннель).
     */
    public function configuredPublicBaseUrl(): ?string
    {
        $raw = (string) (Env::get('PUBLIC_BASE_URL') ?: Env::get('APP_URL') ?: '');
        return $this->normalizePublicBase($raw);
    }

    /**
     * @param string|null $sessionPublicBase override из настроек сессии
     * @return list<string>
     */
    public function joinBaseUrls(int $port, ?string $sessionPublicBase = null): array
    {
        $urls = [];
        $public = $this->normalizePublicBase($sessionPublicBase ?? '')
            ?? $this->configuredPublicBaseUrl();

        if ($public !== null) {
            $urls[] = rtrim($public, '/') . '/join';
        }

        foreach ($this->listenAddresses() as $ip) {
            $urls[] = sprintf('http://%s:%d/join', $ip, $port);
        }

        $unique = [];
        $out = [];
        foreach ($urls as $url) {
            $key = strtolower($url);
            if (isset($unique[$key])) {
                continue;
            }
            $unique[$key] = true;
            $out[] = $url;
        }

        return $out;
    }

    public function detectServerPort(): int
    {
        $port = (int) ($_SERVER['SERVER_PORT'] ?? 0);
        if ($port > 0) {
            return $port;
        }

        $envPort = (int) Env::get('SERVER_PORT', 8090);

        return $envPort > 0 ? $envPort : 8090;
    }

    /**
     * Принимает https://host или host → https://host (без /join).
     */
    public function normalizePublicBase(?string $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return null;
        }

        if (!preg_match('#^https?://#i', $raw)) {
            $raw = 'https://' . $raw;
        }

        $parts = parse_url($raw);
        if (!is_array($parts) || empty($parts['host'])) {
            return null;
        }

        $host = strtolower((string) $parts['host']);
        if ($host === '127.0.0.1' || $host === 'localhost' || str_ends_with($host, '.local')) {
            // localhost не считаем «интернет»-адресом
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        if ($scheme !== 'http' && $scheme !== 'https') {
            return null;
        }

        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
        $path = isset($parts['path']) ? rtrim((string) $parts['path'], '/') : '';
        if ($path === '/' || $path === '/join') {
            $path = '';
        }

        return $scheme . '://' . $parts['host'] . $port . $path;
    }

    private function isUsableIpv4(string $ip): bool
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return false;
        }
        if (str_starts_with($ip, '169.254.')) {
            return false;
        }

        return true;
    }
}
