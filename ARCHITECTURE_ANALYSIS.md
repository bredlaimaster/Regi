# NZ Inventory / Regional Health — Architecture Analysis & Rebuild Options

**Author role:** Software designer & systems engineer (senior, 40 years)
**Scope:** Complete feature inventory of the live codebase, five candidate rebuild architectures on AWS / Azure / GCP, comparative analysis, and two detailed rebuild prompts.
**Source of truth:** The actual repository at `/Users/barnie/001 Claude_Cowork/003 Regional Software` (Next.js 15 App Router + Prisma 5.22 + PostgreSQL, currently on AWS ECS Fargate + RDS + ALB via SST/Pulumi).
**Date:** 2026-04-20.

This document is deliberately long, with precise numbers and concrete trade-offs. Skim the Executive Summary and Final Recommendation, then dive into the options that matter to you.

---

## 0. Executive Summary

The app is a **multi-tenant B2B distributor ERP** for a New Zealand health-products company. It is approximately **45 pages**, **118 server actions** across 15 action files, **15 distinct reports** (CSV/XLSX/PDF), **30+ Prisma models**, **4 daily cron jobs** pinned to NZT, and a **QuickBooks Online** integration with AES-256-GCM-encrypted refresh tokens. Traffic is small (low tens of users), but report generation is CPU-heavy and transactional writes (inventory moves, reservations, landed-cost allocation) must be correct.

The current deployment works but has three material problems:

1. **ALB is HTTP only**, not HTTPS. Cookies, passwords, and QBO OAuth tokens traverse the public internet unencrypted. This is the single biggest risk.
2. **Cron jobs are declared in `vercel.json`** but the app is not on Vercel — the crons never fire in production. Daily FX refresh, low-stock alerts, QBO sync, and scheduled reports do not run.
3. **Secrets live in plain ECS task-definition env vars** (SESSION_SECRET, QBO credentials, DATABASE_URL). A team member with `ecs:DescribeTaskDefinition` can read every secret.

Before recommending a rebuild, I note these three issues can all be fixed in a ~1-week incremental pass on the current stack. A rebuild is only justified if we also want **lower TCO**, **better cold-start economics**, **cleaner separation of concerns**, or **a different cloud for procurement reasons**.

**Final recommendation: rebuild on one of two targets.**

- **Option A (strongest all-round): AWS Refined — ECS Fargate + HTTPS ALB + RDS + EventBridge Scheduler + Secrets Manager + S3.** Low migration cost, retains existing SST/Pulumi IaC, closes the three production gaps, preserves Next.js server actions, cost ~$95/month.
- **Option B (strongest on TCO): GCP Cloud Run + Cloud SQL + Cloud Scheduler + Secret Manager + Cloud Storage.** Scale-to-zero economics, simplest operator model, managed HTTPS out of the box, cost ~$55/month with baseline traffic, ~$20/month if usage is genuinely sparse.

The two rebuild prompts are in Sections 6 and 7 and are ready to hand to a fresh development team.

---

## 1. Complete Feature & Functionality Inventory

This section lists every feature that exists in the codebase today, grouped for clarity. It is grounded in the actual files — `app/`, `actions/`, `lib/`, `prisma/schema.prisma`, `app/api/` — not marketing text.

### 1.1 Identity, Access, and Multi-Tenancy

- **Authentication:** `iron-session` v8 cookie sessions, password hashed with `bcryptjs` rounds=10, seal verified server-side in `lib/auth.ts :: requireSession()`. Cookie name `nz_inv_session`, HttpOnly, SameSite=Lax, 30-day TTL, `Secure` flag auto-enabled only when `APP_URL` begins with `https://`.
- **Login flow:** `/login` email + password form → server action `signInAction` → lookup by email, bcrypt compare, set session userId, redirect to `/`. No email verification, no password reset email, no rate limiting on login attempts.
- **Bootstrap:** `prisma/set-owner-password.ts` — idempotent script, creates or rotates the initial ADMIN user; takes `OWNER_EMAIL`, `OWNER_PASSWORD`, optional `OWNER_TENANT_ID`, `DATABASE_URL` from env.
- **Middleware gate:** `middleware.ts` — cheap cookie-presence redirect to `/login`; public paths are `/login`, `/api/qbo/callback`, `/api/cron`, `/api/health`. `DEV_AUTH_BYPASS=true` skips auth entirely for local dev.
- **Role model:** enum `Role { ADMIN | MANAGER | STAFF | VIEWER }` on the `User` row; `requireRole()` helper in `lib/auth.ts`.
- **User management:** `/settings/users` lists users with status badges; server actions `createUser`, `setUserPassword`, `updateUserRole`, `deleteUser` in `actions/users.ts`.
- **Multi-tenancy:** every domain row has a `tenantId` FK to `Tenant`. `requireSession()` loads the user and exposes `tenantId`; all queries in server actions filter by it. There is no row-level-security in Postgres — tenant isolation is enforced purely in application code.

### 1.2 Catalog: Products, Pricing, Dimensions

- **Products:** full CRUD at `/products`, `/products/new`, `/products/[id]`. Fields include SKU, name, description, cost, reorder point, reorder quantity, dimensions (length × width × height cm), weight, brand, channel, territory, image (via Supabase Storage).
- **Brands / Channels / Territories:** three classification axes managed at `/settings/dimensions`; used for filtering, reporting, and price-group scoping.
- **Price Groups:** 4 seeded groups (Retail, Wholesale, Trade, VIP); managed at `/settings/price-groups`. Each customer is assigned one group.
- **Product Prices:** `ProductPrice` joins `Product × PriceGroup` with NZD price + effective date. Viewed per product on `/products/[id]`; bulk-edited via the price-group detail page.
- **Stock levels:** `StockLevel` is per-product with `qtyOnHand`, `qtyReserved`, `qtyIncoming`. Computed columns `qtyAvailable` = on-hand − reserved and `qtyFree` = available + incoming surface throughout the UI.

### 1.3 Inventory Movement

- **Transactions:** `InventoryTransaction` ledger table records every movement (`RECEIVE`, `SHIP`, `ADJUST`, `TRANSFER`, `RESERVE`, `RELEASE`). Each row carries productId, qty (signed), userId, reason text, timestamp, optional reference (PO/SO id).
- **Batches:** `Batch` table for products flagged `batchTracked`. Fields: batch code, qty, expiry date, receivedAt. Used by `/reports/expiry-tracker` and the product detail "Batches" tab.
- **Adjustment UI:** `/inventory` page — product search, quantity delta, reason. Creates an `ADJUST` InventoryTransaction atomically with the StockLevel update.
- **Stock by product:** `/products/[id]` tabs include Levels, Transactions, Batches, Pricing, Sales History.

### 1.4 Purchasing

- **Purchase Orders:** full lifecycle at `/purchase-orders` (list), `/purchase-orders/new`, `/purchase-orders/[id]`. Statuses: `DRAFT → SUBMITTED → PARTIAL → RECEIVED → CLOSED → CANCELLED`.
- **Lines:** many `PurchaseOrderLine` rows per PO — product, qtyOrdered, qtyReceived, unitCostForeign, unitCostNzd.
- **Foreign currency:** PO header stores `currency`, `fxRate`, `fxRateDate`. Incoming stock is costed in NZD at receipt time using the rate captured on the PO.
- **Landed cost:** `PoReceiveCharge` table holds freight, duty, insurance, other charges per receipt. `lib/inventory.ts` allocates these across lines by value or volume (selectable) and rolls the allocated cost into the receipt's NZD unit cost.
- **Receive flow:** action `receivePo` writes RECEIVE InventoryTransactions, increments StockLevels, decrements `qtyIncoming`, updates line `qtyReceived`, and transitions status based on completion.
- **Supplier ETA view:** `/reports/supplier-eta` shows incoming POs and ETA dates.
- **PO CSV export:** `/api/purchase-orders/[id]/csv` returns the PO in CSV form for the supplier.

### 1.5 Sales

