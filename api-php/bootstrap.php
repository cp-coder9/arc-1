<?php
/**
 * Architex PHP API gateway bootstrap.
 * Shared-hosting compatible, JSON-only responses, no Node runtime required.
 */

declare(strict_types=1);

const ARCHITEX_API_VERSION = 'php-gateway-v0.1.1-20260623';

function architex_allowed_origins(): array
{
    return [
        'https://test.architex.co.za',
        'https://architex.co.za',
        'https://www.architex.co.za',
    ];
}

function architex_apply_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, architex_allowed_origins(), true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');
    header('Access-Control-Max-Age: 600');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}

function architex_starts_with(string $value, string $prefix): bool
{
    return substr($value, 0, strlen($prefix)) === $prefix;
}

function architex_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    echo json_encode($payload + [
        'service' => 'architex-api',
        'runtime' => 'php-shared-hosting',
        'gatewayVersion' => ARCHITEX_API_VERSION,
        'timestamp' => gmdate('c'),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function architex_json_raw(int $status, $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function architex_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        architex_json(400, [
            'error' => 'Invalid JSON',
            'message' => 'Request body must be a JSON object.',
        ]);
    }
    return $decoded;
}

function architex_bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function architex_route_path(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $uri = '/' . ltrim($uri, '/');
    if (architex_starts_with($uri, '/api/')) {
        return substr($uri, 4); // keep leading slash after /api
    }
    if ($uri === '/api') {
        return '/';
    }
    return $uri;
}

function architex_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function architex_not_implemented(string $route, string $message = 'This endpoint is being migrated from Node to the PHP shared-hosting gateway.'): void
{
    architex_json(501, [
        'error' => 'Not Implemented',
        'route' => $route,
        'message' => $message,
        'migrationStatus' => 'planned',
    ]);
}

set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function (Throwable $error): void {
    if (!headers_sent()) {
        architex_json(500, [
            'error' => 'Internal Server Error',
            'message' => 'The PHP API gateway failed while processing the request.',
            'requestId' => bin2hex(random_bytes(8)),
        ]);
    }
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
    exit;
});
