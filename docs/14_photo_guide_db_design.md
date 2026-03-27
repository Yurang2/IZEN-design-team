# Photo Guide DB Design

Date: 2026-03-27

## Goal
- Replace the old text-heavy photo guide entry model with a shot-slot model.
- Support the real workflow: write the shot brief first, then attach or generate a matching image later.
- Keep the runtime compatible with `Cloudflare Pages + Cloudflare Workers + Notion`.

## Runtime Paths
- Internal page: `행사 > 촬영가이드`
- Share page: `/share/photo-guide`
- Worker API: `GET /api/photo-guide`, `POST /api/photo-guide`, `POST /api/photo-guide/:id/files`

## UX Model
- Top area: summary blocks for operating assumptions, goals, roles.
- Main area: groups such as `토요일 학회`, `일요일 강연`, `월요일 크루즈`.
- Each slot card contains:
  - fixed 3:2 thumbnail area
  - title
  - description
  - drag-and-drop image upload
  - optional Gemini image generation from the slot brief

## Notion Fields
| Field | Type | Purpose |
| --- | --- | --- |
| `제목` | `title` | Slot title or summary title |
| `귀속 프로젝트` | `relation` | Optional project linkage |
| `행사명` | `rich_text` | Event label |
| `정렬 순서` | `number` | Slot order inside a group |
| `그룹` | `select` | Visual group / section |
| `행사일` | `date` | Date metadata |
| `장소` | `rich_text` | Location metadata |
| `콜타임` | `rich_text` | Call time metadata |
| `현장 담당자` | `rich_text` | Contact metadata |
| `설명` | `rich_text` | Shot brief |
| `컷 이미지` | `files` | Attached image for the slot |
| `행 유형` | `select` | `shot` or `summary` |
| `요약` | `rich_text` | Summary body text |

## Row Rules
- `행 유형 = shot`
  - rendered as a slot card
  - uses `설명` + `컷 이미지`
- `행 유형 = summary`
  - if `그룹` is empty: rendered in the page-level summary area
  - if `그룹` exists: rendered above that group's slot grid

## Notes
- Old text fields such as `촬영 목적`, `필수 컷`, `시간대별 포인트`, `주의 사항` are no longer part of the synced schema.
- Legacy columns may remain in Notion, but the v2 UI ignores them.
- Image upload is limited to image files because the slot frame is image-first.
