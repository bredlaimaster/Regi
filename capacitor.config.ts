import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Android APK wrapper.
 *
 * We do NOT bundle the Next app as static assets inside the APK — this app
 * has server-rendered pages, Server Actions, and a Postgres-backed session.
 * Instead the APK is a WebView shell that loads the live Next.js deployment
 * over HTTPS. This mirrors how Trusted Web Activities work but lets us wire
 * in native Capacitor plugins (camera, file share, push) cleanly.
 *
 * Set `server.url` to the production ALB URL before `npx cap sync`. For a
 * dev build pointed at your laptop, use `http://10.0.2.2:3000` (the Android
 * emulator's localhost alias) and set `androidScheme: "http"` in an
 * override config. Production must stay HTTPS — mixed content is blocked.
 */
const config: CapacitorConfig = {
  appId: "nz.co.nzinventory.mobile",
  appName: "NZ Inventory",
  // No built-in webDir: we load a remote URL. `www/` is a tiny stub so the
  // Capacitor CLI doesn't error when the folder is missing.
  webDir: "capacitor/www",
  server: {
    // Swap this for the ALB URL (or your custom domain) at release time.
    // Leave undefined in source control so developers can set it in a local
    // `capacitor.config.local.ts` and not leak infra URLs.
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: false, // Production must be HTTPS. Override locally if needed.
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b1220",
  },
};

export default config;
