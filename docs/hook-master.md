# hook-master.md

## 1) ë¬¸ì„œ ëª©ì 
- ??ë¬¸ì„œ??IZEN ?´ë? ?°ì´????ê³„ì•½(JSON Contract)??ê¸°ì? ë¬¸ì„œ??
- API ?‘ë‹µ/?”ì²­ ?¬ë§·ê³??„ë“œ ?•ì˜??ë³?ë¬¸ì„œë¥??°ì„ ?¼ë¡œ ?œë‹¤.

## 2) Connected DB (SSOT)
- Project DB: `NOTION_PROJECT_DB_ID`
- Task DB: `NOTION_TASK_DB_ID`
- Checklist DB: `NOTION_CHECKLIST_DB_ID` (optional)
- Meeting DB (fixed): `3f3c1cc7ec278216b5e881744612ed6b`
- Checklist Assignment DB: `NOTION_CHECKLIST_ASSIGNMENT_DB_ID` (optional)

## 3) ê³µí†µ ê·œì¹™
- ID: ë¬¸ì??`string`) ?¬ìš©
- ? ì§œ: `YYYY-MM-DD` ?•ì‹ ?¬ìš©
- ? ì§œ/?µì…˜ ?„ë“œ???„ìš” ???ëµ ê°€???µì…”??
- ? ë‹¹ ?´ì œ??`null` ?ëŠ” ë¹?ê°??•ì±…???”ë“œ?¬ì¸??ê·œê²©??ë§ì¶° ì²˜ë¦¬

## 4) Core JSON Contract

### 4.1 ProjectRecord
```json
{
  "id": "string",
  "key": "string",
  "bindingValue": "string",
  "name": "string",
  "eventDate": "YYYY-MM-DD",
  "shippingDate": "YYYY-MM-DD",
  "operationMode": "self | dealer",
  "fulfillmentMode": "domestic | overseas | dealer",
  "projectType": "string",
  "eventCategory": "string",
  "iconEmoji": "string",
  "iconUrl": "string",
  "coverUrl": "string",
  "source": "project_db | task_select"
}
```

### 4.2 TaskRecord
```json
{
  "id": "string",
  "url": "string",
  "projectKey": "string",
  "projectName": "string",
  "projectSource": "relation | select | unknown",
  "requester": ["string"],
  "workType": "string",
  "taskName": "string",
  "status": "string",
  "statusColor": "string",
  "assignee": ["string"],
  "startDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "actualEndDate": "YYYY-MM-DD",
  "detail": "string",
  "priority": "string",
  "urgent": true,
  "issue": "string"
}
```

### 4.3 CreateTaskInput
```json
{
  "taskName": "string",
  "projectId": "string",
  "projectName": "string",
  "workType": "string",
  "status": "string",
  "assignee": ["string"],
  "requester": ["string"],
  "startDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "detail": "string",
  "priority": "string",
  "urgent": false,
  "issue": "string"
}
```

### 4.4 UpdateTaskInput
```json
{
  "projectId": "string | null",
  "projectName": "string | null",
  "taskName": "string | null",
  "workType": "string | null",
  "status": "string | null",
  "assignee": ["string"],
  "requester": ["string"],
  "startDate": "YYYY-MM-DD | null",
  "dueDate": "YYYY-MM-DD | null",
  "detail": "string | null",
  "priority": "string | null",
  "urgent": true,
  "issue": "string | null"
}
```

### 4.5 ChecklistAssignmentRow
```json
{
  "id": "string",
  "key": "string",
  "projectPageId": "string",
  "checklistItemPageId": "string",
  "taskPageId": "string | null",
  "applicable": true,
  "assignmentStatus": "not_applicable | unassigned | assigned",
  "assignmentStatusText": "string"
}
```

