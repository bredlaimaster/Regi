# Mobile app — architecture & operator's manual

**Status:** v1 shipped. Web-only: runs in Chrome on Android, installable as a
PWA. **No native APK / Capacitor** — see the note below.

> ### Note on the abandoned APK
>
> We briefly prototyped a Capacitor-based Android APK that wrapped the web app
> in a WebView and used `@capacitor-mlkit/barcode-scanning` for native ML Kit
> scanning. On the target device (Samsung Galaxy S24 Ultra) the APK path was
> faulty — the camera overlay stayed black and code changes on the server
> didn't always reflect in the WebView. The web path in plain Chrome was rock
> solid, so we deleted all Capacitor infrastructure (the `android/`, `capacitor/`
> directories, `capacitor.config.ts`, and the `@capacitor/*` npm packages).
> **Do not reintroduce Capacitor without re-evaluating the WebView issue.**
> If you want a home-screen icon, install the PWA from Chrome's menu.

## What it does

Three workflows on a phone, all reusing the existing web-app server actions:

| Flow | Route | Calls |
|---|---|---|
| Pick sales orders | `/mobile/pick/[soId]` | `partialPickSalesOrder` |
| Receive purchase orders | `/mobile/receive/[poId]` | `partialReceivePurchaseOrder` |
| Stock take | `/mobile/stocktake` | `adjustStock` |

Each flow is scanner-first: the camera reads a barcode, the server resolves
it to a product, the UI stages a quantity change, and a single commit at the
end writes the delta atomically on the server.

## Files

```
actions/mobile.ts                       server actions used only by /mobile
app/manifest.ts                         PWA manifest → /manifest.webmanifest
app/mobile/layout.tsx                   standalone mobile layout (no sidebar)
app/mobile/page.tsx                     home (3 tiles)
app/mobile/pick/                        sales-order picking flow
app/mobile/receive/                     purchase-order receiving flow
app/mobile/stocktake/                   single-item stock-take flow
components/mobile/barcode-scanner.tsx   camera + manual-entry scanner
components/mobile/mobile-header.tsx     compact sticky header
components/mobile/tile-link.tsx         large touch target tile
lib/mobile/sort-by-bin.ts               pure sort helper (pick-path order)
public/icons/icon.svg                   PWA icon placeholder
```

Tests:

```
__tests__/lib/sort-by-bin.test.ts       pure unit tests
__tests__/actions/mobile.test.ts        mocked-prisma action tests
```

## Schema changes

Only two new indexes on `Product` — no column adds, no data migrations:

```prisma
@@index([tenantId, unitBarcode])
@@index([tenantId, caseBarcode])
```

Run `npm run db:push` (or let the ECS container's boot-time `prisma db push`
handle it) on deploy.

## Barcode resolver

`actions/mobile.ts → resolveBarcode({ code })` matches on **`unitBarcode`
first, then `caseBarcode`**. Case-barcode matches bump the staged qty by
`product.caseQty` in a single scan — the picker can tear open one carton and
we credit 12 units (or whatever the case holds).

Returned payload:

```ts
{ productId, sku, name, binLocation, caseQty, matched: "unit" | "case", stockQty }
```

Cross-tenant isolation is enforced in the `where` clause — every query
filters on `session.tenantId`.

## Pick path ordering

`lib/mobile/sort-by-bin.ts → sortLinesByBin()` orders SO lines by
`product.binLocation` lexicographically. The observed bin format (`F08B01`,
`G07A01`) happens to sort to a walkable aisle path, so this is good enough
for v1.

Rules:
- Lines with no bin code sort **last** (staging/bench pick).
- Ties break on SKU for deterministic order.
- Function is pure — easy to swap for an explicit hierarchy table later.

When you hand over the real placement hierarchy, replace the body of
`sortLinesByBin` with a lookup-table sort. The callers (`getPickSheet`,
`getReceiveSheet`) don't change.

## Scanner behaviour

