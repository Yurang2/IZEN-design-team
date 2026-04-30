# Current Task

## Task ID
storyboard-title-nanobanana-multi-results

## Goal
Fix storyboard title updates so existing DB documents are patched instead of recreated, and support multiple Nano Banana edit results in the local editor.

## Scope
- Storyboard PPT DB save path for metadata-only edits.
- Nano Banana multiple image result extraction, history restore, result switching, download, and promote-to-source behavior.
- Self-review records for this change set.

## Files/areas touched
- `src/features/storyboard/StoryboardPptxView.tsx`
- `tools/nanobanana-editor/app.js`
- `tools/nanobanana-editor/main.cjs`
- `tools/nanobanana-editor/server.mjs`
- `tools/nanobanana-editor/styles.css`
- `.ai-review/*`

## Success criteria
- Existing storyboard DB selection remains on PATCH for title/meta-only saves.
- Nano Banana displays all returned edit images and allows selecting one.
- Selected edit result can be downloaded or promoted as the next source image.
- Existing unrelated dirty files are not included in commits.

## Required reviewers
- ux
- tech
- product
- qa
- user-advocate
- design-brand

## Conditional reviewers
- security-privacy: included for local files, credentials, and Vertex integration surface
- ops-deployment: included for Cloudflare/runtime save-path risk
