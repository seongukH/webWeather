# 방제 이력 API 명세서

드론 방제 소프트웨어 등 외부 시스템에서 방제 이력을 전송하기 위한 REST API입니다.

**Base URL**: `http://{서버주소}:{포트}/api/spray.php`

---

## 1. 방제 기록 저장

**Endpoint**: `POST /api/spray.php`

### 요청 본문 (JSON)

```json
{
  "fieldBoundary": [[126.7105, 34.9380], [126.7135, 34.9380], [126.7135, 34.9355], [126.7105, 34.9355]],
  "flightPath": [[126.7107, 34.9378], [126.7133, 34.9378], [126.7133, 34.9372], [126.7107, 34.9372]],
  "pesticideType": "클로란트라닐리프롤 수화제",
  "pesticideAmount": 12.5,
  "sprayStart": "2026-02-25T09:00:00",
  "sprayEnd": "2026-02-25T09:35:00",
  "memo": "논벼 도열병 예방 방제 - 드론 DJI T40"
}
```

### 필드 설명

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `fieldBoundary` | array | ✅ | 논지 바운더리 좌표 배열. `[[경도, 위도], ...]` 형식. **최소 3개** 좌표 필요 (다각형) |
| `flightPath` | array | ✅ | 드론 비행 경로 좌표 배열. `[[경도, 위도], ...]` 형식. **최소 2개** 좌표 필요 |
| `pesticideType` | string | ✅ | 농약 종류 (예: "클로란트라닐리프롤 수화제") |
| `pesticideAmount` | number | ✅ | 농약 사용량 (리터 단위) |
| `sprayStart` | string | ✅ | 방제 시작 시간. ISO 8601 형식 (`YYYY-MM-DDTHH:MM:SS`) |
| `sprayEnd` | string | ✅ | 방제 완료 시간. ISO 8601 형식 |
| `memo` | string | ❌ | 비고 (드론 모델, 작업자, 기타 메모) |

### 좌표 형식

- **좌표계**: WGS84 (EPSG:4326)
- **순서**: `[경도(longitude), 위도(latitude)]` — GeoJSON 표준 순서
- 예: 서울시청 → `[126.978, 37.566]`

### 응답

```json
{
  "success": true,
  "message": "방제 기록 저장 완료",
  "id": 1
}
```

### 요청 예시

#### cURL

```bash
curl -X POST http://localhost:8080/api/spray.php \
  -H "Content-Type: application/json" \
  -d '{
    "fieldBoundary": [
      [126.7105, 34.9380],
      [126.7135, 34.9380],
      [126.7135, 34.9355],
      [126.7105, 34.9355]
    ],
    "flightPath": [
      [126.7107, 34.9378],
      [126.7133, 34.9378],
      [126.7133, 34.9372],
      [126.7107, 34.9372]
    ],
    "pesticideType": "클로란트라닐리프롤 수화제",
    "pesticideAmount": 12.5,
    "sprayStart": "2026-02-25T09:00:00",
    "sprayEnd": "2026-02-25T09:35:00",
    "memo": "드론 DJI T40"
  }'
```

#### Python

```python
import requests

data = {
    "fieldBoundary": [
        [126.7105, 34.9380],
        [126.7135, 34.9380],
        [126.7135, 34.9355],
        [126.7105, 34.9355]
    ],
    "flightPath": [
        [126.7107, 34.9378],
        [126.7133, 34.9378],
        [126.7133, 34.9372],
        [126.7107, 34.9372]
    ],
    "pesticideType": "이미다클로프리드 입상수화제",
    "pesticideAmount": 8.0,
    "sprayStart": "2026-02-24T14:00:00",
    "sprayEnd": "2026-02-24T14:22:00",
    "memo": "벼멸구 방제 - XAG P100"
}

response = requests.post("http://localhost:8080/api/spray.php", json=data)
print(response.json())
```

#### JavaScript (Node.js)

