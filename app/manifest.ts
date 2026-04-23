import type { MetadataRoute } from "next";

/**
 * PWA manifest. Served at `/manifest.webmanifest` by Next.js.
 *
 * When Capacitor wraps this app into an APK, the manifest is used to seed
 * the app name / icons / display mode for the WebView shell too.
 *
 * Icons: swap the placeholder SVG for proper PNGs (192px + 512px) under
 * `public/icons/` before shipping to production.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NZ Inventory",
    short_name: "NZ Inventory",
    description: "Pick, receive, and stock-take from your phone",
    start_url: "/mobile",
    scope: "/mobile",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
