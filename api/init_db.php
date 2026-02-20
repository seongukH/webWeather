<?php
/**
 * DB 초기화 스크립트
 * 브라우저에서 한 번만 실행: /api/init_db.php
 */

header('Content-Type: application/json; charset=utf-8');

try {
    $dsn = 'mysql:unix_socket=/run/mysqld/mysqld10.sock;charset=utf8mb4';
    $pdo = new PDO($dsn, 'root', 'Tjddnr01130!', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    // 데이터베이스 생성
    $pdo->exec('CREATE DATABASE IF NOT EXISTS webweather CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE webweather');

    // 설정 테이블
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ');

    echo json_encode([
        'success' => true,
        'message' => 'DB 초기화 완료: webweather.settings 테이블 생성됨'
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
