# Product Context

## Product
IZEN design team internal operations console.

## Target users
IZEN design team staff who need practical, fast team operations workflows.

## Runtime / hosting
Production target is Cloudflare Pages + Cloudflare Workers. Do not assume an always-on local server.

## Source of truth
- Product/design: `docs/00_설계도.md`
- API/data contract: `docs/hook-master.md`
- Security/ops: `docs/WORKER_SECURITY.md`, `docs/RECOVERY_CLOUDFLARE_HOSTING.md`

## Current priorities
- Usability, visibility, workflow clarity, and operational speed first.
- Authentication exists but is not a current priority unless explicitly requested.
- Prefer improving existing screens over introducing parallel flows.

## Data principles
- Human-edited operational data: Notion.
- High-volume append/machine logs: Cloudflare D1.
- Avoid double source-of-truth storage.

## Non-negotiable review principles
- No next-stage progression without required reviewer approval.
- Preserve Cloudflare architecture.
- Sync TypeScript types and docs when shared contracts change.
- Keep user-facing reports short unless detail is requested.
