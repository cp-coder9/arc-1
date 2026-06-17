<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/firebase.php';

architex_apply_cors();

if (architex_method() === 'OPTIONS') {
    architex_json(204, ['status' => 'ok']);
}

$route = architex_route_path();
$method = architex_method();

function architex_require_user(): array
{
    $token = architex_bearer_token();
    if ($token === null || $token === '') {
        architex_json(401, ['error' => 'Unauthorized', 'message' => 'Missing Firebase bearer token.']);
    }
    try {
        $claims = architex_verify_firebase_id_token($token);
        $uid = (string) $claims['sub'];
        $email = strtolower((string) ($claims['email'] ?? ''));
        $profile = null;
        try { $profile = architex_firestore_get_document('users', $uid); } catch (Throwable $ignored) { $profile = null; }
        $role = is_array($profile) ? (string) ($profile['role'] ?? '') : '';
        $isAdmin = $role === 'admin' || ($email !== '' && in_array($email, architex_admin_emails(), true));
        return ['uid' => $uid, 'email' => $email, 'role' => $role, 'isAdmin' => $isAdmin, 'profile' => $profile, 'claims' => $claims];
    } catch (Throwable $error) {
        architex_json(401, ['error' => 'Unauthorized', 'message' => 'Firebase token verification failed.']);
    }
}

function architex_now(): string
{
    return gmdate('c');
}

function architex_public_payload(array $doc): array
{
    unset($doc['_name']);
    return $doc;
}

function architex_record_audit(string $action, array $actor, array $target = [], array $metadata = []): void
{
    try {
        architex_firestore_create_document('audit_logs', [
            'action' => $action,
            'actorId' => $actor['uid'] ?? null,
            'actorEmail' => $actor['email'] ?? null,
            'target' => $target,
            'metadata' => $metadata,
            'createdAt' => architex_now(),
            'source' => 'php-gateway',
        ]);
    } catch (Throwable $ignored) {
        // Audit write failures must not turn safe fallback routes into HTML/500 responses.
    }
}

function architex_payfast_signature(array $data, string $passphrase): string
{
    unset($data['signature']);
    ksort($data);
    $pairs = [];
    foreach ($data as $key => $value) {
        if ($value !== null && $value !== '') {
            $pairs[] = $key . '=' . str_replace('%20', '+', rawurlencode(trim((string) $value)));
        }
    }
    $paramString = implode('&', $pairs);
    if ($passphrase !== '') {
        $paramString .= '&passphrase=' . str_replace('%20', '+', rawurlencode($passphrase));
    }
    return md5($paramString);
}

function architex_llm_text_response(string $text): array
{
    return ['choices' => [['message' => ['role' => 'assistant', 'content' => $text]]]];
}

function architex_call_gemini_text(string $prompt, ?string $system = null): string
{
    $apiKey = architex_env('GEMINI_API_KEY');
    if (!$apiKey) throw new RuntimeException('GEMINI_API_KEY is not configured.');
    $fullPrompt = trim(($system ? $system . "\n\n" : '') . $prompt);
    $body = json_encode(['contents' => [['parts' => [['text' => $fullPrompt]]]]]);
    $model = architex_env('GEMINI_MODEL', 'gemini-2.0-flash');
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($apiKey);
    $response = architex_http_json($url, ['method' => 'POST', 'headers' => ['Content-Type' => 'application/json'], 'body' => $body]);
    if (($response['status'] ?? 0) < 200 || ($response['status'] ?? 0) >= 300 || !is_array($response['body'])) {
        throw new RuntimeException('Gemini provider request failed.');
    }
    return (string) ($response['body']['candidates'][0]['content']['parts'][0]['text'] ?? 'No response generated.');
}

if ($route === '/health' && $method === 'GET') {
    architex_json(200, [
        'status' => 'ok',
        'mode' => 'php-shared-hosting-gateway',
        'nodeSupported' => false,
    ]);
}

