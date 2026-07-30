'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { DatabaseZap } from 'lucide-react';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
  BookmarkIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline';
import { buildRowString, buildBulkCopyString } from "@/services/productFormatter";
import { OnlineStatusBadge, FullscreenButton } from "@/components/HeaderUtilities";
import { CATEGORY_BADGES_SEMANTIC, BRAND_BADGES_SEMANTIC } from "@/constants/badges";
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  parseAspectRim,
  parseRimOnly,
  matchesAspectRim,
  matchesSearch,
  paginate,
  searchWithAspectRimFallback,
} from '@/services/searchFilter';
import { useCart } from '@/hooks/useCart';
import {
  getCachedTcPages,
  getRows,
  setRows,
  ROWS_KEY,
} from '@/services/cache';
import { syncManager } from '@/services/syncManager';
import { SYNC_TASK } from '@/services/syncTasks';
import { useSyncTask, useSyncBatches, useOnSyncComplete } from '@/hooks/useSyncManager';
import { Skeleton } from '@/components/Skeletons';
import {
  fetchTcAttributeLabelsCached,
  type TcProductsBatch,
  type TcApiProduct,
  type TcAttributeLabels,
} from './api';


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
  /** `date` as a sortable integer (2026-07-20 → 20260720), 0 when absent.
   *  Precomputed at map time so the default date sort compares numbers instead
   *  of running a collator over 318k strings on every filter change. */
  dateKey: number;
  /** 1 = current/latest record, 0 = historical. Used by the client-side Latest filter. */
  is_latest: number;

  /* ── TC-specific columns ── */
  /** Unit price (API `price`, falling back to `cost`). */
  price: number;
  /** API `set_price` — the set-of-4 price. */
  setOf4Price: number;
  /** NO API SOURCE — see NO_API_FIELD. */
  oem: string;
  /** NO API SOURCE — see NO_API_FIELD. */
  offer: string;
}

/**
 * OEM, Qty and Offer have no field in the GraphQL schema. Probed against the
 * live endpoint: `oem`, `oem_code`, `is_oem`, `offer`, `offer_price`,
 * `discount`, `qty`, `quantity`, `stock`, `set_of_4` all return
 * "Cannot query field ... on type Query". They render as "—" rather than being
 * invented — deriving Offer from price vs set_price would be guessing at
 * pricing semantics, and a wrong discount is worse than a blank.
 */
const NO_API_FIELD = '—';

/** Units in a "set" — a full set of tyres for one car. */
const SET_OF_4_UNITS = 4;

interface Toast {
  id: number;
  msg: string;
}

/**
 * Reused collator for column sorting. `String.prototype.localeCompare` builds a
 * fresh collator on every call, which is fine occasionally but not when a sort
 * is always active: with LATEST? unticked the comparator runs across ~318k rows
 * (~5.7M comparisons). One shared instance is the same ordering, far cheaper.
 */
const collator = new Intl.Collator();

/**
 * Canonicalise the API's own `brand_category` casing (e.g. "tier1" → "Tier 1").
 *
 * Takes ONLY the category. There used to be a BRAND_CATEGORY_MAP fallback that
 * guessed a tier from the brand name when the API returned nothing — removed:
 * Magento is the single source of truth, and inventing a tier client-side meant
 * the UI could contradict the Admin. An empty value stays empty so the caller
 * renders "-" rather than a guess.
 */
