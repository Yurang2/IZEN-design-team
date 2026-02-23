# Notion 디자인 업무 자동화

현재는 두 경로를 함께 사용합니다.

- 경로 A(기존): Notion 프로젝트 DB 신규 row -> proposal 생성
- 경로 B(신규): CSV `이전 버전` + `현재 버전` 업로드 -> 변경점(diff) 기반 proposal 생성/갱신

승인된 항목만 Notion `디자인팀 업무 DB`에 실제 Task로 생성합니다.

## 요구사항 정정 메모 (2026-02-19)

- 현재 구현:
  - Notion 프로젝트 DB 신규 row 감지 기반 proposal 생성(기존)
  - CSV 이전/현재 버전 비교 기반 proposal 생성/마감일 업데이트(신규)
- 목표 요구: CSV diff 기반 흐름을 중심으로 고도화하고, 팀장 승인 후 반영

## 현재 AI 판정 방식 (중요)

- 현재 단계는 외부 LLM API(OpenAI/Gemini)를 호출하지 않습니다.
- CSV를 바로 정제 테이블로 읽고 비교합니다.
  - 권장 컬럼: `month`, `date`, `startdate`, `enddate`, `country`, `city`, `name`, `purpose`
  - 필수: `name` + (`startdate/enddate` 또는 `date`)
  - 하루 행사도 `startdate=enddate`로 저장합니다.
  - `date` 컬럼이 있으면 교차월 표기(`27 - April 1`, `August 30 - 4`)를 해석해 `startdate/enddate`를 보완합니다.
  - `name`이 `TBD` 계열이면 `City_Event` 패턴으로 프로젝트명을 강제 보정합니다.
  - 파일명 앞부분이 `[izenimplant]...` 형태면 `izenimplant_...`로 자동 정리해 저장합니다.
- 이벤트 비교는 기본 키(`행사명+도시+국가`) + 행사명 동일성(연도/표기 차이 허용) 보조 매칭으로 수행합니다.
  - 도시/국가 표기가 Rev 간에 달라도 같은 행사명으로 인식되면 `삭제` 대신 `변경`으로 분류됩니다.
- `startdate/enddate`가 `TBD`여도 이벤트 행 자체는 유지합니다.
  - 날짜가 없어도 행사 존재 비교(추가/삭제/변경)는 가능하게 처리합니다.
- 정제 0건이면 CSV 컬럼 이름과 날짜 포맷(`YYYY-MM-DD`)을 먼저 확인하세요.
- 원인 추적은 Firestore의 `csv_uploads.normalizedRows`, `csv_uploads.extractedTextPreview`, `proposals.sourceUploadId`를 확인하면 됩니다.

자세한 구조/스키마는 `docs/NOTION_AUTOMATION.md`를 참고하세요.

## 1) 프론트 실행

```bash
cp .env.example .env
npm install
npm run dev
```

`VITE_FUNCTIONS_BASE_URL`는 반드시 Functions 서버 URL이어야 합니다.
예시:
- 로컬 에뮬레이터: `http://127.0.0.1:5001/<firebase-project-id>/asia-northeast3`
- 배포 환경: `https://<region>-<project-id>.cloudfunctions.net`

Cloudflare Pages를 사용하면 프로젝트 설정의 Environment Variables에
`VITE_FUNCTIONS_BASE_URL`를 추가한 뒤 재배포해야 합니다.

또는 배포된 웹 화면 상단의 `Functions API Base URL` 입력칸에
`https://<region>-<project-id>.cloudfunctions.net`를 입력하고
`저장 후 다시연결`을 눌러 런타임에 설정할 수 있습니다.

## 2) Functions 실행

```bash
cd functions
cp .env.example .env
npm install
npm run build
firebase emulators:start --only firestore,functions
```

## 주요 엔드포인트

- `GET /listPendingProposals`
- `GET /listChecklistCategories`
- `GET /diagnoseNotionAccess`
- `POST /uploadProjectCsv` (기본)
- `GET /getUploadNormalizedRows` (기본)
- `POST /uploadProjectPdf` (레거시 별칭)
- `GET /getPdfUploadNormalizedRows` (레거시 별칭)
- `POST /compareRevisionsAndGenerateProposals` (권장)
- `POST /generateProposalsFromUpload` (레거시 단일 업로드 경로)
- `POST /updateProposal`
- `POST /updateProjectCategory`
- `POST /deleteProposal`
- `POST /approveProposals`

