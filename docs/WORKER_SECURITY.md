# Worker Security Hardening Guide

## What changed

The Worker API now enforces secure defaults:

- Authentication required for all API endpoints (`X-API-Key`)
- Strict CORS allowlist from `ALLOWED_ORIGINS`
- Security headers on all responses
- `Cache-Control: no-store` on sensitive API paths (`/tasks`, `/tasks/:id`, `/projects`, `/meta`)
- Basic in-memory per-IP burst throttle (429)
- `/meta` is no longer publicly readable because auth is required globally

## Required env vars

- `API_KEY` (required): shared API key sent via `X-API-Key`
- `ALLOWED_ORIGINS` (recommended): comma-separated exact origins for browsers

## Optional env vars

- `RATE_LIMIT_WINDOW_SECONDS` (default: `10`)
- `RATE_LIMIT_MAX_REQUESTS` (default: `180`)
- `RATE_LIMIT_BLOCK_SECONDS` (default: `30`)
- `REQUIRE_CF_ACCESS` (default: `false`)
- `ALLOWED_ACCESS_EMAILS` (optional CSV when `REQUIRE_CF_ACCESS=true`)

## How to set API_KEY

### Recommended: secret (do this in production)

```bash
npx wrangler secret put API_KEY --config worker/wrangler.toml
```

Then enter your key value when prompted.

### Possible but not recommended: plain text variable

You can set it as plain text in `wrangler.toml` `[vars]`, for example:

```toml
[vars]
API_KEY = "izenjsk_62988"
```

This is technically supported, but unsafe because plain text vars are easier to leak and may end up in source control.

## Cloudflare Dashboard setup

Worker > Settings > Variables and Secrets:

- Add `API_KEY`
  - Type: `Secret` (recommended)
  - Type: `Text` works but is less secure
- Add `ALLOWED_ORIGINS`
  - Example: `https://your-pages-domain.pages.dev,https://your-custom-domain.com`
- Add rate-limit vars only if you need to tune defaults.

## Local development note

If `ALLOWED_ORIGINS` is empty, only localhost origins are allowed by default.
This keeps local development usable while being safe by default.
