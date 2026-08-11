'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { notFound } from 'next/navigation';
import { features } from '@/config/features';
import BookInquiryModal from "@/components/BookInquiryModal";
import CheckSupplierModal from "@/components/CheckSupplierModal";
import CartModal from "@/components/CartModal";
import QuickViewModal from '@/components/QuickViewModal';
import QuotationModal from '@/components/QuotationModal';
import Filter from '@/components/Filter';
import Pagination from "@/components/Pagination";
import ToastContainer from "@/components/ToastContainer";
type TableDensity = 'compact' | 'comfortable' | 'breathable';
import { useProductFilter } from '@/hooks/useProductFilter';
import { useProductSorting } from '@/hooks/useProductSorting';
import ChatModal from "@/components/ChatModal";
import TyresGuideModal from "@/components/TyresGuideModal";
import ProductTableRow from '@/components/ProductTableRow';
import { buildRowString, buildBulkCopyString, setOfFourPrice } from "@/services/productFormatter";
import Header from "@/components/Header";
import HeaderActions from "@/components/HeaderActions";
import { CATEGORY_BADGES_SEMANTIC, BRAND_BADGES_SEMANTIC } from "@/constants/badges";
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  paginate,
} from '@/services/searchFilter';
import { useCart } from '@/hooks/useCart';
import {
  getCachedTcPages,
  purgeLegacyTcCache,
  getRows,
  setRows,
  ROWS_KEY,
} from '@/services/cache';
import { syncManager } from '@/services/syncManager';
import { SYNC_TASK } from '@/services/syncTasks';
import { useSyncTask, useSyncBatches, useOnSyncComplete, useOnSyncError } from '@/hooks/useSyncManager';
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


/**
 * Every column the Search box should match as a plain substring, UNIONed with
 * the tokenized search above (see `globalSearchFields` in useProductFilter).
 *
 * Needed because `SEARCH_FIELDS` alone cannot cover these. Two gaps it closes:
 *   - Columns absent from `SEARCH_FIELDS` entirely — oem, offer, qty, price,
 *     setOf4Price, sizeFull.
 *   - NUMERIC values. The tokenizer routes any all-digit token to the size
 *     fields, so a price ("469"), a qty ("1") or a year ("2026") could never
 *     reach its own column no matter which fields were listed.
 *
 * `oem` is listed for completeness but is always NO_API_FIELD ("—") — the
 * schema has no OEM field (see the NO_API_FIELD note), so it can only ever
 * match someone typing the dash itself.
 */
const GLOBAL_SEARCH_FIELDS = [
  'brand',
  'category',
  'pattern',
  'size',
  'sizeFull',
  'oem',
  'country',
  'year',
  'qty',
  'price',
  'setOf4Price',
  'offer',
] as const;



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
  /** True when the API's `offers` attribute holds a real option id. Drives the
   *  OFFERS? filter; the RunFlat column still uses `runflat`. */
  hasOffer: boolean;
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

interface Toast {
  id: number;
  msg: string;
}



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
  if (lower.includes('motorcycle')) return '';
  if (lower === 'budget') return 'Budget';
  if (lower === 'tier 1' || lower === 'tier1') return 'Tier 1';
  if (lower === 'tier 2' || lower === 'tier2') return 'Tier 2';
  if (lower === 'tier 3' || lower === 'tier3') return 'Tier 3';
  if (lower === 'premium') return 'Premium';
  if (lower === 'quality') return 'Quality';
  if (lower === 'mid-range' || lower === 'midrange') return 'Mid-Range';
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
  offers: Record<string, string>;
  tyresCategory: Record<string, string>;
}

const EMPTY_MAP: Record<string, string> = {};

function prepareTcLabels(labels: TcAttributeLabels): TcLabelMaps {
  return {
    size: labels.tyre_size ?? EMPTY_MAP,
    brand: labels.brand ?? EMPTY_MAP,
    runflat: labels.runflat ?? EMPTY_MAP,
    year: labels.year ?? EMPTY_MAP,
    country: labels.country ?? EMPTY_MAP,
    offers: labels.offers ?? EMPTY_MAP,
    tyresCategory: labels.tyres_category ?? EMPTY_MAP,
  };
}

