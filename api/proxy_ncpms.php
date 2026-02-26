<?php
/**
 * NCPMS API 프록시
 * CORS + Mixed Content 문제 우회: 브라우저(HTTPS) → NAS PHP → NCPMS(HTTP)
 *
 * 사용: /api/proxy_ncpms.php?apiKey=...&serviceCode=SVC31&cropCode=FC010101&...
 */

header('Access-Control-Allow-Origin: *');

// 허용 파라미터만 전달
$allowed = ['apiKey','serviceCode','cropCode','diseaseWeedCode','displayDate',
             'sickKey','insectKey','kncrCode','displayCount','listFlag',
             'sickNameKor','cropName','examinYear'];
$params = [];
foreach ($allowed as $k) {
    if (isset($_GET[$k])) {
        $params[$k] = $_GET[$k];
    }
}

if (!isset($params['apiKey']) || !isset($params['serviceCode'])) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(400);
    echo json_encode(['error' => 'apiKey, serviceCode 파라미터 필수'], JSON_UNESCAPED_UNICODE);
    exit;
}

$url = 'http://ncpms.rda.go.kr/npmsAPI/service?' . http_build_query($params);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'webweather-proxy/1.0',
]);

$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/json; charset=utf-8';
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(502);
    echo json_encode(['error' => 'NCPMS API 연결 실패: ' . $error], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($httpCode);
header('Content-Type: ' . $contentType);
echo $body;
