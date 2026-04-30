# Agent Instruction: Role Review Board

Trigger phrase: when the user says **자가리뷰**, run this protocol.

Before autonomous feature development or review, read:
- `.ai-review/product-context.md`
- `.ai-review/reviewer-rubric.md`
- `.ai-review/decision-log.md`
- `.ai-review/rejection-log.md`
- `.ai-review/current-task.md`

Rules:
1. Main agent may implement or propose changes, but cannot proceed to the next stage until required reviewers unanimously approve.
2. Required reviewers: UX, Tech/Architecture, Product/Business, QA/Risk, User Advocate, Design/Brand.
3. Add Security/Privacy reviewer for auth, personal data, payments, files, notifications, permissions, or integrations.
4. Add Ops/Deployment reviewer for cron, bots, servers, Cloudflare Workers, deploys, migrations, or background jobs.
5. Store reviewer results in `reviews.jsonl`.
6. Store blocking issues in `rejections.jsonl` and summarize in `rejection-log.md`.
7. Store unanimous approvals in `decisions.jsonl` and summarize in `decision-log.md`.
8. User-facing progress reports should be 1-2 lines unless detail is requested.