- **Customers:** `/customers` list, `/customers/new`, `/customers/[id]`. Fields: name, GST number, billing + shipping addresses, payment terms, price group, credit limit, contact list, notes.
- **Customer contacts:** `CustomerContact` rows (name, role, email, phone) editable from the detail page.
- **Sales Orders:** `/sales-orders` list, `/sales-orders/new`, `/sales-orders/[id]`. Statuses: `DRAFT → CONFIRMED → PICKING → SHIPPED → INVOICED → CANCELLED`.
- **Lines:** SalesOrderLine — product, qty, unitPrice (derived from the customer's price group at add-time, overridable), discountPct, totalNzd.
- **Reservations:** confirming an SO creates `StockReservation` rows that reduce `qtyAvailable` without touching `qtyOnHand`. `/reservations` page shows the global reservation queue; supports expiry/bulk release.
- **Shipping:** `shipSalesOrder` action decrements `qtyOnHand`, releases reservations, creates SHIP InventoryTransactions, transitions status.
- **Invoicing:** `invoiceSalesOrder` transitions to INVOICED; renders a PDF invoice via `@react-pdf/renderer` at `/api/sales-orders/[id]/invoice`.
- **Packing slip / picking list:** rendered via `lib/pdf.tsx` helpers.
- **SO XLSX export:** `/api/sales-orders/[id]/xlsx`.

### 1.6 Proforma Invoices & Credit Notes

- **Proforma:** `/proforma` list, `/proforma/new`, `/proforma/[id]`. Used for quotes and pre-payment invoices. `ProformaInvoice` + `ProformaInvoiceLine` tables; convertible to a SalesOrder.
- **Credit Notes:** `/credit-notes` list + detail. `CreditNote` + `CreditNoteLine` tables; linked to an originating SalesOrder; reverses inventory on issue (configurable).
- **PDFs:** both proformas and credit notes render as `@react-pdf/renderer` PDFs.

### 1.7 Suppliers

- **Supplier master:** `/suppliers`, `/suppliers/new`, `/suppliers/[id]`. Fields: name, country, lead-time days, default currency, bank details, tax number, notes.
- **Supplier contacts:** `SupplierContact` rows editable per supplier.
- **Supplier performance report:** on-time delivery %, fill rate, and price-stability metrics computed in `lib/reports/supplier.ts`.

### 1.8 Dashboards

- **Root `/`:** KPI tiles (revenue MTD, profit MTD, open POs, open SOs, low-stock count), recent activity feed, plus a stocked-value by brand chart (Recharts).
- **`/reports` overview:** `overview-chart.tsx` — revenue vs cost vs margin trend for the fiscal year.

### 1.9 Reports (15 distinct)

Each report has a dedicated page under `/reports/`, with filters (date range, dimension pickers), an on-page table, and "Download CSV" / "Download XLSX" / sometimes "Download PDF" buttons:

1. `actual-vs-budget` — monthly actual revenue / cost / margin versus `Budget` rows, variance % highlighted red/green.
2. `brand-breakdown` — revenue and margin by brand for a period; stacked bar chart.
3. `channel-trends` — revenue by channel over fiscal-year months.
4. `container-planning` — groups PO lines by supplier container/shipment to help plan cartons.
5. `customer-sales` — per-customer revenue, gross margin, line count; sortable.
6. `customer-trends` — top N customers, month-over-month trajectory.
7. `expiry-tracker` — batches expiring within X months, by product, with current on-hand qty.
8. `monthly-sales` — revenue / cost / margin per month with fiscal-year selector.
9. `overstock` — products where months-on-hand exceeds a configurable threshold (default 6).
10. `reorder-planner` — products at or below reorder point, suggested reorder qty, latest supplier cost.
11. `rep-performance` — revenue and margin by sales rep (user).
12. `stock-on-hand` — current snapshot, valued at latest cost.
13. `stock-turn` — annualised inventory turnover per product or brand.
14. `supplier-eta` — open PO lines and expected arrival dates.
15. `tester-tracker` — products flagged `isTester`, consumption rate, remaining stock.

The underlying compute lives in `lib/reports/`: `margin.ts`, `inventory.ts`, `supplier.ts`, `trends.ts`, plus shared helpers `xlsx.ts` (ExcelJS) and `pdf.tsx` (@react-pdf/renderer).

### 1.10 Settings Area

Eight admin sub-pages at `/settings`:

- `/settings/users` — user CRUD, role management, password reset.
- `/settings/price-groups` — group CRUD + bulk pricing.
- `/settings/dimensions` — brands / channels / territories CRUD.
- `/settings/budgets` — monthly budget targets by period and dimension.
- `/settings/tax` — GST rate, rounding rules.
- `/settings/quickbooks` — connect/disconnect QBO, view sync history.
- `/settings/reports` — manage scheduled-report subscriptions.
- `/settings/audit` — activity log viewer (best-effort; not all actions log).

### 1.11 QuickBooks Online Integration

- **OAuth 2.0 flow:** `/api/qbo/connect` kicks off authorization, `/api/qbo/callback` completes. Refresh token is AES-256-GCM encrypted in `lib/quickbooks/crypto.ts` with a 32-byte key from `QBO_ENCRYPTION_KEY`.
- **Connection state:** `QboConnection` table stores encrypted refresh token, realmId, token expiry, environment (sandbox/production).
- **Sync queue:** `QboSyncJob` table + `lib/quickbooks/sync.ts` orchestrator. Supports pushing invoices, payments, and customer records. 5 retries with exponential backoff.
- **Daily cron:** `/api/cron/qbo-sync` drains the queue once per day (0800 NZT).
- **Client:** `lib/quickbooks/client.ts` wraps the QBO REST API with token auto-refresh.

### 1.12 Cron Jobs (Declared, Currently Not Firing)

Declared in `vercel.json`:

- `/api/cron/qbo-sync` — 0800 NZT daily. Drain QBO sync queue.
- `/api/cron/low-stock` — 1900 NZT daily. Find products below reorder point, email ADMIN_EMAIL via Resend.
- `/api/cron/fx-rates` — 1800 NZT daily. Fetch yesterday's ECB NZD rates from Frankfurter.app, upsert into `ExchangeRate` table.
- `/api/cron/reports` — 0700 NZT daily. Find `ScheduledReport` rows due today, render them, email via Resend, write `ReportDelivery` rows.

These handlers are implemented and functional, but because the app is on AWS ECS (not Vercel), the cron declarations are inert. This is one of the three gaps called out in the Executive Summary.

### 1.13 Imports, Exports, Integrations

- **Exports:** CSV via `lib/csv.ts`, XLSX via `lib/reports/xlsx.ts`, PDF via `lib/pdf.tsx` + `@react-pdf/renderer`.
- **CSV imports:** bulk product import, bulk price import, bulk customer import, all surfaced on their respective list pages.
- **Resend:** email delivery for scheduled reports + low-stock alerts.
- **Frankfurter.app:** free ECB FX rates API (no key); `lib/fx.ts` calls it.
- **Supabase Storage:** `lib/supabase/admin.ts` is still used for product image uploads even though Supabase auth was removed.

### 1.14 Data Model Summary

The schema (`prisma/schema.prisma`, 717 lines) contains these tables, grouped:

- **Tenancy & identity:** `Tenant`, `User`.
- **Catalog:** `Product`, `Brand`, `Channel`, `Territory`, `PriceGroup`, `ProductPrice`.
- **Inventory:** `StockLevel`, `InventoryTransaction`, `Batch`, `StockReservation`.
- **Purchasing:** `Supplier`, `SupplierContact`, `PurchaseOrder`, `PurchaseOrderLine`, `PoReceiveCharge`.
- **Sales:** `Customer`, `CustomerContact`, `SalesOrder`, `SalesOrderLine`.
- **Proforma / Credits:** `ProformaInvoice`, `ProformaInvoiceLine`, `CreditNote`, `CreditNoteLine`.
- **Planning & Reporting:** `Budget`, `ReportSnapshot`, `ScheduledReport`, `ReportDelivery`.
- **External integration:** `QboConnection`, `QboSyncJob`, `ExchangeRate`.

### 1.15 Non-Functional Behaviours

- **Fiscal year:** NZ standard April 1 → March 31. Enforced in all financial reports via `lib/constants.ts`.
- **Timezone:** NZT (Pacific/Auckland). All cron schedules expressed in NZT; all date formatting uses `date-fns-tz`.
- **Currencies:** NZD is the base; POs can be placed in any currency with captured FX rate.
- **Rounding:** GST and totals rounded to 2 dp (cents).
- **Audit-ish log:** best effort via `InventoryTransaction` for stock-impact events; no generic audit log for price changes, user edits, etc.
- **Testing:** Vitest unit tests in `__tests__/lib/` cover `utils`, `currency`, `constants`. Feature coverage is thin.

---

## 2. Current Architecture — Honest Assessment

Before choosing a rebuild target, we score what's actually running today.

### 2.1 Infrastructure Snapshot

- **Region:** `ap-southeast-2` (Sydney) — closest AWS region to NZ.
- **Compute:** ECS Fargate, arm64, 0.25 vCPU / 0.5 GB RAM, desired count 1, min 1 / max 2.
- **Database:** RDS PostgreSQL 16.13, `db.t4g.micro`, 20 GB gp2, publicly accessible (!), single-AZ.
- **Network:** One VPC, public subnets only, no NAT Gateway (saves ~$32/mo), no VPC endpoints.
- **Ingress:** ALB on HTTP:80, target group → Fargate:3000. **No TLS, no HTTPS.**
- **Registry:** ECR with `:latest` tag, mutable, no image signing.
- **IaC:** SST 4.7.1 + `@pulumi/aws` (TypeScript).
- **Build:** Dockerfile, multi-stage, Node 22-slim base, `prisma db push --accept-data-loss` runs on container start.
- **Secrets:** Plain-text env vars in the ECS task definition (SESSION_SECRET, QBO_ENCRYPTION_KEY, DATABASE_URL, etc.).

Approximate monthly cost: **~$60** (Fargate ~$10, RDS ~$13, ALB ~$20, data transfer/storage <$5, ECR storage pennies).

### 2.2 What Works

- **Single codebase, single deployment unit.** Next.js + Prisma on a single container. Easy to reason about.
- **Server Actions + Prisma** is a highly productive combo for CRUD-heavy ERP work. 118 actions across 15 files.
- **Multi-tenant enforcement in code** is consistent — all server actions start with `requireSession()` and scope by `tenantId`.
- **Schema is clean** — 30 models, no circular weirdness, proper indexes on `tenantId`.
- **IaC is already TypeScript.** SST/Pulumi means infra changes are version-controlled and reviewable.
- **arm64 Fargate** is ~20% cheaper than x86 and matches the Apple Silicon dev machine.

### 2.3 What Doesn't Work / High Priority Gaps

1. **HTTP-only ALB.** Passwords and session cookies traverse the internet in the clear. This should be fixed even if you stay on the current stack.
2. **Cron jobs don't fire.** `vercel.json` is ignored by ECS. Daily FX, low-stock, QBO sync, and scheduled reports never run.
3. **Secrets in plain env.** `SESSION_SECRET`, `QBO_ENCRYPTION_KEY`, `DATABASE_URL` sit in the ECS task definition JSON.
4. **Database publicly accessible.** RDS is on a public subnet with a public IP. Only a security-group ingress rule stands between the public internet and the Postgres port.
5. **`prisma db push --accept-data-loss` on every container start.** This works for a demo but is the wrong migration strategy for real data. One bad schema edit + one deploy = dropped column = lost data.
6. **No backups strategy beyond RDS defaults.** No point-in-time-recovery enabled, no snapshot retention policy documented.
7. **No logging or alerting.** No CloudWatch dashboards, no alarms for 5xx rate, no Resend delivery failure handling.
8. **No CI/CD.** Deploy is manual: build image locally, `docker push`, `aws ecs update-service --force-new-deployment`.
9. **Single-AZ RDS.** Zone outage = app is down until AZ recovers.
10. **Single Fargate task minimum.** A container crash loop = full outage until the next one comes up.

### 2.4 What the App Actually Needs

The app profile matters for picking architecture:

- **Low concurrent load** — single-digit users, most of the time.
- **Bursty CPU** — report generation is 100–500 ms of Postgres query + 1–5 s of @react-pdf or ExcelJS rendering.
- **Transactional writes** — inventory moves, reservations, landed-cost allocation must be ACID.
- **Scheduled compute** — four daily crons at fixed times.
- **Data criticality** — this is a business's stock ledger. Losing it loses the business.
- **Single data-centre locality** — all users in NZ or Australia; global CDN not material.
- **Small team** — likely one developer, at most two. Ops overhead must be near zero.

These five shape every recommendation that follows.

---

## 3. The Five Candidate Architectures

Each option is described with **topology**, **specific services**, **what changes from the codebase**, **strengths**, **weaknesses**, and **indicative monthly cost**. Costs are on-demand list-price estimates for the `ap-southeast-2` / `australia-east` / `australia-southeast1` regions with no commitments or reserved capacity.

### Option 1 — AWS Refined (Container + RDS, done properly)

**Topology:** Same shape as today, with every rough edge removed.

```
 Users → Route 53 → CloudFront → ALB (HTTPS, ACM cert)
                                  ↓
                          ECS Fargate (arm64, 0.5 vCPU / 1 GB, min 1 max 3)
                                  ↓
                      RDS PostgreSQL 16 (db.t4g.small, multi-AZ, private subnet)
                                  ↕
                   Secrets Manager     S3 (reports, product images)
                                  ↑
              EventBridge Scheduler → ECS RunTask (crons 4×/day)
```

**Services and changes:**

- **ALB → HTTPS** with ACM-issued cert + Route 53 domain. Terminate TLS at ALB, redirect :80 → :443.
- **RDS** moved to private subnets, publicly-accessible off, multi-AZ, automated backups 7 days, PITR enabled.
- **Secrets Manager** for `SESSION_SECRET`, `QBO_*`, `DATABASE_URL`. ECS task role grants `secretsmanager:GetSecretValue`; container reads via `secrets` block in task definition (automatic env injection).
- **EventBridge Scheduler** creates four cron rules mapped to `ECS RunTask` with a small, separate "cron" task definition that runs `tsx scripts/cron-handler.ts <name>`. Remove `vercel.json`.
- **S3** for scheduled-report artifacts (`s3://…/reports/{tenantId}/{date}/{id}.pdf`), product images (replaces Supabase Storage), and audit attachments. CloudFront in front for signed-URL delivery.
- **Prisma migrations:** replace `prisma db push` on startup with `prisma migrate deploy` + committed migrations in `prisma/migrations/`. Dev uses `prisma migrate dev`.
- **CI/CD:** GitHub Actions → ECR push → `aws ecs update-service`. Image tags `git-<sha>` instead of `:latest`.
- **Observability:** CloudWatch Logs with retention, CloudWatch Alarms on ALB 5xx, ECS CPU/Memory, RDS storage, a minimal dashboard. Resend delivery failures surfaced via their webhook into `ReportDelivery` rows.
- **IaC:** keep SST/Pulumi. Add `aws.cloudfront.Distribution`, `aws.acm.Certificate`, `aws.s3.Bucket`, `aws.secretsmanager.Secret`, `aws.scheduler.Schedule`.

**Strengths:**

- **Smallest migration distance.** The Next.js app itself barely changes; only `lib/storage.ts`, `lib/secrets.ts`, and the cron handler entrypoint are new. Server Actions, Prisma, all domain code is preserved.
- **Retains team know-how.** The developer already knows AWS, SST, Pulumi, Docker.
- **Fixes every known gap** in one release: HTTPS, private DB, managed secrets, real crons, real migrations.
- **Multi-AZ RDS** closes the single-zone outage risk.
- **Still runs on arm64**, so price/performance stays strong.

**Weaknesses:**

- **Always-on Fargate** — pays for idle compute 24/7. Scaling to zero is not possible on Fargate.
- **Four hops** at the edge (Route 53 → CloudFront → ALB → Fargate) add ~30 ms latency. Immaterial for this app.
- **NAT Gateway + VPC endpoints** add ~$35/mo once RDS moves private, since Fargate tasks in private subnets need outbound internet for Resend, Frankfurter, QBO.
- **Operational surface area** — ALB, CloudFront, Route 53, ACM, ECS, ECR, RDS, EventBridge, S3, Secrets Manager, CloudWatch, IAM all need IaC entries.

**Indicative monthly cost:**

| Component                     | Cost    |
|-------------------------------|---------|
| Fargate 0.5 vCPU/1 GB, 1 task | ~$18    |
| ALB                           | ~$22    |
| CloudFront (low traffic)      | ~$1     |
| RDS db.t4g.small multi-AZ, 20 GB gp3 | ~$45 |
| NAT Gateway + data            | ~$35    |
| S3 + storage + requests       | ~$2     |
| EventBridge Scheduler (free tier) | $0  |
| Secrets Manager (~6 secrets)  | ~$3     |
| Route 53 hosted zone          | ~$0.50  |
| CloudWatch logs + alarms      | ~$3     |
| Data transfer out             | ~$2     |
| ACM cert                      | $0      |
| **Total**                     | **~$131** |

If multi-AZ RDS is dropped (single-AZ, accept the zone-outage risk): ~$95/mo.

---

### Option 2 — AWS Serverless (OpenNext + Aurora Serverless v2)

**Topology:** Next.js runs on Lambda; Postgres is Aurora Serverless v2; no always-on compute.

```
 Users → Route 53 → CloudFront → Lambda@URL (OpenNext handler)
                                    ↓
                          RDS Proxy (connection pooling)
                                    ↓
                   Aurora Serverless v2 PostgreSQL (min 0.5 ACU, max 4 ACU)
                                    ↕
                   Secrets Manager     S3 (reports, images)
                                    ↑
              EventBridge Scheduler → Lambda cron handlers
```

**Services and changes:**

- **OpenNext** adapter (`open-next.js.org`) compiles the Next.js app to a Lambda-compatible bundle. Each route runs in Node Lambda (Fluid Compute-style lifecycle not available in AWS without Lambda SnapStart on Java).
- **Aurora Serverless v2** scales compute 0.5 → 4 ACU (Aurora Capacity Units), with per-second billing. Pauses are no longer supported on v2 — minimum 0.5 ACU ≈ $0.06/hr ≈ $43/mo.
- **RDS Proxy** required because Lambda concurrency can fan out to hundreds of connections; Aurora can't handle that natively at small ACUs.
- **Lambda cron handlers** — each of the 4 cron endpoints compiles to its own Lambda, triggered by EventBridge Scheduler.
- **@react-pdf/renderer + ExcelJS** both fit inside Lambda's 250 MB unzipped package limit (they're ~50 MB combined). PDF generation for a 10-page invoice runs in ~2 s, well within Lambda's 15-min max.
- **Session cookies** via iron-session work unchanged.
- **S3 for artifacts**, same as Option 1.

