<?php
/**
 * NCPMS SVC31 위젯용 AJAX 콜백 프록시
 * (NCPMS 공식 샘플 fore_ajax_callback.php 기반)
 *
 * NCPMS 위젯 JS가 내부적으로 이 URL을 호출하여
 * NCPMS 서버에서 예측 데이터를 가져옴
 */

header("Content-type: application/xml; charset=utf-8");

$queryString = $_SERVER["QUERY_STRING"];
$url = 'http://ncpms.rda.go.kr/npmsAPI/service?' . $queryString . '&serviceType=AA001';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'Mozilla/5.0 webweather-proxy/1.0',
]);

$body = curl_exec($ch);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    echo '<?xml version="1.0" encoding="UTF-8"?><error>' . htmlspecialchars($error) . '</error>';
} else {
    echo $body;
}
