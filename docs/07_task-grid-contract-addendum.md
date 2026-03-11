# Task Grid Contract Addendum

Date: 2026-03-11

Purpose:
- Documents Task DB fields added to the web task operations grid before `docs/hook-master.md` encoding is normalized.

Task response field additions:
- `workTypeColor?: string`
- `actualStartDate?: YYYY-MM-DD`
- `predecessorTask?: string`
- `predecessorPending?: boolean`
- `outputLink?: string`

Notion mapping intent:
- `startDate`: `접수일`
- `workTypeColor`: Notion select/status color for `업무구분`
- `actualStartDate`: `착수일`
- `predecessorTask`: `선행 작업`
- `predecessorPending`: `선행 미완료`
- `outputLink`: `산출물 링크`
