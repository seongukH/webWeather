<?php
/**
 * 범용 프록시 (NCPMS 위젯 + VWorld Data API)
 * CORS / Mixed Content 우회
 *
 * 사용:
 *   /api/proxy.php?url=http://ncpms.rda.go.kr/...
 *   /api/proxy.php?url=https://api.vworld.kr/...
 *
 * 보안: 허용 도메인만 프록시
 */

// 허용 도메인 목록
$allowedHosts = [
    'ncpms.rda.go.kr',
    'api.vworld.kr',
];

$targetUrl = isset($_GET['url']) ? $_GET['url'] : '';

if (!$targetUrl) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(400);
    echo json_encode(['error' => 'url 파라미터 필수'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 도메인 검증
$parsed = parse_url($targetUrl);
$host = isset($parsed['host']) ? $parsed['host'] : '';

if (!in_array($host, $allowedHosts)) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => '허용되지 않은 도메인: ' . $host], JSON_UNESCAPED_UNICODE);
    exit;
}

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'Mozilla/5.0 webweather-proxy/1.0',
    CURLOPT_HEADER => true,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(502);
    echo json_encode(['error' => '프록시 연결 실패: ' . $error], JSON_UNESCAPED_UNICODE);
    exit;
}

$headers = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

// Content-Type 전달
if (preg_match('/Content-Type:\s*(.+)/i', $headers, $m)) {
    header('Content-Type: ' . trim($m[1]));
} else {
    header('Content-Type: text/html; charset=utf-8');
}

header('Access-Control-Allow-Origin: *');
http_response_code($httpCode);
echo $body;