`components/mobile/barcode-scanner.tsx` uses the web `BarcodeDetector` Shape
Detection API with a `getUserMedia` camera stream. It exposes two modes,
toggled by a segmented control at the top:

- **Auto** (default): camera runs continuously while `active=true`. Every
  decoded barcode fires `onDetect`, with a **1-second global cooldown** so
  the loop doesn't re-fire on the same label while the picker is still
  holding it. `AUTO_SCAN_COOLDOWN_MS` at the top of the file is the seam —
  widen it for noisy reads, shrink it for faster double-scans.
- **Manual**: camera is OFF until the user taps the "Tap to scan" button.
  When tapped, the camera opens, the first detection fires `onDetect`, and
  the camera tears down again. Tap again for the next item. Saves battery
  for stocktake-style flows where scans are sparse.

Both modes share the same `getUserMedia` + `BarcodeDetector` pipeline. A
`manualArmed` flag gates whether detections are emitted in Manual mode.

Supported formats: EAN-13, EAN-8, UPC-A/E, Code-128, Code-39, Code-93, ITF,
QR. The `FORMATS` constant at the top of the file is the seam — narrow it
if you want to harden scanning against noise.

If `BarcodeDetector` is absent (rare — Chrome ≥83 covers everything we
care about), the camera block disappears and only the manual-entry input
remains. The manual input is **always visible** below the camera, so
damaged/missing barcodes never block a picker.

## Deployment prerequisites (secure context)

`getUserMedia` requires a **secure context**. Chrome blocks it on plain-HTTP
origins outside `localhost`.

For the warehouse/production rollout we need **HTTPS on the ALB** — one ACM
cert + an HTTPS listener on the existing ALB is the whole fix.

### Dev/demo on plain HTTP (current state)

While the ALB is still HTTP-only, picking staff must enable one Chrome
flag per device to unblock the camera:

1. Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Paste the ALB URL (e.g. `http://WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com`)
3. Set the flag to **Enabled**, restart Chrome.

This is fine for sandbox / internal testing. Remove it the moment the
ALB gets a real certificate.

### Install as a PWA

Chrome → ⋮ menu → **Install app** (or "Add to Home screen"). This gives a
home-screen icon and a standalone window (no browser chrome). PWA installs
inherit the Chrome camera permission, so grant camera access once in a
normal Chrome tab **before** installing.

## Auth

Same as the desktop app: iron-session cookie, checked in `middleware.ts`
(cookie presence) then re-validated via `requireSession()` on every server
action. The mobile layout calls `requireSession()` at the top, so
unauthenticated users bounce to `/login` like they do for the web app.

The PWA manifest at `/manifest.webmanifest` and the `/icons/*` path are
allowlisted in middleware so the OS install prompt can read them without a
session.

## Testing

```bash
npm test          # vitest run
npm run test:watch
```

Tests cover:

- `sortLinesByBin` — 6 cases (order, unallocated-last, tie break, purity,
  empty, whitespace).
- `resolveBarcode` — unit match, case match, empty input, not found,
  tenant scoping, missing stock level.
- `pickableSalesOrders` / `receivablePurchaseOrders` — outstanding filter,
  tenant scoping, status filter.
- `getPickSheet` — cross-tenant refusal, bin-sorted output.
- `getReceiveSheet` — cross-tenant refusal.

Writes (pick commit, receive commit, stock adjust) are NOT re-tested here —
they go through the web app's existing server actions which already have
their own coverage.

## Known limitations (v1)

- No offline mode. A dropped connection during commit surfaces an error
  toast; the staged picks survive on the phone because they live in React
  state. When connectivity returns the user taps "Commit" again.
- No batch/expiry capture on phone receive. The desktop Receive dialog is
  still the place for supplier invoices, freight, and expiry dates.
- Receive page doesn't show "put away to bin" prompts yet — it just sorts
  lines by bin. Add a big bin callout once there's a real placement map.
- No double-read confirmation. If false reads become an issue in a noisy
  warehouse, require two consecutive identical reads before firing
  `onDetect`.
