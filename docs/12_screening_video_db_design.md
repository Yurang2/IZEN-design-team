# Screening Video DB Design

Date: 2026-03-16

## Goal

Use one lightweight Notion DB to track screening outputs without duplicating large local folders.

This DB is for:

- exhibition/screening history by project
- source vs converted file naming
- exhibition label separate from project relation
- aspect ratio tracking for playback preparation
- revision and final-master tracking

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
| `대표 이미지` | `files` | no | thumbnail shown in Notion table |
| `영상 키` | `rich_text` | yes | stable video family key |
| `Rev` | `number` | yes | revision number |
| `현재 최종본` | `checkbox` | yes | final playable master flag |
| `변환 전 파일명` | `rich_text` | no | original naming |
| `변환 후 파일명` | `rich_text` | no | converted/export naming |
| `화면 비율` | `select` | no | playback ratio |
| `상영 가능 상태` | `select` | yes | current playback readiness |
| `이슈 사유` | `rich_text` | no | issue note |

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
- Thumbnail upload script: `npm run upload:screening-video-thumbnails`

## Playback status options

- `ready`
- `live`
- `issue`
- `retired`

## Practical usage

- Use `귀속 프로젝트` when the row belongs to an internal project already managed in the project DB.
- Use `상영 전시회` when the booth/event naming needs to remain visible even if the project title changes.
- When a file is revised, create a new row with the same `영상 키` and a higher `Rev`.
- Only one row per `영상 키` should keep `현재 최종본=true`.
- The “play now” view should filter `현재 최종본=true` and `상영 가능 상태` in `ready`, `live`.
- Keep only naming and playback metadata here; continue storing heavy binaries outside Notion.
