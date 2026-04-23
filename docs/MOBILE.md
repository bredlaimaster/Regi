# Mobile app — architecture & operator's manual

**Status:** v1 shipped. Works as an installable PWA today. Will be packaged as
an Android APK via Capacitor.

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

## Why "Option 5 — Capacitor"

We picked Capacitor over alternatives (pure PWA, Bubblewrap TWA, React
Native, native Kotlin) because it's the only option that gives:

1. A real signed **Android APK** for sideload.
2. **Native ML Kit barcode scanning** via `@capacitor/mlkit-barcode-scanning`.
3. **One codebase** — the APK shell just loads the live `/mobile/*` routes.
4. **Zero change to auth** — the WebView carries the existing iron-session
   cookie the same way Chrome does.
5. **Zero new backend surface** — every write delegates to server actions
   that the desktop UI already uses.

Trade: the UI runs in a WebView, which is ~90% native perf. For a scan-heavy
flow this is invisible.

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
capacitor.config.ts                     Capacitor wrapper config
capacitor/www/index.html                stub so the CLI is happy
public/icons/icon.svg                   PWA / APK icon placeholder
```

New tests:

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

`components/mobile/barcode-scanner.tsx` has two branches:

1. **Native `BarcodeDetector`** — used when `"BarcodeDetector" in window`.
   Chrome ≥83 on Android and all modern WebViews. Zero JS bundle cost.
2. **Manual-entry fallback** — if the API is absent, the component renders
   a text input. It's always visible as a belt-and-braces option for
   damaged barcodes.

Supported formats: EAN-13, EAN-8, UPC-A/E, Code-128, Code-39, Code-93, ITF,
QR. The `SUPPORTED_FORMATS` constant at the top of the file is the seam —
narrow it if you want to harden scanning against noise.

`getUserMedia` requires a **secure context**. On `localhost` or inside the
Capacitor WebView this is automatic. On a plain-HTTP ALB the camera branch
won't start — the fallback input does. See "Deployment prerequisites"
below.

## Auth

Same as the desktop app: iron-session cookie, checked in `middleware.ts`
(cookie presence) then re-validated via `requireSession()` on every server
action. The mobile layout calls `requireSession()` at the top, so
unauthenticated users bounce to `/login` like they do for the web app.

The PWA manifest at `/manifest.webmanifest` and the `/icons/*` path are
allowlisted in middleware so the OS install prompt can read them without a
session.

## Deployment prerequisites

Before you hand the APK to the warehouse:

1. **HTTPS on the ALB.** Capacitor on Android ≥9 blocks cleartext by
   default (we've explicitly set `cleartext: false` in `capacitor.config.ts`).
   The PWA camera also requires HTTPS in Chrome outside localhost. One ACM
   cert + ALB HTTPS listener = both problems solved.
2. **`SESSION_SECRET`** stays unchanged — same cookie as the desktop app.
3. The `CAPACITOR_SERVER_URL` env var must be set to the production URL
   before running `npx cap sync`.

## Building the APK (one-time)

```bash
# 1. Install Capacitor — these are not yet pinned in package.json.
npm i -D @capacitor/cli @capacitor/core @capacitor/android
npm i @capacitor/mlkit-barcode-scanning        # future: for native ML Kit

# 2. Scaffold the Android project (creates /android with the Gradle files).
CAPACITOR_SERVER_URL=https://your-domain.example \
  npx cap add android

# 3. Sync config and copy assets.
CAPACITOR_SERVER_URL=https://your-domain.example \
  npx cap sync

# 4. Build an APK. For dev sideload: Android Studio → Build → Build APK.
#    For a signed release APK, configure a keystore in android/app/build.gradle.
npx cap open android
```

Android Studio outputs the unsigned APK at
`android/app/build/outputs/apk/debug/app-debug.apk`. Sideload with
`adb install app-debug.apk` while the phone is in developer mode with USB
debugging enabled.

### Permissions

The APK needs the camera permission. Add to
`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

### Swapping in native ML Kit (recommended before shipping to users)

The `BarcodeScanner` consumer API is `{ active, onDetect, onError }`. When
you're ready to use native ML Kit instead of the web `BarcodeDetector`,
replace the camera-loop effect in `components/mobile/barcode-scanner.tsx`
with a call to `BarcodeScanner.startScan` from
`@capacitor/mlkit-barcode-scanning`. Detect the Capacitor runtime with
`Capacitor.isNativePlatform()` — the manual-entry fallback stays intact for
the PWA path.

## Testing

```bash
npm test          # vitest run
npm run test:watch
```

Added tests cover:

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
- No hand-roll of the `BarcodeDetector` output for noisy warehouses — we
  trust the first detection. If false reads become an issue, require two
  consecutive identical reads before firing `onDetect`.

## Performance notes

- Pick / receive pages are `export const dynamic = "force-dynamic"` — we
  always want fresh `qtyPicked`/`qtyReceived`.
- The scanner uses `requestAnimationFrame` with a 600ms cooldown after a
  successful detect to avoid duplicate fires.
- The camera `MediaStream` is torn down on unmount and when `active` flips
  false, to release the hardware for other apps.
