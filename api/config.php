<?php
/**
 * DB 연결 설정
 * 운영 배포에서는 환경변수로 값을 주입하세요.
 */

if (!function_exists('envOrDefault')) {
    function envOrDefault($key, $default = '')
    {
        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return trim((string)$value);
    }
}

if (!function_exists('envBool')) {
    function envBool($key, $default = false)
    {
        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
    }
}

define('DB_SOCKET', envOrDefault('WEBWEATHER_DB_SOCKET', '/run/mysqld/mysqld10.sock'));
define('DB_HOST', envOrDefault('WEBWEATHER_DB_HOST', '127.0.0.1'));
define('DB_PORT', (int)envOrDefault('WEBWEATHER_DB_PORT', '3306'));
define('DB_USER', envOrDefault('WEBWEATHER_DB_USER', 'webweather_app'));
define('DB_PASS', envOrDefault('WEBWEATHER_DB_PASS', ''));
define('DB_NAME', envOrDefault('WEBWEATHER_DB_NAME', 'webweather'));
define('DB_ALLOW_EMPTY_PASS', envBool('WEBWEATHER_DB_ALLOW_EMPTY_PASS', false));

function getDB() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    if (DB_PASS === '' && !DB_ALLOW_EMPTY_PASS) {
        throw new RuntimeException('WEBWEATHER_DB_PASS 환경변수를 설정하세요.');
    }

    if (DB_SOCKET !== '') {
        $dsn = 'mysql:unix_socket=' . DB_SOCKET . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    } else {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    }

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}