## 스케줄러

- `syncNewProjects` : 10분마다 실행

## 트러블슈팅

### 1) 노션 DB 링크를 알고 있는데 접근이 안 되는 경우

이 프로젝트는 스크래핑이 아니라 **Notion API**를 사용합니다.  
따라서 사용자 계정 권한과 별개로, `NOTION_TOKEN`에 연결된 Integration이 각 DB에 초대되어 있어야 합니다.

- DB 우측 상단 `Share` -> `Invite`에서 Integration 추가
- `NOTION_PROJECT_DB_ID`, `NOTION_CHECKLIST_DB_ID`, `NOTION_TASK_DB_ID` 값 재확인
- 프론트의 `노션 권한 점검` 버튼으로 3개 DB 접근 상태 확인

### 2) Firebase URL(Functions API Base URL)은 꼭 필요한가?

필수입니다. 프론트는 직접 Notion을 호출하지 않고, Firebase Functions API를 통해서만 데이터 조회/승인을 수행합니다.  
즉 이 URL은 프론트가 백엔드와 통신하기 위한 기본 주소입니다.

## 작업 원칙 (협업)

- 앞으로 코드/설정 변경 시, 변경 이유와 현재 상태를 `README.md`에 함께 기록합니다.
- 청소년 작업자도 이해할 수 있게 짧고 명확한 문장으로 기록합니다.

## 현재 과금 상태 (2026-02-19)

- GCP Billing 연결: `비활성화` (`billingEnabled: false`)
- Functions 배포 스크립트: 기본 차단 (`functions/package.json`에서 `ALLOW_BILLING_DEPLOY=1` 없으면 배포 실패)
- Functions export: 로컬 테스트 가능 상태로 복구 (`functions/src/index.ts`)

즉, **지금 상태로는 클라우드 배포가 기본적으로 막혀 있어 과금 위험이 매우 낮습니다.**

## 구동 가이드 (과금 기준)

- 로컬 구동(`npm run dev`, Emulator): 과금 없음
- 클라우드 배포: 과금 가능성 있음 (Billing 재연결 + 배포 허용 필요)

## 배포 전 비용 계산 (2026-02-19 기준)

Cloudflare에 프론트를 배포해도, Firebase 백엔드(Functions/Firestore)는 별도 과금 대상입니다.  
즉, 최종 배포 전에는 아래 계산을 먼저 하고 시작합니다.

### 1) 무료구간 확인

- Cloud Functions (Blaze 기준, 월):
  - Invocations: 2,000,000
  - GB-seconds: 400,000
  - CPU-seconds: 200,000
  - Internet egress: 5GB
- Cloud Firestore (일/월):
  - Reads: 50,000 / day
  - Writes: 20,000 / day
  - Deletes: 20,000 / day
  - Stored data: 1GiB
  - Outbound transfer: 10GiB / month

### 2) 우리 서비스 예상치 입력 (월 기준)

- `revision_pair_count_per_month` (월 비교 실행 횟수, 이전/현재 1쌍 기준)
- `avg_added_changed_events_per_pair` (쌍당 추가/변경 행사 수)
- `avg_proposals_per_event` (행사 1건당 생성 proposal 수)
- `manager_actions_per_proposal` (수정/삭제/승인 API 호출 횟수)
- `api_view_calls_per_month` (목록/진단 조회 호출 수)
- `avg_response_egress_mb` (응답 평균 크기 MB)

### 3) 러프 계산식

- Functions 호출수(월):
  - `uploadProjectCsv * 2 * revision_pair_count_per_month`
  - `compareRevisionsAndGenerateProposals * revision_pair_count_per_month`
  - `list/update/delete/approve/diagnose` 총합
- Firestore Writes(월):
  - `2 * revision_pair_count_per_month` (`csv_uploads` 문서 생성)
  - `revision_pair_count_per_month * avg_added_changed_events_per_pair * avg_proposals_per_event` (proposal 생성)
  - 변경 행사로 인한 기존 pending proposal dueDate update
  - 수정/삭제/승인에 따른 update 횟수
- Firestore Reads(월):
  - 비교 시 업로드/체크리스트/pending proposal 조회
  - 목록 조회 + 승인 처리 시 proposal 조회 + 기타 진단 조회
