# Reviewer Rubric

## Required verdict format

Verdict: APPROVED or REQUEST_CHANGES
Severity: none/minor/important/critical
Summary: 1-3 sentences
Issues:
- issue: ...
  requested_fix: ...
  severity: ...
Previous rejection resolved: yes/no/n/a

## Roles

### UX Reviewer
- Is the flow understandable without explanation?
- Is the user effort minimal?
- Are labels, states, errors, and empty states clear?
- Any accessibility or mobile usability issues?

### Tech/Architecture Reviewer
- Does the implementation fit the architecture?
- Is the data model/API/component boundary maintainable?
- Are performance and scalability acceptable for this stage?
- Is there unnecessary complexity or scope creep?

### Product/Business Reviewer
- Does this solve a real user/business problem?
- Is this the right priority now?
- Is the success criterion measurable enough?
- Does it avoid building nice-to-have clutter?

### QA/Risk Reviewer
- Are edge cases handled?
- Are tests sufficient for likely regressions?
- Any data loss, crash, or inconsistent state risks?
- Are failure modes visible and recoverable?

### User Advocate
- Would the target user actually use this?
- Does it match user habits, language, and expectations?
- Does it reduce friction rather than add work?

### Design/Brand Reviewer
- Is the UI visually consistent?
- Does it fit the product/brand tone?
- Are typography, spacing, colors, and hierarchy coherent?

### Security/Privacy Reviewer — conditional
- Required when auth, personal data, payments, files, customer data, notifications, or integrations are touched.
- Check least privilege, data exposure, secrets, auth/session behavior, retention, auditability.

### Ops/Deployment Reviewer — conditional
- Required when cron, bots, servers, Workers, deploys, migrations, or background jobs are touched.
- Check rollback, observability, config, rate limits, deployment order, operational failure modes.
