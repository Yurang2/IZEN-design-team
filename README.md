# Notion 업무 협업툴 MVP (Cloudflare 전환판)

React 프론트 + Cloudflare Workers 백엔드 + Notion API 구조입니다.

Firebase는 제거되었고, 백엔드는 Workers만 사용합니다.

## 아키텍처

```text
Browser (React/Vite)
  -> GET/PATCH/POST /api/*
Cloudflare Worker
  -> 60초 스냅샷 캐시(Cache API, 서버 공용 키)
  -> 체크리스트 할당 영구저장/감사로그(D1, 선택)
  -> Notion API (Task DB, Project DB)
Notion Databases (원장)
```

- 프론트는 60초 폴링 유지
- Workers는 읽기 요청을 스냅샷 캐시로 응답
- 토큰은 Worker 환경변수로만 보관 (프론트 노출 금지)

## 폴더 구조

```text
.
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── notionApi.ts
│   │   ├── notionWork.ts
│   │   └── types.ts
│   └── .dev.vars.example
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── main.tsx
│   └── index.css
├── public/
│   ├── _headers
│   ├── _redirects
│   └── vite.svg
├── worker/wrangler.toml
├── .env.example
└── scripts/publish-web.sh
```

## API 엔드포인트

### 1) GET `/api/tasks?projectId=...&status=...&q=...&cursor=...&pageSize=...`

- 설명: 업무 목록 조회 (필터 + 페이지네이션)

요청 예시:
```http
GET /api/tasks?projectId=abc123&status=진행중&q=배너&pageSize=50
```

응답 예시:
```json
{
  "ok": true,
  "tasks": [
    {
      "id": "page_id",
      "url": "https://www.notion.so/...",
      "projectKey": "project_page_id",
      "projectName": "10주년 방콕 행사",
      "projectSource": "relation",
      "requester": ["홍길동"],
      "workType": "디자인",
      "taskName": "포스터 제작",
      "status": "진행중",
      "assignee": ["김디자이너"],
      "startDate": "2026-02-20",
      "dueDate": "2026-03-05",
      "detail": "상세 내용"
    }
  ],
  "nextCursor": "50",
  "hasMore": true,
  "schema": { "fields": {}, "unknownFields": [], "projectBindingMode": "relation" },
  "cacheTtlMs": 60000
}
```

### 2) GET `/api/tasks/:id`

- 설명: 단일 업무 상세 조회

요청 예시:
```http
GET /api/tasks/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

응답 예시:
```json
{
  "ok": true,
  "task": { "id": "...", "taskName": "포스터 제작", "status": "진행중" },
  "schema": { "fields": {}, "unknownFields": [], "projectBindingMode": "relation" },
  "cacheTtlMs": 60000
}
```

### 3) POST `/api/tasks`

- 설명: 업무 생성 (귀속 프로젝트 relation 포함)

요청 예시:
```json
{
  "projectId": "project_page_id",
  "taskName": "신규 업무",
  "status": "진행 전",
  "assignee": ["담당자명"],
  "dueDate": "2026-03-10",
  "detail": "업무상세"
}
```

응답 예시:
```json
{
  "ok": true,
  "task": { "id": "...", "taskName": "신규 업무" },
  "schema": { "fields": {}, "unknownFields": [], "projectBindingMode": "relation" }
}
```

### 4) PATCH `/api/tasks/:id`

- 설명: 상태/담당자/마감일/상세 수정

요청 예시:
```json
{
  "status": "진행중",
  "assignee": ["담당자명"],
  "dueDate": "2026-03-20",
  "detail": "수정 상세"
}
```

응답 예시:
```json
{
  "ok": true,
  "task": { "id": "...", "status": "진행중" },
  "schema": { "fields": {}, "unknownFields": [], "projectBindingMode": "relation" }
}
```

### 5) GET `/api/projects`

- 설명: 프로젝트 목록 조회 (드롭다운용)

요청 예시:
```http
GET /api/projects
```

응답 예시:
```json
{
  "ok": true,
  "projects": [
    {
      "id": "project_page_id",
      "key": "project_page_id",
      "bindingValue": "project_page_id",
      "name": "10주년 방콕 행사",
      "eventDate": "2026-03-01",
      "source": "project_db"
    }
  ],
  "schema": { "fields": {}, "unknownFields": [], "projectBindingMode": "relation" },
  "cacheTtlMs": 60000
}
```

### 6) GET `/api/checklists?eventName=...&eventCategory=...&operationMode=...&fulfillmentMode=...`

- 설명: 행사 체크리스트 조회 + 영업일 역산(주말/한국 공휴일 제외)
- `operationMode`: `self | dealer`
- `fulfillmentMode`: `domestic | overseas | dealer`

### 7) GET `/api/checklist-assignments`

- 설명: 체크리스트 할당 상태 조회

### 8) POST `/api/checklist-assignments`

- 설명: 체크리스트 항목을 업무(Task ID)에 할당/해제

### 9) GET `/api/checklist-assignment-logs?limit=100`

- 설명: 체크리스트 할당 변경 로그 조회 (D1 연결 시)

## 캐시/폴링 설계

- Workers Cache API 사용
- TTL 60초 (`API_CACHE_TTL_SECONDS`, 기본 60)
- 읽기 요청(`GET /api/tasks`, `/api/tasks/:id`, `/api/projects`)은 서버 공용 스냅샷 캐시 사용
- 사용자 수와 관계없이 캐시가 유효한 동안 Notion 재조회 없음
- 프론트는 60초 폴링, 변경 시 optimistic update로 즉시 UI 반영

## 환경변수

### Front (`.env`)

`.env.example`:
```bash
VITE_API_BASE_URL=/api
```

- 로컬 Worker를 별도 포트로 띄울 경우 예: `http://127.0.0.1:8787/api`
- Cloudflare Pages에서는 프로젝트 환경변수로 동일 키 설정 가능

