# 20_AAR_LOG

## 작성 규칙
- 작업 종료 전 반드시 AAR을 기록한다.

## 로그

### 2026-02-27
- 작업 항목: `hook-master.md` 신규 생성 및 JSON 계약 정의
- 결과: Connected DB(프로젝트/태스크/체크리스트/회의) 기준으로 Core JSON Contract 문서화 완료
- 배운 점: 코드 타입(`worker/src/types.ts`, `src/shared/types.ts`)을 기준으로 문서를 맞추면 계약 불일치 위험이 줄어든다.
- 다음 액션: 스키마/필드 변경 시 `hook-master.md`와 타입 파일을 동시 업데이트한다.

### 2026-02-27 (경로 정렬)
- 작업 항목: `CODEX_RULES.md`, `hook-master.md`의 `docs/` 이동 반영
- 결과: `docs/CODEX_RULES.md` 내 설계 참조 경로와 무결성 조건을 `docs` 기준으로 갱신
- 배운 점: 문서 이동 시 규칙 문서의 경로 하드코딩 항목을 즉시 동기화해야 운영 오류를 줄일 수 있다.
- 다음 액션: 이후 스키마/파일명 변경 시 `docs/hook-master.md` 동시 갱신 원칙을 유지한다.

### 2026-02-27 (회의록 D1 fallback 제거)
- 작업 항목: 회의록 API 라우트에서 D1 fallback 비활성화 및 문서 정합성 갱신
- 결과: `NOTION_MEETING_DB_ID` 미설정 시 회의록 경로(`/api/transcripts`, `/api/uploads/presign`, `/api/keyword-*`, `/api/assemblyai/webhook`)가 `config_missing`으로 즉시 실패하도록 수정
- 배운 점: 정책상 미사용 저장소 경로는 코드 fallback으로 남기면 운영 환경 누락 시 의도와 다른 동작을 유발할 수 있다.
- 다음 액션: 회의록 관련 D1 레거시 함수 정리(완전 삭제) 여부를 별도 PR에서 결정한다.

### 2026-02-27 (회의록 제목/날짜 규칙 + Notion 본문 구조)
- 작업 항목: 회의록 파일명 `yymmdd 제목` 파싱, Notion `날짜` 속성 반영, 본문 `요약/전문` 섹션 구조 적용
- 결과: DB 고정 ID(`3f3c1cc7ec278216b5e881744612ed6b`) 기준으로 회의록 row 생성 시 날짜/제목이 분리 저장되고, 본문은 요약 placeholder + 전문(원문/발화)로 기록되도록 변경
- 배운 점: 업로드 제목 규칙을 서버에서 강제 파싱하면 클라이언트 입력 편차에도 기록 품질을 일정하게 유지할 수 있다.
- 다음 액션: GPT-5 mini 요약 연동 시 `요약` 섹션 업데이트 API를 추가한다.

### 2026-02-27 (R2 presign 미지원 fallback)
- 작업 항목: `uploads/presign` 실패 시 Worker direct 업로드/조회(`uploads/direct`, `uploads/fetch`) fallback 경로 구현
- 결과: presign 미지원 런타임에서도 업로드/전사 파이프라인이 동작하도록 토큰 기반 fallback URL 반환 로직을 추가
- 배운 점: 브라우저 직업로드 전제 기능은 런타임 차이를 고려한 안전한 대체 경로가 필요하다.
- 다음 액션: `CLOUDFLARE_API_TOKEN` 설정 후 Worker 배포 및 실제 WAV E2E 검증을 수행한다.