```javascript
const response = await fetch("http://localhost:8080/api/spray.php", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fieldBoundary: [[126.71, 34.94], [126.71, 34.93], [126.72, 34.93], [126.72, 34.94]],
    flightPath: [[126.711, 34.939], [126.719, 34.939], [126.719, 34.935]],
    pesticideType: "클로란트라닐리프롤 수화제",
    pesticideAmount: 12.5,
    sprayStart: "2026-02-25T09:00:00",
    sprayEnd: "2026-02-25T09:35:00",
    memo: "드론 DJI T40"
  })
});
const result = await response.json();
console.log(result);
```

---

## 2. 방제 기록 목록 조회

**Endpoint**: `GET /api/spray.php`

### 쿼리 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `limit` | int | 50 | 조회 건수 (최대 100) |
| `offset` | int | 0 | 시작 위치 (페이징) |

### 응답

```json
{
  "success": true,
  "total": 2,
  "records": [
    {
      "id": 2,
      "field_boundary": [[127.054, 36.187], [127.058, 36.187], [127.058, 36.184], [127.054, 36.184]],
      "flight_path": [[127.0542, 36.1868], [127.0578, 36.1868], [127.0578, 36.1858]],
      "pesticide_type": "이미다클로프리드 입상수화제",
      "pesticide_amount": "8.00",
      "spray_start": "2026-02-24 14:00:00",
      "spray_end": "2026-02-24 14:22:00",
      "memo": "벼멸구 방제 - 드론 XAG P100",
      "created_at": "2026-02-25 10:00:00",
      "updated_at": "2026-02-25 10:00:00"
    }
  ]
}
```

### 요청 예시

```bash
# 전체 조회
curl http://localhost:8080/api/spray.php

# 페이징 (10건씩, 2페이지)
curl "http://localhost:8080/api/spray.php?limit=10&offset=10"
```

---

## 3. 단건 조회

**Endpoint**: `GET /api/spray.php?id={id}`

### 응답

```json
{
  "success": true,
  "record": {
    "id": 1,
    "field_boundary": [[126.7105, 34.938], ...],
    "flight_path": [[126.7107, 34.9378], ...],
    "pesticide_type": "클로란트라닐리프롤 수화제",
    "pesticide_amount": "12.50",
    "spray_start": "2026-02-25 09:00:00",
    "spray_end": "2026-02-25 09:35:00",
    "memo": "논벼 도열병 예방 방제 - 드론 DJI T40",
    "created_at": "2026-02-25 09:45:00",
    "updated_at": "2026-02-25 09:45:00"
  }
}
```

---

## 4. 방제 기록 삭제

**Endpoint**: `DELETE /api/spray.php?id={id}`

### 응답

```json
{
  "success": true,
  "message": "삭제 완료"
}
```

---

## 에러 응답

모든 에러는 다음 형식으로 반환됩니다:

```json
{
  "success": false,
  "error": "에러 메시지"
}
```

### HTTP 상태 코드

| 코드 | 의미 | 설명 |
|------|------|------|
| `200` | OK | 요청 성공 |
| `400` | Bad Request | 필수 필드 누락, 잘못된 형식 |
| `404` | Not Found | 해당 ID의 기록 없음 |
| `405` | Method Not Allowed | 지원하지 않는 HTTP 메서드 |
| `500` | Internal Server Error | DB 연결 실패 등 |

---

## DJI / XAG 드론 연동 가이드

### DJI Agras (T40, T25 등)

DJI 드론의 비행 로그에서 자동으로 방제 이력을 전송하려면:

1. DJI FlightHub 또는 DJI Terra에서 비행 로그 내보내기
2. 로그 파일(CSV/KML)에서 좌표, 시간, 약제 정보 추출
3. 위 API 형식에 맞게 변환 후 POST 전송

### XAG (P100 등)

XAG 드론 로그에서:

1. XAG APC에서 비행 기록 다운로드
2. 논지 바운더리와 비행 경로 좌표 추출
3. API로 자동 전송

### 좌표 변환 참고

- DJI 로그: 위도/경도 순서 → API는 **경도/위도 순서** (GeoJSON 표준)
- EPSG:4326 (WGS84) 좌표계 사용
- 예: DJI `lat=34.938, lng=126.710` → API `[126.710, 34.938]`

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-26
