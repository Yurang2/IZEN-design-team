# Notion 업무 협업툴 MVP (Cloudflare 전환판)

React 프론트 + Cloudflare Workers 백엔드 + Notion API 구조입니다.

Firebase는 제거되었고, 백엔드는 Workers만 사용합니다.

## 현재 상태 (2026-02-25)

- 운영 스택: `Cloudflare Pages + Worker + Notion` (Firebase 제거 완료)
- 업무 뷰:
  - List / Board 지원
  - Board는 `그룹형(할 일/진행/완료)` + `상태형(노션 상태 그대로)` 전환 지원
- 프로젝트 뷰:
  - 프로젝트 목록 + `종속 업무 타임라인` 표시
  - 타임라인 모드: `보고용 / 운영용 / 업무용`
  - 운영용 상단 요약:
    - `지연` (완료/보류/보관 제외)
    - `오늘 마감` (오늘이 마감일인 업무 수, 완료/보류/보관 제외)
    - `일정 충돌` (동일 담당자+동일 마감일 2건 이상)
    - `선행대기` (선행 작업 미완료로 블록된 업무 수, 완료/보류/보관 제외)
    - 요약 카드를 클릭하면 타임라인에서 해당 항목만 펼쳐서 확인 가능 (다시 클릭 시 해제)
  - 보고용/업무용 상단 요약 카드도 동일하게 클릭 필터 동작 지원
  - 업무용 상단 `내 활성 업무`: 현재 선택 담당자 기준 `완료/보류/보관` 제외 업무 수
- 체크리스트:
  - 행사 체크리스트 탭 내부 목적 기반 2모드:
    - `일정공유용`: 행사진행일 기준 `D-day` 역산 일정 공유(즉답용)
    - `할당용`: 체크리스트 항목별 `생성/할당/해당없음` 운영
  - 프로젝트 속성(`행사분류/배송마감일/운영방식/배송방식/행사진행일`)은 노션 Project DB를 단일 입력원장으로 사용하고, 화면에서는 읽기전용으로 표시
  - 할당 소스: 노션 `행사-체크리스트 할당 매트릭스` DB (업서트 키: `projectPageId::checklistItemPageId`)
  - 미할당 항목은 액션의 `생성` 버튼으로 업무를 자동 생성하고 즉시 할당 가능
  - 할당된 업무 텍스트 클릭 시 해당 업무 상세로 바로 이동
  - 분류 기준:
    - 프로젝트 유형: `전시회 | 행사 | 교육 | 내부업무 | 기타 | 제품개발`
    - 행사분류: 노션 운영 기준값을 그대로 사용 (코드에 고정 카테고리 하드코딩 금지)
    - 현재 운영 행사분류(예시):
      - 이젠 자체 행사(국내)
      - 이젠 자체 행사(해외)
      - 전시회 참가(자사/국내)
      - 전시회 참가(자사/해외)
      - 딜러 자체 행사(딜러/지원)
      - 딜러 자체 행사(딜러/미지원)
      - 전시회 참가(딜러/지원)
      - 전시회 참가(딜러/미지원)
- 백업:
  - 수동 Export 버튼 제공
  - `storageMode=cache`면 로그가 비거나 적은 것이 정상
- 프리뷰:
  - `VITE_USE_MOCK_DATA=true` 또는 `?demo=1`로 mock 데이터 모드 실행 가능
- Worker 배포 안정화:
  - `scripts/run-worker.sh`에서 config 경로 기준 깨짐 이슈 수정 완료

## UI 리빌드 목표 (단계 진행)

1. Phase 1: 디자인 토큰/컴포넌트 시스템 고정
- 색/타입/간격/상태색 체계 통일
- 버튼/필터/테이블/카드의 변형 규칙 단순화

2. Phase 2: 업무 화면 재구성
- List/Board 상단 도구바와 필터 경험 개선
- 저장/로딩/에러 피드백 강화

3. Phase 3: 프로젝트 중심 플로우 강화
- 프로젝트 상세에서 종속 업무(리스트/타임라인) 전환
- 체크리스트 할당과 프로젝트 플로우 연계 강화