**Strengths:**

- **True per-request billing.** Long idle nights cost ~$0 for compute.
- **Automatic scale-out** for report bursts or morning peaks.
- **No container image to maintain.** OpenNext handles the bundling.
- **Aurora Serverless v2** handles growth to hundreds of tenants without re-architecting.

**Weaknesses:**

- **Cold starts.** First request after idle: 1–3 s on Node Lambda for a typical Next.js app. Report pages will feel slow on first load.
- **Aurora minimum cost** is higher than a `db.t4g.small` ($43 vs $15 non-multi-AZ). For a single-tenant distributor this is net-negative until traffic justifies the elasticity.
- **Prisma on Lambda** requires the binary-target tweak (`linux-arm64-openssl-3.0.x`) and the `?pgbouncer=true&connection_limit=1` trick. Fiddly but well-trodden.
- **OpenNext is an extra abstraction layer.** When it breaks on a new Next.js minor version, you debug OpenNext internals.
- **RDS Proxy** adds $10–15/mo and another IAM boundary.
- **Observability fragmentation.** Each Lambda has its own log group; tracing a request across functions needs X-Ray.

**Indicative monthly cost:**

| Component                            | Cost    |
|--------------------------------------|---------|
| Lambda invocations + compute (low)   | ~$3     |
| CloudFront                           | ~$1     |
| Aurora Serverless v2 (0.5 ACU min)   | ~$43    |
| RDS Proxy                            | ~$12    |
| S3 + storage + requests              | ~$2     |
| EventBridge Scheduler                | $0      |
| Secrets Manager                      | ~$3     |
| Route 53 hosted zone                 | ~$0.50  |
| CloudWatch logs                      | ~$3     |
| Data transfer out                    | ~$2     |
| ACM cert                             | $0      |
| **Total**                            | **~$70**|

