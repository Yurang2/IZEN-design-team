# Schedule DB Addendum

Date: 2026-03-11

This addendum records the schedule-tab contract introduced after the original SSOT docs were written.

## Environment

- Worker env var: `NOTION_SCHEDULE_DB_ID`
- Value format: plain Notion database ID
- Example: `NOTION_SCHEDULE_DB_ID=25bc1cc7ec27801f952ede56d393673e`

## Product intent

- `CHECKLIST` DB remains the existing checklist source of truth.
- `SCHEDULE` is a separate Notion database connected only for the schedule tab.
- The schedule tab reads the current Notion schema as-is instead of remapping it into a fixed internal column model.

## API contract

- Endpoint: `GET /api/schedule`

Response shape:

```json
{
  "ok": true,
  "configured": true,
  "database": {
    "id": "string | null",
    "url": "string | null",
    "title": "string"
  },
  "columns": [
    {
      "id": "string",
      "name": "string",
      "type": "string"
    }
  ],
  "rows": [
    {
      "id": "string",
      "url": "string | null",
      "cells": [
        {
          "columnId": "string",
          "type": "string",
          "text": "string",
          "href": "string | null"
        }
      ]
    }
  ],
  "cacheTtlMs": 60000
}
```

Rules:

- If `NOTION_SCHEDULE_DB_ID` is missing, the API returns `configured=false` and empty `columns`/`rows`.
- Column `name` and `type` come directly from the Notion Schedule DB schema.
- Cell `text` is a normalized display string derived from the original Notion property value.
- The frontend renders columns in the same order returned by the Notion database schema object.
