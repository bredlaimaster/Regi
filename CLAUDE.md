# CLAUDE.md — Regional Software / NZ Inventory

Handoff notes for any Claude session that opens this repo. Keep this file
short and high-signal; don't dump full transcripts here.

## What this is

Internal inventory + light-ERP web app for **one** client (Regional Health Ltd,
NZ). Multi-tenant in the schema (`tenantId` everywhere) but in practice a
single tenant. Don't add features for "other tenants" — this codebase is
optimised for one NZ business.

**Stack:** Next.js 15.5.x App Router · React 19 · Server Actions · Prisma ·
PostgreSQL · iron-session + bcryptjs · Tailwind · shadcn/ui · Sonner toasts.
**Deploy:** SST → AWS ECS Fargate (arm64) + RDS Postgres + ALB (HTTP, no TLS).
**Region:** `ap-southeast-2`.

## Production endpoints / IDs

| Thing | Value |
|---|---|
| App URL | `http://WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com` |
| Health check | `/api/health` |
| ECS cluster | `nz-inventory-prod-ClusterCluster-urmnhshn` |
| ECS service | `Web` |
| ECR repo | `186048966327.dkr.ecr.ap-southeast-2.amazonaws.com/nz-inventory:latest` |
| AWS account | `186048966327` |
| ALB DNS | `WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com` |

`APP_URL` env var (set in `sst.config.ts`) is the source of truth — derives
the cookie `Secure` flag (HTTP → false, HTTPS → true). The ALB is HTTP only;
flipping `Secure=true` will silently drop the session cookie.

## Auth model

- **iron-session v8** + **bcryptjs**. Cookie name: `nz_inv_session`.
- `SESSION_SECRET` env var (≥32 chars). Configured in `sst.config.ts`.
  `lib/session.ts` is lazy and tolerant during `NEXT_PHASE=phase-production-build`
  so static-page generation doesn't crash without a real secret.
- `middleware.ts` only checks **cookie presence** — full unseal happens in
  `requireSession`/`requireRole` (`lib/auth.ts`). Don't add iron-session
  unsealing inside middleware; the `NextRequest.cookies` ↔ iron-session
  `CookieStore` shapes don't match cleanly.
- **Three roles:** `ADMIN`, `SALES`, `WAREHOUSE` (Prisma `Role` enum).
- **Owner bootstrap:** `prisma/set-owner-password.ts` — one-off script,
  `OWNER_EMAIL` + `OWNER_PASSWORD` env, hashes with bcrypt and inserts/updates.
- **No Supabase, no NextAuth, no OAuth.** Closed system, password only.

## Schema enums (Prisma)

```
Role:     ADMIN | SALES | WAREHOUSE
POStatus: DRAFT | ORDERED | RECEIVED | CANCELLED
SOStatus: DRAFT | CONFIRMED | PICKED | SHIPPED | CANCELLED
TaxRule:  GST15 | ZERO | IMPORT_GST | EXEMPT
```

`TaxRule` is shared across `Customer` and `Supplier`. **Customers must not be
offered `IMPORT_GST`** — that's an expense-side concept only (already
enforced in `customer-detail-tabs.tsx`).

## NZ tax + QuickBooks integration

This is the most subtle part of the system. Read this before touching
anything in `lib/quickbooks/` or `app/(app)/settings/tax/`.

### Conventions

- **All prices stored ex-GST in NZD.** No exceptions on the sell side.
- **All bills/invoices push to QBO with `GlobalTaxCalculation: "TaxExcluded"`** —
  QBO calculates GST itself from the per-line tax code. Don't hand-calculate
  tax and put it in `TxnTaxDetail` (that was the original 6000 validation
  bug — it forced GST to zero).
- **Resolve QBO TaxCode by name, not ID.** IDs vary across QBO files; names
  are stable enough. Use `lib/quickbooks/tax-codes.ts` — it has fallback
  chains so older NZ files (`GST Free Income`) and newer ones (`Zero Rated`)
  both work.

### Canonical mapping

Income side (Customer → Invoice):

| App rule | Preferred | Fallbacks |
|---|---|---|
| `GST15` | `GST on Income` | — |
| `ZERO` | `Zero Rated` | `GST Free Income`, `Zero Rated Income` |
| `EXEMPT` | `Out of Scope` | `Exempt Income`, `No GST` |

