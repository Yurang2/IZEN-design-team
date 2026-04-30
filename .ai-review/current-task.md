# Current Task

## Task ID
ai-review-board-bootstrap

## Goal
Introduce a reusable review-board protocol so main agents can develop features while ephemeral role reviewers gate progress by unanimous approval.

## Scope
- Create `.ai-review/` memory files.
- Use MD summaries for humans and JSONL logs for structured review records.
- Share the `role-review-board` skill with other Hermes profiles where possible.

## Files/areas touched
- `.ai-review/*`
- Hermes skill: `role-review-board`

## Success criteria
- Future agents can read `.ai-review` context and run role-based subagent reviews.
- Reviewer decisions and rejections can be accumulated across sessions.
- User receives only short progress reports by default.

## Required reviewers
- ux
- tech
- product
- qa
- user-advocate
- design-brand

## Conditional reviewers
- security-privacy: when auth, personal data, files, notifications, integrations, or permissions are touched
- ops-deployment: when cron, bots, Workers, deploys, migrations, or background jobs are touched
