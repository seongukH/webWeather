<?php
/**
 * NCPMS SVC31 위젯용 AJAX 콜백 프록시
 * (NCPMS 공식 샘플 fore_ajax_callback.php 기반)
 *
 * NCPMS 위젯 JS가 내부적으로 이 URL을 호출하여
 * NCPMS 서버에서 예측 데이터를 가져옴
 */

header("Content-type: application/xml; charset=utf-8");
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

$queryString = $_SERVER["QUERY_STRING"];
if (!$queryString || strlen($queryString) > 2048) {
    echo '<?xml version="1.0" encoding="UTF-8"?><error>invalid query</error>';
    exit;
}
if (preg_match('/[\r\n]/', $queryString)) {
    echo '<?xml version="1.0" encoding="UTF-8"?><error>invalid query format</error>';
    exit;
}

$url = 'https://ncpms.rda.go.kr/npmsAPI/service?' . $queryString . '&serviceType=AA001';

$ch = curl_init($url);
$curlOptions = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'Mozilla/5.0 webweather-proxy/1.0',
];
if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
    $curlOptions[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    $curlOptions[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
}
curl_setopt_array($ch, $curlOptions);

$body = curl_exec($ch);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    echo '<?xml version="1.0" encoding="UTF-8"?><error>' . htmlspecialchars($error) . '</error>';
} else {
    echo $body;
}
