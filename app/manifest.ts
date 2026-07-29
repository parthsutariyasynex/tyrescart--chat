import type { MetadataRoute } from "next";

/**
 * PWA manifest, served at /manifest.webmanifest.
 *
 * A metadata route rather than a static public/manifest.json so it is typed and
 * stays in step with the app's metadata in layout.tsx.
 *
 * `display: "standalone"` matters for a POS: staff open it like an app, without
 * browser chrome, and it keeps its own history stack so a stray back-swipe
 * can't drop them out mid-sale.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TyresCart POS — Point of Sale",
    short_name: "TyresCart POS",
    description:
      "TyresCart point-of-sale: browse tyre products and chat shortcuts, powered by Magento GraphQL. Works offline.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f6f9", // --page-bg in globals.css
    theme_color: "#00843d", // --accent (theme green)
    icons: [
      {
        src: "/favicon-color.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