- Egress(월):
  - `총 API 호출수 * avg_response_egress_mb`

### 4) 판단 기준

- 위 예상치가 무료구간 이하면 백엔드 요금은 사실상 `0원`에 가깝습니다.
- 무료구간을 넘는 항목만 Blaze 종량 과금됩니다.
- 이 프로젝트 리전(`asia-northeast3`)은 Functions Tier 2 가격권역이므로, 초과 시 단가가 높을 수 있습니다.

### 5) 배포 직전 체크리스트

- Firebase 콘솔에서 Budget alert 설정
- 첫 달은 일단 낮은 트래픽으로 운영 후 실제 사용량으로 재계산
- emulator 우선 검증 후 배포

### 6) 공식 문서 (항상 최신값 재확인)

- Firebase Pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore pricing: https://firebase.google.com/docs/firestore/pricing
- Firebase FAQ (Cloud Functions free tier): https://firebase.google.com/support/faq
- Functions location/Tier 정보: https://firebase.google.com/docs/functions/locations

## 작업 로그

- 아래 일부 로그는 CSV 전환 이전(PDF 실험 단계) 이력입니다.
- 2026-02-19: 과금 차단 조치 적용
  - Billing unlink 수행
  - Functions 배포 안전장치 추가
  - Functions export 제거로 재배포 시 함수 생성 방지
- 2026-02-19: 재테스트 가능 상태로 조정
  - 로컬 테스트를 위해 Functions export 복구
  - `npm run build` 검증 완료
- 2026-02-19: 터미널 작업 자동화
  - `npm run setup:functions-env` 추가 (질문형으로 functions/.env 생성)
  - `npm run dev:local` 추가 (빌드 + 에뮬레이터 + 프론트 원커맨드 실행)
- 2026-02-19: env 입력 UX 개선
  - `setup:functions-env`에서 NOTION_TOKEN 숨김 입력 제거 (붙여넣기 안정화)
  - `NOTION_TOKEN` 환경변수로도 입력 가능하게 변경
- 2026-02-19: Emulator env 파싱 오류 수정
  - `FUNCTION_REGION`(예약 키) 대신 `APP_FUNCTION_REGION` 사용으로 변경
  - `dev:local` 실행 시 기존 `.env`의 예약 키를 자동 마이그레이션하도록 개선
- 2026-02-19: Functions env fallback 보강
  - Emulator discovery에서 env 누락 시를 대비해 `functions/src/config.ts`에서 `.env` 파일 fallback 로딩 추가
- 2026-02-19: Cloud Workstations 연결 안정화
  - 프론트 fetch에 `credentials: include` 적용
  - Functions CORS에 `credentials: true` 적용
- 2026-02-19: URL 저장 후 버튼 비활성화 버그 수정
  - `app-config.js`의 빈 문자열(`FUNCTIONS_BASE_URL: ""`)이 저장값을 덮는 문제 수정
  - `src/App.tsx`에서 빈 문자열 설정은 자동 무시하고 localStorage 값 사용
- 2026-02-19: CSV 업로드 전환(현재 기본 경로)
  - Functions에 `POST /uploadProjectCsv`, `GET /getUploadNormalizedRows` 추가
  - 업로드 저장 컬렉션을 `csv_uploads`로 분리해 과거 PDF 실험 데이터와 분리
  - 프론트 파일 선택을 CSV(`.csv,text/csv`)로 전환하고 업로드/조회 엔드포인트 교체
  - `uploadProjectPdf`, `getPdfUploadNormalizedRows`는 레거시 별칭으로 유지
  - CSV 필수 조건: `name` + (`startdate/enddate` 또는 `date`)
- 2026-02-19: 판별 선행/UX/삭제 안정화
  - `compareRevisionsAndGenerateProposals`에 `previewOnly` 모드 추가(행사 존재/변경 선판별)
  - 프론트에 `행사 존재/변경 판별` 버튼 및 결과 표 추가
  - 현재 업로드 쌍에 대해 선판별을 완료하지 않으면 `버전 비교 + 제안 생성` 실행을 막도록 가드 추가
  - 정제 데이터 영역에 `더보기/닫기` 토글 추가
  - `deleteProposal` API를 문서 존재 확인 + merge 업데이트로 보강, 프론트 삭제 오류 표시 추가