if ($route === '/version' && $method === 'GET') {
    $buildInfoPath = dirname(__DIR__) . '/build-info.json';
    $buildInfo = null;
    if (is_readable($buildInfoPath)) {
        $decoded = json_decode((string) file_get_contents($buildInfoPath), true);
        $buildInfo = is_array($decoded) ? $decoded : null;
    }
    architex_json(200, [
        'status' => 'ok',
        'mode' => 'php-shared-hosting-gateway',
        'build' => $buildInfo,
    ]);
}

if ($route === '/auth/check-admin' && $method === 'POST') {
    architex_json_input();
    $user = architex_require_user();
    architex_json(200, [
        'status' => 'ok',
        'uid' => $user['uid'],
        'email' => $user['email'] !== '' ? $user['email'] : null,
        'role' => $user['role'] !== '' ? $user['role'] : ($user['isAdmin'] ? 'admin' : null),
        'isAdmin' => $user['isAdmin'],
        'firestoreProfileLoaded' => is_array($user['profile']),
        'firestoreConfigured' => is_array($user['profile']),
    ]);
}

if ($route === '/profile/me' && $method === 'GET') {
    $user = architex_require_user();
    architex_json(200, architex_public_payload($user['profile'] ?: [
        'uid' => $user['uid'],
        'email' => $user['email'],
        'role' => $user['isAdmin'] ? 'admin' : null,
    ]));
}

if ($route === '/profile/me' && in_array($method, ['PUT', 'PATCH'], true)) {
    $user = architex_require_user();
    $body = architex_json_input();
    unset($body['role'], $body['isAdmin'], $body['admin'], $body['uid'], $body['email']);
    $body['updatedAt'] = architex_now();
    $doc = architex_firestore_set_document('users', $user['uid'], $body, true);
    architex_record_audit('profile.updated', $user, ['type' => 'user', 'id' => $user['uid']], ['fields' => array_keys($body)]);
    architex_json(200, architex_public_payload($doc));
}

if (preg_match('#^/users/([^/]+)/profile$#', $route, $matches) === 1 && in_array($method, ['PUT', 'PATCH'], true)) {
    $user = architex_require_user();
    $targetUid = $matches[1];
    if ($targetUid !== $user['uid'] && !$user['isAdmin']) {
        architex_json(403, ['error' => 'Forbidden', 'message' => 'Cannot update another user profile.']);
    }
    $body = architex_json_input();
    if (!$user['isAdmin']) unset($body['role'], $body['isAdmin'], $body['admin']);
    unset($body['uid']);
    $body['updatedAt'] = architex_now();
    $doc = architex_firestore_set_document('users', $targetUid, $body, true);
    architex_record_audit('user.profile.updated', $user, ['type' => 'user', 'id' => $targetUid], ['fields' => array_keys($body)]);
    architex_json(200, architex_public_payload($doc));
}

if ($route === '/notifications/token' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $fcmToken = trim((string) ($body['fcmToken'] ?? ''));
    if ($fcmToken === '') architex_json(400, ['error' => 'Missing FCM Token']);
    $profile = $user['profile'] ?: [];
    $tokens = $profile['fcmTokens'] ?? [];
    if (!is_array($tokens)) $tokens = [];
    if (!in_array($fcmToken, $tokens, true)) $tokens[] = $fcmToken;
    architex_firestore_set_document('users', $user['uid'], ['fcmTokens' => $tokens, 'updatedAt' => architex_now()], true);
    architex_json(200, ['success' => true]);
}

if ($route === '/verifications/me' && $method === 'GET') {
    $user = architex_require_user();
    $records = architex_firestore_query_equals('user_verifications', 'userId', $user['uid'], 25);
    $records = array_map('architex_public_payload', $records);
    architex_json_raw(200, $records);
}

