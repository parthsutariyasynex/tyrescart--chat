'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  HomeIcon,
  ShoppingBagIcon,
  ChatBubbleLeftRightIcon,
  TruckIcon,
  ArrowsPointingOutIcon,
  WifiIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import SidebarSyncButton from '@/components/SidebarSyncButton';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { matchesSearch, parseAspectRim, parseRimOnly, matchesAspectRim } from '@/services/searchFilter';
import { Skeleton, SupplierTableSkeleton } from '@/components/Skeletons';
import {
  getCachedSupplierProducts,
  countCachedSupplierProducts,
  syncSupplierProductsPage,
  type CachedSupplierProduct,
} from '@/services/cache';
import {
  syncManager,
  useSyncTask,
  useSyncBatches,
  useOnSyncComplete,
} from '@/hooks/useSyncManager';
import { SYNC_TASK } from '@/services/syncTasks';

/**
 * Field names `searchFilter` should read on this page's `Product` shape.
 *
 * The module defaults to the raw `SupplierProductItem` names
 * (`product_name`, `sku`, `brand_category`, …); the table works with the mapped
 * shape, so the equivalents are passed explicitly. That override is exactly why
 * `matchesSearch` takes the field lists as parameters.
 */
const SEARCH_FIELDS = ['pattern', 'itemCode', 'brand', 'category', 'country', 'size'] as const;
/** Numeric tokens are matched against the size ONLY — never name or SKU. */
const SEARCH_SIZE_FIELDS = ['size'] as const;

/** Size-box predicate: full/normalized size, with width-omitted aspect+rim fallback (e.g. "55R16"). */
function matchesSizeInput(item: { size: string }, s: string): boolean {
  const ar = parseAspectRim(s);
  if (ar) return matchesAspectRim(item, ar.aspect, ar.rim, ['size']);
  return matchesSearch(item, s, ['size'], ['size']);
}


export interface Product {
  id: number;
  source: string;
  itemCode: string;
  /** Display label derived from the feed's `product_source` discriminator:
   *  "Supplier" | "Competitor", or "" when the row predates that field. */
  productType: string;
  category: string;
  brand: string;
  pattern: string;
  size: string;
  /** Display size incl. load index + speed rating, e.g. "215/55 R18 99H". */
  sizeFull: string;
  runflat: boolean;
  year: number;
  country: string;
  flag: string;
  qty: number;
  cost: number;
  fittingPrice: number;
  date: string;
  /** 1 = current/latest record, 0 = historical. Used by the client-side Latest filter. */
  is_latest: number;
}

interface Toast {
  id: number;
  msg: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Reused collator for column sorting. `String.prototype.localeCompare` builds a
 * fresh collator on every call, which is fine occasionally but not when a sort
 * is always active: with LATEST? unticked the comparator runs across ~318k rows
 * (~5.7M comparisons). One shared instance is the same ordering, far cheaper.
 */
const collator = new Intl.Collator();

function formatDateDDMM(rawDate?: string): string {
  if (!rawDate || !rawDate.trim()) return '-';
  const str = rawDate.trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const monthStr = MONTH_NAMES[d.getMonth()] || String(d.getMonth() + 1).padStart(2, '0');
    return `${day}-${monthStr}`;
  }
  const match = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    if (match[1].length === 4) {
      const day = match[3].padStart(2, '0');
      const monthIdx = parseInt(match[2], 10) - 1;
      const monthStr = MONTH_NAMES[monthIdx] || match[2].padStart(2, '0');
      return `${day}-${monthStr}`;
    } else {
      const day = match[1].padStart(2, '0');
      const monthIdx = parseInt(match[2], 10) - 1;
      const monthStr = MONTH_NAMES[monthIdx] || match[2].padStart(2, '0');
      return `${day}-${monthStr}`;
    }
  }
  return str;
}

/**
 * Append the Load Index + Speed Rating (e.g. "99H", "94Y", "129/126R") to the
 * tyre size when present. The supplier feed's `load_index` field is empty, so
 * it's parsed from the product name: find the size, then the rating token that
 * follows it — skipping a ply-rating like "10PR". Load index may be a dual
 * value (129/126); the speed rating is a single trailing letter. Returns the
 * size unchanged when no rating is found. No hardcoded values.
 *   "215/55 R18" + "LING LONG 215/55R18 99H HP010 2026" → "215/55 R18 99H"
 */
function sizeWithLoadSpeed(size: string, productName: string): string {
  if (!size) return size;
  const m = (productName || '').match(
    /\d{2,3}\s*\/\s*\d{2}\s*Z?R?\s*\d{2}\s+(?:\d{1,2}PR\s+)?(\d{2,3}(?:\/\d{2,3})?[A-Z])(?![A-Z])/i,
  );
  const rating = m ? m[1].toUpperCase().replace(/\s+/g, '') : '';
  return rating ? `${size} ${rating}` : size;
}

/**
 * Map a cached supplier record (REAL supplierProducts GraphQL data) into the
 * table's Product shape. Fields the supplier feed doesn't provide (qty,
 * fittingPrice, date, flag) default to empty/0; `runflat` is inferred from the
 * product name.
 */
/**
 * Human label for the feed's `product_source` discriminator.
 *
 * `supplierProducts` is a combined feed: it returns both sides of the catalogue
 * and `product_source` says which. Rows cached before that field was added to
 * the query have no value, so they render as "—" rather than being guessed at.
 */
function productTypeLabel(source?: string): string {
  if (source === 'supplier') return 'Supplier';
  if (source === 'competitor') return 'Competitor';
  return '';
}

/**
 * Stable numeric row id for a cached supplier record. Numeric ids pass through
 * unchanged; anything else maps to a negative slot derived from `sort_seq`, so
 * non-numeric ids stay distinct from each other AND from real ids.
 */
function supplierRowId(p: CachedSupplierProduct): number {
  const n = Number(p.id);
  if (p.id !== "" && p.id !== null && p.id !== undefined && Number.isFinite(n)) return n;
  return typeof p.sort_seq === "number" ? -(p.sort_seq + 1) : 0;
}

