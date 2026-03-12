# Bangkok Timetable Strategy

Date: 2026-03-12

## 1) Source file snapshot

Source file:

- `files/IZEN Seminar in Bangkok Timetable.xlsx`
- Sheet: `Cue Sheet`

Detected header row:

- `No`
- `Category`
- `Time`
- `RT (Minutes)`
- `Personnel on Stage`
- `Video`
- `Audio`
- `Remarks`

Detected cue rows:

- Total cue rows: `14`
- Data is event-cue oriented, not document-body oriented.
- Some rows contain multiple video assets in one cell.
- Some rows contain multiple audio assets in one cell.
- At least one row contains operator note text in `Remarks`.

## 2) What this means

This file is small enough to migrate manually, but its usage pattern is not stable enough to stay as a static distributed document.

Operational characteristics already visible in the source:

- Each row is a cue unit.
- The team needs to assign design graphics per cue.
- The same cue may reference more than one asset.
- The same timetable is shared with both vendor and internal staff.
- A stale printed/exported copy can cause field mistakes.

Conclusion:

- The problem is not "writing a prettier file".
- The problem is "maintaining one live operational source of truth".

## 3) Recommended data shape

Use one primary database first. Do not split into multiple databases on day one.

Recommended first database: `Bangkok Cue Board`

Suggested columns:

- `Order` - number
- `Cue Title` - title
- `Time Start` - text or date/time
- `Time End` - text or date/time
- `Runtime Minutes` - number
- `Personnel On Stage` - rich text
- `Source Video` - rich text
- `Source Audio` - rich text
- `Graphic Asset` - rich text
- `Graphic Type` - select (`image`, `video`, `mixed`, `none`)
- `Preview` - files/media
- `Asset Link` - url
- `Status` - select (`planned`, `designing`, `ready`, `shared`, `changed_on_site`)
- `Owner` - person or text
- `Vendor Note` - rich text
- `Last Confirmed At` - last edited time or date/time

Recommended interpretation:

- Existing `Video` and `Audio` columns remain reference columns from the original cue sheet.
- New design-team assignment lives in `Graphic Asset`, `Graphic Type`, `Preview`, `Asset Link`, `Status`.
- If one cue later needs multiple managed graphics with separate status, then split to a second `Cue Assets` database later.
- Do not start with two databases unless operations already require per-asset lifecycle tracking.

## 4) Tool decision

### Option A: Keep using xlsx only

Pros:

- Lowest initial setup

Cons:

- Weak live update control
- Weak preview experience
- Multiple distributed versions are hard to prevent
- Poor field-readiness when changes happen on site

Verdict:

- Not recommended

### Option B: Notion DB + hosted read-only web view

Pros:

- Fits current repository architecture and existing Notion + Worker pattern
- Easy to attach media and add operational status fields
- Easy to expose one current web URL for vendor/internal staff
- Lower integration cost than introducing a new external system into this repo

Cons:

- Table editing is less spreadsheet-native than a dedicated sheet/grid tool
- If asset tracking becomes complex, a second related DB may be needed later

Verdict:

- Best fit if the web view will be built in this repository

### Option C: Sheet/grid tool first, web later

Examples:

- Google Sheets
- Airtable

Pros:

- Faster bulk editing than Notion
- Good when operators mostly work in rows and columns

Cons:

- Introduces another source/system to connect later
- Adds integration work if this repo remains the main operations console

Verdict:

- Best fit only if editing speed is more important than current stack alignment

## 5) Recommendation

Recommended path for this repository:

1. Create a dedicated Notion DB for Bangkok cue operations.
2. Add a dedicated Worker env var for that DB.
3. Build a read-only hosted field view that always shows the latest cue status, preview, and link.
4. Keep the original xlsx only as import/reference material.

Recommended env var name:

- `NOTION_BANGKOK_TIMETABLE_DB_ID`

Why this is the current recommendation:

- The repo already treats Notion DB as the operational source of truth.
- The workbook structure is already row-oriented and easy to map into DB records.
- The main failure mode described by the user is stale distribution, which a live URL solves better than a file.
- The file is small enough that first migration cost is manageable.

## 6) Migration note

Initial migration from the current xlsx can be done row by row without automation if needed, because there are only `14` cue rows.

If automation is desired later:

- Parse xlsx
- Normalize time range into start/end
- Preserve original `Video` and `Audio`
- Add new design assignment fields
- Push rows into the selected SSOT
