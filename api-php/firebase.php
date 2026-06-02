<?php
/** Firebase Auth + Firestore REST helpers for the PHP shared-hosting gateway. */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$architexLocalEnvPath = __DIR__ . '/env.local.php';
if (is_readable($architexLocalEnvPath)) {
    /** @noinspection PhpIncludeInspection */
    require_once $architexLocalEnvPath;
}

function architex_env(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }
    return $value;
}

function architex_firebase_project_id(): string
{
    return architex_env('VITE_FIREBASE_PROJECT_ID')
        ?? architex_env('FIREBASE_PROJECT_ID')
        ?? 'gen-lang-client-0880960511';
}

function architex_firestore_database_id(): string
{
    return architex_env('VITE_FIREBASE_DATABASE_ID')
        ?? architex_env('FIREBASE_DATABASE_ID')
        ?? 'ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635';
}

function architex_base64url_decode(string $value): string
{
    $padded = strtr($value, '-_', '+/');
    $padding = strlen($padded) % 4;
    if ($padding > 0) {
        $padded .= str_repeat('=', 4 - $padding);
    }
    $decoded = base64_decode($padded, true);
    if ($decoded === false) {
        throw new RuntimeException('Invalid base64url value.');
    }
    return $decoded;
}

function architex_base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function architex_http_json(string $url, array $options = []): array
{
    $method = $options['method'] ?? 'GET';
    $headers = $options['headers'] ?? [];
    $body = $options['body'] ?? null;
    $headerLines = [];
    foreach ($headers as $name => $value) {
        $headerLines[] = $name . ': ' . $value;
    }
    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headerLines),
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 15,
        ],
    ]);
    $responseBody = file_get_contents($url, false, $context);
    $status = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $matches)) {
                $status = (int) $matches[1];
                break;
            }
        }
    }
    if ($responseBody === false) {
        throw new RuntimeException('HTTP request failed: ' . $url);
    }
    $decoded = json_decode($responseBody, true);
    return [
        'status' => $status,
        'body' => is_array($decoded) ? $decoded : null,
        'raw' => $responseBody,
    ];
}

function architex_http_raw(string $url, array $options = []): array
{
    $method = $options['method'] ?? 'GET';
    $headers = $options['headers'] ?? [];
    $body = $options['body'] ?? null;
    $headerLines = [];
    foreach ($headers as $name => $value) {
        $headerLines[] = $name . ': ' . $value;
    }
    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headerLines),
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => (int) ($options['timeout'] ?? 30),
        ],
    ]);
    $responseBody = file_get_contents($url, false, $context);
    $status = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $matches)) {
                $status = (int) $matches[1];
                break;
            }
        }
    }
    return ['status' => $status, 'raw' => $responseBody === false ? '' : $responseBody];
}

function architex_firebase_certs(): array
{
    static $certs = null;
    if (is_array($certs)) {
        return $certs;
    }
    $response = architex_http_json('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (($response['status'] ?? 0) !== 200 || !is_array($response['body'])) {
        throw new RuntimeException('Unable to fetch Firebase public certificates.');
    }
    $certs = $response['body'];
    return $certs;
}

function architex_decode_jwt_parts(string $jwt): array
{
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        throw new RuntimeException('Invalid JWT format.');
    }
    $header = json_decode(architex_base64url_decode($parts[0]), true);
    $payload = json_decode(architex_base64url_decode($parts[1]), true);
    if (!is_array($header) || !is_array($payload)) {
        throw new RuntimeException('Invalid JWT header or payload.');
    }
    return [$header, $payload, $parts[0] . '.' . $parts[1], architex_base64url_decode($parts[2])];
}

