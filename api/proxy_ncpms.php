<?php
/**
 * NCPMS API 프록시
 * CORS + Mixed Content 문제 우회: 브라우저(HTTPS) → NAS PHP → NCPMS(HTTPS)
 *
 * 사용: /api/proxy_ncpms.php?apiKey=...&serviceCode=SVC31&cropCode=FC010101&...
 */

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

// 허용 파라미터만 전달
$allowed = [
    'apiKey',
    'serviceCode',
    'cropCode',
    'diseaseWeedCode',
    'displayDate',
    'sickKey',
    'insectKey',
    'sidoCode',
];
$params = [];
foreach ($allowed as $k) {
    if (isset($_GET[$k])) {
        $params[$k] = trim((string)$_GET[$k]);
    }
}

function ncpmsError($status, $message) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($params['apiKey']) || !isset($params['serviceCode'])) {
    ncpmsError(400, 'apiKey, serviceCode 파라미터 필수');
}

if (strlen($params['apiKey']) < 8 || strlen($params['apiKey']) > 128 || preg_match('/[\x00-\x1F\x7F]/', $params['apiKey'])) {
    ncpmsError(400, '유효하지 않은 apiKey 파라미터');
}

$allowedServiceCodes = ['SVC31', 'SVC33', 'SVC05', 'SVC09'];
if (!in_array($params['serviceCode'], $allowedServiceCodes, true)) {
    ncpmsError(400, '허용되지 않은 serviceCode');
}

if (isset($params['displayDate']) && !preg_match('/^\d{8}$/', $params['displayDate'])) {
    ncpmsError(400, 'displayDate 형식은 YYYYMMDD 입니다.');
}
foreach (['cropCode', 'diseaseWeedCode', 'sickKey', 'insectKey', 'sidoCode'] as $codeField) {
    if (!isset($params[$codeField])) continue;
    if (!preg_match('/^[A-Za-z0-9_]{2,24}$/', $params[$codeField])) {
        ncpmsError(400, "{$codeField} 형식이 올바르지 않습니다.");
    }
}

$url = 'https://ncpms.rda.go.kr/npmsAPI/service?' . http_build_query($params);

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
    ncpmsError(502, 'NCPMS API 연결 실패: ' . $error);
}
if ($body === false) {
    ncpmsError(502, 'NCPMS API 응답이 비어 있습니다.');
}

header('Content-Type: text/xml; charset=utf-8');
http_response_code($httpCode);
echo $body;
