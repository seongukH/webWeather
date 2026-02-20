<?php
/**
 * DB 연결 설정
 * Synology NAS MariaDB 10 (Unix 도메인 소켓)
 */

define('DB_SOCKET', '/run/mysqld/mysqld10.sock');
define('DB_USER', 'root');
define('DB_PASS', 'Tjddnr01130!');
define('DB_NAME', 'webweather');

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:unix_socket=' . DB_SOCKET . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}