function architex_verify_firebase_id_token(string $jwt): array
{
    [$header, $payload, $signedData, $signature] = architex_decode_jwt_parts($jwt);
    if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
        throw new RuntimeException('Unsupported Firebase token header.');
    }
    $certs = architex_firebase_certs();
    $kid = (string) $header['kid'];
    if (!isset($certs[$kid])) {
        throw new RuntimeException('Firebase token certificate not found.');
    }
    $ok = openssl_verify($signedData, $signature, (string) $certs[$kid], OPENSSL_ALGO_SHA256);
    if ($ok !== 1) {
        throw new RuntimeException('Firebase token signature verification failed.');
    }
    $projectId = architex_firebase_project_id();
    $now = time();
    if (($payload['iss'] ?? '') !== 'https://securetoken.google.com/' . $projectId) {
        throw new RuntimeException('Firebase token issuer mismatch.');
    }
    if (($payload['aud'] ?? '') !== $projectId) {
        throw new RuntimeException('Firebase token audience mismatch.');
    }
    if (empty($payload['sub']) || !is_string($payload['sub'])) {
        throw new RuntimeException('Firebase token subject is missing.');
    }
    if (($payload['exp'] ?? 0) < $now) {
        throw new RuntimeException('Firebase token is expired.');
    }
    if (($payload['iat'] ?? 0) > $now + 300) {
        throw new RuntimeException('Firebase token issued-at is in the future.');
    }
    return $payload;
}

function architex_service_account(): ?array
{
    $raw = architex_env('FIREBASE_SERVICE_ACCOUNT_KEY') ?? architex_env('FIREBASE_SERVICE_ACCOUNT');
    if ($raw === null) {
        return null;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) && strpos($raw, '"private_key"') !== false) {
        $repaired = preg_replace_callback(
            '/("private_key"\s*:\s*")(.*?)("\s*,\s*"client_email")/s',
            function (array $matches): string {
                $privateKey = str_replace(["\r\n", "\r", "\n"], '\\n', $matches[2]);
                return $matches[1] . $privateKey . $matches[3];
            },
            $raw
        );
        if (is_string($repaired)) {
            $decoded = json_decode($repaired, true);
        }
    }
    if (!is_array($decoded)) {
        $maybeJson = base64_decode($raw, true);
        if ($maybeJson !== false) {
            $decoded = json_decode($maybeJson, true);
        }
    }
    return is_array($decoded) ? $decoded : null;
}

function architex_google_access_token(): string
{
    static $cached = null;
    if (is_array($cached) && ($cached['expiresAt'] ?? 0) > time() + 60) {
        return (string) $cached['token'];
    }
    $sa = architex_service_account();
    if ($sa === null || empty($sa['client_email']) || empty($sa['private_key'])) {
        throw new RuntimeException('Firebase service account is not configured for PHP gateway.');
    }
    $now = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
        'iss' => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
    ];
    $signedData = architex_base64url_encode(json_encode($header)) . '.' . architex_base64url_encode(json_encode($claims));
    $signature = '';
    $ok = openssl_sign($signedData, $signature, (string) $sa['private_key'], OPENSSL_ALGO_SHA256);
    if (!$ok) {
        throw new RuntimeException('Unable to sign service-account JWT.');
    }
    $assertion = $signedData . '.' . architex_base64url_encode($signature);
    $body = http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $assertion,
    ]);
    $response = architex_http_json('https://oauth2.googleapis.com/token', [
        'method' => 'POST',
        'headers' => ['Content-Type' => 'application/x-www-form-urlencoded'],
        'body' => $body,
    ]);
    if (($response['status'] ?? 0) !== 200 || !is_array($response['body']) || empty($response['body']['access_token'])) {
        throw new RuntimeException('Unable to exchange service-account JWT for access token.');
    }
    $cached = [
        'token' => (string) $response['body']['access_token'],
        'expiresAt' => $now + (int) ($response['body']['expires_in'] ?? 3600),
    ];
    return (string) $cached['token'];
}

function architex_firestore_document_url(string $collection, string $documentId): string
{
    $collectionPath = implode('/', array_map('rawurlencode', explode('/', trim($collection, '/'))));
    return sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents/%s/%s',
        rawurlencode(architex_firebase_project_id()),
        rawurlencode(architex_firestore_database_id()),
        $collectionPath,
        rawurlencode($documentId)
    );
}

