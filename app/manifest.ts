import type { MetadataRoute } from "next";

/**
 * PWA manifest. Served at `/manifest.webmanifest` by Next.js.
 *
 * Mobile flows are installable as a PWA (Chrome → "Install app"). No native
 * wrapper — we tried Capacitor and reverted; see `docs/MOBILE.md`.
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