---

### Option 3 — Azure Container Apps (Microsoft Stack)

**Topology:** Container Apps (scale-to-zero) + managed Postgres + Container Apps Jobs for crons.

```
 Users → Azure Front Door (HTTPS, CDN) → Container Apps (ingress)
                                              ↓
                        Azure Database for PostgreSQL Flexible Server (B1ms, private endpoint)
                                              ↕
                              Azure Key Vault     Azure Blob Storage
                                              ↑
                 Azure Container Apps Jobs (scheduled, cron triggered)
```

**Services and changes:**

- **Azure Container Apps** — Kubernetes-based, scale-to-zero with a 0-to-1 warm-up that averages 1–3 s on Linux. Same Dockerfile works.
- **Azure Database for PostgreSQL Flexible Server**, Burstable B1ms (1 vCPU, 2 GB). Private endpoint via VNet integration.
- **Container Apps Jobs** — scheduled container runs. Four cron jobs become four Job definitions with `scheduleExpression` (cron syntax) triggers.
- **Azure Key Vault** for secrets. Container Apps can reference secrets via `secretRef`.
- **Azure Blob Storage** for artifacts + images.
- **Azure Front Door** for HTTPS + global CDN + WAF.
- **Entra ID (Azure AD)** optional — if the customer uses Microsoft 365, SSO via OpenID Connect is simpler than on AWS.
- **Migrations:** `prisma migrate deploy` on Job startup or as a one-shot Job.
- **IaC:** rewrite SST/Pulumi to use Pulumi's `@pulumi/azure-native` provider. Alternatively Bicep or Terraform.

**Strengths:**

- **Scale to zero** — idle overnight costs only storage.
- **Managed HTTPS** on Front Door is a single `customDomains` block; no ACM-equivalent dance.
- **Azure Container Apps Jobs** is a cleaner cron primitive than EventBridge → ECS RunTask.
- **Enterprise sales story** — if targets are Microsoft-aligned NZ SMEs, the ecosystem fit is stronger.
- **B1ms is cheap** — ~$15/mo for the DB.

**Weaknesses:**

- **Cold starts** when scaling from 0. Container Apps typically wakes in 1–3 s with a good `startupProbe`, but the first hit after idle is noticeable.
- **Learning curve** — the team has no stated Azure experience. Re-IaC'ing in Pulumi Azure Native is a week's work.
- **Egress pricing** on Azure Front Door is higher than CloudFront for low volumes.
- **Private endpoint + VNet** setup is more wizardry than AWS equivalent.
- **Tooling gaps** — the Azure CLI and portal are less AI-agent-friendly than AWS (fewer reliable MCPs, more portal clicks).

**Indicative monthly cost:**

| Component                                              | Cost    |
|--------------------------------------------------------|---------|
| Container Apps (low usage, scale to zero)              | ~$5     |
| PostgreSQL Flexible Server B1ms, 32 GB                 | ~$18    |
| Azure Front Door Standard                              | ~$35    |
| Blob Storage (hot, <10 GB)                             | ~$1     |
| Key Vault (~10k ops)                                   | ~$1     |
| Container Apps Jobs (4 × day × ~30 s)                  | ~$1     |
| Log Analytics                                          | ~$3     |
| Private endpoint + VNet                                | ~$8     |
| Data transfer out                                      | ~$2     |
| **Total**                                              | **~$74**|

Without Front Door (plain Container Apps ingress with managed cert): ~$40/mo, at the cost of no CDN/WAF.

---

### Option 4 — GCP Cloud Run + Cloud SQL (Simplest, Lowest TCO)

**Topology:** Cloud Run containers + Cloud SQL + Cloud Scheduler pulling HTTPS endpoints.

```
 Users → Cloud Load Balancer (HTTPS, managed cert) → Cloud Run (Next.js container)
                                                         ↓
                                        Cloud SQL for PostgreSQL (db-f1-micro or db-g1-small, private IP)
                                                         ↕
                                           Secret Manager     Cloud Storage
                                                         ↑
                                 Cloud Scheduler → OIDC-signed HTTPS → Cloud Run cron routes
```