/** Indexed read, no `String()` allocation; '' for a missing/absent option. */
const lbl = (m: Record<string, string>, id: number | null): string =>
  id === null || id === undefined ? '' : m[id] ?? '';

function mapTcProduct(p: TcApiProduct, maps: TcLabelMaps): Product {
  const size = lbl(maps.size, p.tyre_size);
  const li = (p.load_index ?? '').trim();
  const regular = p.price_range?.minimum_price?.regular_price?.value ?? 0;
  const tyresCategoryFromLabel = lbl(maps.tyresCategory, p.tyres_category ?? null);
  const tyresCategoryFromList = p.categories?.find(c => c.name && c.name !== 'Default Category' && c.name !== 'Tyres')?.name ?? '';
  const tyresCategoryLabel = tyresCategoryFromLabel || tyresCategoryFromList;
  // Resolved once and reused by BOTH the Offer column and the Set of 4
  // derivation below, so the price can never disagree with the badge shown
  // next to it.
  const offerLabel = lbl(maps.offers, p.offers) || NO_API_FIELD;
  const sizeFull = li && !size.includes(li) ? `${size} ${li}`.trim() : size;

  return {
    id: Number(p.uid ? parseInt(atob(p.uid), 10) : 0) || 0,
    source: '',
    itemCode: p.sku ?? '',
    productType: '',
    category: normalizeCategory(tyresCategoryLabel),
    brand: lbl(maps.brand, p.brand),
    pattern: p.name ?? '',
    size,
    sizeFull,
    runflat: lbl(maps.runflat, p.runflat) !== '',
    // `offers` is an option ID, not a boolean: null and 0 both mean "no offer",
    // any other id is one of the 8 configured promotions. Nothing is defaulted —
    // a product the API says nothing about is simply not an offer.
    hasOffer: p.offers !== null && p.offers !== undefined && Number(p.offers) > 0,
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
    // per-unit figure. Computed at map time, so it re-derives automatically
    // whenever the API returns a new price — nothing cached to go stale.
    //
    // NOT a flat 4x: a free-tyre promotion means the customer pays for fewer
    // than four. The rule lives in `setOfFourPrice` (services/productFormatter)
    // so this page, Quick View and the copy string cannot drift apart. The
    // per-unit `price` above is left exactly as the API sent it.
    setOf4Price: setOfFourPrice(regular, offerLabel),
    oem: NO_API_FIELD,
    // The promo attribute's own label, e.g. "Free Wheel Alignment". This was a
    // regular-vs-final price percentage, which rendered as an em-dash on every
    // row: measured across all 8,526 products, none has final < regular, so the
    // spread was always zero. `offers` is the field that actually carries this.
    offer: offerLabel,
  };
}

/** Badge classes now live in constants/badges.ts; aliased so the JSX below
 *  is untouched and this page keeps its own variant. */
const categoryBadges = CATEGORY_BADGES_SEMANTIC;
const brandBadges = BRAND_BADGES_SEMANTIC;