if ($route === '/verifications/submit' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $now = architex_now();
    $record = [
        'userId' => $user['uid'],
        'subjectType' => (string) ($body['subjectType'] ?? 'bep'),
        'statutoryBody' => (string) ($body['statutoryBody'] ?? 'SACAP'),
        'registrationNumber' => (string) ($body['registrationNumber'] ?? ''),
        'evidenceUrls' => is_array($body['evidenceUrls'] ?? null) ? $body['evidenceUrls'] : [],
        'displayName' => (string) ($body['displayName'] ?? ($user['profile']['displayName'] ?? '')),
        'status' => 'pending',
        'provider' => 'php-gateway-manual-review',
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    if ($record['registrationNumber'] === '') architex_json(400, ['error' => 'registrationNumber is required']);
    $doc = architex_firestore_create_document('user_verifications', $record);
    architex_record_audit('verification.submitted', $user, ['type' => 'user_verification', 'id' => $doc['id'] ?? null], ['statutoryBody' => $record['statutoryBody']]);
    architex_json(200, architex_public_payload($doc));
}

if ($route === '/architect/verify-sacap' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $architectId = (string) ($body['architectId'] ?? $user['uid']);
    if ($architectId !== $user['uid'] && !$user['isAdmin']) architex_json(403, ['error' => 'Forbidden']);
    $sacapNumber = trim((string) ($body['sacapNumber'] ?? ''));
    if ($sacapNumber === '') architex_json(400, ['success' => false, 'error' => 'sacapNumber is required']);
    architex_firestore_set_document('architect_profiles', $architectId, [
        'userId' => $architectId,
        'sacapNumber' => $sacapNumber,
        'sacapStatus' => 'pending',
        'sacapLastCheckedAt' => architex_now(),
        'verificationProvider' => 'php-gateway-manual-review',
    ], true);
    architex_record_audit('architect.sacap_check_requested', $user, ['type' => 'architect_profile', 'id' => $architectId], ['sacapNumber' => $sacapNumber]);
    architex_json(200, ['success' => true, 'status' => 'pending', 'details' => ['category' => 'Manual SACAP review queued']]);
}

if ($route === '/jobs/opportunities' && $method === 'GET') {
    $user = architex_require_user();
    $verifications = architex_firestore_query_equals('user_verifications', 'userId', $user['uid'], 25);
    $activeBepVerification = null;
    foreach ($verifications as $verification) {
        $status = strtolower((string) ($verification['status'] ?? ''));
        $subjectType = strtolower((string) ($verification['subjectType'] ?? ''));
        if (in_array($status, ['verified', 'approved', 'active'], true) && in_array($subjectType, ['bep', 'architect'], true)) {
            $activeBepVerification = $verification;
            break;
        }
    }
    if (!$activeBepVerification && !$user['isAdmin']) {
        architex_record_audit('marketplace.opportunities_blocked_unverified_bep', $user, ['type' => 'marketplace_opportunities'], ['requiredSubjectType' => 'bep', 'requiredStatutoryBody' => 'SACAP']);
        architex_json(403, [
            'error' => 'Verified built-environment professional status required',
            'verificationRequired' => ['subjectType' => 'bep', 'statutoryBody' => 'SACAP'],
        ]);
    }

    $search = strtolower(trim((string) ($_GET['q'] ?? '')));
    $region = strtolower(trim((string) ($_GET['region'] ?? '')));
    $jobs = architex_firestore_list_documents('jobs', 100);
    $opportunities = [];
    foreach ($jobs as $job) {
        if (($job['status'] ?? '') !== 'open') continue;
        $haystack = strtolower(implode(' ', [
            (string) ($job['title'] ?? ''),
            (string) ($job['description'] ?? ''),
            (string) ($job['category'] ?? ''),
            (string) ($job['region'] ?? ''),
            (string) ($job['location'] ?? ''),
        ]));
        if ($search !== '' && strpos($haystack, $search) === false) continue;
        if ($region !== '' && strpos(strtolower((string) ($job['region'] ?? $job['location'] ?? '')), $region) === false) continue;
        unset($job['_name']);
        $job['aiMatchScore'] = $search !== '' ? 0.9 : 0.75;
        if ($activeBepVerification) $job['verificationId'] = $activeBepVerification['id'] ?? null;
        $opportunities[] = $job;
    }
    usort($opportunities, function (array $a, array $b): int {
        return strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? ''));
    });
    architex_record_audit('marketplace.opportunities_viewed', $user, ['type' => 'marketplace_opportunities'], ['verificationId' => $activeBepVerification['id'] ?? null, 'resultCount' => count($opportunities), 'search' => $search, 'region' => $region]);
    architex_json(200, ['opportunities' => $opportunities, 'verificationId' => $activeBepVerification['id'] ?? null]);
}