- 2026-02-19: 프로젝트-귀속업무 계층 UI + 행사 분류 필터
  - 제안 목록을 프로젝트 단위 카드(펼치기/접기)로 변경하고, 하위 귀속업무 표를 프로젝트 내부에 배치
  - 프로젝트명 클릭으로 확장/축소 가능
  - 프로젝트에 `행사 분류` 선택값 저장 API(`POST /updateProjectCategory`) 추가
  - 행사 분류 선택지는 체크리스트 DB(`30aff6bdba96809db01ccee207bacde6`)의 `행사 분류` 값에서 동적으로 로드
  - 하위 업무는 선택된 `행사 분류`와 각 업무의 `eventCategories` 매칭 기준으로 엄격 필터링(미매칭 제외)
  - proposal 문서에 `projectCategory`, `eventCategories` 필드를 저장하도록 생성 로직 확장
- 2026-02-19: VIDEC 오인 제거 보강
  - 날짜가 `TBD`인 CSV 행도 정제 단계에서 제외하지 않도록 수정
  - 비교 로직에 행사명 동일성 보조 매칭을 추가해 키 변동(도시/국가/표기) 시 `삭제` 오탐 감소
- 2026-02-19: 정제 데이터 UX 가독성 개선
  - 이전 정제 패널을 `이전 불러오기`와 `현재 불러오기` 사이 위치로 재배치
  - 현재 정제 패널은 `현재 불러오기` 바로 아래에 표시되도록 재배치
  - 정제 패널 확장 시 상단/하단에 작은 `닫기` 버튼 2개 제공
  - 정제 테이블을 월(`Month`) 단위 섹션으로 분리하고 컬럼 순서를 `행사명-시작일-종료일` 중심으로 조정
- 2026-02-19: 정제 테이블 마감 다듬기
  - 월 섹션 제목에 건수 표기 추가 (예: `August (5건)`)
  - `Startdate`, `Enddate`는 줄바꿈 없이 표시
  - 월 섹션 컬럼 너비를 동일하게 고정
  - 신뢰도 표기를 `H/M/L` 약어로 축약
  - 정제/원본 미리보기 패널에서 우측 가로 스크롤이 나오지 않도록 폭/레이아웃 조정
- 2026-02-19: PDF 수동 업로드 기능 추가
  - 프론트에 PDF 업로드 버튼 추가 (`src/App.tsx`)
  - Functions에 `POST /uploadProjectPdf` 추가 (`functions/src/index.ts`)
  - 현재는 업로드 메타데이터 저장 단계이며 AI 추출 파이프라인은 다음 단계에서 연결
- 2026-02-19: 러프 AI 제안 생성 파이프라인 추가
  - `POST /generateProposalsFromUpload` 추가
  - 업로드 텍스트(러프 추출) + 파일명 기반으로 체크리스트 후보를 뽑아 `proposals` pending 생성
  - PDF 기반 proposal은 Notion 프로젝트 매핑 전에는 승인 차단 (`project_mapping_required`)
- 2026-02-19: PDF 버전 비교 기반 제안 생성/갱신 추가
  - `POST /compareRevisionsAndGenerateProposals` 추가
  - `uploadProjectPdf`에 `revisionRole(previous|current)` 저장 및 이벤트 추출 저장
  - 추가 행사: 신규 proposal 생성, 변경 행사: 기존 pending proposal 마감일 재계산 update
  - 비교 결과 요약을 `revision_diffs`에 저장
- 2026-02-19: PDF 정제 단계/조회 UI 추가
  - `uploadProjectPdf` 시 `normalizedRows` 생성/저장 (Month/Date/Country/City/Event/Purpose/start/end)
  - Month carry-forward, `29 - February 2` 같은 교차월 날짜 범위 파싱 추가
  - 날짜-only 파싱은 행 시작 패턴으로 제한해 오탐 감소
  - PDF 본문 추출을 `pdf-parse` 기반으로 강화하고 stream fallback 유지
  - 날짜 줄 다음의 여러 줄을 같은 행사로 묶는 멀티라인 정제 로직 추가
  - Country/City 인식 휴리스틱 보강(예: `China Shenyang`)
  - 다단어 국가(`South Korea`) 및 후행 도시(`... Dubai`) 인식 보강
  - 하루 행사 date 파싱 시 `Enddate`를 `Startdate`와 동일하게 보정
  - 추출 실패 시 파일명 fallback 제거(정제 0건으로 표시)
  - 프론트에 `추출 텍스트(표)` 추가(줄 단위 테이블로 확인)
  - 정제 표 컬럼명을 `Startdate`, `Enddate`로 명시
  - `GET /getPdfUploadNormalizedRows` 추가 및 프론트 `정제 데이터 보기` 표 연결