4. Phase 4: 상호작용 고도화
- 보드 드래그/인라인 편집/키보드 단축키
- 대량 편집/빠른 액션 도입

5. Phase 5: 운영 품질
- 권한/감사로그/복구 시나리오 문서화
- 실사용 지표 기반 UI 튜닝

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
│   ├── mock/
│   │   └── mockApi.ts
│   ├── main.tsx
│   └── index.css
├── public/
│   ├── _headers
│   ├── _redirects
│   └── vite.svg
├── worker/wrangler.toml
├── .env.example
└── scripts/
    ├── publish-web.sh
    └── run-worker.sh
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

### 7) GET `/api/checklist-assignments?projectId=...`

- 설명: 선택 프로젝트 기준 매트릭스 행 조회 + 누락된 적용 항목 자동 생성

- 설명: 체크리스트 할당 상태 조회

### 8) POST `/api/checklist-assignments`

- 설명: `projectPageId + checklistItemPageId` 기준 업서트, `taskPageId` relation 저장/해제
- 요청 필드:
  - `projectPageId` (required)
  - `checklistItemPageId` (required)
  - `taskPageId` (optional, `assignmentStatus=assigned`일 때 required)
  - `assignmentStatus` (optional: `assigned | unassigned | not_applicable`)
- 설명: 체크리스트 항목을 업무에 할당/해제하거나 `해당없음`으로 명시 처리

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
VITE_USE_MOCK_DATA=false
```

- 로컬 Worker를 별도 포트로 띄울 경우 예: `http://127.0.0.1:8787/api`
- Cloudflare Pages에서는 프로젝트 환경변수로 동일 키 설정 가능
- Firebase Studio/Web Preview에서 백엔드 없이 UI 테스트할 때:
  - `VITE_USE_MOCK_DATA=true` 또는 URL에 `?demo=1`
  - `src/mock/mockApi.ts`의 더미 데이터로 동작

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

- 2026-02-25: 프로젝트 타임라인 집계/라벨 정리
  - 지연 집계에서 `보류/보관` 상태 제외 로직을 문자열 포함 기준으로 보강
  - 운영용 상단 카드 구성 변경: `과부하 담당자` -> `선행대기`, 기존 `선행 대기` -> `오늘 마감`
  - `오늘 마감`은 오늘 마감일인 업무를 카운팅하도록 집계 추가
  - 운영용 요약 카드를 클릭하면 해당 항목만 타임라인에 필터링/펼침되도록 인터랙션 추가
  - 보고용/업무용 요약 카드도 동일한 필터 인터랙션을 적용
  - 체크리스트 할당 업무를 클릭하면 해당 업무 상세 화면으로 바로 이동
  - 업무용 `내 활성 업무` 카운트를 `완료/보류/보관` 제외 기준으로 조정
  - 체크리스트 탭에 `생성` 버튼 추가: 항목 기반으로 업무를 만들고 할당까지 자동 처리
  - Worker 노션 조회 시 `archived/in_trash` 페이지를 제외하도록 보강 (삭제/휴지통 항목 노출 방지)
  - 체크리스트 할당 매트릭스 스키마 호환성 보강:
    - `이름/프로젝트/체크리스트 항목/할당 업무` 최소 컬럼 구성에서도 자동 생성/업서트 동작
    - 관계형 컬럼은 이름뿐 아니라 연결 DB ID 우선으로 매칭해 오인식 방지
    - `할당상태/적용여부`는 명시 컬럼이 있을 때만 사용 (예: `행사분류` 오인식 방지)
  - 날짜 표기/UI 정돈:
    - 프로젝트/체크리스트 표시 날짜를 `yyyy-mm-dd` 형식으로 통일
    - 타임라인/테이블 줄바꿈 규칙을 `break-word/keep-all` 중심으로 조정해 가독성 개선
    - 프로젝트 타임라인 요약에 `집계 기준일`과 `마감일 미정 건수`를 추가해 운영 판단 기준을 명확화
  - 프로젝트 타임라인 전 모드(보고/운영/업무)에 `오늘` 기준 마커(라벨/라인/밴드) 추가
  - 프로젝트 타임라인 구조 개선:
    - 프로젝트 요약 트랙 높이를 조정해 `행사진행일`/`오늘` 라벨이 동시에 안정적으로 노출되도록 보강
    - 프로젝트를 `프로젝트 구분`(예: 행사/전시회/교육 등) 섹션으로 그룹화해 탐색성을 개선
  - 타임라인 마커 라벨 정리:
    - `행사진행일` 표기를 `진행일`로 축약
    - `오늘/진행일` 마커 아래 날짜를 `M.D` 형식(예: `2.25`)으로 표시
  - 프로젝트 아이콘 가시성 보강:
    - 프로젝트 이모지 아이콘을 Twemoji SVG로 렌더링해 OS 폰트 의존도를 낮춤
    - 국기 이모지에는 텍스트 fallback(`🇦🇪 AE`)을 함께 제공