function normalizeCategory(cat?: string): string {
  const trimmed = (cat || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'budget') return 'Budget';
  if (lower === 'tier 1' || lower === 'tier1') return 'Tier 1';
  if (lower === 'tier 2' || lower === 'tier2') return 'Tier 2';
  if (lower === 'tier 3' || lower === 'tier3') return 'Tier 3';
  if (lower === 'premium') return 'Premium';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Per-attribute option maps, resolved ONCE per batch.
 *
 * `labelOf(labels, 'brand', id)` did two property lookups plus a `String(id)`
 * allocation for each of five attributes on every row. Measured on the live
 * catalogue that mapping cost ~1.1ms/row — ~8.2s for 7,809 rows, and it re-runs
 * on every mount's cache hydration. Resolving the five maps up front turns each
 * lookup into a single indexed read with no allocation.
 */
interface TcLabelMaps {
  size: Record<string, string>;
  brand: Record<string, string>;
  runflat: Record<string, string>;
  year: Record<string, string>;
  country: Record<string, string>;
}

const EMPTY_MAP: Record<string, string> = {};

function prepareTcLabels(labels: TcAttributeLabels): TcLabelMaps {
  return {
    size: labels.tyre_size ?? EMPTY_MAP,
    brand: labels.brand ?? EMPTY_MAP,
    runflat: labels.runflat ?? EMPTY_MAP,
    year: labels.year ?? EMPTY_MAP,
    country: labels.country ?? EMPTY_MAP,
  };
}

/** Indexed read, no `String()` allocation; '' for a missing/absent option. */
const lbl = (m: Record<string, string>, id: number | null): string =>
  id === null || id === undefined ? '' : m[id] ?? '';

function mapTcProduct(p: TcApiProduct, maps: TcLabelMaps): Product {
  const size = lbl(maps.size, p.tyre_size);
  const li = (p.load_index ?? '').trim();
  const regular = p.price_range?.minimum_price?.regular_price?.value ?? 0;
  const final = p.price_range?.minimum_price?.final_price?.value ?? regular;
  // Offer comes from the API's own regular-vs-final spread — a real discount,
  // not a guess. Blank when there is none.
  const pct = regular > 0 && final < regular ? Math.round(((regular - final) / regular) * 100) : 0;

  return {
    id: Number(p.uid ? parseInt(atob(p.uid), 10) : 0) || 0,
    source: '',
    itemCode: p.sku ?? '',
    productType: '',
    category: p.categories?.[0]?.name ?? '',
    brand: lbl(maps.brand, p.brand),
    pattern: p.name ?? '',
    size,
    sizeFull: size && li ? `${size} ${li}` : size,
    runflat: lbl(maps.runflat, p.runflat) !== '',
    year: Number(lbl(maps.year, p.year)) || 0,
    country: lbl(maps.country, p.country),
    flag: '',
    // `stock_status` is the only stock signal the storefront exposes
    // (`only_x_left_in_stock` errors with "sku is not assigned to given stock").
    qty: p.stock_status === 'IN_STOCK' ? 1 : 0,
    cost: regular,
    fittingPrice: 0,
    date: '',
    dateKey: 0,
    is_latest: 1,
    price: regular,
    // Set of 4 Price is DERIVED, never fetched: the API's `price` is the
    // per-unit figure, so a set of four is simply 4x it. Computed here at map
    // time, which means it re-derives automatically whenever the API returns a
    // new price — there is nothing cached or stored to go stale.
    setOf4Price: regular * SET_OF_4_UNITS,
    oem: NO_API_FIELD,
    offer: pct > 0 ? `${pct}%` : NO_API_FIELD,
  };
}

/** Badge classes now live in constants/badges.ts; aliased so the JSX below
 *  is untouched and this page keeps its own variant. */
const categoryBadges = CATEGORY_BADGES_SEMANTIC;
const brandBadges = BRAND_BADGES_SEMANTIC;

export default function TcProductsPage() {
  const isOnline = useOnlineStatus();

  /** Seeded from the session rows cache so returning to this page paints the
   *  full table on the FIRST render — no await, no progressive fill. Empty on a
   *  cold start, where the IndexedDB path below fills it. */
  const [allProducts, setAllProducts] = useState<Product[]>(
    () => getRows<Product>(ROWS_KEY.tcProducts) ?? [],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandInput, setBrandInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  /** Price Range bounds — kept as raw strings so a field can be empty. */
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  /** RunFlat-only toggle — true = show only products where runflat === true.
   *  Defaults to true so the page opens pre-filtered to runflat products. */
  const [runflatOnly, setRunflatOnly] = useState(true);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  // Default to newest-first. Without a sort the table renders in cache order,
  // which mirrors the API's `id ASC` — i.e. catalogue insertion order, not
  // recency. On the live data that puts the OLDEST rows (2025-05-08) on page 1
  // and the newest (2026-07-20) on page ~587, so the latest stock looked absent.
  const [sortColumn, setSortColumn] = useState<keyof Product | null>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  /** Rows the user has added via the Action column. Client-side only — there is
   *  no list/cart endpoint on the API yet, so this is UI state, not fake data. */
  const [listIds, setListIds] = useState<Set<number>>(new Set());
  /** Persisted, offline-first cart — survives refresh, navigation and offline. */
  const cart = useCart();
  const [activeDrawerItem, setActiveDrawerItem] = useState<Product | null>(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isDensityMenuOpen, setIsDensityMenuOpen] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  // isSupplierOpen removed — Supplier dropdown is not used on TC Products page.
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'breathable'>('comfortable');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((msg: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  }, []);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [pageSyncing, setPageSyncing] = useState(false);
  /** Synchronous latch for the PAGE-scoped sync only. The full catalogue sync
   *  is owned by the global manager, which dedupes on its own. */
  const syncInFlight = useRef(false);
  /**
   * True while `loadAll` is still walking the catalogue's pages.
   *
   * Needed because `isLoading` clears as soon as page 1 lands, while the
   * remaining ~78 pages keep arriving for up to a minute. With a cold cache and
   * RUNFLAT? checked, the first page can legitimately contain no matching rows —
   * and the table then said "No products found", which is false: the data is on
   * its way. Replaces a frozen `bootstrapping` flag that was always false, so
   * the skeleton clause guarding this case never actually fired.
   */
  const [backgroundLoading, setBackgroundLoading] = useState(false);

  /* ── Storefront API loading ──────────────────────────────────────
     Data comes from the `products` GraphQL field via ./api.ts, NOT from the
     supplier IndexedDB cache — this page shows TyresCart's own catalogue.
     Page 1 paints immediately, then the rest streams in the background, the
     same shape as the /products page's batch loader. */

  /* ── The catalogue sync lives in the GLOBAL manager ──
     Same architecture as supplier-products: the work is a registered task, so it
     keeps running when the user navigates away and cannot be started twice
     (`start()` dedupes synchronously). This page only observes it. */
  const tcSync = useSyncTask(SYNC_TASK.tcProducts);
  const taskRunning = tcSync.status === 'running';
  /** Progress of the one sync there is — manual and automatic are the same task now. */
  const syncProgress = tcSync.progress;

  /**
   * Rows keyed by catalogue page — the single source of truth for the table,
   * written by BOTH the manual loader and the background task's batches.
   *
   * A ref (not state) because batches arrive outside React's render cycle, and
   * page-keyed (not appended) because that makes a re-delivered batch idempotent:
   * it overwrites its own slot. Supplier-products needs a `seenIds` set for the
   * same guarantee precisely because it appends.
   */
  const pagesRef = useRef<Map<number, Product[]>>(new Map());
  const labelsRef = useRef<TcAttributeLabels>({});

  /** Rebuild the flat list from the page map, in catalogue order. */
  const flushPages = useCallback(() => {
    const ordered = [...pagesRef.current.keys()].sort((a, b) => a - b);
    const merged: Product[] = [];
    for (const p of ordered) merged.push(...pagesRef.current.get(p)!);
    setAllProducts(merged);
  }, []);
  /** Invalidates an in-flight background load when the page unmounts or reloads. */


  const loadIdRef = useRef(0);

  /**
   * Paint whatever IndexedDB holds, and hand any actual fetching to the manager.
   *
   * This no longer fetches anything itself. It used to carry a second, INLINE
   * page-by-page loop for the manual Sync path, because `SyncTaskDefinition.run`
   * takes no arguments and so could not be told "force". The task now always
   * forces, which removes the reason for the duplicate path — and with it a
   * sequential walk that took ~80s where the pooled task takes ~14s, plus the
   * risk of the two paths fetching the same pages at once.
   */
  const loadAll = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    const isCurrent = () => loadId === loadIdRef.current;

    setIsLoading(true);
    setBackgroundLoading(true);

    try {
      // Option-id → label maps, fetched once and reused for every row.
      const attrLabels = await fetchTcAttributeLabelsCached().catch(
        () => ({}) as TcAttributeLabels,
      );
      if (!isCurrent()) return;
      labelsRef.current = attrLabels;
      const maps = prepareTcLabels(attrLabels);

      // Pre-fill from IndexedDB in ONE read (not 86 sequential ones), so a
      // revisit or refresh paints the whole table immediately.
      const cachedPages = await getCachedTcPages();
      if (!isCurrent()) return;
      for (const rec of cachedPages) {
        pagesRef.current.set(rec.page, rec.data.items.map((it) => mapTcProduct(it, maps)));
      }
      if (pagesRef.current.size) {
        flushPages();
        setIsLoading(false);
      }

      // ANY cached page → stop. Auto-sync fires ONLY when IndexedDB holds
      // nothing for this page, exactly like supplier-products. Deliberately
      // `> 0`, not "is the cache complete": a PARTIAL cache must not trigger
      // network work either — filling gaps is the Sync button's job.
      if (cachedPages.length > 0) return;

      // Cold cache → the registered task does the walk, so it survives
      // navigation. `start()` dedupes synchronously, so a run already going
      // (another route, the sidebar, StrictMode's double effect) is joined,
      // never restarted. Rows arrive through `useSyncBatches`.
      void syncManager.start(SYNC_TASK.tcProducts);
    } catch (e) {
      // Reaching here means even the cache read failed — a genuinely cold start
      // with no network, not a normal offline load.
      console.error('[tc-products] load failed:', e);
      if (isCurrent()) {
        addToast(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'Offline and no cached products yet. Connect once to load the catalogue.'
            : 'Could not load products. Please try again.',
        );
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        setBackgroundLoading(false);
      }
    }
  }, [addToast, flushPages]);

  /* ── Live rows from the global sync ──
     The task writes each page to IndexedDB BEFORE emitting it, so the UI can
     never show a product the cache lacks. Batches land in the same page-keyed
     map the loader uses, which makes them idempotent: a page re-delivered (a
     second run, a remount mid-sync) overwrites its slot instead of appending a
     duplicate. No `seenIds` bookkeeping needed, unlike supplier-products.

     A page mounting mid-sync misses batches emitted earlier — its mount-time
     bulk cache read covers exactly those, since they are already persisted. */
  useSyncBatches<TcProductsBatch>(SYNC_TASK.tcProducts, (batches) => {
    const maps = prepareTcLabels(labelsRef.current);
    for (const b of batches) {
      if (!b?.page) continue;
      pagesRef.current.set(b.page, b.items.map((it) => mapTcProduct(it, maps)));
    }
    flushPages();
    setIsLoading(false);
  });

  /* ── Settle up when the global sync finishes ──
     Fires wherever the user is. Nothing to reconcile — the page map is already
     canonical and in catalogue order — so this only clears the loading flag for
     a page that was mounted throughout. */
  useOnSyncComplete(SYNC_TASK.tcProducts, () => {
    setIsLoading(false);
    setBackgroundLoading(false);
  });

  // Surface a failed background sync — the manager records the reason, but with
  // no page mounted at the time there was nothing to show it.
  useEffect(() => {
    if (tcSync.status === 'error' && tcSync.error) {
      addToast('Could not load TC products. Please use Sync to retry.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcSync.status, tcSync.error]);

  // Mirror the loaded rows into the session cache for the next visit.
  useEffect(() => {
    if (allProducts.length) setRows(ROWS_KEY.tcProducts, allProducts);
  }, [allProducts]);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark-theme');
    void loadAll();
    // Bump the load id on unmount so a background run stops instead of
    // fetching every remaining page into a dead component.
    return () => {
      loadIdRef.current++;
    };
  }, [loadAll]);

  // Header refresh button — re-runs the same API load with full sync banner.
  const handlePageSync = async () => {
    if (syncInFlight.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      addToast('Offline: cannot sync without an internet connection.');
      return;
    }
    // Already running (sidebar, another route, a previous click) → join it
    // rather than queueing a second pass over the same pages.
    if (syncManager.isRunning(SYNC_TASK.tcProducts)) {
      addToast('Sync already in progress…');
      return;
    }
    syncInFlight.current = true;
    setPageSyncing(true);
    try {
      // The SAME pooled task the automatic sync uses: 8 workers, per-page retry
      // with backoff, circuit breaker, `force: true` so every page is refetched.
      // Progress and rows come back through `useSyncTask` / `useSyncBatches`.
      await syncManager.start(SYNC_TASK.tcProducts);
      const msg = syncManager.getTask(SYNC_TASK.tcProducts)?.message;
      addToast(msg || 'Products refreshed.');
    } catch {
      addToast('Refresh failed. Please try again.');
    } finally {
      syncInFlight.current = false;
      setPageSyncing(false);
    }
  };;

  /*
   * Full catalogue sync now lives entirely in the global manager (see
   * `services/syncTasks.ts`) and is triggered by <SidebarSyncButton />. This
   * page deliberately keeps NO handler for it:
   *   - it must not stop when the user navigates away, and
   *   - it must not also be registered via `registerModuleSync`, or a sidebar
   *     sync would run the whole ~3,187-request pass twice.
   * The page only observes — see `useSyncTask` / `useSyncBatches` above.
   */

  // supplierRef removed — Supplier dropdown is not used on TC Products page.
  const categoryRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef<HTMLDivElement>(null);
  const densityRef = useRef<HTMLDivElement>(null);

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
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
    // Search + the width-omitted aspect+rim fallback, both from
    // services/searchFilter.ts — the two-step used to be inlined here and in
    // the other product page.
    if (searchQuery.trim()) {
      result = searchWithAspectRimFallback(result, searchQuery.trim(), SEARCH_FIELDS, SEARCH_SIZE_FIELDS);
    }

    // Category — exact match on the selected dropdown value.
    // Supplier filter removed: TC Products page has a single source.
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

    // Price range — inclusive Min/Max over the PRICE column. Each bound is
    // applied only when it parses as a number, so a half-filled range still
    // filters on the side that was entered and a blank pair is a no-op.
    const minPrice = parseFloat(minPriceInput);
    const maxPrice = parseFloat(maxPriceInput);
    if (!isNaN(minPrice)) result = result.filter(item => item.price >= minPrice);
    if (!isNaN(maxPrice)) result = result.filter(item => item.price <= maxPrice);

    // RunFlat checkbox — when checked, only products with runflat === true are shown.
    // Purely client-side; never triggers an API call.
    if (runflatOnly) result = result.filter(item => item.runflat === true);

    if (sortColumn) {
      // `sort` mutates in place. If no filter ran, `result` is still the
      // `allProducts` state array — copy first so we never reorder state.
      if (result === allProducts) result = [...result];
      const dir = sortAsc ? 1 : -1;
      // Date is the default sort, so it runs constantly and over the largest
      // arrays — take the precomputed integer path instead of the collator.
      if (sortColumn === 'date') {
        result.sort((a, b) => (a.dateKey - b.dateKey) * dir);
        return result;
      }
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
  }, [allProducts, searchQuery, categoryFilter, brandInput, sizeInput, yearInput, qtyInput, minPriceInput, maxPriceInput, runflatOnly, sortColumn, sortAsc]);

  // All three dropdown lists in ONE pass. Three separate useMemos each walked
  // the full 318k-row array and allocated its own intermediate — at this size
  // that is three full scans plus three throwaway arrays every time the
  // catalogue changes. One reduce over the array gives the same three lists.
  // supplierOptions removed — Supplier filter is not used on TC Products page.
  const { categoryOptions, brandOptions } = useMemo(() => {
    const categories = new Set<string>();
    const brands = new Set<string>();
    for (const p of allProducts) {
      if (p.category) categories.add(normalizeCategory(p.category));
      if (p.brand) brands.add(p.brand);
    }
    return {
      categoryOptions: Array.from(categories).sort(),
      brandOptions: Array.from(brands).sort(),
    };
  }, [allProducts]);

  const filteredBrandOptions = useMemo(() => {
    if (!brandInput.trim()) return brandOptions;
    const lastTerm = brandInput.split(',').pop()?.trim().toLowerCase() || '';
    if (!lastTerm) return brandOptions;
    return brandOptions.filter(b => b.toLowerCase().includes(lastTerm));
  }, [brandOptions, brandInput]);

  const selectedBrandList = useMemo(() => {
    return brandInput.split(',').map(s => s.trim()).filter(Boolean);
  }, [brandInput]);

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
  // Pagination maths from services/searchFilter.ts. `paginate` clamps the page
  // into range, so an out-of-range page shows the last page rather than a blank
  // slice while the clamp effect below catches up.
  const page = useMemo(
    () => paginate(filteredProducts, currentPage, pageSize),
    [filteredProducts, currentPage, pageSize],
  );
  const totalItems = filteredProducts.length;
  const totalPages = page.pagination.totalPages;
  const currentItems = page.items;

  // Skeleton while the first read is in flight, during a Sync that has no data
  // yet, or — the third clause — whenever the background page-by-page fill is
  // still running and the current view has nothing to show. That last case is
  // what keeps "No products found" off the screen while data is still arriving;
  // only a finished load with a genuinely empty result reaches the empty state.
  const showSkeleton =
    (isLoading && allProducts.length === 0) ||
    (pageSyncing && allProducts.length === 0) ||
    ((backgroundLoading || taskRunning) && currentItems.length === 0);

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
    setCategoryFilter('ALL');
    setBrandInput('');
    setSizeInput('');
    setYearInput('');
    setQtyInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setRunflatOnly(true); // reset to default (checked)
    setCurrentPage(1);
    addToast('Filters reset to default.');
  };



  const clearSelection = () => {
    setSelectedIds(new Set());
  };


  //old add to list code 
  // const addToList = (item: Product) => {
  // setListIds(prev => new Set(prev).add(item.id));
  // addToast(`Added "${item.pattern || item.brand}" to list.`);

  /**
   * toggleList — adds or removes a product from the client-side "List" set.
   *
   * HOW IT WORKS (current — UI only):
   *   - `listIds` is a React state Set<number> that lives only in memory.
   *   - Clicking the Bookmark icon once  → adds item.id  → icon turns indigo (filled).
   *   - Clicking the Bookmark icon again → removes item.id → icon reverts to outline.
   *   - No API call is made; data is lost on page refresh.
   *
   * HOW TO WIRE TO A REAL API IN THE FUTURE:
   *   1. Create a backend endpoint, e.g. POST /api/list  { productId } to add
   *      and DELETE /api/list/:productId to remove.
   *   2. Replace the setListIds lines below with your API calls (fetch/axios).
   *   3. Initialise `listIds` from an API fetch in a useEffect on mount.
   *   4. Consider optimistic UI: update state immediately, roll back on error.
   *
   * TO REMOVE THIS FEATURE ENTIRELY:
   *   1. Delete this function.
   *   2. Delete the `listIds` and `setListIds` state declaration (~line 287).
   *   3. Remove the Bookmark <button> block from the Action <td> in the table.
   *   4. Remove `BookmarkIcon` from the heroicons import at the top of the file.
   */
  const toggleList = (item: Product) => {
    const alreadyInList = listIds.has(item.id);
    setListIds(prev => {
      const next = new Set(prev);
      if (alreadyInList) {
        next.delete(item.id);   // ← remove from list
      } else {
        next.add(item.id);      // ← add to list
      }
      return next;
    });
    addToast(
      alreadyInList
        ? `Removed "${item.pattern || item.brand}" from list.`
        : `Added "${item.pattern || item.brand}" to list.`
    );
  };

  /**
   * Add to the PERSISTED cart (IndexedDB via cartStore), not component state.
   * A `Set<number>` in React state was lost on refresh and on navigating away —
   * unacceptable for a POS mid-sale. Re-adding the same product bumps its
   * quantity rather than duplicating a line (the store keys on product id).
   */
  const addToCart = (item: Product) => {
    cart.add({
      id: item.id,
      sku: item.itemCode,
      name: item.pattern,
      brand: item.brand,
      size: item.sizeFull || item.size,
      price: item.price,
    });
    addToast(`Added "${item.pattern || item.brand}" to cart.`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast(`Copied "${text}" to clipboard!`);
  };


  // Single-row copy — unchanged behaviour, now just delegating the formatting.
  const copyRowData = (item: Product) => {
    const rowString = buildRowString(item);
    navigator.clipboard.writeText(rowString);
    addToast(`Copied: "${rowString}"`);
  };

  const hasActiveFilter = useMemo(() => {
    return (
      Boolean(searchQuery.trim()) ||
      categoryFilter !== 'ALL' ||
      Boolean(brandInput.trim()) ||
      Boolean(sizeInput.trim()) ||
      Boolean(yearInput.trim()) ||
      Boolean(qtyInput.trim()) ||
      Boolean(minPriceInput.trim()) ||
      Boolean(maxPriceInput.trim()) ||
      runflatOnly
    );
  }, [searchQuery, categoryFilter, brandInput, sizeInput, yearInput, qtyInput, minPriceInput, maxPriceInput, runflatOnly]);

  /**
   * Bulk copy — every product in the current search/filter result set, exactly
   * as if the row-copy had been clicked on each one, joined by newlines.
   * Only active when a search term or filter is applied.
   */
  const copyAllSearchResults = async () => {
    if (!hasActiveFilter) {
      addToast('Please enter a search query or filter first.');
      return;
    }
    if (filteredProducts.length === 0) {
      addToast('No products available to copy.');
      return;
    }
    const payload = buildBulkCopyString(filteredProducts);
    try {
      await navigator.clipboard.writeText(payload);
      addToast(`Successfully copied ${filteredProducts.length.toLocaleString()} search results.`);
    } catch {
      addToast('Copy failed. Please try again.');
    }
  };

  const exportCSV = () => {
    if (!filteredProducts.length) return;
    const headers = ['BRAND', 'TYRE SIZE', 'NAME', 'RUNFLAT', 'ORIGIN', 'YEAR', 'OEM', 'QTY', 'PRICE', 'SET OF 4 PRICE', 'OFFER'];
    const rows = filteredProducts.map(p => [
      p.brand, p.sizeFull || p.size, `"${p.pattern.replace(/"/g, '""')}"`, p.runflat ? 'Yes' : 'No', p.country, p.year, p.oem, p.qty ?? '', p.price.toFixed(2), p.setOf4Price.toFixed(2), p.offer
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'tc_products.csv');
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


  // Cell padding class based on Density mode
  const cellPaddingClass = useMemo(() => {
    if (density === 'compact') return 'py-2 px-3.5';
    if (density === 'comfortable') return 'py-3 px-4';
    return 'py-4 px-4'; // breathable
  }, [density]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-200 relative">


      {/* 2. MAIN FULL-WIDTH SUPPLIER PRODUCTS AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">

        {/* TOP NAVIGATION HEADER */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-2xs">

          {/* Title & Stats */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">TC Products</h1>
            <span className="inline-flex items-center justify-center min-w-[92px] bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200/80 tabular-nums whitespace-nowrap">
              {pageSyncing || taskRunning ? (
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


            {/* Copy All Search Results — bulk version of the row-click copy.
                Same formatter (`buildRowString`), one line per product. */}
            <button
              type="button"
              onClick={copyAllSearchResults}
              title={hasActiveFilter ? "Copy All Search Results" : "Please enter a search query or filter first"}
              aria-label="Copy All Search Results"
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg transition-colors focus:outline-none active:scale-95 ${hasActiveFilter
                ? 'text-slate-600 hover:text-emerald-600 hover:bg-slate-100'
                : 'text-slate-300 hover:text-slate-400 hover:bg-slate-50'
                }`}
            >
              <ClipboardDocumentIcon className="w-[18px] h-[18px]" />
            </button>

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

            <FullscreenButton tone="slate" />

            {/* Header Sync Button — per page sync */}
            <button
              type="button"
              onClick={(e) => {
                handlePageSync();
                e.currentTarget.blur();
              }}
              disabled={pageSyncing || taskRunning}
              title="Sync current page supplier products"
              aria-label="Sync current page supplier products"
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 focus:outline-none"
            >
              <DatabaseZap className={`w-5 h-5 ${pageSyncing ? 'animate-pulse text-emerald-600' : ''}`} />
            </button>

            {/* Online Indicator */}
            <OnlineStatusBadge isOnline={isOnline} variant="fixed" />

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

          {/* Filters Bar — Category · Brand · Search · Size · Year · Qty · RunFlat */}
          <section className="shrink-0 bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs relative z-30">
            <div className="flex flex-wrap items-end gap-2.5">

              {/* Category */}
              <div ref={categoryRef} className="flex flex-col min-w-[140px] relative">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Category</label>
                <button
                  onClick={() => {
                    setIsCategoryOpen(!isCategoryOpen);
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
              <div ref={brandRef} className="relative flex flex-col min-w-[150px] max-w-[180px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Brand</label>
                <div className="relative">
                  <input
                    type="text"
                    value={brandInput}
                    onFocus={() => {
                      setIsBrandOpen(true);
                      setIsCategoryOpen(false);
                      setIsPageSizeOpen(false);
                      setIsDensityMenuOpen(false);
                    }}
                    onChange={(e) => {
                      setBrandInput(e.target.value);
                      setIsBrandOpen(true);
                      setIsCategoryOpen(false);
                      setIsPageSizeOpen(false);
                      setIsDensityMenuOpen(false);
                      setCurrentPage(1);
                    }}
                    placeholder="Brand"
                    className="h-10 w-full bg-white border border-slate-200 rounded-lg pl-3 pr-9 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                  {brandInput ? (
                    <XMarkIcon
                      onClick={() => {
                        setBrandInput('');
                        setCurrentPage(1);
                      }}
                      className="w-4 h-4 text-slate-400 hover:text-rose-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                      title="Clear brand search"
                    />
                  ) : (
                    <ChevronDownIcon
                      onClick={() => {
                        setIsBrandOpen(!isBrandOpen);
                        setIsCategoryOpen(false);
                        setIsPageSizeOpen(false);
                        setIsDensityMenuOpen(false);
                      }}
                      className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer hover:text-slate-600 transition-colors"
                    />
                  )}
                </div>

                {/* Selected Brand Pills with individual X remove buttons */}
                {selectedBrandList.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-w-[260px]">
                    {selectedBrandList.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"
                      >
                        <span>{b}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const remaining = selectedBrandList.filter((item) => item.toLowerCase() !== b.toLowerCase());
                            setBrandInput(remaining.length > 0 ? remaining.join(', ') + ', ' : '');
                            setCurrentPage(1);
                          }}
                          className="hover:bg-emerald-200/70 rounded-full p-0.5 transition-colors text-emerald-800"
                          title={`Remove ${b}`}
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {selectedBrandList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setBrandInput('');
                          setCurrentPage(1);
                        }}
                        className="text-[10px] text-slate-400 hover:text-rose-600 font-semibold underline underline-offset-2 ml-1 self-center"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                )}

                {isBrandOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => { setBrandInput(''); setCurrentPage(1); setIsBrandOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${!brandInput.trim() ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span>All Brands</span>
                      {!brandInput.trim() && <span className="text-emerald-600 font-bold">✓</span>}
                    </button>
                    {filteredBrandOptions.map((b) => {
                      const selectedBrands = brandInput.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                      const isSelected = selectedBrands.includes(b.toLowerCase());

                      return (
                        <button
                          key={b}
                          onClick={() => {
                            const currentParts = brandInput.split(',').map(s => s.trim()).filter(Boolean);
                            const lastPart = currentParts[currentParts.length - 1] || '';
                            const isLastPartial = lastPart && !brandOptions.some(opt => opt.toLowerCase() === lastPart.toLowerCase());

                            let baseParts = currentParts;
                            if (isLastPartial) {
                              baseParts = currentParts.slice(0, -1);
                            }

                            let newParts: string[];
                            if (baseParts.some(p => p.toLowerCase() === b.toLowerCase())) {
                              newParts = baseParts.filter(p => p.toLowerCase() !== b.toLowerCase());
                            } else {
                              newParts = [...baseParts, b];
                            }

                            setBrandInput(newParts.length > 0 ? newParts.join(', ') + ', ' : '');
                            setCurrentPage(1);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${isSelected ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <span className="truncate">{b}</span>
                          {isSelected && <span className="text-emerald-600 font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="flex flex-col flex-1 min-w-[150px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Search</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="searchInput"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    placeholder="Query..."
                    className="search-field h-10 w-full pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Size */}
              <div className="flex flex-col w-[170px]">
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
              <div className="flex flex-col w-[140px]">
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
              <div className="flex flex-col w-[130px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Qty</label>
                <input
                  type="text"
                  value={qtyInput}
                  onChange={(e) => { setQtyInput(e.target.value); setCurrentPage(1); }}
                  placeholder="Qty..."
                  className="h-10 bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                />
              </div>

              {/* Price Range — Min / Max over the PRICE column */}
              <div className="flex flex-col w-[300px]">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Price Range</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={minPriceInput}
                    onChange={(e) => { setMinPriceInput(e.target.value); setCurrentPage(1); }}
                    placeholder="Min"
                    className="h-10 w-full min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                  <span className="text-slate-400 text-xs font-semibold shrink-0">-</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={maxPriceInput}
                    onChange={(e) => { setMaxPriceInput(e.target.value); setCurrentPage(1); }}
                    placeholder="Max"
                    className="h-10 w-full min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* RunFlat? — filters to runflat === true products only */}
              <label className="flex items-center gap-2 h-10 text-slate-600 text-sm font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={runflatOnly}
                  onChange={(e) => { setRunflatOnly(e.target.checked); setCurrentPage(1); }}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:ring-offset-0 focus:outline-none cursor-pointer"
                />
                RUNFLAT?
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
            <div className="px-5 py-2.5 flex items-center justify-end border-b border-slate-200/70 bg-slate-50/70 relative z-20">
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
                    {!hiddenColumns.has('brand') && <th onClick={() => handleSort('brand')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[130px]">Brand <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('size') && <th onClick={() => handleSort('size')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[150px]">Tyre Size <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('name') && <th onClick={() => handleSort('pattern')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[320px]">Name <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('runflat') && <th className="py-3 px-2 text-center whitespace-nowrap w-[85px]">RunFlat</th>}
                    {!hiddenColumns.has('origin') && <th onClick={() => handleSort('country')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap w-[120px]">Origin <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('year') && <th onClick={() => handleSort('year')} className="py-3 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap w-[65px]">Year <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('oem') && <th className="py-3 px-2 text-center whitespace-nowrap w-[80px]">OEM</th>}
                    {!hiddenColumns.has('qty') && <th onClick={() => handleSort('qty')} className="py-3 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap w-[65px]">Qty <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('price') && <th onClick={() => handleSort('price')} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap w-[120px]">Price <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('setOf4Price') && <th onClick={() => handleSort('setOf4Price')} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap w-[140px]">Set of 4 Price <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('offer') && <th className="py-3 px-2 text-center whitespace-nowrap w-[85px]">Offer</th>}
                    <th className="py-3 px-3 text-center whitespace-nowrap w-[100px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {showSkeleton ? (
                    Array.from({ length: pageSize }).map((_, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50">
                        {!hiddenColumns.has('brand') && <td className={cellPaddingClass}><Skeleton className="h-5 w-20 rounded-md" /></td>}
                        {!hiddenColumns.has('size') && <td className={cellPaddingClass}><Skeleton className="h-5 w-24 rounded-md" /></td>}
                        {!hiddenColumns.has('name') && <td className={cellPaddingClass}><Skeleton className="h-4 w-48 rounded" /></td>}
                        {!hiddenColumns.has('runflat') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-10 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('origin') && <td className={cellPaddingClass}><Skeleton className="h-4 w-16 rounded" /></td>}
                        {!hiddenColumns.has('year') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-12 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('oem') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-8 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('qty') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-6 w-8 rounded-full mx-auto" /></td>}
                        {!hiddenColumns.has('price') && <td className={`${cellPaddingClass} text-right`}><Skeleton className="h-4 w-16 rounded ml-auto" /></td>}
                        {!hiddenColumns.has('setOf4Price') && <td className={`${cellPaddingClass} text-right`}><Skeleton className="h-4 w-20 rounded ml-auto" /></td>}
                        {!hiddenColumns.has('offer') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-10 rounded mx-auto" /></td>}
                        <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-7 w-16 rounded-lg mx-auto" /></td>
                      </tr>
                    ))
                  ) : currentItems.length === 0 ? (
                    <tr>
                      {/* Height matched to a full page of rows (measured 53px each) so the
                          table body stays the same height whether it holds data, the
                          skeleton, or this message — switching between them can't shift
                          the layout. */}
                      <td
                        colSpan={12}
                        className="py-16 text-center text-slate-400 align-middle"
                        style={{ height: Math.min(pageSize, 10) * 53 }}
                      >
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

                          {!hiddenColumns.has('brand') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border uppercase tracking-tight whitespace-nowrap inline-block ${brandBadges[item.brand] || 'badge-brand-default'}`}>
                                {item.brand || '-'}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('size') && (
                            <td className={cellPaddingClass}>
                              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-50 text-slate-700 border border-slate-200/70 font-mono whitespace-nowrap">
                                {item.sizeFull || item.size || '-'}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('name') && (
                            <td className={`${cellPaddingClass} text-xs font-bold text-slate-800`}>
                              <span className="line-clamp-2">{item.pattern || '-'}</span>
                            </td>
                          )}

                          {!hiddenColumns.has('runflat') && (
                            <td className={`${cellPaddingClass} text-center whitespace-nowrap`}>
                              {item.runflat ? (
                                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 whitespace-nowrap inline-block">Runflat</span>
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </td>
                          )}

                          {!hiddenColumns.has('origin') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                {item.country && item.country.trim() ? item.country : <span className="text-slate-400 font-medium">-</span>}
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('year') && (
                            <td className={`${cellPaddingClass} text-center text-xs font-semibold text-slate-700`}>
                              {item.year && item.year > 0 ? item.year : <span className="text-slate-400 font-medium">-</span>}
                            </td>
                          )}

                          {!hiddenColumns.has('oem') && (
                            <td className={`${cellPaddingClass} text-center text-xs text-slate-400 font-medium`}>{item.oem}</td>
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

                          {!hiddenColumns.has('price') && (
                            <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
                              <div className="inline-flex items-center justify-end text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap" dir="ltr">
                                <span className="whitespace-nowrap">{item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('setOf4Price') && (
                            <td className={`${cellPaddingClass} text-right whitespace-nowrap`}>
                              <div className="inline-flex items-center justify-end text-xs font-semibold text-slate-600 font-mono whitespace-nowrap" dir="ltr">
                                <span className="whitespace-nowrap">{item.setOf4Price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('offer') && (
                            <td className={`${cellPaddingClass} text-center text-xs text-slate-400 font-medium`}>{item.offer}</td>
                          )}

                          <td className={`${cellPaddingClass} text-center`}>
                            <div className="flex items-center justify-center gap-1.5">
                              {/* List toggle button — calls toggleList() to add or remove.
                                  To disable this button, delete this entire <button> block. */}
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleList(item); }}
                                title={listIds.has(item.id) ? 'Remove from List' : 'Add to List'}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${listIds.has(item.id)
                                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                                  : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                                  }`}
                              >
                                <BookmarkIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                                title="Add to Cart"
                                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${cart.has(item.id)
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                  }`}
                              >
                                <ShoppingCartIcon className="w-4 h-4" />
                              </button>
                            </div>
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
                  {activeDrawerItem.category ? (
                    <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full uppercase tracking-wider ${categoryBadges[activeDrawerItem.category] || 'bg-purple-50 text-purple-700'}`}>
                      {activeDrawerItem.category}
                    </span>
                  ) : null}
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
                  { key: 'brand', label: 'Brand' },
                  { key: 'size', label: 'Tyre Size' },
                  { key: 'name', label: 'Name' },
                  { key: 'runflat', label: 'RunFlat' },
                  { key: 'origin', label: 'Origin' },
                  { key: 'year', label: 'Year' },
                  { key: 'oem', label: 'OEM' },
                  { key: 'qty', label: 'Qty' },
                  { key: 'price', label: 'Price' },
                  { key: 'setOf4Price', label: 'Set of 4 Price' },
                  { key: 'offer', label: 'Offer' }
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