function architex_firestore_collection_url(string $collection): string
{
    $collectionPath = implode('/', array_map('rawurlencode', explode('/', trim($collection, '/'))));
    return sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents/%s',
        rawurlencode(architex_firebase_project_id()),
        rawurlencode(architex_firestore_database_id()),
        $collectionPath
    );
}

function architex_firestore_run_query_url(): string
{
    return sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents:runQuery',
        rawurlencode(architex_firebase_project_id()),
        rawurlencode(architex_firestore_database_id())
    );
}

function architex_firestore_decode_value(array $value)
{
    if (array_key_exists('stringValue', $value)) return $value['stringValue'];
    if (array_key_exists('booleanValue', $value)) return (bool) $value['booleanValue'];
    if (array_key_exists('integerValue', $value)) return (int) $value['integerValue'];
    if (array_key_exists('doubleValue', $value)) return (float) $value['doubleValue'];
    if (array_key_exists('timestampValue', $value)) return $value['timestampValue'];
    if (array_key_exists('arrayValue', $value)) {
        $items = $value['arrayValue']['values'] ?? [];
        return array_map('architex_firestore_decode_value', is_array($items) ? $items : []);
    }
    if (array_key_exists('mapValue', $value)) {
        $fields = $value['mapValue']['fields'] ?? [];
        $out = [];
        foreach ($fields as $key => $fieldValue) {
            if (is_array($fieldValue)) $out[$key] = architex_firestore_decode_value($fieldValue);
        }
        return $out;
    }
    return null;
}

function architex_firestore_encode_value($value): array
{
    if ($value === null) return ['nullValue' => null];
    if (is_bool($value)) return ['booleanValue' => $value];
    if (is_int($value)) return ['integerValue' => (string) $value];
    if (is_float($value)) return ['doubleValue' => $value];
    if (is_string($value)) return ['stringValue' => $value];
    if (is_array($value)) {
        $isList = $value === [] || array_keys($value) === range(0, count($value) - 1);
        if ($isList) {
            return ['arrayValue' => ['values' => array_map('architex_firestore_encode_value', $value)]];
        }
        $fields = [];
        foreach ($value as $key => $item) {
            $fields[(string) $key] = architex_firestore_encode_value($item);
        }
        return ['mapValue' => ['fields' => $fields]];
    }
    return ['stringValue' => (string) $value];
}

function architex_firestore_encode_fields(array $data): array
{
    $fields = [];
    foreach ($data as $key => $value) {
        $fields[(string) $key] = architex_firestore_encode_value($value);
    }
    return ['fields' => $fields];
}

function architex_firestore_decode_document(array $document): array
{
    $fields = $document['fields'] ?? [];
    $out = [];
    foreach ($fields as $key => $value) {
        if (is_array($value)) $out[$key] = architex_firestore_decode_value($value);
    }
    if (isset($document['name'])) {
        $out['_name'] = $document['name'];
        $parts = explode('/', (string) $document['name']);
        $out['id'] = end($parts);
    }
    return $out;
}

function architex_firestore_get_document(string $collection, string $documentId): ?array
{
    $token = architex_google_access_token();
    $response = architex_http_json(architex_firestore_document_url($collection, $documentId), [
        'headers' => ['Authorization' => 'Bearer ' . $token],
    ]);
    if (($response['status'] ?? 0) === 404) {
        return null;
    }
    if (($response['status'] ?? 0) !== 200 || !is_array($response['body'])) {
        throw new RuntimeException('Firestore document read failed.');
    }
    return architex_firestore_decode_document($response['body']);
}

