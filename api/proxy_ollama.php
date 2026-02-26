<?php
/**
 * Ollama Cloud API 프록시
 * 서버 사이드에서 Bearer 토큰 인증 처리
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST만 허용'], JSON_UNESCAPED_UNICODE);
    exit;
}

$apiToken = getenv('OLLAMA_API_KEY') ?: getenv('OLLAMA_API_TOKEN') ?: '';
if (!$apiToken) {
    http_response_code(500);
    echo json_encode(['error' => 'OLLAMA_API_KEY 환경변수 미설정. Secrets에 OLLAMA_API_KEY를 추가해주세요.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = file_get_contents('php://input');
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON 본문 필요'], JSON_UNESCAPED_UNICODE);
    exit;
}

$body = json_decode($input, true);
$endpoint = $body['_endpoint'] ?? 'chat';
unset($body['_endpoint']);

$urlMap = [
    'chat'     => 'https://ollama.com/api/chat',
    'generate' => 'https://ollama.com/api/generate',
    'models'   => 'https://ollama.com/api/tags',
];
$url = $urlMap[$endpoint] ?? $urlMap['chat'];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($body),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiToken,
    ],
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    http_response_code(502);
    echo json_encode(['error' => 'Ollama API 연결 실패: ' . $error], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($httpCode);
echo $response;