export default function TcProductsPage() {
  if (!features.tcProducts) notFound();
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
  /** Offer filter — 'ALL' = show all products, 'HAS_OFFER' = any offer, or specific offer label.
   *  Defaults to 'ALL' so all products are shown when no specific offer is selected. */
  const [offerFilter, setOfferFilter] = useState('ALL');

  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  // Default sort is Date, descending (latest date first)
  // Default view is Year DESC, then Date DESC inside each year (see the
  // `year` branch in useProductSorting). Sorting by 'date' alone ordered the
  // whole catalogue by date and interleaved the years — 2024 rows dated
  // 07-Jul sat above 2026 rows dated 04-Jul.
  const { handleSort, sortItems } = useProductSorting<Product>('year', false);

  const [selectedIds] = useState<Set<number>>(new Set());
  /** Rows the user has added via the Action column. Client-side only — there is
   *  no list/cart endpoint on the API yet, so this is UI state, not fake data. */
  const [listIds, setListIds] = useState<Set<number>>(new Set());
  /** Persisted, offline-first cart — survives refresh, navigation and offline. */
  const cart = useCart();
  /** Row whose supplier-availability panel is open, or null. */
  const [checkSupplierItem, setCheckSupplierItem] = useState<Product | null>(null);
  /** Cart panel visibility. Opens on Add to Cart. */
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [quickViewItem, setQuickViewItem] = useState<Product | null>(null);
  const [inquiryModalItem] = useState<Product | null>(null);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isTyresGuideModalOpen, setIsTyresGuideModalOpen] = useState(false);
  const [density] = useState<TableDensity>('comfortable');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((msg: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  }, []);

  const [hiddenColumns] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  /** Synchronous latch for the PAGE-scoped sync only. The full catalogue sync
   *  is owned by the global manager, which dedupes on its own. */
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

      // One-time: drop pages cached before the query asked for `offers`. Without
      // this they would still match on page size and be served without the field.
      await purgeLegacyTcCache().catch(() => 0);
      if (!isCurrent()) return;

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

      // Offline with nothing cached → do NOT start. The task would burn 3 retry
      // attempts per page and trip its circuit breaker for no possible gain;
      // supplier-products has always guarded this. The toast below tells the
      // user to connect once.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        addToast('Offline and no cached products yet. Connect once to load the catalogue.');
        return;
      }

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
  useOnSyncError(SYNC_TASK.tcProducts, () => {
    addToast('Could not load TC products. Please use Sync to retry.');
  });

  // Mirror the loaded rows into the session cache for the next visit.
  useEffect(() => {
    if (allProducts.length) setRows(ROWS_KEY.tcProducts, allProducts);
  }, [allProducts]);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark-theme');
    void loadAll();
    const ref = loadIdRef;
    // Bump the load id on unmount so a background run stops instead of
    // fetching every remaining page into a dead component.
    return () => {
      ref.current++;
    };
  }, [loadAll]);

  // Header refresh button — re-runs the same API load with full sync banner.