if (preg_match('#^/admin/verifications/([^/]+)/(review|recheck)$#', $route, $matches) === 1 && $method === 'POST') {
    $user = architex_require_user();
    if (!$user['isAdmin']) architex_json(403, ['error' => 'Admin access required']);
    $verificationId = rawurldecode($matches[1]);
    $action = $matches[2];
    $body = architex_json_input();
    $verification = architex_firestore_get_document('user_verifications', $verificationId);
    if (!$verification) architex_json(404, ['error' => 'Verification not found']);
    $now = architex_now();
    if ($action === 'review') {
        $status = (string) ($body['status'] ?? '');
        if (!in_array($status, ['verified', 'rejected'], true)) architex_json(400, ['error' => 'status must be verified or rejected']);
        $updates = [
            'status' => $status,
            'reviewedBy' => $user['uid'],
            'reviewedAt' => $now,
            'updatedAt' => $now,
            'adminReviewNote' => (string) ($body['adminReviewNote'] ?? ''),
        ];
        if ($status === 'rejected') {
            $reason = trim((string) ($body['rejectionReason'] ?? ''));
            if (strlen($reason) < 5) architex_json(400, ['error' => 'A clear rejection reason is required']);
            $updates['rejectionReason'] = $reason;
        }
        $doc = architex_firestore_set_document('user_verifications', $verificationId, $updates, true);
        architex_record_audit('verification.reviewed', $user, ['type' => 'user_verification', 'id' => $verificationId], ['status' => $status]);
        architex_json(200, ['verification' => architex_public_payload($doc), 'status' => $status]);
    }
    $doc = architex_firestore_set_document('user_verifications', $verificationId, [
        'status' => 'pending',
        'recheckRequestedBy' => $user['uid'],
        'recheckRequestedAt' => $now,
        'recheckReason' => (string) ($body['reason'] ?? 'Admin queued official register recheck'),
        'provider' => 'php-gateway-manual-recheck',
        'updatedAt' => $now,
    ], true);
    architex_record_audit('verification.recheck_queued', $user, ['type' => 'user_verification', 'id' => $verificationId], ['reason' => (string) ($body['reason'] ?? '')]);
    architex_json(200, ['verification' => architex_public_payload($doc), 'status' => 'pending']);
}

if ($route === '/review' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $prompt = (string) ($body['prompt'] ?? $body['message'] ?? '');
    $system = (string) ($body['systemInstruction'] ?? 'You are an AI assistant providing preliminary South African built-environment review. Do not certify or approve regulated workflows; require human professional signoff.');
    if ($prompt === '') architex_json(400, ['error' => 'prompt is required']);
    try {
        $text = architex_call_gemini_text($prompt, $system);
        architex_record_audit('ai.review.completed', $user, ['type' => 'ai_review', 'id' => null], ['provider' => 'gemini-php-gateway']);
        architex_json(200, architex_llm_text_response($text));
    } catch (Throwable $error) {
        architex_record_audit('ai.review.unavailable', $user, ['type' => 'ai_review', 'id' => null], ['reason' => $error->getMessage()]);
        architex_json(503, [
            'error' => 'AI review temporarily unavailable',
            'message' => 'The PHP gateway could not reach a configured AI provider. No automated regulated approval was performed.',
            'migrationStatus' => 'provider-gated',
        ]);
    }
}

