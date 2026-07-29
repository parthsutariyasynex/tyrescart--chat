import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  images: {
    // Storefront product images: real photos come from /media/** and the
    // fallback placeholder from /static/**, so allow the whole host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.tyrescart.com",
        pathname: "/**",
      },
    ],
  },
};

/**
 * PWA / service worker. Source lives in `app/sw.ts`, compiled to `public/sw.js`
 * at build time.
 *
 * Disabled in development on purpose: a worker precaching the shell fights with
 * Fast Refresh and produces stale-bundle confusion that reads like real bugs.
 * Test offline behaviour with `npm run build && npm start`.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // The app already recovers on its own (syncManager resumes interrupted runs);
  // a forced reload on reconnect would interrupt an in-flight catalogue sync.
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