function mapSupplierToProduct(p: CachedSupplierProduct): Product {
  return {
    // `CachedSupplierProduct.id` is `string | number`. A non-numeric id used to
    // collapse to 0 via `Number(p.id) || 0`, so EVERY such row shared id 0 —
    // and because `selectedIds` is a Set<number>, ticking one checkbox ticked
    // all of them. Fall back to the row's `sort_seq` (unique per row) mapped
    // into negative space, which cannot collide with a real numeric id.
    // `sort_seq` is absent on rows cached before v4; those keep the old
    // behaviour until the next full sync repopulates the field.
    id: supplierRowId(p),
    source: p.source_name ?? '',
    itemCode: p.sku ?? '',
    productType: productTypeLabel(p.product_source),
    category: p.brand_category ?? '',
    brand: p.brand ?? '',
    pattern: p.product_name ?? '',
    size: p.size ?? '',
    sizeFull: sizeWithLoadSpeed(p.size ?? '', p.product_name ?? ''),
    runflat: p.runflat !== undefined && p.runflat !== null
      ? (typeof p.runflat === 'boolean' ? p.runflat : String(p.runflat).toLowerCase() === 'yes' || String(p.runflat) === '1')
      : /run\s*flat|\bRFT\b|\bZP\b|\bSSR\b|\bMOE\b/i.test(p.product_name ?? ''),
    year: Number(p.year) || 0,
    country: p.country ?? '',
    flag: '',
    qty: 0,
    cost: Number(p.cost) || Number(p.price) || 0,
    fittingPrice: 0,
    date: p.date ?? '',
    is_latest: Number(p.is_latest) === 1 ? 1 : 0,
  };
}

