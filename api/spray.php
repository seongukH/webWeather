<?php
/**
 * 방제 기록 API
 *
 * POST /api/spray.php          → 방제 기록 저장
 * GET  /api/spray.php           → 전체 목록 조회
 * GET  /api/spray.php?id=N      → 단건 조회
 * DELETE /api/spray.php?id=N    → 삭제
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

try {
    $pdo = getDB();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB 연결 실패: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// ─── POST: 방제 기록 저장 ──────────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'JSON 본문이 필요합니다'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $required = ['fieldBoundary', 'flightPath', 'pesticideType', 'pesticideAmount', 'sprayStart', 'sprayEnd'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || (is_string($input[$field]) && trim($input[$field]) === '')) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => "필수 필드 누락: $field"], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    if (!is_array($input['fieldBoundary']) || count($input['fieldBoundary']) < 3) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'fieldBoundary: 최소 3개 좌표 필요 [[lng,lat],...]'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!is_array($input['flightPath']) || count($input['flightPath']) < 2) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'flightPath: 최소 2개 좌표 필요 [[lng,lat],...]'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare('
        INSERT INTO spray_records (field_boundary, flight_path, pesticide_type, pesticide_amount, spray_start, spray_end, memo)
        VALUES (:boundary, :path, :type, :amount, :start, :end, :memo)
    ');

    $stmt->execute([
        ':boundary' => json_encode($input['fieldBoundary']),
        ':path'     => json_encode($input['flightPath']),
        ':type'     => $input['pesticideType'],
        ':amount'   => floatval($input['pesticideAmount']),
        ':start'    => $input['sprayStart'],
        ':end'      => $input['sprayEnd'],
        ':memo'     => $input['memo'] ?? null,
    ]);

    $id = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => '방제 기록 저장 완료',
        'id'      => (int)$id,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── GET: 조회 ─────────────────────────────────
if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM spray_records WHERE id = :id');
        $stmt->execute([':id' => (int)$_GET['id']]);
        $row = $stmt->fetch();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => '기록을 찾을 수 없습니다'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $row['field_boundary'] = json_decode($row['field_boundary'], true);
        $row['flight_path']    = json_decode($row['flight_path'], true);

        echo json_encode(['success' => true, 'record' => $row], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $limit  = isset($_GET['limit'])  ? min(100, max(1, (int)$_GET['limit'])) : 50;
    $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

    $total = $pdo->query('SELECT COUNT(*) FROM spray_records')->fetchColumn();

    $stmt = $pdo->prepare('SELECT * FROM spray_records ORDER BY spray_start DESC LIMIT :limit OFFSET :offset');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['field_boundary'] = json_decode($row['field_boundary'], true);
        $row['flight_path']    = json_decode($row['flight_path'], true);
    }

    echo json_encode([
        'success' => true,
        'total'   => (int)$total,
        'records' => $rows,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE: 삭제 ──────────────────────────────
if ($method === 'DELETE') {
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id 파라미터 필요'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare('DELETE FROM spray_records WHERE id = :id');
    $stmt->execute([':id' => (int)$_GET['id']]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => '기록을 찾을 수 없습니다'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'message' => '삭제 완료'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => '지원하지 않는 메서드'], JSON_UNESCAPED_UNICODE);
