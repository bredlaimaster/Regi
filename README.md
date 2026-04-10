# NZ Inventory — MVP

Simple, fast inventory & order management for NZ importers.
Next.js 15 · React 19 · Prisma · Supabase · TanStack Query · shadcn/ui.

## Setup

```bash
pnpm install         # or npm / yarn
cp .env.example .env # fill in Supabase + QBO creds
pnpm db:push
pnpm db:seed
pnpm dev
```

### Supabase

1. Create a Supabase project.
2. Auth → Providers: enable Email (magic link) and Google.
3. Storage → create bucket `product-images` (public).
4. Copy `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DATABASE_URL` into `.env`.

### QuickBooks Online

1. Create an app at developer.intuit.com.
2. Redirect URI = `${APP_URL}/api/qbo/callback`.
3. Paste client id/secret into `.env`.
4. Generate `QBO_ENCRYPTION_KEY` with `openssl rand -base64 32`.
5. Visit `/settings/quickbooks` and click Connect.
6. Map `TaxCodeRef` and `AccountRef` values in `lib/quickbooks/sync.ts` to your real QBO accounts.

### Cron (Vercel)

Configured in `vercel.json`. Set `CRON_SECRET` in project env and Vercel will call:

- `/api/cron/qbo-sync` every 15 min — retries QBO pushes
- `/api/cron/low-stock` daily 19:00 NZT — emails admins

## Structure

```
app/            Next.js routes ( (app) group = protected )
actions/        Server Actions
components/     UI + forms
lib/            prisma, supabase, quickbooks, utils
prisma/         schema + seed
```

All server actions call `requireSession()` / `requireRole()` and `assertTenant()`.
Every stock movement writes an immutable `InventoryTransaction` row alongside the `StockLevel` upsert.
