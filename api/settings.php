<?php
/**
 * API Key 설정 CRUD API
 *
 * GET  /api/settings.php          → 전체 설정 조회
 * POST /api/settings.php          → 설정 저장 (JSON body)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

try {
    $db = getDB();
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        // 전체 설정 조회
        $stmt = $db->query('SELECT setting_key, setting_value FROM settings');
        $rows = $stmt->fetchAll();

        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }

        echo json_encode(['success' => true, 'settings' => $settings], JSON_UNESCAPED_UNICODE);

    } elseif ($method === 'POST') {
        // 설정 저장
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !is_array($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'JSON body 필요'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $stmt = $db->prepare('
            INSERT INTO settings (setting_key, setting_value)
            VALUES (:key, :value)
            ON DUPLICATE KEY UPDATE setting_value = :value2, updated_at = CURRENT_TIMESTAMP
        ');

        $saved = [];
        foreach ($input as $key => $value) {
            // 허용된 키만 저장
            $allowedKeys = ['vworldKey', 'ncpmsKey'];
            if (!in_array($key, $allowedKeys)) continue;

            $stmt->execute([
                ':key' => $key,
                ':value' => $value,
                ':value2' => $value,
            ]);
            $saved[] = $key;
        }

        echo json_encode([
            'success' => true,
            'message' => count($saved) . '개 설정 저장됨',
            'saved' => $saved,
        ], JSON_UNESCAPED_UNICODE);

    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB 오류: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
