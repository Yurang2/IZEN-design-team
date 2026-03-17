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
- Temporary handoff note: keep mid-task progress updates short, and if a partial in-progress state must be saved, record the current status in `AGENTS.md` so the next turn can resume quickly.
- Remove any temporary handoff note from `AGENTS.md` as soon as the referenced fix/work is completed.

## 승인 후 작업 원칙
- 사용자가 승인 전 작업 금지를 지시하면, 에이전트는 먼저 요청 내용을 바탕으로 변경 계획을 사용자에게 설명한다.
- 사용자의 명시적 승인을 받기 전에는 파일 수정, 구현, 설정 변경, 기타 실제 작업을 시작하지 않는다.
- 승인 후 작업 범위가 달라지면, 변경된 계획을 다시 설명하고 다시 승인받은 뒤 진행한다.

## Verification
- Primary verification command: `npm run build`
- `npm run lint` currently includes legacy failures in the existing codebase; treat it carefully and distinguish new issues from pre-existing ones.

## Git Policy
- After each completed change set, commit the relevant files and push them to the GitHub repository unless the user explicitly says not to.
- Keep commits scoped to the task. Do not include unrelated files.

## 마크다운 파일 기술 정책
- 가급적 모든 .md 파일은 100줄을 넘지 않도록 한다.
