# Screening History DB Design

Date: 2026-03-16

## Goal

Use one Notion DB as the permanent log of what was actually played at each event.

Worker env:

- `NOTION_SCREENING_HISTORY_DB_ID`

Target DB title:

- `상영 영상 기록 DB`

## Recommended schema

| Property | Type | Purpose |
| --- | --- | --- |
| `제목` | `title` | row title |
| `귀속 프로젝트` | `relation -> NOTION_PROJECT_DB_ID` | project linkage |
| `관련 업무` | `relation -> NOTION_TASK_DB_ID` | related task linkage |
| `행사명` | `rich_text` | event label |
| `상영일` | `date` | actual play date |
| `상영 순서` | `number` | actual play order |
| `스크린/구역` | `rich_text` | screen or zone |
| `대표 이미지` | `files` | gallery preview |
| `변환 전 파일명` | `rich_text` | original naming |
| `상영 당시 파일명` | `rich_text` | actual played file |
| `화면 비율` | `select` | playback ratio |
| `원본 준비 Row ID` | `rich_text` | source plan row id |

## Sync paths

- `POST /admin/notion/screening-history-schema/sync`
- `npm run sync:screening-video-schema`
- `npm run upload:screening-video-thumbnails`