### 4.6 Meeting Transcript Input Rule
```json
{
  "key": "meetings/audio/.../file.m4a",
  "title": "yymmdd ?”ì?¸í? ì£¼ê°„ë³´ê³ ",
  "minSpeakers": 2,
  "maxSpeakers": 10,
  "keywordSetId": "string | null"
}
```
- ?„ë¡ ???…ë¡œ???¼ì? `title` ?˜ë™ ?…ë ¥??ë°›ì? ?Šê³ , ?…ë¡œ???Œì¼ëª?`file.name`)??`title`ë¡??„ì†¡?œë‹¤.
- `title`??`yymmdd <?œëª©>` ?¨í„´?´ë©´:
- Notion `? ì§œ` ?ì„±(date)??`YYYY-MM-DD`ë¡??€?¥í•œ??
- Notion ?˜ì´ì§€ ?œëª©?€ `yymmdd` ?´í›„ ?ìŠ¤?¸ë? ?¬ìš©?œë‹¤.
- ?¨í„´???„ë‹ˆë©?ê¸°ì¡´ ?œëª©??ê·¸ë?ë¡??¬ìš©?˜ê³  `? ì§œ`??ë¹„ìš´??
- ?œë²„??R2 key??UUID prefix(`<32hex>-`)ë¥??œê±°???Œì¼ëª…ì„ ê¸°ì??¼ë¡œ???™ì¼ ?Œì‹±?œë‹¤.
- Notion ? ì§œ ì»¬ëŸ¼?€ `? ì§œ` ?ëŠ” `?¼ì`ë¥??ë™ ?¸ì‹??ê¸°ë¡?œë‹¤.

### 4.7 Meeting Upload Presign Response
```json
{
  "ok": true,
  "key": "meetings/audio/.../file.wav",
  "putUrl": "string",
  "requiredHeaders": {
    "Content-Type": "audio/wav"
  },
  "uploadMode": "r2_presigned | worker_direct"
}
```

### 4.8 Meeting Transcript Read Shape (excerpt)
```json
{
  "transcript": {
    "id": "string",
    "meetingId": "string",
    "meetingDate": "YYYY-MM-DD | null",
    "status": "queued | submitted | processing | completed | failed | error",
    "bodySynced": false,
    "meeting": {
      "title": "string"
    }
  }
}
```

### 4.9 Meeting Transcript Publish (manual Notion sync)
- Endpoint: `POST /api/transcripts/:id/publish`
- Purpose: after speaker mapping is completed in web UI, publish mapped utterances to Notion body and generate summary.
- Rule:
- webhook/GET polling must not auto-publish transcript body.
- publish is rejected when transcript status is not `completed`.
- publish is rejected when any speaker label is unmapped.
- Notion `?„ë¬¸` section writes only `?”ìë³?ë°œí™”` (mapped names). `?ë¬¸ ?ìŠ¤?? section is not written.
- `?”ìë³?ë°œí™”` ??ª©?€ `[HH:MM:SS-HH:MM:SS] ?”ì: ë°œí™”` ?•ì‹?¼ë¡œ ?€?„ìŠ¤?¬í”„ë¥??¬í•¨?œë‹¤. (timestamp ?„ë½ ??prefix ?ëµ)
- `OPENAI_API_KEY`ê°€ ?¤ì •??ê²½ìš° `?”ì•½` ?¹ì…˜?€ GPT ?”ì•½?¼ë¡œ ì±„ìš´?? ë¯¸ì„¤????placeholderë¥?? ì??œë‹¤.
- publish ë°˜ë³µ ?¤í–‰?€ AssemblyAI ?¬ì „??ë¹„ìš©??ë§Œë“¤ì§€ ?ŠëŠ”?? ?? `OPENAI_API_KEY`ê°€ ?¤ì •??ê²½ìš° ?”ì•½ ?¸ì¶œ ë¹„ìš©?€ ?¤í–‰ ?Ÿìˆ˜ë§Œí¼ ë°œìƒ?œë‹¤.

```json
{
  "ok": true,
  "transcriptId": "string",
  "assemblyId": "string",
  "status": "completed",
  "utteranceCount": 123,
  "audioFileAttached": true
}
```

### 4.10 ReferenceRecord
```json
{
  "id": "string",
  "title": "string",
  "sourceType": "image | youtube | link | other",
  "usageType": "simple | copy-study | idea",
  "link": "string",
  "imageUrl": "string",
  "projectName": "string",
  "authorName": "string",
  "authorIp": "string",
  "tags": ["string"]
}
```
- `projectId` in reference/storyboard APIs is the related Task page ID.
- `authorName` and `authorIp` are server-filled on reference create.

### 4.11 StoryboardDocumentRecord
```json
{
  "id": "string",
  "title": "string",
  "projectId": "related task page id",
  "projectName": "string",
  "versionName": "string",
  "memo": "string",
  "data": { "meta": {}, "frames": [] },
  "exportedFileNames": ["string"]
}
```
## 5) ?´ë? ê³µìš© JSON êµ¬ì¡° ?ˆì‹œ
- ?„ë˜ êµ¬ì¡°???€ ?´ë? ë¬¸ì„œ/??ê³„ì•½?ì„œ ê³µìš© ?ˆì‹œë¡??¬ìš©?œë‹¤.

```json
{
  "id": "string",
  "name": "string",
  "status": "Draft | Approved | Completed",
  "startDate": "YYYY-MM-DD"
}
```

```json
{
  "projectId": "string",
  "title": "string",
  "assigneeId": "string",
  "dueDate": "YYYY-MM-DD",
  "done": true
}
```

## 6) ë³€ê²?ê·œì¹™
- ?Œì¼ëª?ë°?JSON schema ë³€ê²½ì? `hook-master.md` ?™ì‹œ ?˜ì •???†ìœ¼ë©??¤íŒ¨ë¡?ê°„ì£¼?œë‹¤.
- ê³„ì•½ ë³€ê²???ê´€???€???Œì¼(`worker/src/types.ts`, `src/shared/types.ts`)ê³??¨ê»˜ ?™ê¸°?”í•œ??

## 7) 2026-02-27 Meetings Publish Addendum
- Summary Markdown required headers are limited to:
  - `## È¸ÀÇ °³¿ä`
  - `### Âü¼®ÀÚ(ÃßÁ¤)`
  - `### ÀÚµ¿ ÃÊ¾È ¾È³»`
  - `## ÇÙ½É ¾È°Ç ¿ä¾à`
  - `## Á¤ÇØÁø ³»¿ë / È®ÀÎ ÇÊ¿ä`
