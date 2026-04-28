# Claude 작업 지침

이 문서는 Claude/Codex 계열 에이전트가 이 저장소에서 작업할 때 반드시 지켜야 할 운영 규칙을 정리한다.

## 1. 실행 전 플랜 확인 필수
- 파일 수정, 스크립트 실행, Notion DB 변경, 커밋 등 실제 변경 작업 전에는 **예상 플랜을 먼저 보고**하고 사용자의 **명시적 승인**을 받는다.
- 승인 전에는 읽기/조회/확인 작업만 수행한다.
- 규모와 무관하게 같은 원칙을 적용한다.
- 되돌리기 어려운 작업(Notion row archive, 대규모 파일 수정, 스크립트 실행, DB 생성)은 특히 엄격하게 적용한다.

## 2. 모호한 지시는 확인 먼저
- 사용자 요청이 여러 해석이 가능하면 임의로 진행하지 말고 해석 옵션을 짧게 정리한 뒤 무엇을 원하는지 확인한다.
- 결과물과 범위가 명확하지 않으면 바로 구현하지 않는다.
- 걱정·질문·아이디어 표현은 즉시 실행 요청이 아닐 수 있으므로 먼저 방향을 확인한다.

## 3. 기존 합의 사항
- 작업 플로우는 `플랜 공유 -> 승인 -> 작업 -> 커밋 -> 푸시 -> 결과 보고`를 기본으로 한다.
- 작업 완료 후에는 관련 파일만 묶어서 커밋하고 푸시한다.
- 여러 사용자가 보는 화면의 큰 UI 변경은 먼저 사용자와 합의한다.
- Notion DB 생성이 필요하면 부모 페이지 `23ec1cc7-ec27-803a-9567-f6b5ebc7cb36` 기준을 따른다.
- Worker 배포는 자동이 아니라 수동 요청 시에만 진행한다.

## 4. 데이터 저장소 분리 정책
데이터는 **Notion**(사람이 편집)과 **Cloudflare D1**(대량·기계 쓰기)로 나눈다.
DB 스키마를 건드리거나 새 저장소를 추가할 때마다 이 섹션과 `AGENTS.md`의 동일 섹션을 **같은 커밋에서 함께 업데이트**한다.

### 현재 Notion DB
| DB | 역할 | env key |
|---|---|---|
| 프로젝트 | 프로젝트 목록 | `NOTION_PROJECT_DB_ID` |
| 업무 (태스크) | 업무구분 select + 태스크 레코드 | `NOTION_TASK_DB_ID` |
| 체크리스트 | 행사 체크리스트 | `NOTION_CHECKLIST_DB_ID` |
| 업무 피드백 | 업무상 발생한 피드백 기록 | `NOTION_FEEDBACK_DB_ID` |
| 프로그램 이슈 트래커 | 팀 내부 프로그램 사용 피드백/버그/개선 요청 | `NOTION_PROGRAM_ISSUES_DB_ID` |
| 레퍼런스 자료함 | 이미지/링크 레퍼런스와 활용 분류 | `NOTION_REFERENCE_DB_ID` |
| NAS 이슈 트래커 | NAS 구조 논의 | `NOTION_NAS_ISSUES_DB_ID` |
| 업무 매뉴얼 상태 | 업무구분별 확정/논의중/미정 | `NOTION_WORK_MANUAL_STATUS_DB_ID` |
| 폴더 구조 상태 | 폴더별 확정/논의중/미정 | `NOTION_FOLDER_STATUS_DB_ID` |
| 업무별 참조 폴더 | `workType × path × role` | `NOTION_WORK_MANUAL_REFS_DB_ID` |
| 변경 이력 | append-only 감사 로그 (임시) | `NOTION_CHANGE_HISTORY_DB_ID` |
| 기타 | 일정/상영/회의록/촬영가이드 등 | `wrangler.toml` 참조 |

### 현재 Cloudflare D1 / R2
- NAS 트리 저장본 (`NAS_TREE_DB` / `nas_tree_state`)
- 스토리보드 문서/본문 (`STORYBOARD_DB` 권장, 미설정 시 `NAS_TREE_DB` / `storyboard_documents`, `storyboard_frames`)
- 스토리보드 이미지 (`STORYBOARD_ASSETS_BUCKET` 권장, 미설정 시 `MEETING_AUDIO_BUCKET`의 `storyboards/` prefix)

### 예정 Cloudflare D1
- 체크리스트 업로드 로그 (태스크 × 항목 × 파일)
- 변경 이력 (Notion → D1 이관 예정)
- 로컬 에이전트 이벤트 로그

### 원칙
1. 사람이 자주 수정하는 데이터는 Notion에 둔다.
2. 앱 상태/대량·append 위주 데이터는 D1에 둔다.
3. 하나의 데이터는 하나의 저장소만 사용한다.
4. DB/컬럼 추가·삭제·이동 시 `AGENTS.md`와 이 문서를 같은 커밋에서 함께 갱신한다.