if ($route === '/agent/search' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $query = trim((string) ($body['query'] ?? ''));
    if ($query === '') architex_json(400, ['error' => 'query is required']);
    try {
        $text = architex_call_gemini_text('Search/summarize relevant knowledge for: ' . $query, 'Return concise practical guidance with caveats and source limitations.');
        architex_json(200, ['text' => $text]);
    } catch (Throwable $error) {
        architex_json(503, ['error' => 'Search provider unavailable', 'details' => 'No configured PHP-compatible search/LLM provider is available.']);
    }
}

if ($route === '/agent/scope' && $method === 'POST') {
    architex_require_user();
    architex_json(200, ['scope' => [], 'agents' => [], 'message' => 'Agent scope registry is available in the SPA/Firestore; PHP gateway returned an empty provider-neutral scope.']);
}

if ($route === '/agent/test-settings' && $method === 'POST') {
    architex_require_user();
    $body = architex_json_input();
    try {
        $text = architex_call_gemini_text((string) ($body['prompt'] ?? 'Return OK'), 'Provider smoke test');
        architex_json(200, ['success' => true, 'text' => $text]);
    } catch (Throwable $error) {
        architex_json(503, ['success' => false, 'error' => 'Provider unavailable']);
    }
}

if ($route === '/files/upload' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $fileBase64 = (string) ($body['fileBase64'] ?? '');
    $context = (string) ($body['context'] ?? '');
    $fileName = basename((string) ($body['fileName'] ?? ('upload-' . time())));
    $fileType = (string) ($body['fileType'] ?? 'application/octet-stream');
    $fileSize = (int) ($body['fileSize'] ?? 0);
    $jobId = $body['jobId'] ?? null;
    $submissionId = $body['submissionId'] ?? null;
    if ($fileBase64 === '') architex_json(400, ['error' => 'No file provided']);
    if ($context === '') architex_json(400, ['error' => 'context field is required']);
    if ($fileSize > 20 * 1024 * 1024) architex_json(413, ['error' => 'File is too large', 'details' => 'Maximum upload size is 20 MB']);
    $binary = base64_decode($fileBase64, true);
    if ($binary === false) architex_json(400, ['error' => 'Invalid base64 file payload']);
    if (strlen($binary) > 20 * 1024 * 1024) architex_json(413, ['error' => 'File is too large', 'details' => 'Maximum upload size is 20 MB']);

    if ($jobId) {
        $job = architex_firestore_get_document('jobs', (string) $jobId);
        if (!$job) architex_json(404, ['error' => 'Job not found']);
        $authorized = ($job['clientId'] ?? null) === $user['uid'] || ($job['selectedArchitectId'] ?? null) === $user['uid'] || $user['isAdmin'];
        if (!$authorized) architex_json(403, ['error' => "You don't have permission to upload files for this job"]);
    }

    $blobToken = architex_env('BLOB_READ_WRITE_TOKEN') ?? architex_env('VITE_BLOB_READ_WRITE_TOKEN');
    if (!$blobToken) architex_json(503, ['error' => 'Service unavailable: Storage token missing.']);
    $pathname = 'architex/' . date('Y/m/d') . '/' . preg_replace('/[^A-Za-z0-9._-]+/', '-', $fileName);
    $upload = architex_http_raw('https://blob.vercel-storage.com/' . rawurlencode($pathname), [
        'method' => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $blobToken,
            'Content-Type' => $fileType,
            'X-Add-Random-Suffix' => '1',
        ],
        'body' => $binary,
        'timeout' => 60,
    ]);
    $blob = json_decode((string) $upload['raw'], true);
    if (($upload['status'] ?? 0) < 200 || ($upload['status'] ?? 0) >= 300 || !is_array($blob) || empty($blob['url'])) {
        architex_json(503, ['error' => 'Upload failed', 'details' => 'Vercel Blob REST upload was rejected by the provider.']);
    }
    $doc = architex_firestore_create_document('uploaded_files', [
        'url' => (string) $blob['url'],
        'fileName' => $fileName,
        'fileType' => $fileType,
        'fileSize' => $fileSize ?: strlen($binary),
        'uploadedBy' => $user['uid'],
        'context' => $context,
        'jobId' => $jobId,
        'submissionId' => $submissionId,
        'uploadedAt' => architex_now(),
    ]);
    architex_record_audit('file.uploaded', $user, ['type' => 'uploaded_file', 'id' => $doc['id'] ?? null], ['context' => $context, 'jobId' => $jobId, 'fileName' => $fileName]);
    architex_json(200, ['url' => (string) $blob['url'], 'fileId' => $doc['id'] ?? null]);
}

