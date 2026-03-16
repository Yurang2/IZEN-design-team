# Screening Plan DB Design

Date: 2026-03-16

## Goal

Use one Notion DB to prepare upcoming screening plans before they become history rows.

Worker env:

- `NOTION_SCREENING_PLAN_DB_ID`

Target DB title:

- `영상 편성 준비 DB`

## Recommended schema

| Property | Type | Purpose |
| --- | --- | --- |
| `제목` | `title` | plan row title |
| `귀속 프로젝트` | `relation -> NOTION_PROJECT_DB_ID` | project linkage |
| `관련 업무` | `relation -> NOTION_TASK_DB_ID` | linked work item |
| `행사명` | `rich_text` | target event |
| `상영일` | `date` | planned date |
| `상영 순서` | `number` | planned order |
| `스크린/구역` | `rich_text` | screen or zone |
| `대표 이미지` | `files` | gallery preview |
| `변환 전 파일명` | `rich_text` | source naming |
| `목표 상영 파일명` | `rich_text` | planned final filename |
| `실제 상영 파일명` | `rich_text` | final played filename |
| `화면 비율` | `select` | target ratio |
| `상태` | `select` | `planned/editing/ready/locked/completed/cancelled` |
| `히스토리 반영` | `checkbox` | sync marker |
| `히스토리 페이지 ID` | `rich_text` | created history page id |
| `실제 상영 여부` | `checkbox` | optional playback confirmation |
| `실제 상영 순서` | `number` | optional actual order override |
| `이슈 사유` | `rich_text` | issue note |

## Automation

- `상태=completed` and `히스토리 반영=false`
- Worker cron copies the row to the history DB
- After copy, the plan row is updated with `히스토리 반영=true`

## Sync paths

- `POST /admin/notion/screening-plan-schema/sync`
- `POST /admin/notion/screening-plan-history-sync`
- `npm run sync:screening-plan-schema`
