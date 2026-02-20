<?php
/**
 * VWorld Data API 프록시
 * CORS 문제 우회: 브라우저 → NAS PHP → VWorld API
 *
 * 사용: /api/proxy_vworld.php?data=LT_C_AISPRHC&key=...&page=1&size=1000
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// 허용 파라미터만 전달 (보안)
$allowed = ['service','request','data','key','format','size','page','crs','geomFilter','attrFilter','domain'];
$params = [];
foreach ($allowed as $k) {
    if (isset($_GET[$k])) {
        $params[$k] = $_GET[$k];
    }
}

// 기본값
if (!isset($params['service']))  $params['service'] = 'data';
if (!isset($params['request']))  $params['request'] = 'GetFeature';
if (!isset($params['format']))   $params['format'] = 'json';
if (!isset($params['crs']))      $params['crs'] = 'EPSG:4326';

if (!isset($params['data']) || !isset($params['key'])) {
    http_response_code(400);
    echo json_encode(['error' => 'data, key 파라미터 필수'], JSON_UNESCAPED_UNICODE);
    exit;
}

$url = 'https://api.vworld.kr/req/data?' . http_build_query($params);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'webweather-proxy/1.0',
]);

$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    http_response_code(502);
    echo json_encode(['error' => 'VWorld API 연결 실패: ' . $error], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($httpCode);
echo $body;