if ($route === '/files/delete' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $fileId = (string) ($body['fileId'] ?? '');
    if ($fileId === '') architex_json(400, ['error' => 'Missing fileId or fileUrl']);
    $file = architex_firestore_get_document('uploaded_files', $fileId);
    if (!$file) architex_json(404, ['error' => 'File record not found in database']);
    if (($file['uploadedBy'] ?? null) !== $user['uid'] && !$user['isAdmin']) architex_json(403, ['error' => "You don't have permission to delete this file"]);
    architex_firestore_set_document('uploaded_files', $fileId, ['deletedAt' => architex_now(), 'deletedBy' => $user['uid'], 'status' => 'deleted'], true);
    architex_record_audit('file.deleted', $user, ['type' => 'uploaded_file', 'id' => $fileId], ['softDelete' => true]);
    architex_json(200, ['success' => true, 'message' => 'File metadata marked deleted successfully']);
}

if (preg_match('#^/jobs/([^/]+)/applications$#', $route, $matches) === 1 && $method === 'POST') {
    $user = architex_require_user();
    $jobId = $matches[1];
    $body = architex_json_input();
    $proposal = trim((string) ($body['proposal'] ?? ''));
    if ($proposal === '') architex_json(400, ['error' => 'Proposal is required']);
    $job = architex_firestore_get_document('jobs', $jobId);
    if (!$job) architex_json(404, ['error' => 'Job not found']);
    if (($job['status'] ?? null) !== 'open') architex_json(400, ['error' => 'This job is not open for applications']);
    if (($job['clientId'] ?? null) === $user['uid']) architex_json(400, ['error' => 'You cannot apply to your own job']);
    $now = architex_now();
    $doc = architex_firestore_create_document('jobs/' . $jobId . '/applications', [
        'jobId' => $jobId,
        'architectId' => $user['uid'],
        'architectName' => $user['profile']['displayName'] ?? $user['email'] ?? 'Professional',
        'proposal' => $proposal,
        'notes' => (string) ($body['notes'] ?? ''),
        'status' => 'pending',
        'createdAt' => $now,
        'updatedAt' => $now,
    ]);
    architex_record_audit('marketplace.application_submitted', $user, ['type' => 'job_application', 'id' => $doc['id'] ?? null, 'projectId' => $jobId], []);
    architex_json(201, ['id' => $doc['id'] ?? null, 'jobId' => $jobId, 'status' => 'pending']);
}

