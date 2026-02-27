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