Expense side (Supplier → Bill):

| App rule | Preferred | Fallbacks |
|---|---|---|
| `GST15` | `GST on Expenses` | — |
| `ZERO` | `Zero Rated Expenses` | `GST Free Expenses` |
| `IMPORT_GST` | `Zero Rated Expenses` | `GST Free Expenses` |
| `EXEMPT` | `Out of Scope` | `Exempt Expenses`, `No GST` |

Receive-charge lines (per-line based on the charge's own rate):

| Rate | Code |
|---|---|
| ≥ 15% | `GST on Expenses` |
| 0% | `Zero Rated Expenses` → `GST Free Expenses` |

### Sync pipeline

- `lib/quickbooks/sync.ts` — `pushInvoice`, `pushBill`, plus the resolver
  glue. Cached per-tenant TaxCode lookup via in-process `Map`.
- `actions/qbo.ts` — `runFullQboSync()` server action: enqueues all SOs
  missing `qboInvoiceId` + all POs missing `qboBillId`, then drains the queue
  via `processQboSyncJobs` (capped at 20 passes, breaks on no forward
  progress). `listQboTaxCodes()` powers the live status column on
  Settings → Tax.
- `app/(app)/settings/quickbooks/sync-button.tsx` — the user-facing
  "Sync all to QuickBooks" button. ADMIN-only.
- **The QBO Realm + tokens** live in `QboConnection` (per tenant). Connect
  via `/api/qbo/connect` (OAuth callback at `/api/qbo/callback`, public route
  in middleware allowlist).

## Build / deploy / verify cycle

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. ECR login + arm64 build & push (single command, takes a few min)
aws ecr get-login-password --region ap-southeast-2 \
  | docker login --username AWS --password-stdin \
      186048966327.dkr.ecr.ap-southeast-2.amazonaws.com
docker buildx build --platform linux/arm64 \
  -t 186048966327.dkr.ecr.ap-southeast-2.amazonaws.com/nz-inventory:latest \
  --push .

# 3. Force a new ECS deployment (picks up :latest)
aws ecs update-service \
  --cluster nz-inventory-prod-ClusterCluster-urmnhshn \
  --service Web \
  --force-new-deployment \
  --region ap-southeast-2

# 4. Watch rollout (poll until rolloutState=COMPLETED)
aws ecs describe-services \
  --cluster nz-inventory-prod-ClusterCluster-urmnhshn \
  --services Web \
  --region ap-southeast-2 \
  --query 'services[0].deployments[?status==`PRIMARY`].rolloutState'

# 5. Verify
curl -s -o /dev/null -w "%{http_code}\n" \
  http://WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com/api/health
```

**Build platform must be arm64.** Fargate task is arm64; an amd64 image
will boot-loop with `exec format error`.

The `Dockerfile` `CMD` runs `npx prisma db push --skip-generate
--accept-data-loss` on startup before `next start` — schema changes apply
automatically when a new task launches. If you add a destructive migration,
think hard about that flag.

## Routes overview (you usually don't need to read all of these)

```
app/
├── (app)/                  # Authenticated app shell
│   ├── layout.tsx          # Sidebar + topbar
│   ├── page.tsx            # Dashboard
│   ├── products/           # List + detail + new (with Pricing, Image tabs)
│   ├── inventory/          # Stock levels by product
│   ├── purchase-orders/    # List + new + [id] (with partial-receive form)
│   ├── sales-orders/       # List + new + [id] (with pick + ship)
│   ├── proforma/           # Proforma invoices
│   ├── reservations/       # Stock holds
│   ├── suppliers/, customers/
│   ├── reports/            # Margin, sales-by-X, stock-on-hand, etc.
│   └── settings/
│       ├── tax/            # NZ → QBO tax-code mapping (live)
│       ├── quickbooks/     # Connection + Sync All button
│       ├── users/, audit/, budgets/, dimensions/, price-groups/, reports/
├── login/                  # Public
├── mobile/                 # Mobile barcode scanner — pick + receive flows
├── api/
│   ├── qbo/connect, qbo/callback     # OAuth (callback is public)
│   ├── health                         # Public ALB health check
│   ├── cron/...                       # Scheduled tasks (public)
│   └── reports/(pdf|xlsx)/...         # Generated downloads
└── middleware.ts            # Cookie-presence gate, public-path allowlist
```

Public paths in middleware: `/login`, `/api/qbo/callback`, `/api/cron`,
`/api/health`. Add new public paths there if needed.

## Coding conventions

These reflect actual decisions made in past sessions, not abstract advice.

- **Surgical edits.** Don't reformat or "improve" adjacent code in a PR
  about something else. The user explicitly values this.
- **Server Actions for mutations.** Use `"use server"` and return
  `ActionResult<T>` (`{ ok: true, data } | { ok: false, error }`). Client
  components call them inside `useTransition`.
- **`requireRole(["ADMIN"])`** at the top of any admin-only action or page
  loader. `requireSession` for general authed pages.
- **Currency.** Source PO amounts stored in supplier currency; `fxRate` +
  `fxRateDate` snapshotted at PO creation. NZD-equivalent stored alongside
  (`*Nzd` suffix). All sell-side amounts are NZD only.
- **No emojis in committed files** unless the user explicitly asks.
- **No new `*.md` docs unless requested.** This file (CLAUDE.md), the
  testing guide HTML, and the architecture analysis were all asked for.
- **Don't skip hooks** (`--no-verify`, etc.) on commits or pushes. If a
  pre-commit hook fails, fix the cause and create a new commit, don't
  amend the previous one.
- **`git add` specific files**, never `git add -A`. There's almost always
  unrelated dirty work in the tree.

## Recent significant changes (2026-04)

These haven't been pushed to main yet — there's pending work in the tree
when you arrive. Check `git status` and `git diff --stat HEAD` to see what.

1. **Auth rewrite** (commit `aae8ca9`). Replaced Supabase with iron-session +
   bcryptjs. Cookie `Secure` flag now derived from `APP_URL` scheme. Owner
   bootstrap via `prisma/set-owner-password.ts`.
2. **QBO sync button + GST fix** (commit `d4ea878`). Added `runFullQboSync`
   server action, button on Settings → QuickBooks. Fixed 6000 validation by
   using NZ tax codes via name lookup instead of hardcoded `"NON"` and
   removing `TxnTaxDetail: { TotalTax: 0 }`.
3. **NZ tax model overhaul** (uncommitted, deployed). Created
   `lib/quickbooks/tax-codes.ts` with canonical income/expense mappings and
   fallback chains. Settings → Tax page now shows live "in your QBO file"
   status per mapping. `pushInvoice` and `pushBill` now use the resolver +
   `GlobalTaxCalculation: "TaxExcluded"`.
4. **Tester guide** (uncommitted). `docs/tester-guide.html` — friendly
   testing walkthrough for the user's 14-year-old son. CSS-mocked
   screenshots, eight missions covering all major flows, bug-log template.

## Known issues / unfixed bugs

These were discovered during the 2026-04 sessions and **deliberately left
unfixed** at user direction. Don't fix them without asking.

1. **Simple "Receive into stock" button over-receives.** In
   `actions/purchase-orders.ts`, `receivePurchaseOrder` increments stock by
   `line.qtyOrdered` even if a partial receive already happened. If user
   does partial-then-simple, stock is double-counted on the partial portion.
2. **Simple "Receive into stock" ignores `po.receiveCharges`.** Only PO
   header `freight` factors into landed cost in this path. Customs/handling
   keyed via the partial-receive form never get allocated when the simple
   button finishes the PO.
3. **Clearing freight field on follow-up partial receive zeroes it.**
   `parseFloat("") || 0 = 0`, then `freightOverride: 0` overwrites
   `po.freight = 0` on the header.
4. **Supplier costings tab shows current rolling average, not historical
   landed.** `app/(app)/suppliers/[id]/page.tsx` line 59 reads
   `t.product.costNzd` (current) for every historical PO_RECEIPT row. Should
   read from `Batch.costNzd` (already stored per-receipt).
5. **No automated tests for landed-cost math.** Only test file is
   `__tests__/lib/constants.test.ts`. Anything touching the receive paths is
   verified by hand.

## When you start a session, do this first

1. `git status` and `git diff --stat HEAD` — there's almost always pending
   work.
2. `git log --oneline -10` — see what shipped recently.
3. If anything in the deploy pipeline is involved, do a typecheck before
   building (`npx tsc --noEmit`) — Docker build is slow and a TS error costs
   minutes.
4. If the user mentions a specific page or flow, the route layout above
   tells you where to look without grepping.
