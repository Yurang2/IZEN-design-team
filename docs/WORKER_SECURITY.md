# Worker Security Hardening Guide

## What changed

The Worker API now enforces secure defaults:

- Password-based login endpoint (`POST /api/auth/login`)
- Session cookie auth (HttpOnly cookie) for all protected API routes
- Optional server-to-server `X-API-Key` auth (if `API_KEY` is configured)
- Strict CORS allowlist from `ALLOWED_ORIGINS`
- Security headers on all responses
- `Cache-Control: no-store` on sensitive API paths (`/tasks`, `/tasks/:id`, `/projects`, `/meta`)
- Basic in-memory per-IP burst throttle (429)
- `/meta` is no longer publicly readable because protected routes require auth

## Required env vars

- `PAGE_PASSWORD` (required): page password used by `POST /api/auth/login`

## Optional env vars

- `SESSION_SECRET` (recommended): cookie signing secret (fallback: `PAGE_PASSWORD`)
- `SESSION_TTL_SECONDS` (default: `43200`, 12h)
- `API_KEY` (optional): for server-to-server requests via `X-API-Key`
- `AUTH_DISABLED` (default: `false`): if `true`, disables page-password/session enforcement (temporary use only)
- `ALLOWED_ORIGINS` (recommended): comma-separated exact browser origins
- `RATE_LIMIT_WINDOW_SECONDS` (default: `10`)
- `RATE_LIMIT_MAX_REQUESTS` (default: `180`)
- `RATE_LIMIT_BLOCK_SECONDS` (default: `30`)
- `REQUIRE_CF_ACCESS` (default: `false`)
- `ALLOWED_ACCESS_EMAILS` (optional CSV when `REQUIRE_CF_ACCESS=true`)

## How to set PAGE_PASSWORD

### Recommended: secret (production)

```bash
npx wrangler secret put PAGE_PASSWORD --config worker/wrangler.toml
```

Then enter your value (example: `izenjsk_62988`).

### Possible but not recommended: plain text variable

You can set plain text in `wrangler.toml` `[vars]`:

```toml
[vars]
PAGE_PASSWORD = "izenjsk_62988"
```

This works technically, but is less secure because plain text values are easier to leak and may be committed by mistake.

## Cloudflare Dashboard setup

Worker > Settings > Variables and Secrets:

- Add `PAGE_PASSWORD`
  - Type: `Secret` (recommended)
  - Type: `Text` is possible, but less secure
- Add `SESSION_SECRET` (recommended)
- Add `ALLOWED_ORIGINS`
  - Example: `https://your-pages-domain.pages.dev,https://your-custom-domain.com`
  - Wildcard subdomain is supported with `*.` notation, e.g. `https://*.izen-design-team.pages.dev`
- Tune rate-limit vars only if needed

## Local development note

If `ALLOWED_ORIGINS` is empty, only localhost origins are allowed by default.
This keeps local development usable while being safe by default.
