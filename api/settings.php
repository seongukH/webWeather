<?php
/**
 * API Key 설정 CRUD API
 *
 * GET  /api/settings.php          → 전체 설정 조회
 * POST /api/settings.php          → 설정 저장 (JSON body)
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

function sendJson($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function readHeader($name) {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return isset($_SERVER[$key]) ? trim((string)$_SERVER[$key]) : '';
}

function enforceSameOrigin() {
    $origin = readHeader('Origin');
    if ($origin === '') return;

    $originHost = parse_url($origin, PHP_URL_HOST);
    $requestHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
    if (!$originHost || !$requestHost || strcasecmp($originHost, $requestHost) !== 0) {
        sendJson(['success' => false, 'error' => '허용되지 않은 Origin'], 403);
    }
}

function extractAdminTokenFromRequest() {
    $token = readHeader('X-Admin-Token');
    if ($token !== '') return $token;

    $auth = readHeader('Authorization');
    if ($auth !== '' && preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    return '';
}

function requireAdminToken() {
    $expected = envOrDefault('WEBWEATHER_ADMIN_TOKEN', '');
    $allowUnsafeWrite = envBool('WEBWEATHER_ALLOW_UNAUTHENTICATED_SETTINGS_WRITE', false);

    if ($expected === '' && !$allowUnsafeWrite) {
        sendJson([
            'success' => false,
            'error' => '서버에 WEBWEATHER_ADMIN_TOKEN이 설정되지 않아 저장이 비활성화되었습니다.'
        ], 503);
    }
    if ($expected === '') return;

    $provided = extractAdminTokenFromRequest();
    if ($provided === '' || !hash_equals($expected, $provided)) {
        sendJson(['success' => false, 'error' => '관리자 토큰이 유효하지 않습니다.'], 401);
    }
}

function normalizeSettingValue($value) {
    if (!is_string($value)) return null;

    $trimmed = trim($value);
    if (strlen($trimmed) > 512) return null;
    if (preg_match('/[\x00-\x1F\x7F]/', $trimmed)) return null;

    return $trimmed;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    enforceSameOrigin();
    if ($method !== 'GET' && $method !== 'POST') {
        sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
    }

    $db = getDB();

    if ($method === 'GET') {
        // 전체 설정 조회
        $stmt = $db->query('SELECT setting_key, setting_value FROM settings WHERE setting_key IN ("vworldKey","ncpmsKey","agroKey")');
        $rows = $stmt->fetchAll();

        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }

        sendJson(['success' => true, 'settings' => $settings]);

    } elseif ($method === 'POST') {
        requireAdminToken();

        // 설정 저장
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !is_array($input)) {
            sendJson(['success' => false, 'error' => 'JSON body 필요'], 400);
        }

        $stmt = $db->prepare('
            INSERT INTO settings (setting_key, setting_value)
            VALUES (:key, :value)
            ON DUPLICATE KEY UPDATE setting_value = :value2, updated_at = CURRENT_TIMESTAMP
        ');

        $saved = [];
        $allowedKeys = ['vworldKey', 'ncpmsKey', 'agroKey'];
        foreach ($input as $key => $value) {
            // 허용된 키만 저장
            if (!in_array($key, $allowedKeys)) continue;
            $normalized = normalizeSettingValue($value);
            if ($normalized === null) {
                sendJson(['success' => false, 'error' => "유효하지 않은 값: {$key}"], 400);
            }

            $stmt->execute([
                ':key' => $key,
                ':value' => $normalized,
                ':value2' => $normalized,
            ]);
            $saved[] = $key;
        }

        sendJson([
            'success' => true,
            'message' => count($saved) . '개 설정 저장됨',
            'saved' => $saved,
        ]);
    }

} catch (RuntimeException $e) {
    sendJson(['success' => false, 'error' => '설정 오류: ' . $e->getMessage()], 500);
} catch (PDOException $e) {
    sendJson(['success' => false, 'error' => 'DB 오류: ' . $e->getMessage()], 500);
}