;;

  /*
   * Full catalogue sync now lives entirely in the global manager (see
   * `services/syncTasks.ts`) and is triggered by <SidebarSyncButton />. This
   * page deliberately keeps NO handler for it:
   *   - it must not stop when the user navigates away, and
   *   - it must not also be registered via `registerModuleSync`, or a sidebar
   *     sync would run the whole ~3,187-request pass twice.
   * The page only observes — see `useSyncTask` / `useSyncBatches` above.
   */

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered & Sorted Dataset
  const filteredProductsRaw = useProductFilter({
    allProducts,
    searchQuery,
    categoryFilter,
    brandInput,
    sizeInput,
    yearInput,
    qtyInput,
    minPriceInput,
    maxPriceInput,
    offerFilter,
    // The hook defaults to the RAW SupplierProductItem names
    // ("product_name", "sku", "brand_category"), which do not exist on this
    // page's mapped shape — so without these the Query box silently searched
    // only brand/country/size and could never match a name, SKU or category.
    searchFields: SEARCH_FIELDS,
    searchSizeFields: SEARCH_SIZE_FIELDS,
    // Makes the Search box a single global search across every listed column
    // — additive, so existing size-aware queries keep working unchanged.
    globalSearchFields: GLOBAL_SEARCH_FIELDS,
  });

  const filteredProducts = useMemo(() => {
    return sortItems(filteredProductsRaw);
  }, [filteredProductsRaw, sortItems]);

  // Extract category, brand, offer, and size dropdown lists in ONE pass.
  const { categoryOptions, brandOptions, offerOptions, sizeOptions } = useMemo(() => {
    const categories = new Set<string>();
    const brands = new Set<string>();
    const offers = new Set<string>();
    const sizes = new Set<string>();
    for (const p of allProducts) {
      if (p.category) categories.add(normalizeCategory(p.category));
      if (p.brand) brands.add(p.brand);
      if (p.offer && p.offer !== NO_API_FIELD) offers.add(p.offer);
      const sz = p.size || p.sizeFull;
      if (sz) sizes.add(sz);
    }
    return {
      categoryOptions: Array.from(categories).sort(),
      brandOptions: Array.from(brands).sort(),
      offerOptions: Array.from(offers).sort(),
      sizeOptions: Array.from(sizes).sort(),
    };
  }, [allProducts]);



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
    ((backgroundLoading || taskRunning) && currentItems.length === 0);

  // Keep the current page within range whenever the result set shrinks (a
  // filter change, page-size change, or Latest toggle), so the table never sits
  // on an empty, out-of-range page.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
    else if (currentPage < 1) setCurrentPage(1);
  }, [currentPage, totalPages]);



  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setBrandInput('');
    setSizeInput('');
    setYearInput('');
    setQtyInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setOfferFilter('ALL');
    setCurrentPage(1);
    addToast('Filters reset to default.');
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
    // Open the modern Quotation modal
    setIsQuotationModalOpen(true);
  };

  /**
   * Share one product to WhatsApp.
   *
   * Uses `buildRowString` — the exact line the row-copy button produces — so a
   * product shared to WhatsApp reads identically to one pasted from the
   * clipboard. `wa.me` with no number opens the contact picker, letting the user
   * choose the recipient; `noopener` because it is a cross-origin tab.
   */
  const shareOnWhatsApp = (item: Product) => {
    const text = buildRowString(item);
    navigator.clipboard.writeText(text);
    addToast(`Copied product details to clipboard!`);
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
      offerFilter !== 'ALL'
    );
  }, [searchQuery, categoryFilter, brandInput, sizeInput, yearInput, qtyInput, minPriceInput, maxPriceInput, offerFilter]);

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




  // Cell padding class based on Density mode
  const cellPaddingClass = useMemo(() => {
    if (density === 'compact') return 'py-1 px-1.5';
    if (density === 'comfortable') return 'py-1.5 px-2';
    return 'py-2 px-2'; // breathable
  }, [density]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-200 relative">


      {/* 2. MAIN FULL-WIDTH SUPPLIER PRODUCTS AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">

        {/* TOP NAVIGATION HEADER */}
        <Header
          variant="sticky"
          title="TC Products"
          bookInquiry={false}
          fullscreenTone="slate"
          syncTitle="Sync TC products"
          isOnline={isOnline}
          actions={
            <HeaderActions
              badge={
                <span className="inline-flex items-center justify-center min-w-[92px] bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200/80 tabular-nums whitespace-nowrap">
                  {taskRunning ? (
                    syncProgress ? (
                      `Syncing: ${syncProgress.loaded.toLocaleString()} items`
                    ) : (
                      `Syncing... ${totalItems.toLocaleString()} items`
                    )
                  ) : (
                    `${totalItems.toLocaleString()} items`
                  )}
                </span>
              }
              onCopyResult={copyAllSearchResults}
              hasActiveFilter={hasActiveFilter}
              onCreateQuote={() => setIsQuotationModalOpen(true)}
              onExportCSV={exportCSV}
              onChat={() => setIsChatModalOpen(true)}
              onTyresGuide={() => setIsTyresGuideModalOpen(true)}
            />
          }
        />

        {/* SCROLLABLE INNER DASHBOARD BODY */}
        <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 pb-4 gap-3.5 w-full mx-auto overflow-hidden">

          <Filter
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            categoryOptions={categoryOptions}

            brandInput={brandInput}
            setBrandInput={setBrandInput}
            brandOptions={brandOptions}

            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}

            sizeInput={sizeInput}
            setSizeInput={setSizeInput}
            sizeOptions={sizeOptions}

            yearInput={yearInput}
            setYearInput={setYearInput}

            qtyInput={qtyInput}
            setQtyInput={setQtyInput}

            minPriceInput={minPriceInput}
            setMinPriceInput={setMinPriceInput}

            maxPriceInput={maxPriceInput}
            setMaxPriceInput={setMaxPriceInput}

            showOfferFilter
            offerFilter={offerFilter}
            setOfferFilter={setOfferFilter}
            offerOptions={offerOptions}

            onSearch={() => setCurrentPage(1)}
            onReset={resetFilters}
          />

          {/* Data Table Container Card */}
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col flex-1 min-h-0">



            {/* Scrollable Table — fills the card and scrolls INTERNALLY so row
                count / page size never changes the card height (no layout shift). */}
            <div className={`flex-1 min-h-0 [scrollbar-gutter:stable] ${pageSize > 15 ? "overflow-y-auto" : "overflow-hidden"}`}>
              <table className="w-full min-w-[1280px] xl:min-w-0 text-left border-collapse table-fixed">
                <colgroup>
                  {!hiddenColumns.has('brand') && <col className="w-[8%]" />}
                  {!hiddenColumns.has('category') && <col className="w-[7%]" />}
                  {!hiddenColumns.has('size') && <col className="w-[9%]" />}
                  {!hiddenColumns.has('name') && <col className="w-[20%]" />}
                  {!hiddenColumns.has('oem') && <col className="w-[4%]" />}
                  {!hiddenColumns.has('runflat') && <col className="w-[5%]" />}
                  {!hiddenColumns.has('origin') && <col className="w-[6%]" />}
                  {!hiddenColumns.has('year') && <col className="w-[5%]" />}
                  {!hiddenColumns.has('qty') && <col className="w-[4%]" />}
                  {!hiddenColumns.has('price') && <col className="w-[7%]" />}
                  {!hiddenColumns.has('setOf4Price') && <col className="w-[8%]" />}
                  {!hiddenColumns.has('offer') && <col className="w-[10%]" />}
                  <col className="w-[7%]" />
                </colgroup>
                <thead className="bg-slate-50/90 backdrop-blur sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    {!hiddenColumns.has('brand') && <th onClick={() => handleSort('brand')} className="py-2.5 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap">Brand <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('category') && <th onClick={() => handleSort('category')} className="py-2.5 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap">Category <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('size') && <th onClick={() => handleSort('size')} className="py-2.5 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap">Tyre Size <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('name') && <th onClick={() => handleSort('pattern')} className="py-2.5 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap">Name <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('oem') && <th className="py-2.5 px-1 text-center whitespace-nowrap">OEM</th>}
                    {!hiddenColumns.has('runflat') && <th className="py-2.5 px-1 text-center whitespace-nowrap">RunFlat</th>}
                    {!hiddenColumns.has('origin') && <th onClick={() => handleSort('country')} className="py-2.5 px-1.5 cursor-pointer hover:text-slate-900 whitespace-nowrap">Origin <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('year') && <th onClick={() => handleSort('year')} className="py-2.5 px-1 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap">Year <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('qty') && <th onClick={() => handleSort('qty')} className="py-2.5 px-1 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap">Qty <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('price') && <th onClick={() => handleSort('price')} className="py-2.5 px-1.5 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap">Price <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('setOf4Price') && <th onClick={() => handleSort('setOf4Price')} className="py-2.5 px-1.5 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap">Set of 4 <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('offer') && <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Offer</th>}
                    <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {showSkeleton ? (
                    Array.from({ length: pageSize }).map((_, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50">
                        {!hiddenColumns.has('brand') && <td className={cellPaddingClass}><Skeleton className="h-5 w-20 rounded-md" /></td>}
                        {!hiddenColumns.has('category') && <td className={cellPaddingClass}><Skeleton className="h-5 w-16 rounded-md" /></td>}
                        {!hiddenColumns.has('size') && <td className={cellPaddingClass}><Skeleton className="h-5 w-24 rounded-md" /></td>}
                        {!hiddenColumns.has('name') && <td className={cellPaddingClass}><Skeleton className="h-4 w-48 rounded" /></td>}
                        {!hiddenColumns.has('oem') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-8 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('runflat') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-10 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('origin') && <td className={cellPaddingClass}><Skeleton className="h-4 w-16 rounded" /></td>}
                        {!hiddenColumns.has('year') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-12 rounded mx-auto" /></td>}
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
                    currentItems.map((item) => (
                      <ProductTableRow
                        key={item.id}
                        item={item}
                        type="tc"
                        hiddenColumns={hiddenColumns}
                        cellPaddingClass={cellPaddingClass}
                        isSelected={selectedIds.has(item.id)}
                        brandBadges={brandBadges}
                        categoryBadges={categoryBadges}
                        onCopyRow={copyRowData}
                        onQuickView={setQuickViewItem}
                        onAddToCart={addToCart}
                        onToggleList={toggleList}
                        onShareWhatsApp={shareOnWhatsApp}
                        onCheckSupplier={setCheckSupplierItem}
                        inCart={cart.has(item.id)}
                        inList={listIds.has(item.id)}
                        offerOptions={offerOptions}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
            />

          </section>
        </div>
      </main>

      {isCartOpen && (
        <CartModal
          onCloseAction={() => setIsCartOpen(false)}
          onCheckoutAction={(total) =>
            addToast(`Checkout: AED ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} — no order API is wired yet.`)
          }
        />
      )}

      {checkSupplierItem && (
        <CheckSupplierModal
          key={String(checkSupplierItem.id)}
          product={{
            itemCode: checkSupplierItem.itemCode,
            brand: checkSupplierItem.brand,
            size: checkSupplierItem.size,
            sizeFull: checkSupplierItem.sizeFull,
            pattern: checkSupplierItem.pattern,
            price: checkSupplierItem.price,
            setOf4Price: checkSupplierItem.setOf4Price,
            offer: checkSupplierItem.offer,
            year: checkSupplierItem.year,
            country: checkSupplierItem.country,
            flag: checkSupplierItem.flag,
            runflat: checkSupplierItem.runflat,
          }}
          onCloseAction={() => setCheckSupplierItem(null)}
        />
      )}



      {/* Book Inquiry Modal Component */}
      <BookInquiryModal
        isOpen={isInquiryModalOpen}
        onClose={() => setIsInquiryModalOpen(false)}
        sizeOptions={sizeOptions}
        initialProduct={
          inquiryModalItem
            ? {
                brand: inquiryModalItem.brand,
                size: inquiryModalItem.sizeFull || inquiryModalItem.size,
                pattern: inquiryModalItem.pattern,
              }
            : null
        }
      />

      {/* Quick View Slide-Up Modal — Same as Supplier Products */}
      {quickViewItem && (
        <QuickViewModal
          key={quickViewItem.id}
          product={quickViewItem}
          onClose={() => setQuickViewItem(null)}
          onAddToCart={(prod, qty) => {
            cart.add({
              id: Number(prod.id),
              sku: prod.itemCode,
              name: prod.pattern,
              brand: prod.brand,
              size: prod.sizeFull || prod.size,
              price: prod.cost,
            });
            addToast(`Added ${qty} x "${prod.pattern || prod.brand}" to cart!`);
            setQuickViewItem(null);
          }}
        />
      )}

      {/* New Quotation Modal */}
      <QuotationModal
        isOpen={isQuotationModalOpen}
        onClose={() => setIsQuotationModalOpen(false)}
        onSave={() => addToast('Quotation saved successfully!')}
      />

      {/* Chat Shortcuts Modal */}
      <ChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
      />

      {/* Tyres Guide Modal */}
      <TyresGuideModal
        isOpen={isTyresGuideModalOpen}
        onClose={() => setIsTyresGuideModalOpen(false)}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} />

    </div >
  );
}
