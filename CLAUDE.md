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

There is no database — the only network dependency is the Magento GraphQL
endpoint, which `app/api/graphql/route.ts` proxies to `GRAPHQL_ENDPOINT`.

`.env.local` is **NOT optional**: the proxy refuses to guess a host and returns
500 when `GRAPHQL_ENDPOINT` is unset. Three server-only variables (no
`NEXT_PUBLIC_` prefix — Next inlines those into the client bundle):

| Variable | Purpose |
| --- | --- |
| `GRAPHQL_ENDPOINT` | `https://qa.tyrescart.ae/graphql` |
| `KLEVER_API_KEY` | `X-Klever-Api-Key`; Magento answers `403 Invalid or missing API key` without it |
| `GRAPHQL_BASIC_AUTH` | `user:password`; the QA origin sits behind nginx Basic auth |

**QA needs BOTH credentials** — they are separate gates. Basic gets the request
past nginx (`401 www-authenticate: Basic realm="Restricted Area"` without it,
with or without the Klever key); the Klever key gets it past Magento. Each header
is omitted entirely when its variable is unset, so an ungated host is unaffected.
Credentials CANNOT be embedded in the URL instead — Node's fetch rejects
`https://user:pass@host/…` outright ("Request cannot be constructed from a URL
that includes credentials"), even though curl accepts that form.

**`www.tyrescart.com` is dead** — Cloudflare now answers it with a blanket `302`
to `www.tyrescart.ae/en/graphql`, and a 302 downgrades POST→GET and DROPS the
body, so Magento receives an empty query and replies
`Syntax Error: Unexpected <EOF>` at line 1 column 1. That error means "no query
arrived", never a malformed document — if you see it, the endpoint is redirecting,
not the query failing. Vercel projects carry their own copies of these variables;
env changes need a redeploy.

**Schema introspection is BROKEN on both hosts** — `__schema` and `__type` both
500 with `Cannot instantiate interface PayPal\Braintree\Gateway\DataResolver\
Customer\GetCustomerIdByPaymentTokenInterface`. Probe candidate field names one
at a time instead; `Cannot query field "x" on type "Y"` is the only reliable
signal about what exists.

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
3. **Persist** — `services/db.ts`, database `tyrescart-pos` v6, stores: `productQueries` (per-query/per-page responses), `supplierProducts` (one record per product, keyed `id`), `costHistory` (one record per observed cost CHANGE, `productId` index), `tyresChat`, `cart`, `meta`.
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

### supplierProducts fields and filters
Verified by probing (introspection is unavailable — see Environment).

**Fields:** `id`, `sku`, `product_source`, `brand`, `product_name`, `plain_size`,
`cost`, **`price`**, `fitting_price`, `year`, `country`, `tyre_marking`,
`is_latest`, `offers`, `runflat`, `source_date`, `source_name`, `set_price`,
`product_url`, `brand_category`, `size`. There is no `tyre_size`, `category` or
`supplier` field — the size is `plain_size`, and it arrives CONCATENATED
(`"17513"` for 175 R13C), so the readable form is built client-side.

**Filter keys:** `sku`, `is_latest`, `brand`, `plain_size`, `product_source`,
`year`, `country`, `source_name`, `brand_category`, `product_name`, `size`.
**There is no id filter** — `id`, `entity_id` and `product_id` are all rejected.

**On COMPETITOR rows `cost` and `fitting_price` are ALWAYS 0** — we don't buy
them, so the meaningful figure is `price`, the competitor's retail listing.
Gating UI on `cost > 0` therefore hides every one of the 268k competitor rows;
gate on `price ?? cost` instead. `price` was in the query all along but was
missing from the supplier row mapper, which is why the Cost column rendered blank
and the chart had no click target.

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
Reference figures on the live data (dev server, 1600×900). NOTE: row counts below
predate the move to the QA endpoint — on `qa.tyrescart.ae` the feed is 319,426
rows total, **8,248** at `is_latest: 1` (51,328 `supplier` / 268,098
`competitor`), and `products` holds 7,406. Different endpoints carry different
datasets, so re-measure before quoting a count, and re-sync after switching hosts
or IndexedDB will mix two catalogues.

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

### Quick View
The eye button in the supplier table's Action column opens
`components/QuickViewModal.tsx`, which fetches full product detail from the
DEFAULT Magento `products` query (`tcQuickViewQuery` → `fetchTcQuickViewCached`,
one request per product opened, cache-first so re-opens are free and work
offline). The spec grid reads `custom_attributesV2` because it returns labels
already resolved — no second `customAttributeMetadata` round-trip.

**Attribute codes do not match the on-screen labels:** PROFILE is `height`,
LOAD/SPEED is `load_index`. Select attributes arrive as
`selected_options:[{label,value}]`, free text as a plain `value` — a reader
handling one shape silently drops the other.

Resolution is two-stage: **SKU first**, then an exact **brand + pattern + size**
match, accepted ONLY when exactly one candidate matches all three. Two products
sharing those but differing by load index are ambiguous and neither is used —
showing another tyre's images or warranty is worse than a dash. Never fuzzy.

The fallback uses `search`, not `filter`: `tyre_size` is absent from
`ProductAttributeFilterInput`, and `pattern` labels are not unique ("PorTran KC53"
resolves to both 3660 and 819). Magento ANDs search terms against the product
name, which carries brand, size and pattern — so `"Kumho 215/65 R17"` narrows
correctly while `"Kumho 185/65 R14"` returns 0 because that tyre is not stocked.
Candidates are then re-verified attribute-by-attribute client-side.

When Magento resolves nothing, WIDTH/PROFILE/RIM/LOAD-SPEED are recovered by
decomposing the **supplier feed's own size string** (`splitSupplierSize`) — those
values are already in the feed, just concatenated ("180/55 ZR17 73W" → 180 / 55 /
17 / 73W). Strict, never inferred: "185 R14" is a full-profile van size with no
aspect ratio, so PROFILE stays `-`, and exotic motorcycle notations ("2.75-10",
"MH90-21") parse to nothing. Magento always wins when it has a value.

**Most non-`tyrescart` supplier rows resolve to nothing** (measured: tyrescart
12/12 by SKU; Mivomoto/Al Sarkal/pitstop/SandDance/LKN 0/39 — they stock
motorcycle and van sizes the storefront does not sell). Those rows keep the
supplier feed's own brand/pattern/size/year/country/price and show `-` for
Width, Profile, Rim, Load-Speed and Warranty, which exist in neither source.

### Book Inquiry
The **Book Inquiry** button on /tc-products opens `components/BookInquiryModal.tsx`.
Submitting a NEW enquiry calls the **`createCrmBooking`** mutation and only mirrors
the row into `services/inquiryStorage.ts` (localStorage) once the CRM confirms it,
stamped with the returned `crmBookingId` / `crmCustomerId` / `crmStatus`.

**This mutation has no undo** — the schema has no `deleteCrmBooking`,
`cancelCrmBooking` or `updateCrmBooking`, so a mistake can only be cleared in the
Magento admin. It is therefore never issued automatically, never cached and never
retried, and the submit button is disabled while in flight.

Blank fields are OMITTED from the mutation rather than sent as empty strings, so
they cannot blank out data already on a customer's record.

**Customer search** calls `crmCustomerByPhone` and renders the customer, their
vehicles and their booking history; "Use details" copies a customer (or one of
their vehicles) into the form. Things about that endpoint:
- it returns an **ARRAY**, not one customer, and matches the phone as a
  SUBSTRING — `"050"` returns 615 customers, `"9"` returns 4,206. Treating it as
  a single object silently drops every other row
- it does **not normalise** phone numbers — `0501234567` and `501234567` return
  DIFFERENT customers, and `+971501298878` matches NOBODY while `0501298878`
  returns that customer with 4 bookings
- a miss is a `graphql-no-such-entity` **ERROR**, not a null, so
  `fetchCrmCustomerByPhoneGraphQL` translates that one message into `null` and
  lets every other failure throw
- **phone is the only key.** A non-numeric query is not a name search — it
  matches EVERYTHING (`"Alice"` → 6,951 customers), and the client-side digit
  filter cannot help because `phoneDigits("Alice")` is `""`, which returns the
  list unfiltered
- **it is slow, and the cost is the match count** — ~1.3 s floor plus ~5 ms per
  matched customer: exact number 1.5 s, `"050"` (615) 6.8 s, `"05"` (2,065) 7.2 s,
  `"9"` (4,206) **20.8 s**. Trimming the selection set does NOT help — measured
  best-of-N, `{ entity_id }` alone costs the same as the full nested selection.
  There is no `limit`/`pageSize`/`filter` argument to bound it

**Search is backend-only and runs on SUBMIT.** Typing filters nothing and fires
no request; only the Search button or Enter calls the API (`handleSearchCustomer`
sets `submittedQuery`, which is what the table reads — `searchQuery` is just the
input binding). Before that split, typing `"050"` filtered the 15 already-loaded
recent bookings down to 10 without ever asking the backend, which read as
"missing rows".

**A customer with no bookings must not become a row** — an inquiry list may only
contain inquiries. `"050"` matches 615 customers of whom only 11 have bookings,
so a placeholder row per customer buries the 20 real inquiries under 604 blank
rows carrying an invented "Pending" badge. The "customer found, no inquiries"
case is reported by the persistent notice above the table
(`noBookingsNotice`), which is derived from the last result rather than stored.

**Duplicate behaviour, verified by submitting the same phone twice against the
live API:** the phone is the customer key, so a second submit does NOT create a
duplicate customer — it returns the same `entity_id`. It DOES silently overwrite
that customer's stored name and email with whatever is in the form, and it files
a NEW booking each time (correct for an enquiry log). The phone field therefore
runs a debounced `crmCustomerByPhone` check as you type and shows either
"Customer already added" (with the overwrite warning) or "New customer - will be
created on submit."

The enquiry table is **GraphQL-only**: it reads nothing from localStorage or
IndexedDB. It opens EMPTY and fills only with the bookings `crmCustomerByPhone`
returns for a searched number, held in memory for that session — closing the
modal or reloading empties it again. After `createCrmBooking` succeeds the list is
refreshed by re-reading that phone, so the new booking arrives through the same
path as every other row.

This shape is forced by the schema, verified by probing candidate names:
`crmBookings`, `crmCustomerList`, `crmCustomerSearch`, `crmInquiries`,
`crmBookingSearch`, `crmCustomerById` and the rest do not exist, and
`crmCustomerByPhone` takes a mandatory `phone: String!` that no wildcard
satisfies. **Status and Delete row actions are therefore gone** — there is
no `updateCrmBookingStatus` or `deleteCrmBooking` to persist either; status shows
as a read-only `Status <code>` badge. `Inquiry` and `updateInquiry` are still
imported for the edit-draft shape, but nothing populates the table from storage.

**`crmRecentBookings` is the only non-phone list query** and it takes NO
arguments — `limit`, `pageSize`, `first`, `count`, `currentPage`, `offset`,
`phone`, `filter` and `sort` are all rejected. It returns a fixed **15 rows**,
newest first, in ~1.5 s, and is what the modal opens with. Valid fields:
`entity_id`, `customer_id`, `contact_method`, `tire_size_1`, `tire_size_2`,
`quantity`, `brand_preference`, `quoted_price`, `enquiry_date`, `follow_up_date`,
`priority`, `status`, `detail`, `notes`, `created_at`, `updated_at`, plus nested
`customer { … }` and `vehicle { … }`. There is no `source` field.

**Booking `status` is an UNLABELLED integer and its meaning is unknown.**
Observed values are `1`, `4` and `5` (of 727 bookings: 54 / 35 / 638), and every
booking this app creates gets `1`. The API exposes no label — `status_label`,
`status_text`, `status_name`, `status_code`, `state` and `stage` all fail with
`Cannot query field`, no `crmBookingStatuses`-style metadata query exists, and
introspection is broken (see Environment), so the enum cannot be read. **The
mapping lives in the Magento CRM module's PHP source and must be obtained from
the backend team — do not invent labels.** The
`"Pending" | "Contacted" | "Closed"` union in `services/inquiryStorage.ts` is a
frontend-only invention that was never wired to these codes; `crmRows` hardcodes
`status: "Pending"` on every row, so the Contacted and Closed tabs are
permanently empty and 673 of 727 bookings display under the wrong label.

### Cost history
Clicking a **Cost value** in the supplier table opens `components/CostHistoryModal.tsx`
(Recharts line chart, Date Wise / Month Wise tabs).

The series comes from **`supplierProductPriceHistory(id, source)`** — the
authoritative API history. `source` follows the row's `product_source`
discriminator: `"supplier"` charts the cost we pay, `"competitor"` the
competitor's retail price; both return the value in a field named `price`. Dates
arrive as `DD-MMM-YYYY` ("08-May-2025"), which `new Date()` does not parse
reliably — use `parseHistoryDate`. One request per chart opened, cached per
`(id, source)`.

**Both arguments are load-bearing, and getting either wrong yields an empty
chart rather than an error:**

- **`id` is a SUPPLIER FEED id, not a storefront id.** They are different id
  spaces: TCKL-20510 is feed id `2446279` but storefront entity `11717`
  (decoded from `uid`). Passing the storefront id returns
  `Product with ID 11717 not found` (`graphql-no-such-entity`), which the modal's
  `.catch(() => [])` turns into an empty series. /tc-products therefore resolves
  the feed row by SKU first (`fetchSupplierProductsGraphQL({ sku, is_latest: 1 })`
  → `openCostHistory`) and passes that `id` plus the row's `product_source`.
  Resolve BEFORE opening — the modal is keyed on `id`, so setting it twice
  remounts the chart and fires a doomed request first.
- **`source` must match the row.** Asking `"supplier"` for a competitor product
  is a valid query against an empty series, so it returns `[]` silently.

**An `id` is one dated SNAPSHOT, not a product.** A SKU has one feed row per
capture date, each with its own id — `ps_171601815785` has 15 — and **every one
of those ids returns the same full series**, because the history is keyed to the
product. `supplierProducts` has NO id filter (`id`, `entity_id`, `product_id` are
all rejected); filter by `sku` to find a product's rows. Two different SKUs can be
the same tyre from different sellers with different histories, so matching on
brand/pattern/size is not enough to identify a series.

Nothing between the API and Recharts drops points — traced end to end:
`fetchSupplierPriceHistoryGraphQL` passes the array through, `fromApiHistory`
drops only unparseable dates/prices (0 in practice), and `toDateSeries` is a 1:1
map. **`toMonthSeries` is the ONE place the count changes** — it keeps the last
reading per calendar month by design, so a 15-point series shows 9 points on the
Month Wise tab. That is not a bug; use Date Wise for every point.

**The API is the only source — there is no IndexedDB fallback.** Mixing
locally-observed sync points into the same line as the API's real series would
misrepresent it, so what the endpoint returns is what is plotted, and an empty
response shows "No Cost History Available." The `costHistory` store is still
written by manual syncs (`markManualSync` / `consumeManualSync`, because
`SyncTaskDefinition.run` takes no arguments and cannot otherwise tell how it was
triggered) but the chart no longer reads it — verified 0 reads while charting.

## Known gaps

- **No auth.** No `middleware.ts`; nothing gates any route.
- **No checkout.** `hooks/useCart` + `services/cartStore.ts` persist a cart, but only tc-products' Add-to-Cart writes to it; there is no cart UI, order API or receipt. Offline orders/outbox is the deferred Phase 4.
- **`Offer` column now reads the `offers` attribute** (option ids → 8 promo labels such as "Free Wheel Alignment", "Buy 3 Get 1 Free"; 342 of 8,526 products). It previously showed `—` on every row because it was computed from a regular-vs-final price spread, and no product on this store has `final < regular`.
- **`is_offers` does not exist** on the Magento schema — `Cannot query field "is_offers" on type "ProductInterface"`. The real field is `offers`.
- **`Qty` is `stock_status` only** (0/1). No numeric on-hand count exists in the API.
- **`/dashboard` is a placeholder** and is the default landing route.
- **CRM booking status codes are unmapped** (`1`/`4`/`5`). Every row displays as "Pending", so the Contacted and Closed tabs are permanently empty. Blocked on the backend team for the label list — see Book Inquiry.
- **Competitor rows can't open their price history from the supplier table.** The chart is triggered by the Cost cell, and competitor `cost` is structurally 0, so 268k rows have no click target even though `supplierProductPriceHistory` holds their series. /tc-products does not have this problem — it gates on `price`.
- **Each chart open on /tc-products costs an extra SKU→feed-id lookup** (~1–2 s before the modal appears). The modal caches per `(id, source)`, but that resolution step is not cached, so reopening the same row pays it again.
- **Schema introspection is unavailable** (Braintree DI fault on the Magento build), which blocks every schema tool. Field existence has to be probed one name at a time.
- **The two big page components are ~1,850 and ~2,000 lines with ~1,180 identical lines between them** (table shell, filter bar, column modal, pagination). Extracting shared components is a known, deliberately deferred task — until then, a fix applied to one page usually needs applying to the other.