**Services and changes:**

- **Cloud Run** — fully managed containers, scale-to-zero, automatic HTTPS on the `*.run.app` subdomain, or custom domain via the HTTPS Load Balancer. Startup is fast (200–800 ms with a well-built Next.js image).
- **Cloud SQL for PostgreSQL 16** — `db-g1-small` (1 vCPU, 1.7 GB) is ~$28/mo with 20 GB SSD and 7-day backups; `db-f1-micro` is ~$10 but has no HA and is meant for dev. Choose `db-g1-small` for prod.
- **Private IP + Serverless VPC Connector** — keeps DB off the public internet; connector adds ~$10/mo for the smallest size.
- **Cloud Scheduler** — cron jobs as first-class resources. Each of the 4 crons becomes a `google_cloud_scheduler_job` hitting a Cloud Run URL with an OIDC token; the route verifies the token.
- **Secret Manager** for secrets. Cloud Run has first-class `--set-secrets` binding.
- **Cloud Storage** for artifacts and product images. Signed URLs for delivery.
- **Managed certs** via HTTPS Load Balancer; issuance is automatic on domain verification.
- **Migrations:** `prisma migrate deploy` runs as a Cloud Run Job before the main service rolls out, or via `gcloud run jobs execute` in CI.
- **IaC:** rewrite to Terraform or Pulumi `@pulumi/gcp`. Cleaner resource model than AWS for this shape.

**Strengths:**

- **Scale to zero with fast cold starts.** Cloud Run startup of 200–800 ms is the industry leader for Node containers.
- **Managed HTTPS is frictionless.** Point a domain at the load balancer and certs auto-issue.
- **Cloud Scheduler is the cleanest cron primitive** on any of these clouds.
- **Lowest idle cost.** At genuinely low usage, this runs for <$30/mo.
- **Simplest operator model.** Fewer moving parts, cleaner IAM, easier to reason about from a single-developer team.

**Weaknesses:**

- **Cloud SQL connection management** — the `cloud-sql-connector` sidecar or the serverless VPC connector adds a step vs a direct Postgres URL. Works well, but an extra thing to understand.
- **Less NZ enterprise familiarity.** Procurement teams at NZ SMEs know AWS and Microsoft; Google is a distant third.
- **No ap-southeast-2 region for Cloud Run** — the nearest are `australia-southeast1` (Sydney) and `australia-southeast2` (Melbourne). Latency to NZ is ~30 ms either way.
- **Team has no stated GCP experience.** Ramp cost ~1 week.

**Indicative monthly cost:**

| Component                                           | Cost    |
|-----------------------------------------------------|---------|
| Cloud Run (low CPU seconds, scale to zero)          | ~$3     |
| Cloud SQL db-g1-small, 20 GB SSD, backups           | ~$28    |
| Serverless VPC Connector (smallest)                 | ~$10    |
| HTTPS Load Balancer (global)                        | ~$18    |
| Cloud Storage (hot, <10 GB)                         | ~$1     |
| Secret Manager                                      | <$1     |
| Cloud Scheduler (4 jobs, free tier)                 | $0      |
| Cloud Logging (low)                                 | ~$2     |
| Data transfer egress                                | ~$2     |
| **Total**                                           | **~$65**|

