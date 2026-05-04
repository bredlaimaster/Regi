# Playwright MCP testing for Regi

End-to-end testing of the Regi web app via [Playwright MCP](https://github.com/microsoft/playwright-mcp), with automated bug logging into Settings → Support.

## What this gets you

- A real browser driving the live app, controlled by Claude Code from the terminal.
- Bugs logged automatically into the in-app tracker — searchable by you and your team alongside manually-reported bugs.
- Same flow works against local dev (`http://localhost:3000`) and prod (`http://WebLoadBalancer-tbaambtx-...`).

## Architecture

```
┌──────────────┐    Playwright MCP     ┌──────────────┐
│  Claude Code │ ────────────────────▶ │   Browser    │
│   (CLI)      │                       │  (Chromium)  │
└──────┬───────┘                       └──────┬───────┘
       │                                      │
       │ POST /api/bug-reports                │ navigate / click / type
       │ Bearer <BUG_REPORT_API_TOKEN>        │
       ▼                                      ▼
┌──────────────────────────────────────────────────┐
│              Regi (prod or local)                │
│  ┌────────────────────┐  ┌────────────────────┐  │
│  │ /api/bug-reports   │  │  /settings/support │  │
│  │  (token-gated)     │  │   (UI form)        │  │
│  └─────────┬──────────┘  └─────────┬──────────┘  │
│            └─────────────┬─────────┘             │
│                          ▼                       │
│              Postgres (BugReport)                │
└──────────────────────────────────────────────────┘
```

Two ways to log a bug:

1. **API path** — Playwright detects an issue, Claude POSTs to `/api/bug-reports` with the bearer token. Fast, machine-friendly.
2. **UI path** — Claude drives the browser to `Settings → Support`, opens the dialog, fills it in, submits. Slower but dogfoods the same form a human uses.

You can use either or both.

## Install Playwright MCP into Claude Code

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

This adds the server to `~/.claude.json`. Restart any active Claude session (the new tools register on next start).

To verify, in a Claude session run `/mcp` — `playwright` should appear with tools like `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`.

## Configure the bug-report token

The token is already wired up in this repo:

- **Local:** `BUG_REPORT_API_TOKEN` in `.env` (used when running `npm run dev`).
- **Prod:** baked into the ECS task definition via `sst.config.ts`.

Export it into your shell so Claude can `curl` against it without a password prompt every time:

```bash
export BUG_REPORT_API_TOKEN="$(grep BUG_REPORT_API_TOKEN /Users/barnie/Claude\ AI\ /Regi/.env | cut -d'"' -f2)"
```

Add that line to `~/.zshrc` to persist.

To rotate: regenerate (`openssl rand -hex 32`), update `.env`, update `sst.config.ts`, redeploy the ECS task definition.

## First test — verify the connection

Health-check the token:

```bash
PROD_URL="http://WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com"
curl -s -H "Authorization: Bearer $BUG_REPORT_API_TOKEN" "$PROD_URL/api/bug-reports"
# → {"ok":true,"message":"Token valid"}
```

Log a bug end-to-end:

```bash
curl -s -X POST "$PROD_URL/api/bug-reports" \
  -H "Authorization: Bearer $BUG_REPORT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Smoke test from Playwright MCP setup",
    "affectedAreas": ["other"],
    "reporter": "playwright"
  }'
# → {"ok":true,"id":"...","createdAt":"...","url":"/settings/support"}
```

Navigate to **Settings → Support** in the UI — the bug shows up in the Open list.

## Sample test prompts for Claude Code

Once Playwright MCP is connected, prompt Claude with task descriptions. Real ones for Regi:

### Login + role gating

> Test the login flow against http://WebLoadBalancer-tbaambtx-... — open it, log in as `owner@regionalhealth.co.nz`, confirm the sidebar shows all 11 nav items. If any are missing, log a bug via the API.

### PO form auto-fill

> On the prod URL, sign in, go to Purchase Orders → New, pick a supplier whose currency is set to USD in the supplier record. Verify the Currency field auto-snaps to USD. If it stays on NZD, log a bug under "purchase-orders" describing exactly what supplier you picked and what you saw.

### Multi-image upload

> Go to a product detail page, switch to the Images tab, upload three small JPEG images. Verify they all appear, the first one has a green ★ Primary badge, and clicking ★ Primary on a non-primary image promotes it. If anything fails to save or display, log a bug under "products" with reporter "playwright" and a description of the exact failure.

### Settings → Support dogfood

> Sign in. Go to Settings → Support. Click "New bug". Fill description "Test from Playwright UI dogfood", tick the "settings" box, and submit. Verify the bug appears in the Open list. Toggle its checkbox to mark solved, then verify it moves to the Solved filter.

## API reference

### `POST /api/bug-reports`

**Auth:** `Authorization: Bearer <BUG_REPORT_API_TOKEN>`

**Body** (JSON):

| field | type | required | notes |
|---|---|:---:|---|
| `description` | string | ✓ | 1–5000 chars, trimmed |
| `affectedAreas` | string[] | | Subset of canonical keys (see below). Empty = unset. |
| `driveLink` | string \| null | | Valid URL when present, max 2048 chars. Empty string OK. |
| `reporter` | string \| null | | Free text, max 120 chars |

**Canonical area keys:** `dashboard`, `products`, `inventory`, `purchase-orders`, `sales-orders`, `proforma`, `reservations`, `suppliers`, `customers`, `reports`, `settings`, `mobile`, `qbo-sync`, `auth`, `other`.

**Responses:**

- `201` — `{ ok: true, id, createdAt, url: "/settings/support" }`
- `400` — `{ ok: false, error: "Invalid payload", fieldErrors }`
- `401` — `{ ok: false, error: "Unauthorized" }` (missing or wrong token)
- `500` — `{ ok: false, error: "Server not configured" }` (token env unset)

### `GET /api/bug-reports`

Token-only health check. Returns `{ ok: true, message: "Token valid" }` when the token matches.

## Best practices

- **One bug, one POST.** Don't batch multiple unrelated symptoms into a single description — the affected-areas tickboxes work better as a per-bug filter.
- **Include reproduction steps.** Description supports newlines; structure as `Steps:`/`Expected:`/`Actual:`. Attach screenshots/recordings to a Drive folder and put the URL in `driveLink`.
- **Use `reporter` consistently.** `"playwright"` for automated runs, your name for hand-tested ones — makes filtering by source easy later.
- **Don't log infra noise as bugs.** A 502 from the ALB or a Postgres timeout isn't a Regi bug; it's a deploy or DB issue. The tracker is for app-level defects.
- **Toggle solved fast.** When a fix lands, mark the bug solved with the in-app tickbox. The Open filter stays clean and the next session knows what's still real.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 "Unauthorized" | Token missing or wrong | Re-export `BUG_REPORT_API_TOKEN`. Check `.env` and `sst.config.ts` agree. |
| 401 with the right token | Old image deployed before token wired up | Redeploy the task definition revision that includes `BUG_REPORT_API_TOKEN`. |
| 500 "Server not configured" | Env var not in the live ECS task | Re-register task def with the env var; force a new deployment. |
| 307 → /login | Route not in `middleware.ts` PUBLIC_PATHS | Add `/api/bug-reports` to the allowlist; redeploy. |
| 400 "Invalid payload" → `affectedAreas` | Used a free-text label instead of the canonical key | Use slugs from `lib/bug-areas.ts` (e.g. `purchase-orders`, not `Purchase Orders`). |
| Playwright MCP tools missing in `/mcp` | Server not registered or session not restarted | Re-run `claude mcp add playwright -- npx @playwright/mcp@latest`, restart Claude. |

## Files added by this integration

- `app/api/bug-reports/route.ts` — token-gated POST endpoint + GET health check.
- `middleware.ts` — adds `/api/bug-reports` to PUBLIC_PATHS.
- `.env` + `sst.config.ts` — `BUG_REPORT_API_TOKEN` wiring.
- `__tests__/api/bug-reports.test.ts` — pin tests for auth + tenant + Zod.
- `__tests__/auth/rbac-matrix.test.ts` — extended to cover the new public-with-own-auth route.
- `docs/playwright-mcp-testing.html` — designed visual version of this doc.
- `docs/playwright-mcp-testing.md` — this file.