export default function SupplierProductsPage() {
  const isOnline = useOnlineStatus();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandInput, setBrandInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [latestOnly, setLatestOnly] = useState(true);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  // Default to newest-first. Without a sort the table renders in cache order,
  // which mirrors the API's `id ASC` — i.e. catalogue insertion order, not
  // recency. On the live data that puts the OLDEST rows (2025-05-08) on page 1
  // and the newest (2026-07-20) on page ~587, so the latest stock looked absent.
  const [sortColumn, setSortColumn] = useState<keyof Product | null>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeDrawerItem, setActiveDrawerItem] = useState<Product | null>(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isDensityMenuOpen, setIsDensityMenuOpen] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'breathable'>('comfortable');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [pageSyncing, setPageSyncing] = useState(false);
  /** Synchronous latch for the PAGE-scoped sync only. The full catalogue sync
   *  is owned by the global manager, which dedupes on its own. */
  const syncInFlight = useRef(false);
  /** True only while the cold-start latest-products phase is still running. */
  const [bootstrapping, setBootstrapping] = useState(false);

  /* ── Global sync manager: OBSERVE, don't own ───────────────────────
     The catalogue sync runs inside `syncManager`, outside React, so it keeps
     running when this page unmounts. Everything below is a READ of that global
     state — the page contributes no sync lifecycle of its own, which is what
     lets a sync started here survive navigation to another route. */
  const supplierSync = useSyncTask(SYNC_TASK.supplierProducts);
  const fullSyncing = supplierSync.status === 'running';
  const syncProgress = supplierSync.progress;

  // IndexedDB-first: on load/refresh/navigation we ONLY read the cached
  // catalogue — no API request, no background sync, no revalidation. Fresh data
  // comes solely from the Sync buttons (handlePageSync / handleFullSync). If the cache is empty,
  // the table shows its empty state until the user syncs.
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark-theme');
    let alive = true;
    (async () => {
      const cached = await getCachedSupplierProducts();
      if (!alive) return;
      const mapped = cached.map(mapSupplierToProduct);
      setAllProducts(mapped);
      setIsLoading(false);
      // Seed the batch de-dupe set with what we just loaded. Mounting DURING a
      // running sync otherwise appends rows that are already on screen: the
      // cache read brings in the full store, while `seenIds` starts empty on a
      // fresh mount, so every subsequent batch is a duplicate (measured: 67,500).
      for (const p of mapped) seenIds.current.add(p.id);

      // CACHE-FIRST IS UNCHANGED: with anything cached we render it and stop —
      // no GraphQL on load, navigation or refresh. The bootstrap below runs
      // ONLY on a cold cache, where there is nothing to be cache-first about
      // and the alternative is an empty table until the user finds Sync.
      // SOURCE OF TRUTH: does supplier data exist in IndexedDB? Anything cached
      // means no auto-sync. An empty store means bootstrap — for ANY reason:
      // first load, storage eviction, or a manual cache wipe. The
      // `bootstrapCompleted` flag is recorded for diagnostics but deliberately
      // does NOT gate this, so an evicted cache always self-heals.
      if (cached.length > 0) return;

      // Confirm the store really is empty rather than unreadable. The cache
      // read above swallows IndexedDB errors and returns [], so a transient
      // fault (blocked upgrade, quota pressure, DB locked by another tab) would
      // otherwise look identical to an empty cache and launch a ~3,187-request
      // sync on a device that already holds the catalogue. `countCachedSupplierProducts`
      // propagates the error instead; "unknown" is not "empty", so we skip and
      // let the next load — or the Sync button — settle it.
      try {
        if ((await countCachedSupplierProducts()) > 0) return;
      } catch (err) {
        console.warn('[bootstrap] cannot confirm the cache is empty — skipping auto-sync:', err);
        return;
      }
      if (!alive) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      // Hand the work to the GLOBAL manager instead of running it inline. The
      // page no longer owns the sync, so it survives navigation away from this
      // route, and `start()` dedupes synchronously against a run the sidebar
      // (or a previous mount) may already have going — which also covers React
      // StrictMode firing this effect twice in dev.
      //
      // Progress, streamed rows and completion all come back through the
      // subscriptions declared below.
      setBootstrapping(true);
      void syncManager.start(SYNC_TASK.supplierProducts);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ── Live rows from the global sync ──
     Batches are emitted by the manager once each page of rows is already in
     IndexedDB, so the UI can never show a product the cache lacks. Committing
     every batch would re-run the filter/sort memo over an array growing to
     318k rows (~638 times) and lock the page up, so batches are buffered and
     flushed on an interval — with the FIRST one committed immediately so
     products appear as soon as they exist. */
  const batchBuffer = useRef<Product[]>([]);
  const seenIds = useRef<Set<number>>(new Set());
  const lastCommit = useRef(0);
  const committedOnce = useRef(false);

  const commitBatches = useCallback(() => {
    if (!batchBuffer.current.length) return;
    const chunk = batchBuffer.current;
    batchBuffer.current = [];
    lastCommit.current = Date.now();
    setAllProducts(prev => [...prev, ...chunk]);
  }, []);

  useSyncBatches<CachedSupplierProduct>(SYNC_TASK.supplierProducts, (batch) => {
    for (const row of batch) {
      const mapped = mapSupplierToProduct(row);
      // The full pass re-fetches rows the latest-only phase already delivered.
      // IndexedDB upserts them by keyPath "id"; a React array would not, so
      // without this the latest rows would appear twice.
      if (seenIds.current.has(mapped.id)) continue;
      seenIds.current.add(mapped.id);
      batchBuffer.current.push(mapped);
    }
    if (!committedOnce.current) { committedOnce.current = true; commitBatches(); return; }
    if (Date.now() - lastCommit.current >= 1000) commitBatches();
  });

  /* ── Settle up when the global sync finishes ──
     Fires wherever the user is; if they navigated away and came back, the mount
     effect above has already re-read the cache, so this is simply a no-op. */
  useOnSyncComplete(SYNC_TASK.supplierProducts, () => {
    commitBatches();
    // Re-read from IndexedDB so the list is deduped and in canonical `sort_seq`
    // order — batches arrive from 8 concurrent workers, so append order does not
    // match the catalogue's. React 18+ ignores setState on an unmounted
    // component, so a late resolve after navigation is harmless.
    void getCachedSupplierProducts().then((rows) => {
      setAllProducts(rows.map(mapSupplierToProduct));
      setBootstrapping(false);
      seenIds.current.clear();
      committedOnce.current = false;
    });
  });

  // Surface a failed background sync — the manager records the reason, but with
  // no page mounted at the time there was nothing to show it.
  useEffect(() => {
    if (supplierSync.status === 'error' && supplierSync.error) {
      setBootstrapping(false);
      addToast('Could not load supplier products. Please use Sync to retry.');
    }
  }, [supplierSync.status, supplierSync.error]);

  const addToast = (msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  };

  // Per-Page Sync — Header button refreshes ONLY current page data
  const handlePageSync = async () => {
    // Ref, not state: `setPageSyncing(true)` doesn't take effect until the next
    // render, so two clicks in the same tick would both read `false` and both
    // fire. `syncInFlight` flips synchronously, so the second click always loses.
    if (syncInFlight.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      addToast('Offline: cannot sync without an internet connection.');
      return;
    }
    syncInFlight.current = true;
    setPageSyncing(true);
    try {
      const items = await syncSupplierProductsPage({ pageSize, currentPage });
      setAllProducts(items.map(mapSupplierToProduct));
      addToast(`Synced page ${currentPage} supplier products.`);
    } catch {
      addToast('Sync failed. Please try again.');
    } finally {
      syncInFlight.current = false;
      setPageSyncing(false);
    }
  };

  /*
   * Full catalogue sync now lives entirely in the global manager (see
   * `services/syncTasks.ts`) and is triggered by <SidebarSyncButton />. This
   * page deliberately keeps NO handler for it:
   *   - it must not stop when the user navigates away, and
   *   - it must not also be registered via `registerModuleSync`, or a sidebar
   *     sync would run the whole ~3,187-request pass twice.
   * The page only observes — see `useSyncTask` / `useSyncBatches` above.
   */

  const supplierRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef<HTMLDivElement>(null);
  const densityRef = useRef<HTMLDivElement>(null);

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (supplierRef.current && !supplierRef.current.contains(target)) {
        setIsSupplierOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(target)) {
        setIsCategoryOpen(false);
      }
      if (brandRef.current && !brandRef.current.contains(target)) {
        setIsBrandOpen(false);
      }
      if (pageSizeRef.current && !pageSizeRef.current.contains(target)) {
        setIsPageSizeOpen(false);
      }
      if (densityRef.current && !densityRef.current.contains(target)) {
        setIsDensityMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
      }
      if (e.key === 'Escape') {
        setActiveDrawerItem(null);
        setIsColumnModalOpen(false);
        setIsDensityMenuOpen(false);
        setIsPageSizeOpen(false);
        setIsSupplierOpen(false);
        setIsCategoryOpen(false);
        setIsBrandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered & Sorted Dataset
  const filteredProducts = useMemo(() => {
    // Start from the array itself, NOT a spread copy. Every filter below
    // already returns a fresh array, so the eager `[...allProducts]` was an
    // extra full-size allocation (318k entries) on every keystroke-triggered
    // recompute. The only step that would mutate is `.sort()`, which copies
    // explicitly below when nothing else has copied yet.
    let result: Product[] = allProducts;

    // Search — delegated to `services/searchFilter.ts`, the single source of
    // truth for the search contract: tokenized on comma/whitespace, AND across
    // tokens, OR across fields, partial and case-insensitive.
    //
    // This replaces an inline copy that matched numeric tokens with an
    // UNANCHORED `sizeDigits.includes(num)` and also ran them through the text
    // fields. That let a width query hit unrelated stock via SKU digits —
    // measured on the live catalogue: "195" returned 326 rows of which 57 were
    // false positives (e.g. size 33X/12.5 R22, SKU 2281953), and "55" returned
    // 2,344 of which 1,454 were wrong. `matchesSearch` anchors a size token to
    // a width prefix or a whole size component and never matches it against
    // name/SKU, so short numeric searches stay precise. Full sizes are
    // unaffected — every spelling of "205/55R16" still returns the same 61 rows.
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      let matched = result.filter(item => matchesSearch(item, q, SEARCH_FIELDS, SEARCH_SIZE_FIELDS));
      // Width-omitted fallback ("55R16") — unchanged, still only when the exact
      // pass found nothing.
      if (matched.length === 0) {
        const ar = parseAspectRim(q);
        if (ar) {
          matched = result.filter(item => matchesAspectRim(item, ar.aspect, ar.rim, ['size']));
        }
      }
      result = matched;
    }

    // Supplier / Category — exact match on the selected dropdown value.
    if (supplierFilter !== 'ALL') result = result.filter(item => item.source === supplierFilter);
    if (categoryFilter !== 'ALL') result = result.filter(item => item.category === categoryFilter);

    // Brand — comma-separated list or typed text, partial match on ANY.
    if (brandInput.trim()) {
      const brands = brandInput.split(',').map(b => b.trim().toLowerCase()).filter(Boolean);
      if (brands.length) result = result.filter(item => brands.some(b => item.brand.toLowerCase().includes(b)));
    }

    // Size — comma-separated list, each normalized (plain_size) OR formatted-size match.
    if (sizeInput.trim()) {
      const sizes = sizeInput.split(',').map(s => s.trim()).filter(Boolean);
      if (sizes.length) result = result.filter(item => sizes.some(sz => matchesSizeInput(item, sz)));
    }

    // Year — comma-separated exact list (matches route's $in).
    if (yearInput.trim()) {
      const years = yearInput.split(',').map(y => parseInt(y.trim(), 10)).filter(y => !isNaN(y));
      if (years.length) result = result.filter(item => years.includes(item.year));
    }

    // Qty — minimum threshold (matches route's { $gte }).
    if (qtyInput.trim() && !isNaN(Number(qtyInput))) {
      const n = Number(qtyInput);
      result = result.filter(item => item.qty >= n);
    }
    // Latest checkbox — client-side filter over the cached catalogue. Checked =
    // current records only (is_latest = 1); unchecked = ALL synced products.
    // Purely local; never triggers an API call.
    if (latestOnly) result = result.filter(item => item.is_latest === 1);

    if (sortColumn) {
      // `sort` mutates in place. If no filter ran, `result` is still the
      // `allProducts` state array — copy first so we never reorder state.
      if (result === allProducts) result = [...result];
      const dir = sortAsc ? 1 : -1;
      result.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return collator.compare(valA, valB) * dir;
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * dir;
        }
        if (typeof valA === 'boolean' && typeof valB === 'boolean') {
          return (valA === valB ? 0 : valA ? 1 : -1) * dir;
        }
        return 0;
      });
    }

    return result;
  }, [allProducts, searchQuery, supplierFilter, categoryFilter, brandInput, sizeInput, yearInput, qtyInput, latestOnly, sortColumn, sortAsc]);

  // All three dropdown lists in ONE pass. Three separate useMemos each walked
  // the full 318k-row array and allocated its own intermediate — at this size
  // that is three full scans plus three throwaway arrays every time the
  // catalogue changes. One reduce over the array gives the same three lists.
  const { supplierOptions, categoryOptions, brandOptions } = useMemo(() => {
    const sources = new Set<string>();
    const categories = new Set<string>();
    const brands = new Set<string>();
    for (const p of allProducts) {
      if (p.source) sources.add(p.source);
      if (p.category) categories.add(p.category);
      if (p.brand) brands.add(p.brand);
    }
    return {
      supplierOptions: Array.from(sources).sort(),
      categoryOptions: Array.from(categories).sort(),
      brandOptions: Array.from(brands).sort(),
    };
  }, [allProducts]);

  const filteredBrandOptions = useMemo(() => {
    if (!brandInput.trim()) return brandOptions;
    return brandOptions.filter(b => b.toLowerCase().includes(brandInput.toLowerCase()));
  }, [brandOptions, brandInput]);

  const partialSizeInfo = useMemo(() => {
    const q = (searchQuery || sizeInput).trim();
    if (!q) return null;

    // Work out which of the three size components the query actually pinned
    // down. Whatever is left unspecified is masked, so the banner mirrors the
    // search back: width `***`, aspect `**`, rim `**`.
    //   R13        → ***/**R13     (rim only)
    //   13         → ***/**R13     (bare rim)
    //   80         → ***/80R**     (aspect only)
    //   195        → 195/**R**     (width only)
    //   80R13      → ***/80R13     (aspect + rim, unchanged)
    let width: string | null = null;
    let aspect: string | null = null;
    let rim: string | null = null;

    const ar = parseAspectRim(q);
    if (ar) {
      aspect = ar.aspect;
      rim = ar.rim;
    } else {
      const rimOnly = parseRimOnly(q);
      if (rimOnly) {
        rim = rimOnly;
      } else if (/^\d{3}$/.test(q)) {
        width = q;            // 3 digits → a tyre width
      } else if (/^\d{2}$/.test(q)) {
        // A bare 2-digit number is ambiguous, so split it by the ranges the two
        // components actually occupy: rims run ~12-24 inches, aspect ratios
        // ~25-85. So "13"/"17" read as a rim, "55"/"80" as an aspect ratio.
        if (Number(q) <= 24) rim = q;
        else aspect = q;
      }
    }
    // Nothing identifiable, or a fully-specified size — no banner.
    if (!width && !aspect && !rim) return null;

    const widths = new Set<string>();
    for (const item of filteredProducts) {
      const m = item.size.match(/\b(\d{3})\s*[\/\s]/);
      if (m) widths.add(m[1]);
    }
    return {
      matchedPattern: `${width ?? '***'}/${aspect ?? '**'}R${rim ?? '**'}`,
      // Only offer the width picker when the width is the missing piece.
      // Searching a width already answers that question, so the chip row would
      // just echo the query back.
      availableWidths: width ? [] : Array.from(widths).sort((a, b) => Number(a) - Number(b)),
      hasWidth: width !== null,
      aspect: aspect ?? '',
      rim: rim ?? '',
    };
  }, [searchQuery, sizeInput, filteredProducts]);

  // Count & page slice come entirely from the cached (IndexedDB) dataset — for
  // BOTH Latest and All Products modes. No server-side fetch anywhere.
  const totalItems = filteredProducts.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Skeleton only while reading the cache (isLoading) or during an in-progress
  // Sync that has no data yet. An empty cache with no sync shows the empty state.
  // The third clause covers the cold-start bootstrap: until the latest-products
  // phase lands, the LATEST? view can legitimately be empty while data IS on its
  // way, and "No products found" would be telling the user something false.
  const showSkeleton =
    isLoading ||
    ((pageSyncing || fullSyncing) && allProducts.length === 0) ||
    (bootstrapping && currentItems.length === 0);

  // Keep the current page within range whenever the result set shrinks (a
  // filter change, page-size change, or Latest toggle), so the table never sits
  // on an empty, out-of-range page.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
    else if (currentPage < 1) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const handleSort = (colKey: keyof Product) => {
    if (sortColumn === colKey) {
      setSortAsc(prev => !prev);
    } else {
      setSortColumn(colKey);
      setSortAsc(true);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSupplierFilter('ALL');
    setCategoryFilter('ALL');
    setBrandInput('');
    setSizeInput('');
    setYearInput('');
    setQtyInput('');
    setLatestOnly(true);
    setCurrentPage(1);
    addToast('Filters reset to default.');
  };

  const handleSelectAll = (checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      currentItems.forEach(p => newSelected.add(p.id));
    } else {
      currentItems.forEach(p => newSelected.delete(p.id));
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectRow = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast(`Copied "${text}" to clipboard!`);
  };

  const copyRowData = (item: Product) => {
    const formattedCost = (item.cost || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const parts = [
      item.category || '',
      item.brand || '',
      item.pattern || '',
      item.sizeFull || item.size || '',
      item.year && item.year > 0 ? item.year : '',
      item.country && item.country !== '-' ? item.country : '',
      item.qty ?? 0,
      formattedCost,
    ].filter(val => val !== '' && val !== undefined && val !== null);
    const rowString = parts.join(' - ');
    navigator.clipboard.writeText(rowString);
    addToast(`Copied: "${rowString}"`);
  };

  const exportCSV = () => {
    if (!filteredProducts.length) return;
    const headers = ['SOURCE', 'TYPE', 'CATEGORY', 'BRAND', 'TYRE PATTERN', 'SIZE', 'RUNFLAT', 'YEAR', 'COUNTRY', 'QTY', 'COST', 'FITTING PRICE', 'DATE'];
    const rows = filteredProducts.map(p => [
      p.source, p.productType, p.category, p.brand, `"${p.pattern.replace(/"/g, '""')}"`, p.size, p.runflat ? 'Yes' : 'No', p.year, p.country, p.qty, p.cost.toFixed(2), p.fittingPrice.toFixed(2), p.date
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'supplier_products.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(`Exported ${filteredProducts.length} items to CSV.`);
  };

  const toggleColumn = (colKey: string) => {
    const newHidden = new Set(hiddenColumns);
    if (newHidden.has(colKey)) newHidden.delete(colKey);
    else newHidden.add(colKey);
    setHiddenColumns(newHidden);
  };

  const isAllPageSelected = currentItems.length > 0 && currentItems.every(p => selectedIds.has(p.id));

  // Cell padding class based on Density mode
  const cellPaddingClass = useMemo(() => {
    if (density === 'compact') return 'py-2 px-3.5';
    if (density === 'comfortable') return 'py-3 px-4';
    return 'py-4 px-4'; // breathable
  }, [density]);

  const categoryBadges: Record<string, string> = {
    PREMIUM: "bg-purple-50 text-purple-700 border-purple-200/70",
    QUALITY: "bg-blue-50 text-blue-700 border-blue-200/70",
    BUDGET: "bg-amber-50 text-amber-700 border-amber-200/70",
    'MID-RANGE': "bg-teal-50 text-teal-700 border-teal-200/70"
  };

  const brandBadges: Record<string, string> = {
    Bridgestone: "bg-emerald-50 text-emerald-800 border-emerald-200/70",
    Habilead: "bg-teal-50 text-teal-800 border-teal-200/70",
    Kumho: "bg-indigo-50 text-indigo-800 border-indigo-200/70",
    Michelin: "bg-sky-50 text-sky-800 border-sky-200/70",
    Continental: "bg-orange-50 text-orange-800 border-orange-200/70"
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-200 relative">

      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="w-[68px] flex-none bg-white border-r border-slate-200 flex flex-col items-center justify-between py-3 z-30 shadow-xs">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Badge (Links to /dashboard) */}
          <Link
            href="/dashboard"
            title="TyresCart POS"
            className="flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <Image
              src="/favicon-color.png"
              alt="TyresCart"
              width={40}
              height={40}
              priority
              className="w-10 h-10 object-contain rounded-xl"
            />
          </Link>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-2 w-full px-2">
            {[
              { name: 'Dashboard', icon: HomeIcon, href: '/dashboard' },
              { name: 'Products', icon: ShoppingBagIcon, href: '/products' },
              { name: 'Chat', icon: ChatBubbleLeftRightIcon, href: '/tyre_guide/chat' },
              { name: 'Supplier', icon: TruckIcon, href: '/supplier-products' },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = item.name === 'Supplier';

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={item.name}
                  className={`w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none ${isActive
                    ? 'text-emerald-600 bg-emerald-50 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-600 rounded-r-full" />
                  )}
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] mt-1 tracking-tight">{item.name}</span>
                </Link>
              );
            })}

            {/* Shared Sidebar Sync Button */}
            <SidebarSyncButton />
          </nav>
        </div>

        {/* User Profile Avatar at Bottom Left */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-slate-100 w-full">
          <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs shadow-inner">
            KL
          </div>
          <span className="text-[9px] text-slate-500 font-medium truncate max-w-[60px]">Klever</span>
        </div>
      </aside>

      {/* 2. MAIN FULL-WIDTH SUPPLIER PRODUCTS AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">

        {/* TOP NAVIGATION HEADER */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-2xs">

          {/* Title & Stats */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Products</h1>
            <span className="inline-flex items-center justify-center min-w-[92px] bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200/80 tabular-nums whitespace-nowrap">
              {fullSyncing || pageSyncing ? (
                syncProgress ? (
                  `Syncing: ${syncProgress.loaded.toLocaleString()} items`
                ) : (
                  `Syncing... ${totalItems.toLocaleString()} items`
                )
              ) : (
                `${totalItems.toLocaleString()} items`
              )}
            </span>
          </div>

          {/* Right Actions & Controls */}
          <div className="flex items-center gap-2.5">

            {/* Density Selector */}
            <div ref={densityRef} className="relative">

              {isDensityMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-40">
                  {[
                    { key: 'compact', label: 'Compact (44px)' },
                    { key: 'comfortable', label: 'Standard (54px)' },
                    { key: 'breathable', label: 'Breathable (64px)' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setDensity(item.key as 'compact' | 'comfortable' | 'breathable');
                        setIsDensityMenuOpen(false);
                        addToast(`Density set to ${item.key}`);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      {density === item.key && <span className="text-emerald-600 font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>


            {/* Export Button */}
            <button
              onClick={exportCSV}
              className="h-9 flex items-center gap-2 px-3.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-all hover:shadow-emerald-600/20 active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>

            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else if (document.exitFullscreen) {
                  document.exitFullscreen();
                }
              }}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              title="Fullscreen"
            >
              <ArrowsPointingOutIcon className="w-5 h-5" />
            </button>

            {/* Header Sync Button — per page sync */}
            <button
              type="button"
              onClick={(e) => {
                handlePageSync();
                e.currentTarget.blur();
              }}
              disabled={pageSyncing || fullSyncing}
              title="Sync current page supplier products"
              aria-label="Sync current page supplier products"
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 focus:outline-none"
            >
              <ArrowPathIcon className={`w-5 h-5 ${pageSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Online Indicator */}
            {isOnline ? (
              <div className="h-7 w-[95px] inline-flex items-center justify-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 rounded-full text-xs font-semibold border border-emerald-200 shadow-2xs whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <WifiIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online</span>
              </div>
            ) : (
              <div className="h-7 w-[95px] inline-flex items-center justify-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 rounded-full text-xs font-semibold border border-rose-200 shadow-2xs whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <WifiIcon className="w-3.5 h-3.5 text-rose-600" />
                <span>Offline</span>
              </div>
            )}

          </div>
        </header>

        {/* SCROLLABLE INNER DASHBOARD BODY */}
        <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 w-full mx-auto overflow-hidden">

          {/* Width-omitted (aspect+rim) fallback notice banner */}
          {partialSizeInfo && (
            <div className="shrink-0 p-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>
                  Showing tyres matching <strong className="font-bold text-amber-950">{partialSizeInfo.matchedPattern}</strong>.
                  {!partialSizeInfo.hasWidth && ' Select width for a more accurate result:'}
                </span>
              </div>

              {partialSizeInfo.availableWidths.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-amber-800 mr-1">Widths:</span>
                  {partialSizeInfo.availableWidths.map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        if (searchQuery) {
                          setSearchQuery(`${w}/${partialSizeInfo.aspect}R${partialSizeInfo.rim}`);
                        } else if (sizeInput) {
                          setSizeInput(`${w}/${partialSizeInfo.aspect}R${partialSizeInfo.rim}`);
                        }
                      }}
                      className="px-2.5 py-1 text-xs bg-white text-amber-900 font-bold border border-amber-300 rounded-lg hover:bg-amber-100 hover:border-amber-400 transition-all shadow-2xs cursor-pointer active:scale-95"
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filters Bar — Supplier · Category · Brand · Search · Size · Year · Qty · Latest */}
          <section className="shrink-0 bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="flex flex-wrap items-end gap-3">

              {/* Supplier */}
              <div ref={supplierRef} className="flex flex-col min-w-[140px] relative">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Supplier</label>
                <button
                  onClick={() => {
                    setIsSupplierOpen(!isSupplierOpen);
                    setIsCategoryOpen(false);
                    setIsBrandOpen(false);
                    setIsPageSizeOpen(false);
                    setIsDensityMenuOpen(false);
                  }}
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 flex items-center justify-between text-sm font-medium text-slate-700 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="truncate">{supplierFilter === 'ALL' ? 'All' : supplierFilter}</span>
                  <svg className={`w-4 h-4 text-slate-400 ml-2 shrink-0 transition-transform ${isSupplierOpen ? 'rotate-180 text-emerald-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isSupplierOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => { setSupplierFilter('ALL'); setCurrentPage(1); setIsSupplierOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${supplierFilter === 'ALL' ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>All</span>
                      {supplierFilter === 'ALL' && <span className="text-emerald-600 font-bold">✓</span>}
                    </button>
                    {supplierOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setSupplierFilter(s); setCurrentPage(1); setIsSupplierOpen(false); }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${supplierFilter === s ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <span className="truncate">{s}</span>
                        {supplierFilter === s && <span className="text-emerald-600 font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category */}
              <div ref={categoryRef} className="flex flex-col min-w-[140px] relative">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Category</label>
                <button
                  onClick={() => {
                    setIsCategoryOpen(!isCategoryOpen);
                    setIsSupplierOpen(false);
                    setIsBrandOpen(false);
                    setIsPageSizeOpen(false);
                    setIsDensityMenuOpen(false);
                  }}
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 flex items-center justify-between text-sm font-medium text-slate-700 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="truncate">{categoryFilter === 'ALL' ? 'All' : categoryFilter}</span>
                  <svg className={`w-4 h-4 text-slate-400 ml-2 shrink-0 transition-transform ${isCategoryOpen ? 'rotate-180 text-emerald-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isCategoryOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => { setCategoryFilter('ALL'); setCurrentPage(1); setIsCategoryOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${categoryFilter === 'ALL' ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>All</span>
                      {categoryFilter === 'ALL' && <span className="text-emerald-600 font-bold">✓</span>}
                    </button>
                    {categoryOptions.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setCategoryFilter(c); setCurrentPage(1); setIsCategoryOpen(false); }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${categoryFilter === c ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <span className="truncate">{c}</span>
                        {categoryFilter === c && <span className="text-emerald-600 font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Brand */}
              <div ref={brandRef} className="relative flex flex-col min-w-[150px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Brand</label>
                <div className="relative">
                  <input
                    type="text"
                    value={brandInput}
                    onFocus={() => {
                      setIsBrandOpen(true);
                      setIsSupplierOpen(false);
                      setIsCategoryOpen(false);
                      setIsPageSizeOpen(false);
                      setIsDensityMenuOpen(false);
                    }}
                    onChange={(e) => {
                      setBrandInput(e.target.value);
                      setIsBrandOpen(true);
                      setIsSupplierOpen(false);
                      setIsCategoryOpen(false);
                      setIsPageSizeOpen(false);
                      setIsDensityMenuOpen(false);
                      setCurrentPage(1);
                    }}
                    placeholder="Brand"
                    className="h-10 w-full bg-white border border-slate-200 rounded-lg pl-3 pr-8 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                  <ChevronDownIcon
                    onClick={() => {
                      setIsBrandOpen(!isBrandOpen);
                      setIsSupplierOpen(false);
                      setIsCategoryOpen(false);
                      setIsPageSizeOpen(false);
                      setIsDensityMenuOpen(false);
                    }}
                    className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer hover:text-slate-600 transition-colors"
                  />
                </div>

                {isBrandOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-52 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => { setBrandInput(''); setCurrentPage(1); setIsBrandOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${!brandInput ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>All Brands</span>
                      {!brandInput && <span className="text-emerald-600 font-bold">✓</span>}
                    </button>
                    {filteredBrandOptions.map((b) => (
                      <button
                        key={b}
                        onClick={() => { setBrandInput(b); setCurrentPage(1); setIsBrandOpen(false); }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${brandInput.toLowerCase() === b.toLowerCase() ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <span className="truncate">{b}</span>
                        {brandInput.toLowerCase() === b.toLowerCase() && <span className="text-emerald-600 font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="flex flex-col flex-1 min-w-[220px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Search</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="searchInput"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    placeholder="Query..."
                    className="h-10 w-full pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Size */}
              <div className="flex flex-col w-[110px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Size</label>
                <input
                  type="text"
                  value={sizeInput}
                  onChange={(e) => { setSizeInput(e.target.value); setCurrentPage(1); }}
                  placeholder="Size..."
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                />
              </div>

              {/* Year */}
              <div className="flex flex-col w-[90px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Year</label>
                <input
                  type="text"
                  value={yearInput}
                  onChange={(e) => { setYearInput(e.target.value); setCurrentPage(1); }}
                  placeholder="Year..."
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                />
              </div>

              {/* Qty */}
              <div className="flex flex-col w-[90px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Qty</label>
                <input
                  type="text"
                  value={qtyInput}
                  onChange={(e) => { setQtyInput(e.target.value); setCurrentPage(1); }}
                  placeholder="Qty..."
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                />
              </div>

              {/* Latest? */}
              <label className="flex items-center gap-2 h-10 text-slate-600 text-sm font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={latestOnly}
                  onChange={(e) => { setLatestOnly(e.target.checked); setCurrentPage(1); }}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:ring-offset-0 focus:outline-none cursor-pointer"
                />
                LATEST?
              </label>

              {/* Search button */}
              <button
                onClick={() => setCurrentPage(1)}
                title="Search"
                className="h-10 w-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
              </button>

              {/* Reset button */}
              <button
                onClick={resetFilters}
                title="Reset filters"
                className="h-10 w-10 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 rounded-lg shadow-2xs transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* Floating Selection Toolbar */}
          {selectedIds.size > 0 && (
            <div className="sticky top-20 z-20 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center justify-between border border-slate-700 transition-all">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center">
                  {selectedIds.size}
                </span>
                <span className="text-xs font-semibold text-slate-200">items selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { addToast(`Exporting ${selectedIds.size} selected products...`); exportCSV(); clearSelection(); }}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors"
                >
                  Export Selected
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* Data Table Container Card */}
          <section className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">

            {/* Table Header Summary / Entries Per Page Selector */}
            <div className="px-5 py-2.5 flex items-center justify-end border-b border-slate-200/70 bg-slate-50/70">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200/90 shadow-2xs">
                <span className="text-slate-400 font-medium">Show</span>

                <div ref={pageSizeRef} className="relative">
                  <button
                    onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
                    className="h-7 px-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
                  >
                    <span>{pageSize}</span>
                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isPageSizeOpen ? 'rotate-180 text-emerald-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isPageSizeOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-14 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                      {[10, 25, 50, 100].map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            setPageSize(size);
                            setCurrentPage(1);
                            setIsPageSizeOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 text-xs font-semibold flex items-center justify-between transition-colors ${pageSize === size
                            ? 'text-emerald-700 bg-emerald-50/80 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span>{size}</span>
                          {pageSize === size && (
                            <span className="text-emerald-600 font-bold text-xs">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="text-slate-500">entries / page</span>
              </div>
            </div>

            {/* Scrollable Table — fills the card and scrolls INTERNALLY so row
                count / page size never changes the card height (no layout shift). */}
            <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable]">
              <table className="w-full min-w-[1660px] text-left border-collapse table-fixed">
                <thead className="bg-slate-50/90 backdrop-blur sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    {!hiddenColumns.has('source') && <th onClick={() => handleSort('source')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[100px]">Source <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('type') && <th onClick={() => handleSort('productType')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[120px]">Type <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('category') && <th onClick={() => handleSort('category')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[110px]">Category <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('brand') && <th onClick={() => handleSort('brand')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[105px]">Brand <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('pattern') && <th onClick={() => handleSort('pattern')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[360px]">Tyre Pattern <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('size') && <th onClick={() => handleSort('size')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[140px]">Size <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('runflat') && <th className="py-3 px-2 text-center whitespace-nowrap w-[75px]">Runflat</th>}
                    {!hiddenColumns.has('year') && <th onClick={() => handleSort('year')} className="py-3 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap w-[65px]">Year <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('country') && <th onClick={() => handleSort('country')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[110px]">Country <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('qty') && <th onClick={() => handleSort('qty')} className="py-3 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap w-[60px]">Qty <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('cost') && <th onClick={() => handleSort('cost')} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap w-[115px]">Cost <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('fittingPrice') && <th onClick={() => handleSort('fittingPrice')} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap w-[125px]">Fitting Price <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('date') && <th onClick={() => handleSort('date')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[90px]">Date <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    <th className="py-3 px-2 text-center whitespace-nowrap w-[65px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {showSkeleton ? (
                    Array.from({ length: pageSize }).map((_, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50">
                        {!hiddenColumns.has('source') && <td className={cellPaddingClass}><Skeleton className="h-5 w-16 rounded-md" /></td>}
                        {!hiddenColumns.has('type') && <td className={cellPaddingClass}><Skeleton className="h-5 w-20 rounded-md" /></td>}
                        {!hiddenColumns.has('category') && <td className={cellPaddingClass}><Skeleton className="h-5 w-20 rounded-md" /></td>}
                        {!hiddenColumns.has('brand') && <td className={cellPaddingClass}><Skeleton className="h-4 w-20 rounded" /></td>}
                        {!hiddenColumns.has('pattern') && <td className={cellPaddingClass}><Skeleton className="h-4 w-32 rounded" /></td>}
                        {!hiddenColumns.has('size') && <td className={cellPaddingClass}><Skeleton className="h-4 w-20 rounded" /></td>}
                        {!hiddenColumns.has('runflat') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-10 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('year') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-12 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('country') && <td className={cellPaddingClass}><Skeleton className="h-4 w-16 rounded" /></td>}
                        {!hiddenColumns.has('qty') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-6 w-8 rounded-full mx-auto" /></td>}
                        {!hiddenColumns.has('cost') && <td className={`${cellPaddingClass} text-right`}><Skeleton className="h-4 w-14 rounded ml-auto" /></td>}
                        {!hiddenColumns.has('fittingPrice') && <td className={`${cellPaddingClass} text-right`}><Skeleton className="h-4 w-14 rounded ml-auto" /></td>}
                        {!hiddenColumns.has('date') && <td className={cellPaddingClass}><Skeleton className="h-4 w-20 rounded" /></td>}
                        <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-6 rounded mx-auto" /></td>
                      </tr>
                    ))
                  ) : currentItems.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-16 text-center text-slate-400">
                        <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p className="text-sm font-semibold">
                          {allProducts.length === 0 ? 'No products cached yet' : 'No products found'}
                        </p>
                        <p className="text-xs mt-1 text-slate-400">
                          {allProducts.length === 0
                            ? 'Click the Sync button to fetch the supplier catalogue into local storage.'
                            : 'Try adjusting your filters or search query.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((item) => {
                      const isSelected = selectedIds.has(item.id);

                      return (
                        <tr
                          key={item.id}
                          onClick={() => copyRowData(item)}
                          title="Click to copy entire row data"
                          className={`transition-all hover:bg-emerald-50/50 cursor-pointer group ${isSelected ? 'bg-emerald-50/70' : ''}`}
                        >

                          {!hiddenColumns.has('source') && (
                            <td className={cellPaddingClass}>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-bold text-slate-600 border border-slate-200/60">
                                {item.source}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('type') && (
                            <td className={cellPaddingClass}>
                              {item.productType ? (
                                <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border uppercase tracking-tight ${item.productType === 'Supplier'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                                  : 'bg-amber-50 text-amber-700 border-amber-200/60'
                                  }`}>
                                  {item.productType}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </td>
                          )}

                          {!hiddenColumns.has('category') && (
                            <td className={cellPaddingClass}>
                              <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border uppercase tracking-tight ${categoryBadges[item.category] || 'bg-slate-100 text-slate-700'}`}>
                                {item.category}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('brand') && (
                            <td className={cellPaddingClass}>
                              <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border uppercase tracking-tight ${brandBadges[item.brand] || 'bg-slate-100 text-slate-700'}`}>
                                {item.brand}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('pattern') && (
                            <td className={cellPaddingClass}>
                              <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 transition-colors leading-relaxed">
                                {item.pattern}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('size') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-semibold text-slate-700 font-mono whitespace-nowrap inline-block">
                                {item.sizeFull}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('runflat') && (
                            <td className={`${cellPaddingClass} text-center`}>
                              {item.runflat ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200">Runflat</span>
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </td>
                          )}

                          {!hiddenColumns.has('year') && (
                            <td className={`${cellPaddingClass} text-center text-xs font-medium text-slate-600`}>
                              {item.year && item.year > 0 ? item.year : <span className="text-slate-400 font-medium">-</span>}
                            </td>
                          )}

                          {!hiddenColumns.has('country') && (
                            <td className={cellPaddingClass}>
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                {item.country && item.country.trim() ? item.country : <span className="text-slate-400 font-medium">-</span>}
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('qty') && (
                            <td className={`${cellPaddingClass} text-center`}>
                              {item.qty === 0 ? (
                                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-red-50 text-red-600 text-[11px] font-extrabold border border-red-200/60 font-mono">0</span>
                              ) : (
                                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-extrabold border border-emerald-200/60 font-mono">{item.qty}</span>
                              )}
                            </td>
                          )}

                          {!hiddenColumns.has('cost') && (
                            <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
                              <div className="inline-flex items-center justify-end gap-1 text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap" dir="ltr">
                                <span className="whitespace-nowrap">{item.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('fittingPrice') && (
                            <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
                              <div className="inline-flex items-center justify-end gap-1 text-xs font-medium text-slate-500 font-mono whitespace-nowrap" dir="ltr">
                                <span className="whitespace-nowrap">{item.fittingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('date') && (
                            <td className={`${cellPaddingClass} text-xs text-slate-500 whitespace-nowrap`}>
                              {item.date && formatDateDDMM(item.date) !== '-' ? (
                                formatDateDDMM(item.date)
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </td>
                          )}

                          <td className={`${cellPaddingClass} text-center`}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyRowData(item);
                              }}
                              className="p-1 text-slate-400 hover:text-emerald-600 rounded hover:bg-slate-100 transition-colors"
                              title="Copy row data"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    }))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <div className="px-5 py-3.5 flex items-center justify-end border-t border-slate-100 bg-white">
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5) {
                      if (currentPage > 3 && currentPage < totalPages - 1) {
                        pageNum = currentPage - 2 + i;
                      } else if (currentPage >= totalPages - 1) {
                        pageNum = totalPages - 4 + i;
                      }
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 text-xs font-semibold rounded-lg flex items-center justify-center transition-all ${currentPage === pageNum
                          ? 'bg-emerald-600 text-white font-bold shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next
                </button>
              </div>
            </div>

          </section>
        </div>
      </main>

      {/* Slide-Over Product Detail Drawer */}
      {
        activeDrawerItem && (
          <>
            <div
              onClick={() => setActiveDrawerItem(null)}
              className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs transition-opacity"
            />
            <aside className="fixed top-0 right-0 z-50 w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 transition-transform duration-300 ease-in-out flex flex-col">

              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full uppercase tracking-wider ${categoryBadges[activeDrawerItem.category] || 'bg-purple-50 text-purple-700'}`}>
                    {activeDrawerItem.category}
                  </span>
                  <h2 className="text-base font-bold text-slate-900 mt-1">
                    {activeDrawerItem.pattern}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Item Code: <span className="font-mono font-semibold text-slate-700">{activeDrawerItem.itemCode}</span>
                  </p>
                </div>
                <button
                  onClick={() => setActiveDrawerItem(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">

                {/* Overview Grid */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">Brand</span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{activeDrawerItem.brand}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">Size Spec</span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{activeDrawerItem.sizeFull}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">Origin Country</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{activeDrawerItem.country}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">Production Year</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{activeDrawerItem.year}</p>
                  </div>
                </div>

                {/* Pricing & Margin Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing & Margins</h4>
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Supplier Unit Cost:</span>
                      <span className="font-bold text-slate-900 text-sm font-mono">{activeDrawerItem.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Fitting Fee:</span>
                      <span className="font-semibold text-slate-700 font-mono">{activeDrawerItem.fittingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-px bg-slate-100 my-1"></div>
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-emerald-700">Est. Retail MSRP:</span>
                      <span className="text-emerald-600 text-sm font-mono">{(activeDrawerItem.cost * 1.22).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Stock Availability */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventory Allocation</h4>
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">Warehouse Main ({activeDrawerItem.source}):</span>
                      {activeDrawerItem.qty === 0 ? (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-600 border border-red-200/60 font-mono">0 Units Available</span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">{activeDrawerItem.qty} Units Available</span>
                      )}
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(activeDrawerItem.qty * 2.5, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                <button
                  onClick={() => copyToClipboard(activeDrawerItem.itemCode)}
                  className="flex-1 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Copy Item Code
                </button>
                <button
                  onClick={() => setActiveDrawerItem(null)}
                  className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </aside>
          </>
        )
      }

      {/* Customize Visible Columns Modal */}
      {
        isColumnModalOpen && (
          <div
            onClick={() => setIsColumnModalOpen(false)}
            className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Customize Visible Columns</h3>
                <button
                  onClick={() => setIsColumnModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto text-xs font-medium text-slate-700">
                {[
                  { key: 'source', label: 'Source' },
                  { key: 'type', label: 'Type' },
                  { key: 'category', label: 'Category' },
                  { key: 'brand', label: 'Brand' },
                  { key: 'pattern', label: 'Tyre Pattern' },
                  { key: 'size', label: 'Size' },
                  { key: 'runflat', label: 'Runflat' },
                  { key: 'year', label: 'Year' },
                  { key: 'country', label: 'Country' },
                  { key: 'qty', label: 'Qty' },
                  { key: 'cost', label: 'Cost' },
                  { key: 'fittingPrice', label: 'Fitting Price' },
                  { key: 'date', label: 'Date' }
                ].map(col => (
                  <label key={col.key} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded cursor-pointer">
                    <span>{col.label}</span>
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-0 focus:outline-none cursor-pointer"
                    />
                  </label>
                ))}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => { setIsColumnModalOpen(false); addToast('Column settings updated!'); }}
                  className="w-full py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Apply Settings
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-bold flex items-center gap-2 pointer-events-auto border border-slate-700 transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

    </div >
  );
}
