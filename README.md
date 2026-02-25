# webWeather

농작물 병해충 예측지도 (정적 프런트엔드 + PHP API 프록시)

## 운영 배포 필수 설정

### 1) DB 환경변수

아래 값을 Web Station/Nginx(PHP-FPM) 실행 환경에 주입하세요.

- `WEBWEATHER_DB_SOCKET` (기본: `/run/mysqld/mysqld10.sock`)
- `WEBWEATHER_DB_HOST` (기본: `127.0.0.1`)
- `WEBWEATHER_DB_PORT` (기본: `3306`)
- `WEBWEATHER_DB_USER` (권장: 전용 계정, 예 `webweather_app`)
- `WEBWEATHER_DB_PASS` (**필수**)
- `WEBWEATHER_DB_NAME` (기본: `webweather`)
- `WEBWEATHER_DB_ALLOW_EMPTY_PASS` (기본: `false`)

> 운영에서는 `root` 계정 사용을 피하고 최소 권한 계정을 사용하세요.

### 2) 설정 저장(POST) 관리자 토큰

- `WEBWEATHER_ADMIN_TOKEN` (**필수 권장**)

`/api/settings.php`의 `POST` 저장 요청은 `X-Admin-Token`(또는 Bearer) 검증을 통과해야 합니다.
프런트 설정 모달의 "관리자 토큰" 입력칸에 동일한 값을 넣어 저장할 수 있습니다.

### 3) 초기화 스크립트 잠금

`/api/init_db.php`는 기본 비활성화 상태입니다.

- `WEBWEATHER_ENABLE_INIT_DB=1` 일 때만 실행 가능
- `WEBWEATHER_INIT_TOKEN` 또는 `WEBWEATHER_ADMIN_TOKEN` 필요

초기화 요청 시 헤더(`X-Init-Token`) 또는 쿼리(`?token=...`)로 토큰 전달 후 사용하세요.

### 4) 선택 환경변수 (초기 기본 키 주입)

원하면 초기화 시점에만 기본 키를 넣을 수 있습니다.

- `WEBWEATHER_DEFAULT_VWORLD_KEY`
- `WEBWEATHER_DEFAULT_NCPMS_KEY`
- `WEBWEATHER_DEFAULT_AGRO_KEY`

## 보안 변경 사항 요약

- 저장소 내 하드코딩된 API Key/DB 비밀번호 제거
- NCPMS/VWorld/Agromonitoring 경로 HTTPS 우선 적용
- 외부 프록시 의존 최소화 (Same-Origin PHP 프록시 사용)
- 프록시 파라미터 검증 및 SSL 검증 강제
- 설정 API 저장 권한 분리(관리자 토큰)
- 초기화 API 기본 차단