- 2026-02-19: LLM 사용 여부 명시
  - 현재 PDF 판정 로직은 정규식/토큰 기반 휴리스틱이며 외부 LLM API 호출 없음
  - 오탐 가능성과 원인 추적 필드(`pdf_uploads.normalizedRows`, `proposals.sourceUploadId`) 문서화
- 2026-02-19: 배포 전 비용 계산 가이드 추가
  - Cloudflare 프론트 + Firebase 백엔드 기준으로 무료구간/계산식/체크리스트/공식 링크 정리

## 재테스트 절차 (현재 기준)

### 1) 결론 먼저

- 로컬 테스트: 이전과 거의 동일하게 진행 가능
- 클라우드 배포 테스트: 현재는 기본 차단 상태 (의도된 안전장치)

### 2) 로컬 테스트 (권장, 과금 없음)

```bash
# 루트
npm run dev

# 별도 터미널
cd functions
cp .env.example .env
npm install
npm run build
firebase emulators:start --only firestore,functions
```

- 프론트 API Base URL:
  - `http://127.0.0.1:5001/<project-id>/asia-northeast3`
- 이후 테스트 순서:
  - `GET /diagnoseNotionAccess`
  - `GET /listPendingProposals`
  - `POST /updateProposal`, `POST /deleteProposal`
  - `POST /approveProposals`

### 3) 클라우드 배포 테스트 (주의)

- 현재 차단 요인:
  - GCP Billing 연결 해제 상태
  - `functions/package.json`의 `deploy` 스크립트는 `ALLOW_BILLING_DEPLOY=1` 없으면 실패
- 배포가 꼭 필요할 때만 아래를 수행:
  - Billing 재연결
  - `ALLOW_BILLING_DEPLOY=1 npm run deploy`

## ERR_CONNECTION_REFUSED 빠른 해결

브라우저에서 `127.0.0.1` 연결 거부가 나오면 아래 순서로 확인합니다.

1. `functions/.env` 파일 생성 및 값 입력
```bash
cd functions
cp .env.example .env
```
- `NOTION_TOKEN`, `NOTION_PROJECT_DB_ID`, `NOTION_CHECKLIST_DB_ID`, `NOTION_TASK_DB_ID` 필수
- 이 값이 없으면 Functions 로딩 시 `Missing required env: NOTION_TOKEN` 오류가 발생
- 지역 키는 `APP_FUNCTION_REGION` 사용 (`FUNCTION_REGION`는 Emulator 예약 키와 충돌 가능)
- 일부 환경에서 Emulator가 `.env`를 읽고도 런타임 env 전달이 누락될 수 있어, 현재 코드는 `functions/src/config.ts`에서 `.env` 파일 fallback을 사용

2. 에뮬레이터는 루트에서 실행
```bash
cd /home/user/izen-design-team
firebase emulators:start --only firestore,functions --project demo-test
```

3. API 주소 확인
- `http://127.0.0.1:5001/demo-test/asia-northeast3/diagnoseNotionAccess`

4. 여전히 실패하면 포트 점유 프로세스 종료 후 재시작
- 기존 에뮬레이터 터미널에서 `Ctrl + C`

## 초간단 실행 (터미널 1개)

터미널 여러 개를 쓰기 어렵다면 아래 2개만 사용하면 됩니다.

1. 처음 1회: 노션 값 입력
```bash
cd /home/user/izen-design-team
npm run setup:functions-env
```

토큰 붙여넣기가 안 되면 이렇게도 가능합니다:
```bash
cd /home/user/izen-design-team
NOTION_TOKEN='여기에_토큰' npm run setup:functions-env
```

2. 매번 실행: 로컬 전체 실행
```bash
cd /home/user/izen-design-team
npm run dev:local
```

- 이 명령은 자동으로 다음을 수행합니다.
  - functions 빌드
  - Firestore/Functions 에뮬레이터 실행
  - 프론트 실행
  - Functions Base URL 자동 설정