if (preg_match('#^/jobs/([^/]+)/applications/([^/]+)/accept$#', $route, $matches) === 1 && $method === 'POST') {
    $user = architex_require_user();
    $jobId = $matches[1];
    $applicationId = $matches[2];
    $job = architex_firestore_get_document('jobs', $jobId);
    if (!$job) architex_json(404, ['error' => 'Job not found']);
    if (($job['clientId'] ?? null) !== $user['uid'] && !$user['isAdmin']) {
        architex_json(403, ['error' => 'Only the job owner can accept applications']);
    }
    if (($job['status'] ?? null) !== 'open') architex_json(400, ['error' => 'This job is no longer open']);

    $application = architex_firestore_get_document('jobs/' . $jobId . '/applications', $applicationId);
    if (!$application) architex_json(404, ['error' => 'Application not found']);
    if (($application['status'] ?? null) !== 'pending') architex_json(400, ['error' => 'Only pending applications can be accepted']);

    $now = architex_now();
    $selectedProfessionalId = (string) ($application['professionalId'] ?? $application['bepId'] ?? $application['architectId'] ?? '');
    if ($selectedProfessionalId === '') architex_json(400, ['error' => 'Application is missing professional identity']);

    architex_firestore_set_document('jobs/' . $jobId . '/applications', $applicationId, ['status' => 'accepted', 'updatedAt' => $now], true);
    $statusHistory = is_array($job['statusHistory'] ?? null) ? $job['statusHistory'] : [];
    $statusHistory[] = [
        'status' => 'in-progress',
        'timestamp' => $now,
        'actorId' => $user['uid'],
        'note' => 'Accepted ' . (string) ($application['architectName'] ?? $application['professionalName'] ?? 'professional'),
    ];
    architex_firestore_set_document('jobs', $jobId, [
        'status' => 'in-progress',
        'updatedAt' => $now,
        'statusHistory' => $statusHistory,
        'selectedProfessionalId' => $selectedProfessionalId,
        'selectedBepId' => $selectedProfessionalId,
        'selectedArchitectId' => $selectedProfessionalId,
    ], true);
    architex_firestore_set_document('projects', $jobId, [
        'id' => $jobId,
        'jobId' => $jobId,
        'clientId' => (string) ($job['clientId'] ?? $user['uid']),
        'selectedProfessionalId' => $selectedProfessionalId,
        'selectedBepId' => $selectedProfessionalId,
        'selectedArchitectId' => $selectedProfessionalId,
        'currentStage' => 'intake',
        'teamMembers' => [
            ['userId' => (string) ($job['clientId'] ?? $user['uid']), 'role' => 'client', 'joinedAt' => $now, 'status' => 'active'],
            ['userId' => $selectedProfessionalId, 'role' => 'architect', 'discipline' => 'architecture', 'joinedAt' => $now, 'status' => 'active'],
        ],
        'updatedAt' => $now,
        'createdAt' => (string) ($job['createdAt'] ?? $now),
    ], true);

    try {
        $applications = architex_firestore_list_documents('jobs/' . $jobId . '/applications', 100);
        foreach ($applications as $other) {
            if (($other['id'] ?? '') !== $applicationId && ($other['status'] ?? '') === 'pending') {
                architex_firestore_set_document('jobs/' . $jobId . '/applications', (string) $other['id'], ['status' => 'rejected', 'updatedAt' => $now], true);
            }
        }
    } catch (Throwable $ignored) {}

    try {
        architex_firestore_create_document('notifications', [
            'userId' => $selectedProfessionalId,
            'type' => 'application_accepted',
            'title' => 'Application Accepted',
            'body' => 'Your application for "' . (string) ($job['title'] ?? 'this job') . '" was accepted!',
            'data' => ['jobId' => $jobId, 'applicationId' => $applicationId, 'senderId' => $user['uid']],
            'isRead' => false,
            'channels' => ['in_app', 'email', 'push'],
            'createdAt' => $now,
            'deliveryStatus' => 'pending',
        ]);
    } catch (Throwable $ignored) {}
    architex_record_audit('marketplace.application_accepted', $user, ['type' => 'job_application', 'id' => $applicationId, 'projectId' => $jobId], ['selectedProfessionalId' => $selectedProfessionalId, 'projectCreatedOrUpdated' => true]);
    architex_json(200, [
        'jobId' => $jobId,
        'applicationId' => $applicationId,
        'selectedProfessionalId' => $selectedProfessionalId,
        'selectedBepId' => $selectedProfessionalId,
        'selectedArchitectId' => $selectedProfessionalId,
        'status' => 'in-progress',
    ]);
}

