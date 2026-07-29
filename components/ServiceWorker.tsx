"use client";

/**
 * Registers the service worker compiled from `app/sw.ts`.
 *
 * `@serwist/next` only BUNDLES the worker at build time — nothing registers it,
 * so without this component `public/sw.js` is dead weight and the app has no
 * offline shell. Registration has to happen in the browser, hence a client
 * component mounted once from the root layout.
 *
 * Kept as its own file (rather than inlined in layout.tsx) so the layout stays a
 * server component and only this leaf ships to the client.
 */

import { SerwistProvider } from "@serwist/next/react";

/** True during `next dev`, where `withSerwistInit({ disable })` emits no sw.js. */
const DISABLED = process.env.NODE_ENV === "development";

export default function ServiceWorker() {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={DISABLED}
      // A forced reload the moment connectivity returns would abort an in-flight
      // catalogue sync (318k rows) and could wipe a half-entered sale. The app
      // already recovers on its own via syncManager's resume path.
      reloadOnOnline={false}
    />
  );
}
