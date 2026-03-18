# Event Graphics Timetable DB Design

Date: 2026-03-17

## Goal

이 DB는 행사 그래픽 운영용 SSOT다. 화면은 `시간표`, `Masterfile Check`, `External Share` 3개지만, 계층 기준은 모두 같은 세션 구조를 따른다.

기본 원칙:

- `정렬 순서`는 자연수만 사용한다.
- `Cue 번호(QN)`는 세션 단위로 묶어 쓴다.
- `Lecture`는 `등장 + 강연 + 서티 증정`
- `Introduce`는 `등장 + 강연`
- 세부 stage 구분은 `카테고리`와 row 자체로 표현한다.

Worker env:

- `NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID`

## Current schema

| Property | Type | Required | Purpose |
| --- | --- | --- | --- |
| `행 제목` | `title` | yes | primary row title |
| `귀속 프로젝트` | `relation -> NOTION_PROJECT_DB_ID` | no | project linkage |
| `행사명` | `rich_text` | yes | event label fallback and grouping |
| `행사일` | `date` | no | event snapshot date |
| `타임테이블 유형` | `select` | yes | `자체행사`, `전시회` |
| `운영 키` | `rich_text` | yes | stable import/update key |
| `정렬 순서` | `number` | yes | session order, integer only |
| `카테고리` | `select` | yes | `announcement`, `opening`, `entrance`, `introduce`, `lecture`, `certificate`, `break`, `meal`, `closing` |
| `Cue 제목` | `rich_text` | no | human readable cue title |
| `트리거 상황` | `rich_text` | no | exhibition trigger |
| `시작 시각` | `rich_text` | no | start time |
| `종료 시각` | `rich_text` | no | end time |
| `시간 기준` | `rich_text` | no | exhibition timing note |
| `러닝타임(분)` | `number` | no | runtime minutes |
| `메인 화면` | `rich_text` | no | operator-facing graphic source |
| `캡쳐` | `files` | no | registered image tracking |
| `오디오` | `rich_text` | no | operator-facing audio source |
| `오디오파일` | `files` | no | registered audio tracking |
| `무대 인원` | `rich_text` | no | stage personnel |
| `운영 메모` | `rich_text` | no | operator/vendor note |
| `미리보기 링크` | `url` | no | preview link |
| `자산 링크` | `url` | no | delivery link |

## Removed columns

운영용 메인 스키마에서는 아래 컬럼을 제거한다.

- `상태`
- `운영 액션`
- `Cue 순서`
- `Cue 유형`
- `원본 Video`
- `원본 Audio`
- `원본 비고`
- `그래픽 형식`
- `그래픽 자산명`
- `업체 전달 메모`
- `프로젝트명 스냅샷`
- `원본 문서`
- `원본 시트`
- `원본 행번호`
- `담당자`

## Practical rule

- `행사명`은 아직 화면 그룹 라벨과 fallback 텍스트에 쓰이므로 유지한다.
- `행사일`은 relation만으로 바로 끌어오지 않는 화면이 있어 당장은 유지한다.
- 장기적으로 relation label/date 해석이 안정화되면 `행사명`, `행사일` 축소를 다시 검토할 수 있다.

## Bangkok mapping

- source workbook: `files/IZEN Seminar in Bangkok Timetable.xlsx`
- generated rows: `ops/generated/bangkok-event-graphics-timetable.json`
- draft generator: `scripts/generate-event-graphics-timetable-draft.mjs`
- order rebuild: `scripts/rebuild-bangkok-event-graphics-operational-order.mjs`
- entrance expansion: `scripts/augment-event-graphics-entrance-cues.mjs`
- Notion import: `scripts/import-event-graphics-timetable-direct.mjs`

## Migration order

1. schema sync로 새 컬럼/삭제 컬럼을 맞춘다.
2. 행사별 기존 row를 archive하거나 정리한다.
3. draft + masterfile sync를 다시 생성한다.
4. direct import로 현재 세션 구조를 재반영한다.
