<?php
/**
 * DB 초기화 스크립트 (MariaDB)
 * 브라우저에서 한 번만 실행: /api/init_db.php
 */

header('Content-Type: application/json; charset=utf-8');

try {
    $dsn = 'mysql:unix_socket=/run/mysqld/mysqld10.sock;charset=utf8mb4';
    $pdo = new PDO($dsn, 'root', 'YOUR_DB_PASSWORD', [
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

    // 기본 API 키 삽입
    $defaults = [
        'vworldKey' => 'YOUR_VWORLD_API_KEY',
        'ncpmsKey'  => 'YOUR_NCPMS_API_KEY',
    ];

    $stmt = $pdo->prepare('
        INSERT INTO settings (setting_key, setting_value)
        VALUES (:key, :value)
        ON DUPLICATE KEY UPDATE setting_value = :value2, updated_at = CURRENT_TIMESTAMP
    ');

    foreach ($defaults as $key => $value) {
        $stmt->execute([':key' => $key, ':value' => $value, ':value2' => $value]);
    }

    echo json_encode([
        'success' => true,
        'message' => 'DB 초기화 완료: settings 테이블 생성 + API 키 저장됨'
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
