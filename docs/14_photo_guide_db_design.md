# Photo Guide DB Design

Date: 2026-03-19

## Goal

Use one Notion DB to prepare a photographer-facing guide page and an external share page.

Worker env:

- `NOTION_PHOTO_GUIDE_DB_ID`

Share path:

- `/share/photo-guide`

## Recommended row model

- One row can be one guide section or one full event guide.
- The web view groups rows by `행사명` and sorts by `정렬 순서` when available.

## Recommended fields

| Property | Type | Purpose |
| --- | --- | --- |
| `제목` | `title` | section title or guide title |
| `행사명` | `rich_text` | event label for grouping |
| `정렬 순서` | `number` | section order |
| `섹션` | `select` or `rich_text` | section label such as 기본 정보, 필수 컷 |
| `행사일` | `date` or `rich_text` | event date |
| `장소` | `rich_text` | venue |
| `콜타임` | `rich_text` | arrival time for photographer |
| `담당자` | `rich_text`, `phone_number`, or `email` | on-site contact |
| `핵심 목적` | `rich_text` | shoot objective |
| `필수 컷` | `rich_text` | must-have shots |
| `시간대별 포인트` | `rich_text` | time-based guidance |
| `주의 사항` | `rich_text` | restrictions or cautions |
| `납품 규격` | `rich_text` | delivery expectations |
| `참고 자료` | `rich_text` | extra note for references |
| `참고 링크` | `url` or `rich_text` | reference URL |
| `첨부 자료` | `files` | optional attachment list |

## Alias rule in web view

- The page reads several aliases for the same meaning.
- Example: `콜타임`, `집합 시간`, `call time` are treated as the same field.
- This is intentional so the team can settle exact column names later without breaking the page.

## Current behavior

- Internal tab: `촬영가이드`
- External share: read-only public-friendly layout
- Auth gate is skipped for `/share/photo-guide`
