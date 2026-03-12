# Event Graphics Timetable DB Design

Date: 2026-03-12

## 1) Goal

This database is the reusable source of truth for event cue graphics operations.

It is designed for:

- one event having many cue rows
- each cue row carrying the latest playback/design status
- one hosted field view showing only the latest data
- optional relation to the existing Project DB

Worker env name:

- `NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID`

## 2) Relation strategy

Recommended structure:

- one Project DB page
- many Event Graphics Timetable rows related to that project

Recommended exact relation property name:

- `귀속 프로젝트`

Reason:

- the repo already uses `귀속 프로젝트` as the stable relation label pattern for project-bound records
- future Worker parsing/fallback can stay consistent with existing Notion conventions

Important rule:

- `귀속 프로젝트` is recommended but should not be the only grouping field
- keep `프로젝트명 스냅샷` and `행사명` as text fields for resilience during import, exports, or temporary unlinked rows

## 3) Final v1 schema

Use `v1` as a single database. Do not split cue rows and asset rows yet.

| Property | Type | Required | Purpose |
| --- | --- | --- | --- |
| `행 제목` | `title` | yes | Primary row title. Example: `[2026 IZEN Seminar in Bangkok] 01 Announcement` |
| `귀속 프로젝트` | `relation -> NOTION_PROJECT_DB_ID` | no | Optional relation to the main Project DB |
| `프로젝트명 스냅샷` | `rich_text` | yes | Text fallback when relation is empty or unavailable |
| `행사명` | `rich_text` | yes | Event grouping text |
| `행사일` | `date` | no | Event date if known |
| `Cue 순서` | `number` | yes | Display ordering |
| `Cue 유형` | `select` | yes | `announcement`, `opening`, `lecture`, `certificate`, `break`, `meal`, `closing`, `other` |
| `Cue 제목` | `rich_text` | yes | Human-readable cue name |
| `시작 시각` | `rich_text` | yes | Time text such as `9:30` |
| `종료 시각` | `rich_text` | yes | Time text such as `9:40` |
| `러닝타임(분)` | `number` | no | Runtime in minutes |
| `무대 인원` | `rich_text` | no | Personnel on stage |
| `원본 Video` | `rich_text` | no | Original cue sheet video column |
| `원본 Audio` | `rich_text` | no | Original cue sheet audio column |
| `원본 비고` | `rich_text` | no | Original cue sheet remarks |
| `그래픽 자산명` | `rich_text` | no | Working delivery asset name used by the design team |
| `그래픽 형식` | `select` | no | `image`, `video`, `mixed`, `hold`, `unknown`, `none` |
| `미리보기 링크` | `url` | no | Preview URL used by web/Notion |
| `자산 링크` | `url` | no | Final delivery file or folder URL |
| `상태` | `select` | yes | `planned`, `designing`, `ready`, `shared`, `changed_on_site` |
| `담당자` | `rich_text` | no | Owner text |
| `업체 전달 메모` | `rich_text` | no | Vendor-facing operational note |
| `원본 문서` | `rich_text` | yes | Source workbook filename |
| `원본 시트` | `rich_text` | yes | Source worksheet name |
| `원본 행번호` | `number` | yes | Row trace back to source file |

## 4) Self-feedback and adjustments

The first design direction was heavier than necessary. These were corrected in the final draft:

- `미리보기` was first considered as `files & media`
- final recommendation changed to `미리보기 링크`
- reason: import friction is lower, and the hosted web view can render thumbnails from a URL directly

- `담당자` was first considered as `people`
- final recommendation changed to `rich_text`
- reason: first import and external coordination are easier when the DB does not depend on workspace-user matching

- a dedicated asset child DB was first considered
- final recommendation keeps one DB for `v1`
- reason: the current workbook has only `14` cue rows and does not yet prove per-asset lifecycle complexity

## 5) When to split into 2 DBs later

Split only if one cue row routinely needs multiple separately managed assets with different statuses or owners.

Typical triggers:

- one cue has separate opener, loop, fallback still, and emergency still
- each asset has its own owner, version, or delivery state
- vendor requests asset-level approval tracking

If that happens later:

- parent DB: cue rows
- child DB: cue assets
- relation: one cue row to many cue assets

## 6) Draft import mapping from the Bangkok workbook

Workbook used:

- `files/IZEN Seminar in Bangkok Timetable.xlsx`
- sheet `Cue Sheet`

Mapping rules used in the draft generator:

- `Cue 순서` <- `No`
- `Cue 제목` <- `Category`
- `시작 시각`, `종료 시각` <- split `Time` by `~`
- `러닝타임(분)` <- `RT (Minutes)`
- `무대 인원` <- `Personnel on Stage`
- `원본 Video` <- `Video`
- `원본 Audio` <- `Audio`
- `원본 비고` <- `Remarks`
- `그래픽 자산명` <- initialized from `원본 Video`
- `그래픽 형식` <- heuristically derived from `원본 Video`
- `상태` <- initialized as `planned`

Generated draft outputs:

- `ops/generated/bangkok-event-graphics-timetable.csv`
- `ops/generated/bangkok-event-graphics-timetable.json`

Generator script:

- `scripts/generate-event-graphics-timetable-draft.mjs`

## 7) Recommended next step

Create the Notion DB properties with the exact names above, then link each row to the correct project page through `귀속 프로젝트`.

Once the DB exists with these fields, the next implementation step is:

1. Worker read endpoint for event graphics timetable rows
2. read-only hosted field view grouped by project/event
3. visual emphasis for `상태`, `미리보기 링크`, `자산 링크`, and `업체 전달 메모`
