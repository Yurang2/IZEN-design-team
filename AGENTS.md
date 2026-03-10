# AGENTS.md

## Purpose
- This repository is an internal operations console for the IZEN design team.
- Agents working here should optimize for practical team usage, not local-only demos.

## Hosting Model
- Production/runtime target is `Cloudflare Pages + Cloudflare Workers`.
- Do not propose an always-on local PC/server as the default operating model unless the user explicitly asks for it.
- Backend assumptions should stay compatible with the current Cloudflare deployment model.

## Current Product Policy
- Authentication exists in code, but it is intentionally not a current priority.
- Do not spend time re-enabling or redesigning auth unless the user explicitly asks for it.
- Favor usability, visibility, workflow clarity, and operational speed first.

## Source Of Truth
- Product/design SSOT: `docs/00_설계도.md`
- API/data contract SSOT: `docs/hook-master.md`
- Security/ops references:
  - `docs/WORKER_SECURITY.md`
  - `docs/RECOVERY_CLOUDFLARE_HOSTING.md`

## Working Rules
- Before large structural changes, inspect the existing code and preserve the current Cloudflare architecture.
- Prefer improving existing screens over introducing parallel flows.
- When changing shared contracts, sync the relevant TypeScript types and docs together.
- Do not add unrelated sample assets or commit contents from `files/` unless the user explicitly asks.

## Verification
- Primary verification command: `npm run build`
- `npm run lint` currently includes legacy failures in the existing codebase; treat it carefully and distinguish new issues from pre-existing ones.

## Git Policy
- After each completed change set, commit the relevant files and push them to the GitHub repository unless the user explicitly says not to.
- Keep commits scoped to the task. Do not include unrelated files.
