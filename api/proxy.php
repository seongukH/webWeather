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

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

function proxyJsonError($status, $message) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

// 허용 도메인 + 스킴 목록
$allowedTargets = [
    'ncpms.rda.go.kr' => ['http', 'https'],
    'api.vworld.kr' => ['https'],
];

$targetUrl = isset($_GET['url']) ? trim((string)$_GET['url']) : '';

if (!$targetUrl) {
    proxyJsonError(400, 'url 파라미터 필수');
}
if (strlen($targetUrl) > 2048) {
    proxyJsonError(400, 'url 길이가 너무 깁니다.');
}

// 도메인 검증
$parsed = parse_url($targetUrl);
$host = isset($parsed['host']) ? strtolower((string)$parsed['host']) : '';
$scheme = isset($parsed['scheme']) ? strtolower((string)$parsed['scheme']) : '';

if ($host === '' || $scheme === '') {
    proxyJsonError(400, '유효하지 않은 url 형식');
}
if (isset($parsed['user']) || isset($parsed['pass'])) {
    proxyJsonError(400, '인증정보가 포함된 url은 허용되지 않습니다.');
}
if (!isset($allowedTargets[$host])) {
    proxyJsonError(403, '허용되지 않은 도메인: ' . $host);
}
if (!in_array($scheme, $allowedTargets[$host], true)) {
    proxyJsonError(403, '허용되지 않은 스킴: ' . $scheme);
}

$ch = curl_init($targetUrl);
$curlOptions = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'Mozilla/5.0 webweather-proxy/1.0',
    CURLOPT_HEADER => true,
];
if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
    $curlOptions[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    $curlOptions[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
}
curl_setopt_array($ch, $curlOptions);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    proxyJsonError(502, '프록시 연결 실패: ' . $error);
}
if ($response === false) {
    proxyJsonError(502, '프록시 응답이 비어 있습니다.');
}

$headers = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

// Content-Type 전달
if (preg_match('/^Content-Type:\s*([^\r\n]+)/mi', $headers, $m)) {
    header('Content-Type: ' . trim($m[1]));
} else {
    header('Content-Type: text/html; charset=utf-8');
}

http_response_code($httpCode);
echo $body;