- `## Âü¿©ÀÚº° ÇØ¾ß ÇÒ ÀÏ`, `## ºÒÈ®½Ç/Ãß°¡ È®ÀÎ ÇÊ¿ä ±¸°£` are optional and must be omitted when empty.
- Placeholder text like `ÀÚµ¿ º¸Á¤µÈ ¼½¼Ç` must not be emitted for empty optional sections.
- Notion `Àü¹®` section does not emit runtime metadata lines (`status=... generated_at=...`).
- Publish writes the recording to both:
  - page body top file block
  - DB files property `Audio File`

## 2026-02-27 Upload Runtime Update
- Current meeting upload pipeline: Browser -> (R2 presigned or worker_direct fallback) -> R2 -> AssemblyAI(audio_url) -> webhook -> transcript detail/publish.
- Upload timeout handling was updated: dynamic timeout by file size (min 5m, max 30m).
- Upload retry policy was updated: retry once on retryable upload errors (total up to 2 attempts).
- worker_direct is a fallback path when R2 presigned URL is not available. Hard size blocking was removed; warning-only behavior remains.
- Deployment note: manual Cloudflare Pages deploy via Wrangler requires CLOUDFLARE_API_TOKEN in non-interactive environments.

## 2026-03-13 Event Graphics Timetable Addendum
- Internal Event Graphics view now supports two modes:
  - self-hosted event: time-based cue sheet
  - exhibition: situation-based playbook
- Recommended Notion discriminator field: `Å¸ÀÓÅ×ÀÌºí À¯Çü`
  - `ÀÚÃ¼Çà»ç`
  - `Àü½ÃÈ¸`

### Event Graphics Exhibition Row (normalized view model)
```json
{
  "id": "string",
  "order": 1,
  "numberLabel": "01",
  "category": "Regular Operation",
  "trigger": "Booth opening ~ before and after seminar",
  "timeReference": "Always-on loop",
  "mainScreen": "string",
  "audio": "string",
  "action": "Loop | Play | Hold | Switch",
  "note": "string",
  "status": "planned | ready | shared | changed_on_site",
  "previewHref": "string | null",
  "assetHref": "string | null",
  "source": "db | sample"
}
```

## Storyboard Storage Rule
- `GET/POST/PATCH /api/storyboards` uses D1 as the storyboard document source of truth.
- Storyboard metadata and page/frame content are stored in D1 (`storyboard_documents`, `storyboard_frames`).
- Storyboard image binaries are stored in R2 under the `storyboards/` prefix; D1 stores only image keys and metadata.
- Notion is not required for storyboard documents.
