# AGENTS.md

## Purpose
- This repository is an internal operations console for the IZEN design team.
- Agents working here should optimize for practical team usage, not local-only demos.

## Hosting Model
- Production/runtime target is `Cloudflare Pages + Cloudflare Workers`.
- Do not propose an always-on local PC/server as the default operating model unless the user explicitly asks for it.
- Backend assumptions should stay compatible with the current Cloudflare deployment model.

## Current Product Policy
- Authentication exists in code, but it is intentionally not a current priority.
- Do not spend time re-enabling or redesigning auth unless the user explicitly asks for it.
- Favor usability, visibility, workflow clarity, and operational speed first.

## Source Of Truth
- Product/design SSOT: `docs/00_설계도.md`
- API/data contract SSOT: `docs/hook-master.md`
- Security/ops references:
  - `docs/WORKER_SECURITY.md`
  - `docs/RECOVERY_CLOUDFLARE_HOSTING.md`

## Working Rules
- Before large structural changes, inspect the existing code and preserve the current Cloudflare architecture.
- Prefer improving existing screens over introducing parallel flows.
- When changing shared contracts, sync the relevant TypeScript types and docs together.
- When changing the NAS guide folder tree, always verify that `docs/nas-structure/*.md` and the hardcoded tree/examples in `NasGuideView.tsx` still match.
- Do not add unrelated sample assets or commit contents from `files/` unless the user explicitly asks.
- Temporary handoff note: keep mid-task progress updates short, and if a partial in-progress state must be saved, record the current status in `AGENTS.md` so the next turn can resume quickly.
- Remove any temporary handoff note from `AGENTS.md` as soon as the referenced fix/work is completed.

## 승인 후 작업 원칙
- 사용자가 승인 전 작업 금지를 지시하면, 에이전트는 먼저 요청 내용을 바탕으로 변경 계획을 사용자에게 설명한다.
- 사용자의 명시적 승인을 받기 전에는 파일 수정, 구현, 설정 변경, 스크립트 실행, Notion DB 변경, 커밋 등 실제 작업을 시작하지 않는다.
- 요청이 여러 해석이 가능하거나 결과물/범위가 불명확하면, 해석 옵션을 짧게 정리해 사용자에게 확인받은 뒤 진행한다.
- 승인 후 작업 범위가 달라지면, 변경된 계획을 다시 설명하고 다시 승인받은 뒤 진행한다.
- Notion DB 생성이 필요하면 부모 페이지 `23ec1cc7-ec27-803a-9567-f6b5ebc7cb36` 기준을 따른다.
- Worker 배포는 자동으로 하지 말고, 사용자의 수동 요청이 있을 때만 진행한다.

## NAS (Synology) 정책
- NAS에 대해 에이전트가 할 수 있는 행위는 **읽기(조회)와 추가(업로드, 폴더 생성)**뿐이다.
- 덮어쓰기, 삭제, 이름 변경, 이동 등 기존 파일/폴더를 변경하는 일체의 행위를 금지한다.
- NAS에 임의로 폴더나 파일을 생성하지 않는다. 사용자의 명시적 요청이 있을 때만 수행한다.
- Worker 코드에서 `overwrite: 'false'`를 유지하며, 삭제/이름변경/이동 API는 구현하지 않는다.

## Verification
- Primary verification command: `npm run build`
- `npm run lint` currently includes legacy failures in the existing codebase; treat it carefully and distinguish new issues from pre-existing ones.

## Git Policy
- After each completed change set, commit the relevant files and push them to the GitHub repository unless the user explicitly says not to.
- Keep commits scoped to the task. Do not include unrelated files.

## 마크다운 파일 기술 정책
- 가급적 모든 `.md` 파일은 100줄을 넘지 않도록 한다.

## 데이터 저장소 분리 정책
데이터는 **Notion**(사람이 편집)과 **Cloudflare D1**(대량·기계 쓰기)로 나눈다.
DB 스키마를 건드리거나 새 저장소를 추가할 때마다 이 섹션과 `CLAUDE.md`의 동일 섹션을 **반드시 함께 업데이트**한다.

### 현재 Notion DB
| DB | 역할 | env key |
|---|---|---|
| 프로젝트 | 프로젝트 목록 | `NOTION_PROJECT_DB_ID` |
| 업무 (태스크) | 업무구분 select + 태스크 레코드 | `NOTION_TASK_DB_ID` |
| 체크리스트 | 행사 체크리스트 | `NOTION_CHECKLIST_DB_ID` |
| 업무 피드백 | 업무상 발생한 피드백 기록 | `NOTION_FEEDBACK_DB_ID` |
| 프로그램 이슈 트래커 | 팀 내부 프로그램 사용 피드백/버그/개선 요청 | `NOTION_PROGRAM_ISSUES_DB_ID` |
| NAS 이슈 트래커 | NAS 구조 논의 | `NOTION_NAS_ISSUES_DB_ID` |
| NAS 트리 저장본 | path-mapping DB 안의 단일 JSON row (`__NAS_TREE_JSON__`) | `NOTION_PATH_MAPPING_DB_ID` |
| 업무 매뉴얼 상태 | 업무구분별 확정/논의중/미정 | `NOTION_WORK_MANUAL_STATUS_DB_ID` |
| 폴더 구조 상태 | 폴더별 확정/논의중/미정 | `NOTION_FOLDER_STATUS_DB_ID` |
| 업무별 참조 폴더 | `(workType × path × role)` | `NOTION_WORK_MANUAL_REFS_DB_ID` |
| 변경 이력 | append-only 감사 로그 (임시) | `NOTION_CHANGE_HISTORY_DB_ID` |
| 기타 | 일정/상영/회의록/촬영가이드 등 | `wrangler.toml` 참조 |

### 예정 Cloudflare D1 (병행 이관 대상)
- 체크리스트 업로드 로그 (태스크 × 항목 × 파일)
- 변경 이력 (현재 Notion → D1 이관 예정, 볼륨 커질 시)
- 로컬 에이전트 이벤트 로그

### 원칙
1. **사람이 자주 수정하는 소스**(태스크, 업무구분, 매뉴얼 상태, 폴더 상태, 이슈)는 Notion 유지.
2. **대량·append 위주 데이터**(로그, 업로드 기록, 이벤트)는 D1에 둔다.
3. 한 데이터는 한 저장소에만 둔다(이중 저장 금지). 필요 시 Worker가 조인.
4. DB/컬럼 추가·삭제·이동 시 이 섹션과 `CLAUDE.md`의 동일 섹션을 같은 커밋에서 업데이트한다.