- 2026-02-23: Firebase -> Cloudflare Workers 전환
  - Firebase Functions/Hosting 관련 코드 및 설정 제거
  - Worker 백엔드(`worker/src`) 신설
  - Notion 프록시 5개 엔드포인트 구현
  - Cache API 기반 60초 서버 스냅샷 캐시 구현
  - 프론트 API 베이스를 `VITE_API_BASE_URL`로 단순화
  - 목록/상세/생성/상태 변경 + optimistic update 유지
- 2026-02-23: UI/운영 고도화
  - Board 상태 그룹화 + 파스텔 상태 색상 적용
  - Board 워크플로우 모드(`그룹형/상태형`) 전환 추가
  - 프로젝트 탭 `종속 업무 타임라인` 뷰 추가
  - 체크리스트 할당 저장소를 노션 `행사-체크리스트 할당 매트릭스` DB 기반 업서트로 전환 (`projectPageId::checklistItemPageId`)
  - Worker 배포 스크립트(run-worker.sh) 경로 이슈 수정
  - Firebase Studio/Web Preview용 mock 데이터 모드(`src/mock/mockApi.ts`) 추가

- 2026-02-25: Additional current updates
  - Project timeline marker labels (오늘, 진행일) and M.D dates are now rendered outside, directly below the project bar.
  - Task view status visibility improved with a status badge that reflects Notion status/select color.
  - Worker now auto-ensures Project DB properties (행사분류, 배송마감일, 운영방식, 배송방식) and checklist filters auto-fill from the selected project.

- 2026-02-25: Follow-up hotfix
  - Task status select width in task list reduced to about 60% for better compact layout.
  - Added force-sync endpoint POST /api/admin/notion/project-schema/sync to create exact Project DB properties (행사분류, 배송마감일, 운영방식, 배송방식) when missing.
  - Frontend now calls this sync endpoint automatically before loading projects, so property creation is attempted immediately after login.
- 2026-02-25: Checklist workflow refinement
  - Checklist 화면을 `일정공유용 / 할당용` 목적 기반으로 분리.
  - 행사 선택 시 프로젝트 속성(`행사분류/배송마감일/운영방식/배송방식/행사진행일`)을 읽기전용으로 표시하도록 변경.
  - 할당용 액션을 `생성/할당/해당없음` 3버튼으로 통일.
  - Worker `/api/checklist-assignments`가 `assignmentStatus`를 받아 `not_applicable` 저장을 지원.
  - 노션 체크리스트 할당 매트릭스 DB에 `할당상태(select)`, `적용여부(checkbox)` 속성이 없으면 자동 생성 후 사용.
- 2026-02-25: Project timeline UX/category update
  - 프로젝트 탭 보기(보고용/운영용/업무용) 컨트롤을 상단 우측으로 재배치.
  - 타임라인 섹션 분류를 프로젝트 DB `행사속성(행사분류)` 우선 기준으로 변경(없으면 프로젝트 유형 fallback).
  - 분류 섹션 단위 접기/펼치기 토글을 추가.
