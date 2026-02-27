# 회의록 기능 설정 가이드 (Notion DB 저장, D1 미사용)

## 핵심 결론
- 회의록 기능은 `Notion DB + R2 + AssemblyAI`로 동작합니다.
- `D1`은 회의록 기능에서 사용하지 않습니다.
- `R2`는 별도 서버를 띄우는 방식이 아닙니다. Cloudflare에 버킷만 만들고 Worker에 바인딩하면 됩니다.
- 회의록 DB는 고정 ID `3f3c1cc7ec278216b5e881744612ed6b`를 사용합니다.

## 1) Notion 준비
1. 회의록 전용 DB를 하나 만듭니다. (기본 제목 컬럼 1개만 있어도 시작 가능)
2. DB를 Worker가 접근할 수 있도록 Notion Integration을 DB에 공유합니다.
3. DB 주소에서 ID를 복사합니다.
- 예: `https://www.notion.so/<workspace>/<DB_ID>?v=...`
- 회의록 DB는 코드에서 고정 ID(`3f3c1cc7ec278216b5e881744612ed6b`)를 사용하므로, 이 DB를 Integration에 반드시 공유해야 합니다.

## 2) Cloudflare Pages/Workers 환경변수(대시보드) 설정
- `ASSEMBLYAI_API_KEY` (Secret)
- `ASSEMBLYAI_WEBHOOK_SECRET` (Secret)
- `NOTION_TOKEN` (Secret)
- 선택: `OPENAI_API_KEY` (Secret, publish 시 요약 생성)
- 선택: `OPENAI_SUMMARY_MODEL` (Variable, 기본값 `gpt-5`)
- 선택: `ASSEMBLYAI_WEBHOOK_URL` (Variable, 미설정 시 자동 `/api/assemblyai/webhook`)

참고:
- 기존 프로젝트/업무 API를 계속 쓴다면 아래도 이미 설정되어 있어야 합니다.
  - `NOTION_PROJECT_DB_ID`
  - `NOTION_TASK_DB_ID`

## 3) R2 준비 (대시보드)
1. Cloudflare R2에서 버킷 생성 (예: `izen-meeting-audio`)
2. Worker 설정에서 R2 바인딩 추가
- Binding name: `MEETING_AUDIO_BUCKET`
- Bucket: 방금 만든 버킷

참고:
- 런타임에서 `createPresignedUrl`이 지원되면 브라우저 -> R2 직업로드를 사용합니다.
- 미지원이면 Worker가 자동으로 direct upload/fetch fallback 경로(`uploads/direct`, `uploads/fetch`)를 사용합니다.

## 4) 배포 후 확인
1. 웹 `회의록` 탭 접속
2. m4a/mp3 업로드 후 전사 시작
3. 상태가 `queued/processing -> completed`로 변하는지 확인
4. 완료 후 Notion DB에 transcript row 생성 확인
5. Notion 페이지 본문에 전사 텍스트/utterances가 들어오는지 확인
6. 화자 매핑 저장 후 화면 표시명이 바뀌는지 확인
7. 키워드 세트/키워드 추가 후 `keywordsUsed` 반영 확인

## 5) 엔드포인트 요약
- `POST /api/uploads/presign`
- `PUT /api/uploads/direct?key=...&token=...` (fallback)
- `GET /api/uploads/fetch?key=...&token=...` (fallback)
- `POST /api/transcripts`
- `GET /api/transcripts?limit=20`
- `GET /api/transcripts/:id`
- `POST|PATCH /api/transcripts/:id/speakers`
- `POST /api/transcripts/:id/publish`
- `GET|POST|PATCH|DELETE /api/keyword-sets`
- `GET|POST|PATCH|DELETE /api/keywords`
- `POST /api/assemblyai/webhook`
- publish 동작 주의:
- `POST /api/transcripts/:id/publish`는 기존 transcript를 재사용해 Notion 본문만 다시 반영합니다.
- 따라서 publish 반복 실행은 AssemblyAI 재전사 비용을 추가로 발생시키지 않습니다.

## 6) 현재 저장 방식
- 원본 전사(화자 라벨 A/B/C)는 그대로 유지합니다.
- 화자 이름 매핑은 별도 속성으로 저장합니다.
- 화면/내보내기에서는 매핑 이름으로 치환해 보여줍니다.
- Notion 페이지 본문은 `요약` / `전문` 섹션으로 기록됩니다.
- `요약`은 `POST /api/transcripts/:id/publish` 시점에 생성됩니다. (`OPENAI_API_KEY` 미설정 시 placeholder 유지)
- `전문`에는 매핑 확정된 화자 이름 기준 `화자별 발화`만 기록합니다. (`원문 텍스트` 섹션은 생성하지 않음)

## 7) 파일명 규칙
- 업로드 시 제목 입력 없이 파일명을 그대로 사용합니다.
- 파일명이 `yymmdd <제목>` 형식이면:
- Notion `날짜` 속성에 `YYYY-MM-DD`로 저장합니다.
- Notion 페이지 제목은 `<제목>`으로 저장합니다.
- 예: `260227 디자인팀 주간보고` -> 날짜: `2026-02-27`, 제목: `디자인팀 주간보고`
- 날짜 컬럼명은 `날짜`/`일자` 중 실제 DB 필드를 자동 인식합니다.

## 8) 비용 메모
- `POST /api/transcripts`를 다시 호출하면 AssemblyAI 재전사 비용이 다시 발생합니다.
- 같은 transcript에 대해 `매핑 저장 + publish`만 반복하면 AssemblyAI 재전사 비용은 추가되지 않습니다.
- 단, `OPENAI_API_KEY`가 설정된 경우 publish마다 요약 호출 비용이 발생합니다.