function architex_firestore_set_document(string $collection, string $documentId, array $data, bool $merge = true): array
{
    $token = architex_google_access_token();
    $url = architex_firestore_document_url($collection, $documentId);
    if ($merge) {
        foreach (array_keys($data) as $field) {
            $url .= (strpos($url, '?') === false ? '?' : '&') . 'updateMask.fieldPaths=' . rawurlencode((string) $field);
        }
    }
    $response = architex_http_json($url, [
        'method' => 'PATCH',
        'headers' => ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json'],
        'body' => json_encode(architex_firestore_encode_fields($data)),
    ]);
    if (($response['status'] ?? 0) < 200 || ($response['status'] ?? 0) >= 300 || !is_array($response['body'])) {
        $detail = is_array($response['body']) ? json_encode($response['body']) : (string) ($response['raw'] ?? '');
        throw new RuntimeException('Firestore document write failed: HTTP ' . (string) ($response['status'] ?? 0) . ' ' . substr($detail, 0, 500));
    }
    return architex_firestore_decode_document($response['body']);
}

function architex_firestore_create_document(string $collection, array $data, ?string $documentId = null): array
{
    $token = architex_google_access_token();
    $url = architex_firestore_collection_url($collection);
    if ($documentId !== null && $documentId !== '') {
        $url .= '?documentId=' . rawurlencode($documentId);
    }
    $response = architex_http_json($url, [
        'method' => 'POST',
        'headers' => ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json'],
        'body' => json_encode(architex_firestore_encode_fields($data)),
    ]);
    if (($response['status'] ?? 0) < 200 || ($response['status'] ?? 0) >= 300 || !is_array($response['body'])) {
        throw new RuntimeException('Firestore document create failed.');
    }
    return architex_firestore_decode_document($response['body']);
}

function architex_firestore_delete_document(string $collection, string $documentId): void
{
    $token = architex_google_access_token();
    $response = architex_http_json(architex_firestore_document_url($collection, $documentId), [
        'method' => 'DELETE',
        'headers' => ['Authorization' => 'Bearer ' . $token],
    ]);
    if (!in_array(($response['status'] ?? 0), [200, 404], true)) {
        throw new RuntimeException('Firestore document delete failed.');
    }
}

function architex_firestore_list_documents(string $collection, int $pageSize = 25): array
{
    $token = architex_google_access_token();
    $url = architex_firestore_collection_url($collection) . '?pageSize=' . max(1, min(100, $pageSize));
    $response = architex_http_json($url, [
        'headers' => ['Authorization' => 'Bearer ' . $token],
    ]);
    if (($response['status'] ?? 0) !== 200 || !is_array($response['body'])) {
        throw new RuntimeException('Firestore collection list failed.');
    }
    $docs = $response['body']['documents'] ?? [];
    if (!is_array($docs)) return [];
    return array_map('architex_firestore_decode_document', $docs);
}

function architex_firestore_query_equals(string $collection, string $field, $value, int $limit = 25): array
{
    $token = architex_google_access_token();
    $body = [
        'structuredQuery' => [
            'from' => [['collectionId' => $collection]],
            'where' => [
                'fieldFilter' => [
                    'field' => ['fieldPath' => $field],
                    'op' => 'EQUAL',
                    'value' => architex_firestore_encode_value($value),
                ],
            ],
            'limit' => max(1, min(100, $limit)),
        ],
    ];
    $response = architex_http_json(architex_firestore_run_query_url(), [
        'method' => 'POST',
        'headers' => ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json'],
        'body' => json_encode($body),
    ]);
    if (($response['status'] ?? 0) !== 200 || !is_array($response['body'])) {
        throw new RuntimeException('Firestore query failed.');
    }
    $out = [];
    foreach ($response['body'] as $row) {
        if (isset($row['document']) && is_array($row['document'])) {
            $out[] = architex_firestore_decode_document($row['document']);
        }
    }
    return $out;
}

function architex_admin_emails(): array
{
    $configured = architex_env('ARCHITEX_ADMIN_EMAILS');
    $emails = $configured ? preg_split('/\s*,\s*/', $configured) : ['gm.tarb@gmail.com', 'leor@slutzkin.co.za'];
    return array_values(array_filter(array_map('strtolower', $emails ?: [])));
}
