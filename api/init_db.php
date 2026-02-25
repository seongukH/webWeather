<?php
/**
 * DB 초기화 스크립트 (MariaDB)
 * 운영 보안:
 *  - 기본 비활성화 (WEBWEATHER_ENABLE_INIT_DB=1 일 때만 실행)
 *  - 토큰 필수 (WEBWEATHER_INIT_TOKEN 또는 WEBWEATHER_ADMIN_TOKEN)
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/config.php';

function initSendJson($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function initReadHeader($name) {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return isset($_SERVER[$key]) ? trim((string)$_SERVER[$key]) : '';
}

function initExtractToken() {
    $token = initReadHeader('X-Init-Token');
    if ($token !== '') return $token;

    $token = initReadHeader('X-Admin-Token');
    if ($token !== '') return $token;

    $auth = initReadHeader('Authorization');
    if ($auth !== '' && preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }

    $queryToken = isset($_GET['token']) ? trim((string)$_GET['token']) : '';
    if ($queryToken !== '') return $queryToken;
    return '';
}

if (!envBool('WEBWEATHER_ENABLE_INIT_DB', false)) {
    initSendJson([
        'success' => false,
        'error' => '초기화 스크립트가 비활성화되어 있습니다. WEBWEATHER_ENABLE_INIT_DB=1 설정 후 사용하세요.'
    ], 403);
}

$expectedToken = envOrDefault('WEBWEATHER_INIT_TOKEN', envOrDefault('WEBWEATHER_ADMIN_TOKEN', ''));
if ($expectedToken === '') {
    initSendJson([
        'success' => false,
        'error' => 'WEBWEATHER_INIT_TOKEN 또는 WEBWEATHER_ADMIN_TOKEN을 설정하세요.'
    ], 503);
}

$providedToken = initExtractToken();
if ($providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
    initSendJson(['success' => false, 'error' => '초기화 토큰이 유효하지 않습니다.'], 401);
}

try {
    $initSocket = envOrDefault('WEBWEATHER_INIT_DB_SOCKET', DB_SOCKET);
    $initHost = envOrDefault('WEBWEATHER_INIT_DB_HOST', DB_HOST);
    $initPort = (int)envOrDefault('WEBWEATHER_INIT_DB_PORT', (string)DB_PORT);
    $initUser = envOrDefault('WEBWEATHER_INIT_DB_USER', DB_USER);
    $initPass = envOrDefault('WEBWEATHER_INIT_DB_PASS', DB_PASS);

    if ($initPass === '' && !envBool('WEBWEATHER_DB_ALLOW_EMPTY_PASS', false)) {
        throw new RuntimeException('WEBWEATHER_INIT_DB_PASS 또는 WEBWEATHER_DB_PASS를 설정하세요.');
    }

    if ($initSocket !== '') {
        $dsn = 'mysql:unix_socket=' . $initSocket . ';charset=utf8mb4';
    } else {
        $dsn = 'mysql:host=' . $initHost . ';port=' . $initPort . ';charset=utf8mb4';
    }

    $pdo = new PDO($dsn, $initUser, $initPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $dbNameEscaped = str_replace('`', '``', DB_NAME);
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbNameEscaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `{$dbNameEscaped}`");

    // 설정 테이블 생성
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ');

    // 기본 키가 환경변수로 들어온 경우에만 주입
    $defaults = [
        'vworldKey' => envOrDefault('WEBWEATHER_DEFAULT_VWORLD_KEY', ''),
        'ncpmsKey' => envOrDefault('WEBWEATHER_DEFAULT_NCPMS_KEY', ''),
        'agroKey' => envOrDefault('WEBWEATHER_DEFAULT_AGRO_KEY', ''),
    ];

    $stmt = $pdo->prepare('
        INSERT INTO settings (setting_key, setting_value)
        VALUES (:key, :value)
        ON DUPLICATE KEY UPDATE setting_value = :value2, updated_at = CURRENT_TIMESTAMP
    ');

    $savedDefaults = [];
    foreach ($defaults as $key => $value) {
        if ($value === '') continue;
        $stmt->execute([':key' => $key, ':value' => $value, ':value2' => $value]);
        $savedDefaults[] = $key;
    }

    initSendJson([
        'success' => true,
        'message' => 'DB 초기화 완료: settings 테이블 생성',
        'defaultsSaved' => $savedDefaults
    ]);
} catch (RuntimeException $e) {
    initSendJson([
        'success' => false,
        'error' => $e->getMessage()
    ], 500);
} catch (PDOException $e) {
    initSendJson([
        'success' => false,
        'error' => $e->getMessage()
    ], 500);
}
