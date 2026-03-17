# Event Graphics Timetable DB Design

Date: 2026-03-13

## 1) Goal

This DB should stay small enough to operate directly in Notion.

The DB is for:

- event graphics playback order
- exhibition playbook states
- current asset status and preview links
- one internal screen and one external share screen

The DB is not for:

- workbook provenance tracking
- sheet/row trace-back
- redundant project-name fallbacks
- per-asset production history

Worker env:

- `NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID`

## 2) Design rule

Use one slim DB with one stable import key:

- `운영 키`

`운영 키` is now the primary upsert key for import/update.

Recommended format:

- self-hosted event row: `event-slug::event::03::lecture-1`
- exhibition row: `event-slug::exhibition::02::regular-operation`

This replaces the older import dependency on:

- `원본 문서`
- `원본 시트`
- `원본 행번호`

## 3) Slim v2 schema

| Property | Type | Required | Purpose |
| --- | --- | --- | --- |
| `행 제목` | `title` | yes | Primary row title |
| `귀속 프로젝트` | `relation -> NOTION_PROJECT_DB_ID` | no | Optional project linkage |
| `행사명` | `rich_text` | yes | Event grouping label |
| `행사일` | `date` | no | Event date |
| `타임테이블 유형` | `select` | yes | `자체행사`, `전시회` |
| `운영 키` | `rich_text` | yes | Stable import/update key |
| `정렬 순서` | `number` | yes | Shared display order for both modes |
| `카테고리` | `select` | yes | Event type or exhibition state |
| `Cue 제목` | `rich_text` | no | Human-readable cue or state title |
| `트리거 상황` | `rich_text` | no | Situation that triggers the switch |
| `시작 시각` | `rich_text` | no | Start time for event rows |
| `종료 시각` | `rich_text` | no | End time for event rows |
| `시간 기준` | `rich_text` | no | Exhibition time reference or cue timing note |
| `러닝타임(분)` | `number` | no | Runtime in minutes |
| `메인 화면` | `rich_text` | no | Primary screen asset / source |
| `캡쳐(무조건 이미지형식)` | `files` | no | Registered image/thumbnail tracking |
| `오디오` | `rich_text` | no | Audio source |
| `오디오파일` | `files` | no | Registered audio file tracking |
| `무대 인원` | `rich_text` | no | Personnel on stage |
| `운영 액션` | `select` | no | `Play`, `Hold`, `Loop`, `Switch` |
| `운영 메모` | `rich_text` | no | Operator/vendor note |
| `미리보기 링크` | `url` | no | Thumbnail/preview |
| `자산 링크` | `url` | no | Final delivery link |
| `상태` | `select` | yes | `planned`, `designing`, `ready`, `shared`, `changed_on_site` |

## 4) Removed from the recommended schema

These columns are no longer part of the recommended operating schema:

- `프로젝트명 스냅샷`
- `원본 문서`
- `원본 시트`
- `원본 행번호`
- `그래픽 형식`
- `담당자`
- `원본 Video`
- `원본 Audio`
- `원본 비고`
- `그래픽 자산명`
- `업체 전달 메모`

Reason:

- they duplicated meaning already covered by the slim fields
- they made the Notion DB harder to scan in day-to-day operations
- the app no longer needs them as primary fields

## 5) Mode usage

### Self-hosted event rows

Recommended usage:

- `타임테이블 유형` = `자체행사`
- `정렬 순서` = cue order
- `카테고리` = `opening`, `lecture`, `certificate`, `break`, `meal`, `closing`, `other`
- `Cue 제목` = readable session title
- `시작 시각`, `종료 시각`, `러닝타임(분)` = timeline data
- `메인 화면`, `오디오`, `운영 메모` = playback data
- `캡쳐(무조건 이미지형식)`, `오디오파일` = registered file tracking

### Exhibition rows

Recommended usage:

- `타임테이블 유형` = `전시회`
- `정렬 순서` = playbook order
- `카테고리` = `Regular Operation`, `Seminar Starting Soon`, `In Seminar`, `Lucky Draw`
- `트리거 상황`, `시간 기준` = switching context
- `메인 화면`, `오디오`, `운영 액션`, `운영 메모` = playbook instructions
- `캡쳐(무조건 이미지형식)`, `오디오파일` = registered file tracking

## 6) Bangkok draft mapping

Workbook:

- `files/IZEN Seminar in Bangkok Timetable.xlsx`
- sheet `Cue Sheet`

Draft generator mapping:

- `정렬 순서` <- `No`
- `카테고리` <- derived from `Category`
- `Cue 제목` <- `Category`
- `시작 시각`, `종료 시각` <- split `Time`
- `러닝타임(분)` <- `RT (Minutes)`
- `무대 인원` <- `Personnel on Stage`
- `메인 화면` <- `Video`
- `오디오` <- `Audio`
- `운영 메모` <- `Remarks`
- `운영 키` <- generated from event/mode/order/title

Generated outputs:

- `ops/generated/bangkok-event-graphics-timetable.csv`
- `ops/generated/bangkok-event-graphics-timetable.json`

Generator:

- `scripts/generate-event-graphics-timetable-draft.mjs`

Direct Notion import:

- `scripts/import-event-graphics-timetable-direct.mjs`

## 7) Migration note

The code now reads the slim fields first and legacy fields as fallback.

That means migration can proceed in this order:

1. create the slim fields in Notion
2. import rows using `운영 키`
3. confirm the app reads the slim columns
4. manually remove legacy columns from the Notion UI when ready

## 8) Practical recommendation

For operations, keep the DB visibly focused on:

- order
- category
- title
- screen
- audio
- action
- note
- status

If a field does not help the operator make a playback decision, it should not stay in the main DB.
