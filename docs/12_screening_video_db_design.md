# Screening Video DB Design

Date: 2026-03-16

## Goal

Use one lightweight Notion DB to track screening outputs without duplicating large local folders.

This DB is for:

- exhibition/screening history by project
- source vs converted file naming
- exhibition label separate from project relation
- aspect ratio tracking for playback preparation

Worker env:

- `NOTION_SCREENING_VIDEO_DB_ID`

Target DB title:

- `상영 영상 DB`

## Recommended schema

| Property | Type | Required | Purpose |
| --- | --- | --- | --- |
| `제목` | `title` | yes | row title |
| `귀속 프로젝트` | `relation -> NOTION_PROJECT_DB_ID` | no | project linkage |
| `상영 전시회` | `rich_text` | no | exhibition/event label |
| `변환 전 파일명` | `rich_text` | no | original naming |
| `변환 후 파일명` | `rich_text` | no | converted/export naming |
| `화면 비율` | `select` | no | playback ratio |

## Aspect ratio options

- `16:9`
- `9:16`
- `1:1`
- `21:9`
- `32:9`
- `기타`

## Sync paths

- Worker admin route: `POST /admin/notion/screening-video-schema/sync`
- Direct script: `npm run sync:screening-video-schema`

## Practical usage

- Use `귀속 프로젝트` when the row belongs to an internal project already managed in the project DB.
- Use `상영 전시회` when the booth/event naming needs to remain visible even if the project title changes.
- Keep only naming and playback metadata here; continue storing heavy binaries outside Notion.