Without the Global HTTPS LB (use Cloud Run's built-in `*.run.app` HTTPS directly): ~$47/mo, at the cost of losing a custom domain and WAF.

With `db-f1-micro` in a dev/single-tenant setup: ~$28/mo total.

---

### Option 5 — Split Architecture (Frontend + API + Queue Worker)

**Topology:** Client-rendered frontend, dedicated API, background worker for heavy jobs, portable across clouds.

```
 Users → CDN (CloudFront / Front Door / Cloud CDN) → Static Next.js SSG bundle
                                                        ↓ (API calls)
                                               API container (Fastify or NestJS)
                                                        ↓
                                         Postgres (RDS / Azure PG / Cloud SQL)
                                                        ↓
                                    Queue (SQS / Service Bus / Cloud Tasks)
                                                        ↓
                                Worker container (report gen, QBO sync, email)
                                                        ↕
                             Redis (cache + BullMQ backing, optional)
                                                        ↕
                             Object Storage (S3 / Blob / Cloud Storage)
```

**Services and changes:**

- **Frontend:** Next.js in static-export mode, or rewritten as Vite + React. All data fetching via the API. Deploys to CDN + object storage.
- **API:** new service in Fastify or NestJS, REST + Zod. Replaces every Server Action with an HTTP endpoint.
- **Worker:** separate process that consumes a queue for PDF generation, QBO sync, and email sending. Freed from HTTP request timeouts.
- **Queue:** SQS on AWS, Service Bus on Azure, Cloud Tasks on GCP.
- **Cache:** optional Redis for common reads; essential for queue if using BullMQ.
- **Auth:** JWT bearer tokens between SPA and API. Either Cognito / Entra ID / Identity Platform, or a home-grown JWT issuer.
- **Postgres:** unchanged conceptually.
- **Migrations:** same as above, run in CI or as a one-shot job.
- **Observability:** OpenTelemetry across all three tiers.

**Strengths:**

- **Scale tiers independently.** A slow report in the worker never blocks a user request.
- **Portable.** The same container images run on all three clouds. Useful if procurement requires moving later.
- **Testable API.** A clean REST surface is easier to test end-to-end than scattered Server Actions.
- **Clean batch / long-running job story.** Report generation that takes 30 s is fine on a worker; it would time out a serverless HTTP handler.

**Weaknesses:**

- **Major rewrite.** Every one of the 118 Server Actions becomes a REST endpoint. Every form becomes a fetch call. Every UI state becomes client-side. Estimate: **8–12 weeks of full-time engineering** for a team familiar with the domain; more for a fresh team.
- **Higher infra cost.** More services = more always-on bills. At least 3 container services + Redis + queue.
- **More code to own.** Two codebases (frontend + backend) minimum, three if the worker is separate. Auth has to be wired twice.
- **Worse DX for the current team.** Server Actions + Prisma + a single Next.js app is enormously productive for a CRUD-heavy domain like inventory. Splitting sacrifices that for a flexibility the app doesn't currently need.
- **Benefits only materialise at scale.** At 10 concurrent users, the independent-scaling argument doesn't apply.

**Indicative monthly cost (on AWS, for comparability):**

| Component                                           | Cost     |
|-----------------------------------------------------|----------|
| CloudFront + S3 (static frontend)                   | ~$2      |
| Fargate API (0.25 vCPU / 0.5 GB)                    | ~$10     |
| Fargate worker (0.25 vCPU / 0.5 GB)                 | ~$10     |
| ALB (for API)                                       | ~$22     |
| RDS db.t4g.small (multi-AZ)                         | ~$45     |
| SQS                                                 | <$1      |
| ElastiCache Redis cache.t4g.micro                   | ~$13     |
| S3 + NAT + Secrets + CloudWatch                     | ~$40     |
| **Total**                                           | **~$145**|

---

## 4. Side-by-Side Comparison

Legend:  ✓✓ strong  ✓ adequate  ~ workable but painful  ✗ poor fit

| Dimension | Opt 1 — AWS Refined | Opt 2 — AWS Serverless | Opt 3 — Azure CA | Opt 4 — GCP Cloud Run | Opt 5 — Split |
|---|---|---|---|---|---|
| Migration distance from current code | ✓✓ minimal | ~ OpenNext rebuild | ~ Dockerfile portable, IaC new | ~ Dockerfile portable, IaC new | ✗ full rewrite |
| Preserves Server Actions | ✓✓ | ✓ (via OpenNext) | ✓✓ | ✓✓ | ✗ |
| Preserves Prisma schema & migrations | ✓✓ | ✓ (with proxy) | ✓✓ | ✓✓ | ✓✓ |
| Handles heavy PDF/XLSX gen | ✓✓ always-on | ~ 15-min Lambda cap OK | ✓✓ | ✓✓ | ✓✓ queue |
| Cron support for 4 daily NZT jobs | ✓ EventBridge+RunTask | ✓✓ EventBridge+Lambda | ✓✓ CA Jobs | ✓✓ Cloud Scheduler | ✓✓ cron+queue |
| Scale to zero | ✗ | ✓✓ | ✓✓ | ✓✓ | ~ |
| Cold-start impact on UX | ✓✓ none | ~ 1–3 s first hit | ~ 1–3 s first hit | ✓ sub-1 s | ~ |
| Managed HTTPS out of the box | ✓ ACM+ALB | ✓ ACM+CloudFront | ✓✓ Front Door | ✓✓ HTTPS LB | ✓ per-cloud |
| Secrets management | ✓✓ Secrets Mgr | ✓✓ Secrets Mgr | ✓✓ Key Vault | ✓✓ Secret Mgr | ✓✓ any |
| Private database networking | ✓✓ VPC private | ✓✓ VPC + Proxy | ✓✓ Private EP | ✓✓ Private IP + VPC connector | ✓✓ any |
| Multi-AZ / HA DB | ✓✓ | ✓✓ Aurora | ✓ Flexible HA | ✓ Cloud SQL HA | ✓✓ |
| Observability | ✓ CloudWatch | ~ fragmented logs | ✓ Log Analytics | ✓✓ Cloud Logging | ✓✓ OTel |
| IaC reuse (SST/Pulumi already in repo) | ✓✓ keep as-is | ✓ SST native | ~ rewrite Azure | ~ rewrite GCP | ~ |
| Developer cognitive load (1-dev team) | ✓ moderate | ~ higher (Lambda quirks) | ~ moderate (new cloud) | ✓✓ lowest | ✗ highest |
| Monthly cost at current usage | ~$95–130 | ~$70 | ~$40–74 | ~$30–65 | ~$145+ |
| Cost at 10× usage | ~$150 | ~$90 | ~$100 | ~$70 | ~$200 |
| NZ SME procurement familiarity | ✓✓ AWS | ✓✓ AWS | ✓✓ Microsoft | ✓ | ✓ |
| Risk of future platform lock-in | ~ moderate | ~ moderate (OpenNext) | ~ moderate | ~ moderate | ✓✓ portable |
| Time to first deploy from today | ~5 days | ~10 days | ~7 days | ~5 days | ~8–12 weeks |

---

## 5. Final Recommendation — Top Two

Given the shape of this app (CRUD-heavy, low traffic, bursty CPU on reports, 1-dev team, data-critical ledger, NZ locality), the two strongest options are:

### 🥇 Option A — AWS Refined (Option 1)

Best for: **the fastest path to a safe, correct production system with minimal risk**.

- Keeps 100% of the existing domain code intact.
- Fixes every production gap (HTTPS, secrets, real crons, private DB, migrations, CI/CD, backups, alarms) in a single focused ~5-day effort.
- The existing SST/Pulumi IaC stays; only deltas are added.
- Ongoing cost is **~$95/mo single-AZ** or **~$131/mo multi-AZ**, predictable and flat.
- No cold starts. Report pages stay snappy.
- Team retention: developer continues using the AWS tools they already know.

When to pick this over Option B: you want to ship a hardened production system in a week, you don't want to learn a new cloud, you're prepared to pay for always-on compute.

### 🥈 Option B — GCP Cloud Run (Option 4)

Best for: **long-term lowest TCO with the simplest operator model**.

- Scale-to-zero: idle overnight costs pennies.
- Fastest cold starts of any scale-to-zero option (200–800 ms typical).
- Managed HTTPS and custom-domain certs are one-liners.
- Cloud Scheduler is the cleanest cron primitive of the five options.
- The operator surface is smaller than AWS — fewer services, simpler IAM.
- Ongoing cost at low usage: **~$30–65/mo** depending on whether the Global HTTPS LB is used.

When to pick this over Option A: you want the lowest possible monthly bill, you're comfortable learning GCP, you value operational simplicity over platform familiarity, procurement has no AWS mandate.

### Why not the others

- **Option 2 (AWS Serverless)** is tempting for scale-to-zero, but Aurora Serverless v2's $43/mo floor eliminates the cost advantage at this scale, and OpenNext adds a debugging layer the team doesn't need. If traffic grows 10× this becomes the best option.
- **Option 3 (Azure Container Apps)** is technically excellent and competitive on price. Recommend over GCP only if there's a Microsoft 365 / Entra ID procurement reason or a customer-driven requirement.
- **Option 5 (Split)** is the right answer if this app were 10× bigger, multi-team, or multi-product. It is the wrong answer for a 1-dev team shipping an inventory ERP. Revisit in 18 months if the business warrants it.

---

## 6. Rebuild Prompt — Option A (AWS Refined)

Hand this prompt to a development team — fresh or continuing — to rebuild the app on AWS with every gap closed.

---

> ### Rebuild Brief: NZ Inventory ERP on AWS (Fargate + RDS + HTTPS + EventBridge)
>
> **Product:** Multi-tenant B2B distributor ERP for a New Zealand health-products company. Users manage products, stock, batches, suppliers, customers, purchase orders, sales orders, proforma invoices, credit notes, reservations, 15 reports, and a QuickBooks Online sync. Current users are in the low tens; architecture must support 10×.
>
> **Goal:** Production system on AWS `ap-southeast-2`, HTTPS end-to-end, private database, managed secrets, real scheduled jobs, safe migrations, CI/CD, backups, and alarms. Preserve the existing codebase; change only what must change.
>
> **Non-goals:** Rewriting Server Actions, changing Prisma, introducing microservices, adding a queue, replacing the frontend.
>
> **Source of truth:** The existing Next.js 15 App Router + Prisma 5 + PostgreSQL repo. Retain every page, every server action, every Prisma model, every report, every API route, all iron-session auth logic, all fiscal-year / NZT behaviour, and the QuickBooks Online integration with AES-256-GCM-encrypted refresh tokens.
>
> #### Target Architecture
>
> - **Region:** `ap-southeast-2`.
> - **Edge:** Route 53 hosted zone → CloudFront distribution → Application Load Balancer on HTTPS only (:443). ALB :80 redirects to :443. ACM certificate auto-renewed. HSTS header set by the app.
> - **Compute:** ECS Fargate, arm64, `0.5 vCPU / 1 GB`, desired 1, min 1, max 3. Health check at `/api/health`. Task execution role reads from Secrets Manager. Task role has least-privilege S3 + Secrets Manager access only.
> - **Database:** RDS for PostgreSQL 16, `db.t4g.small` multi-AZ, 50 GB gp3, automated backups 7 days, PITR enabled, private subnets, publicly-accessible false, deletion protection on, performance insights on.
> - **Networking:** VPC with 2 public subnets (ALB, NAT) and 2 private subnets (Fargate, RDS) across 2 AZs. One NAT Gateway. Security groups: ALB 80/443 from 0.0.0.0/0; Fargate 3000 from ALB SG only; RDS 5432 from Fargate SG only.
> - **Secrets:** AWS Secrets Manager. One secret per value: `session-secret`, `qbo-client-id`, `qbo-client-secret`, `qbo-encryption-key`, `database-url`, `resend-api-key`, `cron-secret`. Wired into the task definition's `secrets` block (container receives them as env vars at runtime).
> - **Storage:** S3 bucket `nz-inv-artifacts-<account>-<region>` with default SSE-S3, public access blocked, versioned. Subfolders: `reports/{tenantId}/{date}/`, `product-images/{tenantId}/`, `invoices/{tenantId}/`. CloudFront origin access identity for signed-URL delivery of report PDFs.
> - **Cron:** 4× EventBridge Scheduler schedules, each expressed as `cron(... Australia/Auckland)`:
>   - `qbo-sync` 08:00 NZT — `ECS RunTask` with task def `nz-inv-cron` and container env `CRON_HANDLER=qbo-sync`.
>   - `low-stock` 19:00 NZT — same pattern, `CRON_HANDLER=low-stock`.
>   - `fx-rates` 18:00 NZT — same pattern, `CRON_HANDLER=fx-rates`.
>   - `reports` 07:00 NZT — same pattern, `CRON_HANDLER=reports`.
>   - Cron task definition is identical to the web task definition but overrides the entrypoint to `node scripts/cron-handler.js` which dispatches on `CRON_HANDLER`.
> - **Registry:** ECR with immutable tags `git-<sha>`. No `:latest`. Lifecycle policy keeps the last 20 images.
> - **CI/CD:** GitHub Actions on push to `main`: build arm64 image, push to ECR with the commit SHA, `aws ecs update-service --task-definition … --force-new-deployment`, wait for steady state, smoke-test `/api/health`.
> - **Observability:**
>   - CloudWatch Logs retention 30 days on Fargate log group and every cron log group.
>   - CloudWatch Alarms: ALB 5xx >1%, Fargate CPU >80% sustained, Fargate Memory >80%, RDS storage <10% free, RDS CPU >80%, any cron task failure.
>   - CloudWatch Dashboard with request rate, latency, error rate, DB CPU, DB connections.
>   - Optional: Container Insights enabled on the cluster.
> - **Migrations:** Replace `prisma db push --accept-data-loss` on container start. Commit migrations to `prisma/migrations/`. CI runs `prisma migrate deploy` as a one-shot ECS task against the target DB before rolling the web service. Dev uses `prisma migrate dev`.
> - **IaC:** Keep SST 4.7 + `@pulumi/aws` in TypeScript. Single `sst.config.ts` expressing every resource above. A `sst deploy --stage prod` run is idempotent.
>
> #### Code Changes Required (minimum set)
>
> 1. **`lib/session.ts`:** remove the dev fallback path in prod (enforce `SESSION_SECRET` is present); `SECURE_COOKIE` keyed on `APP_URL` starting with `https://` (already done).
> 2. **`lib/storage.ts` (new):** S3 client, `putReport(tenantId, date, id, bytes)`, `getReportSignedUrl(tenantId, date, id)`, `putProductImage(...)`. Replace all `lib/supabase/admin.ts` usage.
> 3. **`lib/secrets.ts` (new, optional):** at boot, read secrets from env (they're already injected by ECS from Secrets Manager).
> 4. **`scripts/cron-handler.ts` (new):** `switch (process.env.CRON_HANDLER) { ... }` dispatching to the four existing route handlers.
> 5. **`app/api/cron/*`:** keep the route handlers for manual invocation; make them importable so the cron-handler script can call them directly.
> 6. **`vercel.json`:** delete.
> 7. **`middleware.ts`:** no change.
> 8. **Dockerfile:** drop `prisma db push` from the startup CMD; startup is just `node server.js` (or equivalent). Prisma generation still happens at build.
> 9. **`package.json`:** add `"migrate:deploy": "prisma migrate deploy"` for CI.
> 10. **`.github/workflows/deploy.yml` (new):** checkout, `docker buildx` arm64, ECR push, `prisma migrate deploy` via one-shot ECS task, `aws ecs update-service`, smoke test.
>
> #### Acceptance Criteria
>
> - `curl -I https://<domain>/` returns `HTTP/2 307` redirect to `/login`.
> - `curl -I http://<domain>/` returns `301` to `https://<domain>/`.
> - ACM cert is valid, `sslshopper.com/ssl-checker.html` scores A or better.
> - Direct Postgres connection from the public internet times out (security group blocks).
> - `aws secretsmanager describe-secret --secret-id nz-inv/session-secret` returns the secret ARN; container env shows `SESSION_SECRET` is present but the task definition does not.
> - All 4 EventBridge schedules are visible in the console; `aws events describe-rule` shows NZT cron expressions; running them manually writes ExchangeRate rows / sends low-stock emails / drains QboSyncJob / writes ReportDelivery rows.
> - `prisma migrate status` against prod shows no pending migrations after CI; no `--accept-data-loss` anywhere.
> - On a bad deploy, `aws ecs update-service --task-definition <previous>` rolls back in <2 min.
> - CloudWatch dashboard shows live metrics; synthetic alarm test fires to configured SNS topic.
>
> #### Deliverables
>
> - `sst.config.ts` with the full resource graph.
> - `Dockerfile` cleaned up.
> - `lib/storage.ts`, `scripts/cron-handler.ts`, `lib/secrets.ts`.
> - GitHub Actions workflow.
> - Migration of all existing data from the current RDS to the new RDS (pg_dump / pg_restore, documented runbook).
> - Runbooks: `docs/runbooks/deploy.md`, `docs/runbooks/rotate-secrets.md`, `docs/runbooks/backup-restore.md`, `docs/runbooks/incident-response.md`.
> - A one-page architecture diagram and cost sheet.
>
> #### Constraints
>
> - Preserve all 15 reports and their exports. No regression in PDF or XLSX output.
> - Preserve iron-session cookie auth. Do not introduce Cognito.
> - Preserve multi-tenant isolation through application code; do not add RLS in this pass.
> - Preserve NZT fiscal-year logic (April–March) and all date formatting.
> - Preserve QBO OAuth flow and AES-256-GCM refresh-token encryption.
> - Do not touch Prisma models unless required to add a migration-safe constraint.
> - No Vercel.
>
> #### Estimated Effort
>
> Experienced AWS engineer familiar with Next.js + SST: **5–7 working days**.

---

## 7. Rebuild Prompt — Option B (GCP Cloud Run)

Hand this prompt to a development team to rebuild the app on GCP.

---

> ### Rebuild Brief: NZ Inventory ERP on GCP (Cloud Run + Cloud SQL + Cloud Scheduler)
>
> **Product:** Multi-tenant B2B distributor ERP for a New Zealand health-products company. Users manage products, stock, batches, suppliers, customers, purchase orders, sales orders, proforma invoices, credit notes, reservations, 15 reports, and a QuickBooks Online sync. Current users are in the low tens; architecture must support 10×.
>
> **Goal:** Production system on GCP `australia-southeast1` (Sydney), scale-to-zero Cloud Run + private Cloud SQL + Cloud Scheduler crons + Secret Manager + Cloud Storage. Lowest sensible TCO with managed HTTPS and a clean operator model.
>
> **Non-goals:** Rewriting Server Actions, changing Prisma, introducing microservices, adding a queue, replacing the frontend.
>
> **Source of truth:** The existing Next.js 15 App Router + Prisma 5 + PostgreSQL repo. Retain every page, every server action, every Prisma model, every report, every API route, all iron-session auth logic, all fiscal-year / NZT behaviour, and the QuickBooks Online integration with AES-256-GCM-encrypted refresh tokens.
>
> #### Target Architecture
>
> - **Region:** `australia-southeast1` (Sydney). All services colocated to minimise egress cost and latency to NZ (~30 ms).
> - **Project:** one GCP project per environment: `nz-inv-dev`, `nz-inv-prod`.
> - **Edge:** Custom domain → external HTTPS Load Balancer with a Google-managed SSL cert → serverless NEG pointing to Cloud Run service. Cloud Armor policy attached with baseline OWASP rules.
> - **Compute:** Cloud Run service `nz-inv-web`, 2nd gen, container image from Artifact Registry, 1 vCPU / 1 GB, concurrency 20, min-instances 0 (scale-to-zero), max-instances 5, CPU always allocated off, startup CPU boost on. Ingress "Internal and Cloud Load Balancing" (locked to the LB).
> - **Database:** Cloud SQL for PostgreSQL 16, `db-g1-small` (1 vCPU, 1.7 GB), 20 GB SSD, HA on, automated backups 7 days, PITR on, private IP only, maintenance window outside business hours.
> - **Networking:** Default VPC with a `/28` Serverless VPC Connector in the same region. Cloud Run attaches to the connector for egress. Cloud SQL on private IP only. Optional Cloud NAT for outbound internet (Resend, Frankfurter, QBO) if the connector alone doesn't cover it.
> - **Secrets:** Google Secret Manager. One secret per value: `session-secret`, `qbo-client-id`, `qbo-client-secret`, `qbo-encryption-key`, `database-url`, `resend-api-key`, `cron-secret`. Wired into the Cloud Run service via `--set-secrets=NAME=SECRET_NAME:latest`.
> - **Storage:** Cloud Storage bucket `nz-inv-artifacts-<project>` with uniform bucket-level access, versioning on, location `australia-southeast1`. Folders: `reports/{tenantId}/{date}/`, `product-images/{tenantId}/`, `invoices/{tenantId}/`. Signed V4 URLs for delivery.
> - **Cron:** 4× Cloud Scheduler jobs in `australia-southeast1` with time zone `Pacific/Auckland`:
>   - `qbo-sync` `0 8 * * *` — POST to `https://<lb-domain>/api/cron/qbo-sync` with OIDC token; route verifies the token's email matches a dedicated `cron-invoker` service account.
>   - `low-stock` `0 19 * * *` → `/api/cron/low-stock`.
>   - `fx-rates` `0 18 * * *` → `/api/cron/fx-rates`.
>   - `reports` `0 7 * * *` → `/api/cron/reports`.
> - **Registry:** Artifact Registry Docker repository `nz-inv/web`, immutable tags `git-<sha>`.
> - **CI/CD:** GitHub Actions on push to `main`: build image, push to Artifact Registry, run a one-shot Cloud Run Job `nz-inv-migrate` that executes `prisma migrate deploy`, then `gcloud run deploy` with the new image and `--no-traffic`, verify, shift 100% traffic.
> - **Observability:**
>   - Cloud Logging with 30-day retention.
>   - Cloud Monitoring dashboards for request count, p50/p95/p99 latency, error rate, DB CPU, DB connections, VPC connector throughput.
>   - Alerting policies: error rate >1%, p95 latency >2 s sustained, DB storage <10%, DB CPU >80%, any Cloud Run revision failing to start, Cloud Scheduler job failures.
>   - Uptime check on `/api/health`.
> - **Migrations:** Replace `prisma db push --accept-data-loss` on container start. Commit migrations to `prisma/migrations/`. CI runs `prisma migrate deploy` via `gcloud run jobs execute nz-inv-migrate` before deploying the new revision. Dev uses `prisma migrate dev`.
> - **IaC:** Replace SST/Pulumi AWS with Terraform or Pulumi `@pulumi/gcp`. Prefer Terraform for GCP ergonomics. Everything above expressed as code; `terraform apply` is idempotent.
>
> #### Code Changes Required (minimum set)
>
> 1. **`lib/session.ts`:** `SECURE_COOKIE` keyed on `APP_URL` starting with `https://` (already done). Remove AWS-specific assumptions from any comments.
> 2. **`lib/storage.ts` (new):** GCS client using `@google-cloud/storage`, `putReport(tenantId, date, id, bytes)`, `getReportSignedUrl(tenantId, date, id)`, `putProductImage(...)`. Replace all `lib/supabase/admin.ts` usage.
> 3. **`app/api/cron/*`:** each route verifies an incoming OIDC token (`Authorization: Bearer <id_token>`), confirms the `email` claim matches the `cron-invoker` service account; falls back to `CRON_SECRET` header for manual invocation in dev.
> 4. **`vercel.json`:** delete.
> 5. **`middleware.ts`:** no change.
> 6. **Dockerfile:** drop `prisma db push` from startup CMD. `node server.js` (or equivalent). Build stage unchanged.
> 7. **`package.json`:** add `"migrate:deploy": "prisma migrate deploy"` for the Cloud Run Job.
> 8. **`.github/workflows/deploy.yml` (new):** checkout, auth to GCP via workload identity federation, build, push to Artifact Registry, `gcloud run jobs execute nz-inv-migrate --wait`, `gcloud run deploy nz-inv-web --no-traffic`, smoke test the revision URL, shift traffic to 100%.
> 9. **`terraform/` (new):** VPC connector, Cloud SQL instance + database + user, Secret Manager secrets (values injected via CI), Cloud Storage bucket, Artifact Registry repo, Cloud Run service, Cloud Run Job, 4× Cloud Scheduler jobs, LB + managed cert, Cloud Armor policy, monitoring alerts, uptime check.
>
> #### Acceptance Criteria
>
> - `curl -I https://<domain>/` returns 307 redirect to `/login` over TLS 1.2+.
> - Cloud SQL has no public IP; connection from outside the VPC fails.
> - `gcloud secrets list --project=nz-inv-prod` shows 7 secrets; Cloud Run service env does not include secret values in the `gcloud run services describe` output.
> - All 4 Cloud Scheduler jobs appear in the console with NZT triggers; manual run (`gcloud scheduler jobs run`) writes ExchangeRate rows / sends low-stock emails / drains QboSyncJob / writes ReportDelivery rows.
> - `prisma migrate status` against prod shows no pending migrations after CI; no `--accept-data-loss` anywhere.
> - Cloud Run revisions are immutable; rollback via `gcloud run services update-traffic` in <30 s.
> - Uptime check passes; alert fires on deliberate `/api/health` failure; auto-resolves on recovery.
> - Cold-start on first request after 30-min idle: <1 s for a static page, <2 s for a DB-backed page.
>
> #### Deliverables
>
> - Terraform modules under `terraform/`.
> - `Dockerfile` cleaned up.
> - `lib/storage.ts`, updated cron handlers with OIDC verification.
> - GitHub Actions workflow using workload identity federation (no long-lived keys).
> - Migration of all existing data from the current AWS RDS to Cloud SQL (pg_dump over a jump-box / private connection, documented runbook).
> - Runbooks: `docs/runbooks/deploy.md`, `docs/runbooks/rotate-secrets.md`, `docs/runbooks/backup-restore.md`, `docs/runbooks/incident-response.md`.
> - Architecture diagram and cost sheet.
>
> #### Constraints
>
> - Preserve all 15 reports and their exports. No regression in PDF or XLSX output.
> - Preserve iron-session cookie auth. Do not introduce Identity Platform in this pass.
> - Preserve multi-tenant isolation through application code; do not add RLS in this pass.
> - Preserve NZT fiscal-year logic (April–March) and all date formatting.
> - Preserve QBO OAuth flow and AES-256-GCM refresh-token encryption.
> - Do not touch Prisma models unless required to add a migration-safe constraint.
> - No Vercel.
>
> #### Estimated Effort
>
> Experienced engineer familiar with Next.js, comfortable picking up GCP: **5–7 working days**. Add 2 days for a team new to GCP.

---

## 8. Appendix — Honest Caveats

- **No hallucinated features.** Every capability listed in Section 1 maps to real files in the repo. If something is listed as "best-effort" (e.g. audit log), that's because the code is best-effort, not because I'm unsure.
- **Pricing is indicative, not contractual.** All figures are on-demand list prices for Apr 2026 in the stated regions. Enterprise discounts, savings plans, committed-use discounts, and free tiers will move these numbers by 10–30%.
- **I did not benchmark cold starts on this app.** Cold-start figures are industry medians for Next.js containers of this size. Actual numbers depend on image size, startup probes, and region traffic patterns.
- **The Aurora Serverless v2 floor is real** — you cannot pause it below 0.5 ACU on the standard V2 product as of this writing. If that changes, Option 2 becomes materially cheaper at idle.
- **GCP region caveat.** `australia-southeast1` is Sydney; `australia-southeast2` is Melbourne. Neither is in NZ. Latency NZ→AU is ~30 ms via the Tasman. Lower than the user's current `ap-southeast-2` (also Sydney). No NZ hyperscaler region exists today.
- **The "split" option (5) is real and sometimes right** — just not for this app at this stage. If the business bifurcates (e.g. a public-facing portal appears for customers to self-serve orders), revisit Option 5.
- **Migration risk.** Whichever target is chosen, the data migration from the current RDS is the single riskiest step. Plan for a rehearsal on a restored snapshot, a cutover window, a read-only period during the cutover, and a documented rollback.

---

## 9. Appendix — Recommended Short-Term Fixes If Not Rebuilding Yet

If the rebuild can't happen this sprint, these three changes close the highest-severity gaps in the current stack in ~1 week:

1. **HTTPS on the ALB** (~2 days): add a Route 53 hosted zone + ACM cert + ALB :443 listener + :80 → :443 redirect. Update `APP_URL` in the task definition so the session cookie flips to `Secure`.
2. **Move secrets to Secrets Manager** (~1 day): create 7 secrets, update the task definition's `secrets` block, remove them from the plain env.
3. **Real crons via EventBridge Scheduler** (~2 days): create 4 rules, a `nz-inv-cron` task definition with `CRON_HANDLER` env dispatch, and a `scripts/cron-handler.ts` entrypoint.

Do these three even if you do eventually rebuild — they are table-stakes production hygiene.

---

*End of report.*