if ($route === '/payment/notify' && $method === 'POST') {
    $data = $_POST ?: architex_json_input();
    $paymentId = (string) ($data['m_payment_id'] ?? $data['custom_str1'] ?? '');
    $receivedSignature = (string) ($data['signature'] ?? '');
    $passphrase = architex_env('PAYFAST_PASSPHRASE') ?? '';
    $expected = architex_payfast_signature($data, $passphrase);
    $signatureOk = $receivedSignature !== '' && hash_equals($expected, $receivedSignature);
    try {
        architex_firestore_create_document('payment_itn_audit', [
            'paymentId' => $paymentId,
            'signatureOk' => $signatureOk,
            'paymentStatus' => (string) ($data['payment_status'] ?? ''),
            'amountGross' => (string) ($data['amount_gross'] ?? ''),
            'raw' => $data,
            'createdAt' => architex_now(),
            'source' => 'php-gateway',
        ]);
    } catch (Throwable $ignored) {}
    if (!$signatureOk) architex_json(400, ['error' => 'Invalid PayFast signature']);
    architex_json(202, ['status' => 'received', 'paymentId' => $paymentId, 'message' => 'ITN signature accepted; funding mutation remains human/provider gated in PHP gateway.']);
}

if ($route === '/payment/escrow/init' && $method === 'POST') {
    $user = architex_require_user();
    $body = architex_json_input();
    $jobId = (string) ($body['jobId'] ?? '');
    if ($jobId === '') architex_json(400, ['error' => 'jobId is required']);
    $job = architex_firestore_get_document('jobs', $jobId);
    if (!$job) architex_json(404, ['error' => 'Job not found']);
    if (($job['clientId'] ?? null) !== $user['uid'] && !$user['isAdmin']) architex_json(403, ['error' => 'Only the client can initialize escrow']);
    $baseAmount = (int) (($job['budget'] ?? $job['amount'] ?? $job['fee'] ?? 0));
    if ($baseAmount <= 0) $baseAmount = 100000;
    $platformFee = (int) round($baseAmount * 0.01);
    $total = $baseAmount + $platformFee;
    $paymentId = 'pay_' . bin2hex(random_bytes(8));
    architex_firestore_set_document('payments', $paymentId, [
        'id' => $paymentId,
        'jobId' => $jobId,
        'clientId' => $user['uid'],
        'amount' => $baseAmount,
        'platformFee' => $platformFee,
        'totalAmount' => $total,
        'status' => 'pending_provider_payment',
        'createdAt' => architex_now(),
        'updatedAt' => architex_now(),
    ], false);
    architex_record_audit('payment.escrow_initialized', $user, ['type' => 'payment', 'id' => $paymentId, 'projectId' => $jobId], ['totalAmount' => $total]);
    architex_json(200, ['paymentId' => $paymentId, 'totalAmount' => $total, 'architectAmount' => $baseAmount, 'platformFee' => $platformFee]);
}

if (in_array($route, ['/payment/confirm', '/payment/milestone/request', '/payment/milestone/release', '/payment/refund'], true) && $method === 'POST') {
    $user = architex_require_user();
    architex_json_input();
    architex_record_audit('payment.route_blocked_pending_php_parity', $user, ['type' => 'payment_route', 'id' => $route], []);
    architex_json(409, ['error' => 'Payment action requires human/admin processing', 'message' => 'This PHP gateway records the request path but does not mutate escrow/release/refund state until full parity tests are complete.']);
}

if (preg_match('#^/payment/#', $route) === 1) {
    architex_not_implemented($route, 'Payment and escrow mutations remain disabled until the PHP gateway has tested provider validation and human approval gates.');
}

if (preg_match('#^/agent/#', $route) === 1) {
    architex_not_implemented($route, 'Agent provider proxy routes are planned for PHP/serverless migration.');
}

if (preg_match('#^/municipal/#', $route) === 1) {
    architex_not_implemented($route, 'Municipal provider routes are planned for PHP/serverless migration.');
}

if (preg_match('#^/verifications#', $route) === 1 || preg_match('#^/admin/verifications/#', $route) === 1 || $route === '/architect/verify-sacap') {
    architex_not_implemented($route, 'Verification workflows require Firebase token verification and Firestore REST write helpers before enabling.');
}

architex_json(404, [
    'error' => 'API route not found',
    'path' => $route,
    'method' => $method,
]);
