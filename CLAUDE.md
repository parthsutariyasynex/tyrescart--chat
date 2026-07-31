# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run dev` — Start dev server (http://localhost:3000)
- `npm run build` — Production build (pinned to `--webpack`: Serwist 9 has no Turbopack support yet, and the service worker in `app/sw.ts` is bundled by its webpack plugin. Next 16 defaults to Turbopack, where the build **fails**; dropping the flag also silently produces no `public/sw.js`.)
- `npm run start` — Start production server
- `npm run lint` — Run ESLint (runs `eslint` with next config)

No test framework is configured. Verification in this project is done by driving a
headless browser over CDP and measuring (see "Measuring" below).

## Environment

`.env.local` is optional. There is no database and no auth secret — the only
network dependency is the Magento GraphQL endpoint, which
`app/api/graphql/route.ts` proxies to `https://www.tyrescart.com/graphql`.

## Architecture

**Next.js 16 App Router** point-of-sale front end for tyre retail. It is a
**client-side, offline-first app over a read-only GraphQL API**: there is no
application database, no ORM and no server-side domain logic. Everything the UI
needs is fetched from Magento, normalized in the browser and persisted to
IndexedDB.

### Stack
- **Frontend:** React 19.2, TypeScript, Tailwind CSS 3 (light theme, emerald accent; `/products` and `/tyre_guide/chat` use orange)
- **Data:** Magento GraphQL — `products`, `supplierProducts`, `tyresChat`, `customAttributeMetadata`
- **Server side:** exactly one route, `app/api/graphql/route.ts` (a POST proxy; it exists so the browser isn't blocked by CORS/WAF)
- **Persistence:** IndexedDB only (`services/db.ts`), no MongoDB/Mongoose
- **Auth:** none. There is no `middleware.ts`; every route and the proxy are open. This must be addressed before deployment.
- **Offline/PWA:** `@serwist/next` service worker (`app/sw.ts` → `public/sw.js`, registered by `components/ServiceWorker.tsx`, disabled in dev) + IndexedDB for data and cart

### Key Directories
- `app/` — routes: `dashboard` (placeholder charts), `products` (storefront catalogue, card grid), `supplier-products` (~319k-row supplier feed, table), `tc-products` (7.8k-row storefront table with cart/list actions), `tyre_guide/chat` (chat shortcuts)
- `app/api/graphql/` — the single API route
- `components/` — `Sidebar`, `SidebarSyncButton`, `Skeletons`, `HeaderUtilities`, `ToastProvider`, `DbInit`, `ServiceWorker`
- `services/` — the whole data layer: `graphql.ts` (fetchers), `queries.ts` (query strings), `cache.ts` (read-through cache + sync routines + session rows cache), `db.ts` (IndexedDB wrapper), `syncManager.ts` / `syncTasks.ts` (background sync), `searchFilter.ts` (search/size matching), `cartStore.ts`, `productFormatter.ts`, `productEnrich.ts`
- `hooks/` — `useSyncManager`, `useCart`, `useOnlineStatus`, `useDebouncedValue`, `useSync`
- `constants/badges.ts` — shared category/brand badge classes

There is no `lib/`, `models/`, `types/` or `middleware.ts` directory. Shared
types live in `services/types.ts`.

### Data flow
1. **Fetch** — `services/graphql.ts` builds a query from `services/queries.ts` and POSTs it through `/api/graphql`.
2. **Cache** — `services/cache.ts` wraps every fetch in a read-through: fresh IndexedDB entry (`CACHE_TTL_MS`, 5 min) is served with **no network**; otherwise fetch → persist → return; on failure the stale entry is served rather than nothing.
3. **Persist** — `services/db.ts`, database `tyrescart-pos` v5, stores: `productQueries` (per-query/per-page responses), `supplierProducts` (one record per product, keyed `id`), `tyresChat`, `cart`, `meta`.
4. **Render** — pages hold normalized rows in state, filter/sort/paginate entirely client-side. No API call is made for search, filtering, sorting or pagination.

### Background sync
`services/syncManager.ts` is a `globalThis`-pinned singleton; `services/syncTasks.ts`
registers the tasks: `supplierProducts`, `tcProducts`, `products`, `tyresChat`.
Because the work lives in the manager and not in a component, **a sync keeps
running when the user navigates away**. Pages observe it via
`hooks/useSyncManager.ts` (`useSyncTask`, `useSyncBatches`, `useOnSyncComplete`).

- `start(id)` dedupes synchronously — a second call joins the in-flight run, so a sync can never be started twice (this also covers React StrictMode's double effect).
- Large syncs use a fixed **worker pool of 8** with per-page retry (3 attempts, exponential backoff + jitter) and, for supplier, a circuit breaker. A failed page is recorded, never silently skipped.
- **One button component:** `components/SyncButton.tsx` on every page. It maps the route to a task and calls `syncManager.start(task)` — same in-flight check, 3s cooldown, toasts (via `ToastProvider`) and spinner everywhere. `/dashboard` has no task, so its button renders disabled. The sidebar button runs `startAll()`.
- **Header vs sidebar scope:** the header button syncs only the current route's task. On /supplier-products that is `supplierPage` (~1 request, refreshes the rows on screen), NOT the 319k catalogue — the full pass belongs to the sidebar. `supplierPage` sets `excludeFromStartAll` so a full sync doesn't also run it.
- **Auto-fetch fires only when IndexedDB holds NOTHING for that page.** One cached record is enough to suppress it — including a PARTIAL cache, which is rendered as-is rather than completed. Applies to supplier, tc, products and chat. Filling gaps and refreshing are the Sync buttons' job.
- **tc and products are never auto-resumed.** Only supplier has a resume path (`resumeInterruptedSupplierSync`, driven by `supplierAll:syncState`), justified by its 3,200-request catalogue. `tcProducts:syncState` is still written but is diagnostic only.
- `resumeInterruptedSupplierSync()` and `resumeInterruptedTcSync()` (both called from `components/DbInit.tsx`) restart a sync that a hard reload killed, detected via the `supplierAll:syncState` / `tcProducts:syncState` meta markers — written `running` before paging starts and only upgraded to `complete`/`partial` at the end.
- Both syncs trip a **circuit breaker** after 12 consecutive page failures rather than hammering a WAF/rate-limiter with the rest of the catalogue.

### Layout and navigation
`app/layout.tsx` owns the viewport frame and renders `<Sidebar />` **above the
route boundary**, so client-side navigation replaces only the content area. Route
`loading.tsx` files render **content-only** skeletons (no sidebar, no
`h-screen w-screen`) — a full-viewport skeleton would blank the chrome and make
navigation look like a page reload. Active nav and accent come from
`usePathname()`, not props.

### Conventions
- Path alias: `@/*` maps to project root
- API/database field names are snake_case; JS variables are camelCase
- Filter and search inputs are debounced 400ms via `hooks/useDebouncedValue` — inputs stay bound to raw state (typing is instant) while only the expensive derived memo reads the debounced copy
- Paginated loaders accumulate **page-keyed** (`byPage.set(n, rows)` + re-flatten), never append. This makes a re-delivered batch idempotent and lets a table be pre-filled from cache before a sync starts
- Rows already mapped this session are kept in the in-memory rows cache (`getRows`/`setRows` in `services/cache.ts`) so a revisit paints on the first render; it is intentionally not persisted (IndexedDB is the source of truth after a reload)
- No CSS modules — Tailwind utilities only, global styles in `app/globals.css`; theme-wide rules belong in `globals.css`, not in components

## Measuring

Performance claims in this repo are measured, not estimated. The pattern used
throughout: launch headless Chrome with `--remote-debugging-port`, drive it over
CDP, and instrument inside the page (wrap `window.fetch`, wrap
`IDBObjectStore.prototype.{get,put,getAll}`, read `Runtime.getHeapUsage`).
Reference figures on the live data (dev server, 1600×900):

- supplier catalogue: **latest stock only** (`is_latest: 1` at the API) — 8,251 rows, 9 requests, ~8 s cold sync. Historical rows are never fetched, stored or shown; the LATEST? checkbox is gone and current stock is the permanent behaviour
- supplier warm page load: all 8,251 rows ready in **0.5 s**, 0 API calls (was 9.9 s when the page held 319,429 rows behind a client-side LATEST? filter)
- the supplier read is **paged** (`streamCachedSupplierProducts`, 20k/page): never call `getAll` on that store — it deserialises every record before resolving
- tc catalogue: 7,809 rows over 79 pages; cold sync ~13.6 s at concurrency 8
- warm revisit: 0 GraphQL requests, 3 IndexedDB ops
- upstream GraphQL page-size cap (measured, not assumed): `supplierProducts` **1000**, `products` **≥2000**
- `supplierProducts`: 1,000 rows / ~0.5–0.9 s vs 100 rows / ~0.6 s → 1,900 rows/s vs 161. Full catalogue = **329 requests / 63 s** (was 3,195 / 351 s at pageSize 100)
- `products` (tc + storefront): throughput plateaus ~200 rows/s, so page size is capped at `STOREFRONT_PAGE_SIZE = 500` — 1000 buys ~10 % and doubles time-to-first-response

Note the `Skeleton` primitive renders class `.skeleton` (shimmer defined in
`globals.css`), **not** `animate-pulse` — detecting skeletons by the wrong class
gives false negatives.

## Known gaps

- **No auth.** No `middleware.ts`; nothing gates any route.
- **No checkout.** `hooks/useCart` + `services/cartStore.ts` persist a cart, but only tc-products' Add-to-Cart writes to it; there is no cart UI, order API or receipt. Offline orders/outbox is the deferred Phase 4.
- **`Offer` column has no upstream data** — `offers`, `tier_price`, `special_price` and `final_price` come back empty, so it renders `—` for every row.
- **`Qty` is `stock_status` only** (0/1). No numeric on-hand count exists in the API.
- **`/dashboard` is a placeholder** and is the default landing route.
- **The two big page components are ~1,850 and ~2,000 lines with ~1,180 identical lines between them** (table shell, filter bar, column modal, pagination). Extracting shared components is a known, deliberately deferred task — until then, a fix applied to one page usually needs applying to the other.