- 종료는 `Ctrl + C` 한 번이면 됩니다.

## Cloud Workstations 접속 규칙

- 이 환경에서는 `http://localhost:5173` 대신 포워딩 주소를 사용합니다.
  - 예: `https://5173-<workspace>.cloudworkstations.dev/`
- Functions Base URL도 포워딩 주소로 입력해야 합니다.
  - 예: `https://5001-<workspace>.cloudworkstations.dev/demo-test/asia-northeast3`
- `http://127.0.0.1:4000`는 Emulator UI(점검용)입니다.

연결 테스트가 실패하면 먼저 브라우저에서 Functions URL을 1회 직접 열어 인증 쿠키를 만든 뒤 다시 시도하세요:

- `https://5001-<workspace>.cloudworkstations.dev/demo-test/asia-northeast3/diagnoseNotionAccess`

### 연결 테스트 성공 후 다음 단계

1. `연결 테스트`는 "입력한 URL이 응답하는지"만 확인합니다.
2. 실제 앱에 URL을 적용하려면 `저장 후 다시연결` 버튼을 눌러야 합니다.
3. 페이지가 다시 로드되면 `노션 권한 점검` 버튼이 활성화됩니다.
4. `노션 권한 점검` 결과에서 `ok: true`가 나오면 이후 승인 플로우 테스트를 진행합니다.

### CSV 버전 비교 테스트 (권장)

1. `이전 버전 업로드`로 이전 Rev CSV를 업로드합니다.
2. `현재 버전 업로드`로 최신 Rev CSV를 업로드합니다.
3. 각 업로드 성공 메시지에서 `uploadId`를 확인합니다.
4. `이전 uploadId`, `현재 uploadId` 입력칸을 확인/수정합니다.
5. 필요하면 `이전/현재 정제 데이터 불러오기` 후 `더보기`로 정제된 행을 확인합니다.
6. `행사 존재/변경 판별` 버튼을 먼저 눌러 신규/변경/삭제 행사 표를 확인합니다.
7. 검토 후 `버전 비교 + 제안 생성` 버튼을 누릅니다.
8. 결과 메시지에서 `추가 N건 / 변경 N건 / 제안 생성 N건 / 마감일 업데이트 N건`을 확인합니다.
9. 하단에서 프로젝트명을 눌러 펼치고, `행사 분류`를 선택해 귀속업무를 필터링한 뒤 검토합니다.

주의:
- 현재 AI 단계는 러프 버전(정규식/토큰 기반)입니다.
- 업로드 기반 제안은 `projectId=csv_event:*` 또는 `csv_upload:*` 형태일 수 있어, 바로 Notion Task 승인(`선택 승인`)은 차단됩니다.
- 변경 행사(diff=changed)는 기존 pending proposal의 마감일이 자동 재계산되어 갱신됩니다.

### 노션 프로젝트 DB 감지 테스트 (기존 스케줄러 경로)

1. 프로젝트 DB에 테스트용 새 row를 1개 추가합니다.
2. 스케줄 함수(`syncNewProjects`)를 실행합니다.
   - 대기 실행: 최대 10분
   - 수동 실행(권장): 브라우저에서 아래 URL 1회 호출
     - `http://127.0.0.1:5001/demo-test/asia-northeast3/syncNewProjects-0`
3. 화면에서 `새로고침`을 눌러 `pending proposals`가 생겼는지 확인합니다.
4. 필요하면 항목 수정/삭제 후 `선택 승인`을 실행합니다.
5. 노션 업무 DB에 실제 Task가 생성되었는지 확인합니다.

주의: 첫 실행은 baseline 저장만 하고 제안 생성을 건너뜁니다.  
따라서 baseline 이후에 추가된 프로젝트 row로 테스트해야 합니다.

#### proposal이 안 생길 때 (가장 흔한 원인)

- 방금 추가한 프로젝트 row가 baseline에 이미 포함되면 신규로 처리되지 않습니다.
- 해결:
  1. 프로젝트 DB에 **새 row를 하나 더** 추가
  2. 프로젝트 DB에 `행사 분류` 컬럼이 있으면 비워두고, 없으면 그대로 진행
  3. `http://127.0.0.1:5001/demo-test/asia-northeast3/syncNewProjects-0` 1회 호출
  4. 앱에서 `새로고침`
