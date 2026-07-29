/// <reference lib="webworker" />

/**
 * Service worker — APP SHELL AND IMAGES ONLY.
 *
 * ── What this does NOT do, deliberately ──
 * It does not cache `/api/graphql`. Every data call in this app is a POST, and
 * the Cache API cannot store POST responses — a `NetworkFirst` route for
 * `/api/*` would look correct, silently cache nothing, and leave you believing
 * data works offline when it doesn't.
 *
 * Offline DATA is already solved by IndexedDB (`services/db.ts` +
 * `services/cache.ts`): the supplier catalogue, tyresChat and storefront query
 * results are persisted there, and pages read cache-first with zero network on
 * load. This worker only makes the SHELL (HTML/JS/CSS/fonts) and product
 * IMAGES survive being offline, which IndexedDB doesn't cover.
 *
 * Result: with the app installed and visited once, a cold offline start
 * renders the real UI with real cached products and real images.
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, CacheFirst, ExpirationPlugin, CacheableResponsePlugin, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    /* ── NEVER cache GraphQL ──
       Listed FIRST so it wins over any broader rule below. NetworkOnly also
       means an offline POST fails fast and surfaces to the caller, instead of
       hanging or resolving with something stale. */
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/graphql"),
      handler: new NetworkOnly(),
    },

    /* ── Magento product images ──
       Large, immutable, and served from a different origin. CacheFirst avoids
       re-downloading them on every visit and is what makes an offline table
       show pictures. Capped so a 300k-product catalogue can't fill the disk. */
    {
      matcher: ({ url }) =>
        url.hostname === "www.tyrescart.com" &&
        (url.pathname.startsWith("/media/") || url.pathname.startsWith("/static/")),
      handler: new CacheFirst({
        cacheName: "tyrescart-product-images",
        plugins: [
          // Opaque cross-origin responses are status 0; allow them or nothing
          // from this host would ever be stored.
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* ── Product images as served by next/image ──
       The rule above only fires for a raw <img> pointing at the CDN. Product
       photos actually go through Next's optimizer, so the browser requests
       SAME-ORIGIN `/_next/image?url=…` and the CDN host never appears in a SW
       fetch event. Serwist's own `next-image` default would handle these, but
       with StaleWhileRevalidate / 64 entries / 24h — far too small for a
       catalogue this size. CacheFirst with the same budget as above keeps
       already-seen photos available offline and off the network entirely.
       Must be listed BEFORE ...defaultCache, since first match wins. */
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname === "/_next/image",
      handler: new CacheFirst({
        cacheName: "tyrescart-product-images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* Serwist's defaults for the Next.js shell: RSC payloads, /_next/static,
       fonts, same-origin images. Left as-is so framework internals stay
       correct across Next upgrades. */
    ...defaultCache,
  ],
});

serwist.addEventListeners();
