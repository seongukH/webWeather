<?php
/**
 * VWorld Data API 프록시
 * CORS 문제 우회: 브라우저 → NAS PHP → VWorld API
 *
 * 사용: /api/proxy_vworld.php?data=LT_C_AISPRHC&key=...&page=1&size=1000
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

function vworldError($status, $message) {
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

// 허용 파라미터만 전달 (보안)
$allowed = ['service','request','data','key','format','size','page','crs','geomFilter','attrFilter','domain'];
$params = [];
foreach ($allowed as $k) {
    if (isset($_GET[$k])) {
        $params[$k] = trim((string)$_GET[$k]);
    }
}

// 기본값
if (!isset($params['service']))  $params['service'] = 'data';
if (!isset($params['request']))  $params['request'] = 'GetFeature';
if (!isset($params['format']))   $params['format'] = 'json';
if (!isset($params['crs']))      $params['crs'] = 'EPSG:4326';

if (!isset($params['data']) || !isset($params['key'])) {
    vworldError(400, 'data, key 파라미터 필수');
}

if ($params['service'] !== 'data' || $params['request'] !== 'GetFeature' || strtolower($params['format']) !== 'json') {
    vworldError(400, '지원되지 않는 요청 파라미터(service/request/format)');
}
if (!preg_match('/^[A-Za-z0-9_]+$/', $params['data'])) {
    vworldError(400, '유효하지 않은 data 파라미터');
}
if (strlen($params['key']) < 8 || strlen($params['key']) > 128 || preg_match('/[\x00-\x1F\x7F]/', $params['key'])) {
    vworldError(400, '유효하지 않은 key 파라미터');
}

$params['size'] = isset($params['size']) ? max(1, min(1000, (int)$params['size'])) : 1000;
$params['page'] = isset($params['page']) ? max(1, min(1000, (int)$params['page'])) : 1;

// 외부에서 넘어온 domain 값을 신뢰하지 않고 서버 호스트로 고정
$requestHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
if ($requestHost) {
    $params['domain'] = $requestHost;
}

$url = 'https://api.vworld.kr/req/data?' . http_build_query($params);

$ch = curl_init($url);
$curlOptions = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'webweather-proxy/1.0',
];
if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
    $curlOptions[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    $curlOptions[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
}
curl_setopt_array($ch, $curlOptions);

$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    vworldError(502, 'VWorld API 연결 실패: ' . $error);
}
if ($body === false) {
    vworldError(502, 'VWorld API 응답이 비어 있습니다.');
}

http_response_code($httpCode);
echo $body;
