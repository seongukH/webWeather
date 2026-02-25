# Ollama Web API 명세서

## 📌 개요

Ollama 기반 AI 챗봇을 위한 REST API입니다. 외부에서 HTTP 요청을 통해 AI와 대화할 수 있습니다.

**Base URL**: `http://172.17.3.220:5000`

---

## 🔧 엔드포인트

### 1. Health Check

서버 및 Ollama 연결 상태를 확인합니다.

**Endpoint**: `GET /api/health`

#### 요청 예시
```bash
curl http://172.17.3.220:5000/api/health
```

#### 응답 예시
```json
{
  "status": "ok",
  "ollama_status": "connected",
  "api_version": "1.0.0"
}
```

#### 응답 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `status` | string | API 서버 상태 (`ok` or `error`) |
| `ollama_status` | string | Ollama 연결 상태 (`connected` or `disconnected`) |
| `api_version` | string | API 버전 |

---

### 2. 모델 목록 조회

설치된 AI 모델 목록을 가져옵니다.

**Endpoint**: `GET /api/models`

#### 요청 예시
```bash
curl http://172.17.3.220:5000/api/models
```

#### 응답 예시
```json
{
  "success": true,
  "models": [
    "llama3.1:70b",
    "llama3.1:8b",
    "qwen2.5:72b"
  ],
  "count": 3
}
```

#### 응답 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `models` | array | 설치된 모델 이름 목록 |
| `count` | integer | 모델 개수 |

---

### 3. 채팅 메시지 전송 (일반)

AI에게 질문을 보내고 응답을 받습니다.

**Endpoint**: `POST /api/chat`

#### 요청 본문
```json
{
  "message": "안녕하세요! RTX 5090에 대해 알려주세요.",
  "model": "llama3.1:70b",
  "stream": false
}
```

#### 요청 필드
| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `message` | string | ✅ | - | 사용자 질문 |
| `model` | string | ❌ | `llama3.1:70b` | 사용할 AI 모델 |
| `stream` | boolean | ❌ | `false` | 스트리밍 여부 |

#### 요청 예시
```bash
curl -X POST http://172.17.3.220:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is artificial intelligence?",
    "model": "llama3.1:70b"
  }'
```

#### 응답 예시
```json
{
  "success": true,
  "response": "Artificial intelligence (AI) refers to the simulation of human intelligence in machines...",
  "model": "llama3.1:70b",
  "done": true,
  "context": [123, 456, 789, ...]
}
```

#### 응답 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `response` | string | AI의 응답 텍스트 |
| `model` | string | 사용된 모델 이름 |
| `done` | boolean | 응답 완료 여부 |
| `context` | array | 대화 컨텍스트 (토큰 ID) |

---

### 4. 채팅 메시지 전송 (스트리밍)

AI 응답을 실시간 스트리밍으로 받습니다.

**Endpoint**: `POST /api/chat/stream`

#### 요청 본문
```json
{
  "message": "Python으로 피보나치 수열을 구현하는 코드를 작성해주세요.",
  "model": "llama3.1:70b"
}
```

#### 요청 예시
```bash
curl -X POST http://172.17.3.220:5000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me a story",
    "model": "llama3.1:70b"
  }'
```

#### 응답 형식
스트리밍 응답 (NDJSON - Newline Delimited JSON)

```json
{"response":"Once","done":false}
{"response":" upon","done":false}
{"response":" a","done":false}
{"response":" time","done":false}
...
{"response":"","done":true,"context":[123,456,...]}
```

---

## ⚠️ 에러 응답

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
| `400` | Bad Request | 잘못된 요청 (필수 필드 누락 등) |
| `404` | Not Found | 존재하지 않는 엔드포인트 |
| `500` | Internal Server Error | 서버 내부 오류 |
| `504` | Gateway Timeout | 요청 시간 초과 (5분) |

---

## 📝 사용 예시

### Python
```python
import requests

# 채팅 메시지 전송
response = requests.post(
    "http://172.17.3.220:5000/api/chat",
    json={
        "message": "안녕하세요!",
        "model": "llama3.1:70b"
    }
)

data = response.json()
if data["success"]:
    print(data["response"])
else:
    print(f"Error: {data['error']}")
```

### JavaScript (Node.js)
```javascript
const axios = require('axios');

async function chat(message) {
  try {
    const response = await axios.post('http://172.17.3.220:5000/api/chat', {
      message: message,
      model: 'llama3.1:70b'
    });

    if (response.data.success) {
      console.log(response.data.response);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

chat('Hello, AI!');
```

### cURL
```bash
# 간단한 질문
curl -X POST http://172.17.3.220:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is 2+2?"}'

# 모델 지정
curl -X POST http://172.17.3.220:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Explain quantum computing",
    "model": "qwen2.5:72b"
  }'
```

### PowerShell
```powershell
$body = @{
    message = "안녕하세요!"
    model = "llama3.1:70b"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "http://172.17.3.220:5000/api/chat" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"

Write-Host $response.response
```

---

## 🚀 서버 실행

### 설치 (최초 1회)
```bash
pip install flask flask-cors requests
```

### 실행
```bash
cd /home/ubuntu/workspace/seongwook_ha/ollama-web
python3 api_server.py
```

또는

```bash
./start.sh
```

### 포트 설정
- API 서버: `5000`
- 웹 인터페이스: `8080`
- Ollama: `11434`

---

## 🔒 보안 고려사항

1. **인증 없음**: 현재 버전은 인증이 없습니다. 프로덕션 환경에서는 API 키 또는 JWT 인증을 추가하세요.
2. **Rate Limiting**: 과도한 요청을 방지하기 위해 Rate Limiting을 구현하는 것을 권장합니다.
3. **HTTPS**: 프로덕션에서는 HTTPS를 사용하세요.
4. **방화벽**: 필요한 IP만 접근할 수 있도록 방화벽 규칙을 설정하세요.

---

## 📊 응답 시간

모델 크기에 따라 응답 시간이 다릅니다:

| 모델 | 평균 응답 시간 | 권장 용도 |
|------|---------------|----------|
| `llama3.1:8b` | 1-3초 | 빠른 응답 필요 시 |
| `llama3.1:70b` | 5-15초 | 일반적인 대화 |
| `qwen2.5:72b` | 5-15초 | 한국어 특화 |
| `llama3.1:405b` | 30-60초 | 최고 품질 필요 시 |

*RTX 5090 기준

---

## 🆘 문제 해결

### 1. "Ollama connection error"
```bash
# Ollama 서비스 확인
systemctl status ollama

# Ollama 재시작
sudo systemctl restart ollama
```

### 2. "Connection refused"
```bash
# 포트 사용 확인
netstat -tlnp | grep 5000

# 방화벽 확인
sudo ufw status
sudo ufw allow 5000/tcp
```

### 3. "Request timeout"
- 대형 모델(405B)은 응답 시간이 깁니다.
- 더 작은 모델을 사용하거나 타임아웃 시간을 늘리세요.

---

## 📞 지원

문제가 발생하면 로그를 확인하세요:
```bash
tail -f /tmp/ollama.log
```

---

**Version**: 1.0.0
**Last Updated**: 2026-02-23
**Author**: Ollama Web API Team
