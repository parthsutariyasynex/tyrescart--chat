# TyresCart POS — Development Plan

A single reference for **how to develop this project** and **how to add IndexedDB**
for offline / instant‑load caching (the Webkul‑POS "sync" pattern).

---

## 1. What this project is

A **frontend‑only Next.js 16 (App Router)** point‑of‑sale UI for TyresCart.
There is **no local database and no backend models** — the app reads live data
from the Magento **GraphQL** endpoint through a thin proxy.

```
Browser (React POS UI)
   │  calls service functions
   ▼
services/graphql.ts ──► /api/graphql (proxy route) ──► https://www.tyrescart.com/graphql
```

### Current structure
```
app/
  layout.tsx                 root layout (ToastProvider, Poppins font)
  page.tsx                   redirect → /dashboard
  globals.css                ⭐ single source of truth for ALL colours + fonts
  api/graphql/route.ts       POST proxy to Magento GraphQL
  dashboard/
    page.tsx                 renders PosProductsPage
    products/page.tsx        the POS catalog UI (products + TyresChat modal)
    chat/                     dashboard chat view
  tyre_guide/chat/page.tsx   Tyre Chat Shortcuts (search + click‑to‑copy, 83 items)
components/
  ToastProvider.tsx          toast notifications
services/
  graphql.ts                 GraphQL client (fetchSupplierProductsGraphQL, fetchTyresChatGraphQL)
  queries.ts                 query string builders
  types.ts                   shared TS types
  tyresChatData.ts           83 chat shortcuts (fallback dataset)
```

### Conventions (keep these)
- **Theming:** every colour/font lives in `app/globals.css` (`:root` tokens + the
  "THEME MAP" that points Tailwind classes at those tokens). To rebrand, edit the
  tokens there — **never** hard‑code colours in components.
- **Path alias:** `@/*` → project root (e.g. `@/services/graphql`).
- **Data access:** UI never calls `fetch("/api/...")` directly for domain data — it
  calls a function in `services/`. Add new data access as a service function.
- **Types** live in `services/types.ts`; **queries** in `services/queries.ts`.

---

## 2. Local development

```bash
npm install        # install deps
npm run dev        # http://localhost:3000  (redirects to /dashboard)
npm run build      # production build (run before committing big changes)
npm run start      # serve the production build
npm run lint       # eslint
```

No `.env` is required for the frontend — the GraphQL endpoint is hard‑coded in
`app/api/graphql/route.ts`. If you later make it configurable, add
`NEXT_PUBLIC_GRAPHQL_ENDPOINT` to `.env.local`.

### Adding a feature — checklist
1. Need new data? Add a **query builder** in `services/queries.ts` + a **type** in
   `services/types.ts` + a **fetch function** in `services/graphql.ts`.
2. Build the UI as a page/route under `app/` (client component with `"use client"`).
3. Use only Tailwind classes already mapped in `globals.css` (or add the token +
   map entry there) so the theme stays centralised.
4. `npm run build` to confirm it compiles.

---

## 3. IndexedDB — offline & instant‑load caching

### Why IndexedDB here
The POS already shows a **"syncing…"** overlay. Right now every load hits the network.
IndexedDB lets us behave like a real POS:

- **Instant first paint** — render cached products/shortcuts immediately, refresh in
  the background.
- **Offline resilience** — the POS keeps working if the Magento endpoint is slow/down.
- **Large capacity** — IndexedDB holds MBs of structured data (localStorage is ~5MB
  of strings only and is synchronous; IndexedDB is async and structured — the right tool).

### What to store (object stores)
| Store | Key | Holds |
|-------|-----|-------|
| `products` | `id` | supplierProducts items from GraphQL |
| `tyresChat` | `id` | tyresChat shortcuts |
| `meta` | `key` | sync timestamps, e.g. `{ key: "products:lastSync", value: <ms> }` |

### Recommended approach
Zero new dependencies — a small promise wrapper is enough. (If you prefer, `npm i idb`
gives a nicer API; the plan below is dependency‑free.)

**Step 1 — create `services/db.ts`:**
```ts
// Minimal IndexedDB wrapper (no dependencies)
const DB_NAME = "tyrescart-pos";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
      if (!db.objectStoreNames.contains("tyresChat")) db.createObjectStore("tyresChat", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly").objectStore(store).getAll();
    tx.onsuccess = () => resolve(tx.result as T[]);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPutAll<T>(store: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    items.forEach((it) => os.put(it));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbSetMeta(key: string, value: unknown) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
}
```
> Guard for SSR: only touch `indexedDB` in the browser (`typeof window !== "undefined"`).
> All the calls above run inside `useEffect`, which is client‑only, so you're safe.

**Step 2 — cache‑first read‑through in the service layer.**
Wrap the existing `fetchSupplierProductsGraphQL` / `fetchTyresChatGraphQL` so the page
gets cached data instantly, then fresh data when it arrives:
```ts
// services/products.cache.ts
import { idbGetAll, idbPutAll, idbSetMeta } from "./db";
import { fetchSupplierProductsGraphQL } from "./graphql";
import type { SupplierProductItem } from "./types";

export async function getProductsCached(
  params: Parameters<typeof fetchSupplierProductsGraphQL>[0],
  onFresh?: (items: SupplierProductItem[]) => void,
): Promise<SupplierProductItem[]> {
  const cached = await idbGetAll<SupplierProductItem>("products").catch(() => []);

  // Background refresh (don't block first paint)
  fetchSupplierProductsGraphQL(params)
    .then(async (res) => {
      if (res.items?.length) {
        await idbPutAll("products", res.items);
        await idbSetMeta("products:lastSync", Date.now());
        onFresh?.(res.items);
      }
    })
    .catch(() => { /* offline → keep cached */ });

  return cached;
}
```

**Step 3 — wire into `app/dashboard/products/page.tsx`:**
```ts
useEffect(() => {
  let mounted = true;
  getProductsCached(
    { brand: brandFilter, plain_size: sizeFilter, pageSize: 24, currentPage },
    (fresh) => { if (mounted) setProducts(fresh); }   // update when network returns
  ).then((cached) => {
    if (mounted && cached.length) { setProducts(cached); setIsSyncing(false); }  // instant paint
  });
  return () => { mounted = false; };
}, [brandFilter, sizeFilter, currentPage]);
```
Do the same for `tyresChat` (store `tyresChat`), falling back to `TYRE_CHAT_SHORTCUTS`
when both cache and network are empty.

### Cache invalidation (TTL)
Read `meta → products:lastSync`. If `Date.now() - lastSync > 24h`, show the syncing
overlay while refreshing; otherwise refresh silently in the background.

### Implementation order
1. `services/db.ts` (wrapper) → verify in DevTools ▸ Application ▸ IndexedDB.
2. `services/products.cache.ts` + wire products page (read‑through).
3. Repeat for tyresChat.
4. Add TTL + tie the "syncing…" overlay to real sync state.
5. (Optional) a "Clear cache / Force sync" button in the header that wipes the stores.

---

## 4. Roadmap / next ideas
- Bump `DB_VERSION` and add an `onupgradeneeded` migration whenever a store changes.
- Add a service worker + web app manifest to make it an installable **PWA** (matches
  the Webkul POS demo — offline + "Add to home screen").
- Persist the cart/session in a `cart` object store so an in‑progress sale survives refresh.
- Move the GraphQL endpoint to `NEXT_PUBLIC_GRAPHQL_ENDPOINT` for staging vs prod.