### Worker (시크릿/변수)

로컬: `worker/.dev.vars` 생성 (`worker/.dev.vars.example` 참고)

배포 시:
```bash
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_TASK_DB_ID
npx wrangler secret put NOTION_PROJECT_DB_ID
```

옵션(평문 vars):
```bash
# worker/wrangler.toml [vars] 또는 Cloudflare dashboard vars
API_CACHE_TTL_SECONDS=60
```

D1(권장, 체크리스트 할당 영구저장/로그):
```bash
# 1) D1 생성 (최초 1회)
npx wrangler d1 create izen-design-checklist

# 2) Worker 배포 환경 변수에 D1 id/name 등록
# - CHECKLIST_DB_ID=<Cloudflare D1 database id>
# - CHECKLIST_DB_NAME=izen-design-checklist

# 3) 배포
npm run deploy:worker
```

- `npm run deploy:worker`는 `scripts/run-worker.sh`를 통해 `CHECKLIST_DB_ID`가 있을 때만 D1 바인딩을 붙입니다.
- D1을 연결하면 `checklist_assignments`, `checklist_assignment_logs` 테이블은 Worker가 자동 생성/마이그레이션됩니다.
- D1 미연결 시 체크리스트 할당은 Cache API(임시 저장)로 동작합니다.

## 로컬 실행

1. 프론트 의존성 설치
```bash
npm install
```

2. Worker 로컬 실행 (터미널 A)
```bash
npm run dev:worker
```

3. 프론트 로컬 실행 (터미널 B)
```bash
cp .env.example .env
npm run dev
```

4. 브라우저 확인
- 프론트: `http://localhost:5173`
- Worker: `http://127.0.0.1:8787`

## 배포 (Cloudflare)

### A. Worker 배포

```bash
npm run deploy:worker
```

배포 후 Workers URL 예:
- `https://izen-design-api.<subdomain>.workers.dev`

### B. Pages 배포

- Build command: `npm run build`
- Build output: `dist`
- Environment Variable:
  - `VITE_API_BASE_URL=https://izen-design-api.<subdomain>.workers.dev/api`

또는 같은 도메인 라우트를 구성했다면:
- `VITE_API_BASE_URL=/api`

## 트러블슈팅

### `Unexpected token '<', \"<!doctype ...\" is not valid JSON`

- 원인: 프론트가 Worker API 대신 HTML 페이지(`index.html`)를 받았을 때 발생합니다.
- 해결:
  1. Pages 환경변수 `VITE_API_BASE_URL`을 Worker URL로 설정
     - 예: `https://izen-design-api.<subdomain>.workers.dev/api`
  2. Pages 재배포
  3. 브라우저 강력 새로고침
- 확인:
  - 브라우저에서 `https://...workers.dev/api/projects` 호출 시 JSON이 보여야 정상
  - HTML이 보이면 API 주소가 잘못된 상태
- 임시 우회(재배포 전 즉시 테스트):
  - 앱 URL 뒤에 `?apiBase=https://<worker>.<subdomain>.workers.dev/api`를 붙여 접속
  - 예: `https://<pages-url>/?apiBase=https://izen-design-api.xxx.workers.dev/api`

### `No deployment available` + `Failed to publish your Function`

- 원인(로그 기준): Pages가 루트 `wrangler.toml`을 읽다가 충돌해 Functions publish 단계에서 실패할 수 있음
- 조치(이미 코드 반영):
  - Worker 설정 파일을 `worker/wrangler.toml`로 이동
  - `_redirects`를 `/task/* /index.html 200`로 변경(무한루프 경고 제거)
- 대시보드에서 해야 할 것:
  1. Pages 프로젝트 `Build command`를 `npm run build`로 지정
  2. `Build output directory`를 `dist`로 지정
  3. `Clear build cache` 후 재배포

## 로그인/권한

- MVP에서는 구현하지 않음
- 설계상 포인트만 유지:
  - Worker 레이어에서 API key/JWT 검증 추가 가능
  - 라우트별 role check 추가 가능

## 이관 작업 로그

- 2026-02-23: Firebase -> Cloudflare Workers 전환
  - Firebase Functions/Hosting 관련 코드 및 설정 제거
  - Worker 백엔드(`worker/src`) 신설
  - Notion 프록시 5개 엔드포인트 구현
  - Cache API 기반 60초 서버 스냅샷 캐시 구현
  - 프론트 API 베이스를 `VITE_API_BASE_URL`로 단순화
  - 목록/상세/생성/상태 변경 + optimistic update 유지
