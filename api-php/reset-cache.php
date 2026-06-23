<?php
declare(strict_types=1);
header('Content-Type: application/json');
$reset = function_exists('opcache_reset') ? opcache_reset() : false;
echo json_encode([
    'status' => $reset ? 'ok' : 'error',
    'opcache_enabled' => function_exists('opcache_get_status') ? (opcache_get_status(false)['opcache_enabled'] ?? false) : false,
    'reset_called' => $reset,
]);
