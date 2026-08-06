'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { buildRowString, buildBulkCopyString } from "@/services/productFormatter";
import Header from '@/components/Header';
import HeaderBookInquiry from '@/components/HeaderBookInquiry';
import HeaderActions from '@/components/HeaderActions';
import { CATEGORY_BADGES_SEMANTIC, BRAND_BADGES_TAILWIND } from "@/constants/badges";
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  parseAspectRim,
  parseRimOnly,
  matchesAspectRim,
  matchesSearch,
  paginate,
  searchWithAspectRimFallback,
} from '@/services/searchFilter';
import { Skeleton } from '@/components/Skeletons';
import CostHistoryModal from '@/components/CostHistoryModal';
import QuickViewModal from '@/components/QuickViewModal';
import QuotationModal from '@/components/QuotationModal';
import Filter from '@/components/Filter';
import ChatModal from "@/components/ChatModal";
import ProductTableRow from "@/components/ProductTableRow";
import Pagination from "@/components/Pagination";
import ToastContainer from "@/components/ToastContainer";
type TableDensity = 'compact' | 'comfortable' | 'breathable';
import PageSizeMenu from "@/components/PageSizeMenu";
import { useProductFilter } from '@/hooks/useProductFilter';
import { useProductSorting } from '@/hooks/useProductSorting';
import {
  streamCachedSupplierProducts,
  getCachedSupplierProductsByYearDesc,
  purgeHistoricalSupplierRows,
  getRows,
  setRows,
  ROWS_KEY,
  countCachedSupplierProducts,
  type CachedSupplierProduct,
} from '@/services/cache';
import {
  syncManager,
  useSyncTask,
  useSyncBatches,
  useOnSyncComplete,
  useOnSyncError,
} from '@/hooks/useSyncManager';
import { SYNC_TASK, setSupplierPageRequest } from '@/services/syncTasks';

/**
 * Field names `searchFilter` should read on this page's `Product` shape.
 *
 * The module defaults to the raw `SupplierProductItem` names
 * (`product_name`, `sku`, `brand_category`, …); the table works with the mapped
 * shape, so the equivalents are passed explicitly. That override is exactly why
 * `matchesSearch` takes the field lists as parameters.
 */
/* `source` is the SOURCE column — the supplier/competitor name, mapped from
   the feed's `source_name` ("LKN", "pitstop", "Mivomoto", "tyrescart"…).
   It was missing here, so the one column that identifies WHO stocks a tyre was
   the only visible column the search box could not match: typing "LKN"
   returned nothing despite 137 such rows being in the feed. */
const SEARCH_FIELDS = ['pattern', 'itemCode', 'brand', 'category', 'country', 'size', 'source'] as const;
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

/**
 * "2026-07-20" → 20260720, so dates sort as plain integers.
 *
 * The table defaults to sorting by date, which means the comparator now runs on
 * every recompute — including with LATEST? unticked, where it covers all
 * 318,668 rows (~5.7M comparisons). Doing that through `Intl.Collator` on
 * strings took ~20s and froze the page; integer subtraction is ~1-2s.
 * Undated rows get 0 so they group at one end rather than interleaving.
 */
function dateSortKey(raw?: string): number {
  if (!raw) return 0;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

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
 * String interning for the supplier mapper.
 *
 * 319,429 rows each carry a handful of fields drawn from small vocabularies —
 * ~10 suppliers, 2 product types, ~5 categories, ~200 brands, ~2k sizes, ~40
 * countries, ~500 dates. `JSON.parse` (and therefore the IndexedDB read) hands
 * back a FRESH string object per occurrence, so the catalogue held hundreds of
 * thousands of duplicate strings: measured ~96MB retained after a full sync.
 *
 * Routing those fields through one shared table means every row points at the
 * same string instance. Row identity, values and ordering are unchanged — only
 * how many copies exist in memory.
 *
 * The table itself holds one entry per DISTINCT value (a few thousand), and is
 * cleared when a sync starts a fresh generation so a re-sync cannot grow it
 * without bound.
 */
const internTable = new Map<string, string>();

function intern(v: string): string {
  const hit = internTable.get(v);
  if (hit !== undefined) return hit;
  internTable.set(v, v);
  return v;
}

/** Drop interned values that a new catalogue generation may no longer use. */
function resetIntern(): void {
  internTable.clear();
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
    source: intern(p.source_name ?? ''),
    itemCode: p.sku ?? '',
    productType: intern(productTypeLabel(p.product_source)),
    category: intern(normalizeCategory(p.brand_category)),
    brand: intern(p.brand ?? ''),
    pattern: p.product_name ?? '',
    size: intern(p.size ?? ''),
    sizeFull: intern(sizeWithLoadSpeed(p.size ?? '', p.product_name ?? '')),
    runflat: p.runflat !== undefined && p.runflat !== null
      ? (typeof p.runflat === 'boolean' ? p.runflat : String(p.runflat).toLowerCase() === 'yes' || String(p.runflat) === '1')
      : /run\s*flat|\bRFT\b|\bZP\b|\bSSR\b|\bMOE\b/i.test(p.product_name ?? ''),
    year: Number(p.year) || 0,
    country: intern(p.country ?? ''),
    flag: '',
    qty: 0,
    cost: Number(p.cost) || Number(p.price) || 0,
    // Was hardcoded to 0. `fitting_price` is a real API field and is populated
    // on some rows, so the column showed 0.00 for every product regardless.
    // Rows cached before it was added to the query have no value → 0, until a
    // re-sync fills them in.
    fittingPrice: Number(p.fitting_price) || 0,
    date: intern(p.date ?? ''),
    dateKey: dateSortKey(p.date),
    is_latest: Number(p.is_latest) === 1 ? 1 : 0,
  };
}

/** Badge classes now live in constants/badges.ts; aliased so the JSX below
 *  is untouched and this page keeps its own variant. */
const categoryBadges = CATEGORY_BADGES_SEMANTIC;
const brandBadges = BRAND_BADGES_TAILWIND;

export default function SupplierProductsPage() {
  console.time("React Render");
  useEffect(() => {
    console.timeEnd("React Render");
  });
  const isOnline = useOnlineStatus();

  /** Seeded from the session rows cache, so returning to this page paints the
   *  full catalogue on the FIRST render instead of awaiting a bulk IndexedDB read
   *  and re-mapping ~318k rows. Empty on a cold start, where the mount effect's
   *  cache read fills it — cache-first behaviour is unchanged either way. */
  const [allProducts, setAllProducts] = useState<Product[]>(
    () => getRows<Product>(ROWS_KEY.supplierProducts) ?? [],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandInput, setBrandInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  /** Price Range bounds — raw input strings so the fields can be empty. */
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  /* ── Debounced copies for the expensive derived work ──
     The inputs above stay bound to the raw state, so typing is never laggy.
     Only `filteredProducts` (and what derives from it) reads these, because that
     memo walks the whole loaded catalogue: measured at 319,429 rows, one
     keystroke cost ~2.5s of blocked main thread, and a six-character query spent
     ~15s recomputing results that were discarded on the next character.

     Dropdowns, checkboxes and sort clicks are NOT debounced — they fire once, so
     delaying them would only add lag. */
  const dSearchQuery = useDebouncedValue(searchQuery);
  const dBrandInput = useDebouncedValue(brandInput);
  const dSizeInput = useDebouncedValue(sizeInput);
  const dYearInput = useDebouncedValue(yearInput);
  const dQtyInput = useDebouncedValue(qtyInput);
  const dMinPriceInput = useDebouncedValue(minPriceInput);
  const dMaxPriceInput = useDebouncedValue(maxPriceInput);


  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  // Default sort is Year, descending (latest year first) — the array itself
  // already arrives in this order straight off the `year` index (see the
  // initial-load effect below), so this default just keeps the DISPLAYED
  // order matching what was actually loaded rather than re-sorting it by date.
  const { sortColumn, sortAsc, handleSort, sortItems } = useProductSorting<Product>('year', false);

  /** Product whose Cost History modal is open, or null. */
  const [costHistoryItem, setCostHistoryItem] = useState<Product | null>(null);
  /** Product whose Quick View modal is open, or null. */
  const [quickViewItem, setQuickViewItem] = useState<Product | null>(null);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [density, setDensity] = useState<TableDensity>('comfortable');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  /** Synchronous latch for the PAGE-scoped sync only. The full catalogue sync
   *  is owned by the global manager, which dedupes on its own. */
  /** True only while the cold-start latest-products phase is still running. */
  /** Set once when this page kicks off the cold-start sync; never cleared —
   *  whether the run is still going is read from the manager below. */
  const [bootstrapRequested, setBootstrapRequested] = useState(false);

  /* ── Global sync manager: OBSERVE, don't own ───────────────────────
     The catalogue sync runs inside `syncManager`, outside React, so it keeps
     running when this page unmounts. Everything below is a READ of that global
     state — the page contributes no sync lifecycle of its own, which is what
     lets a sync started here survive navigation to another route. */
  const supplierSync = useSyncTask(SYNC_TASK.supplierProducts);
  const supplierPageSync = useSyncTask(SYNC_TASK.supplierPage);
  const fullSyncing = supplierSync.status === 'running';
  const syncProgress = supplierSync.progress;

  /* The page-scoped sync task takes no arguments (nothing outside React knows
     which slice is on screen), so publish it whenever pagination changes. */
  useEffect(() => {
    setSupplierPageRequest({ pageSize, currentPage });
  }, [pageSize, currentPage]);

  // IndexedDB-first: on load/refresh/navigation we ONLY read the cached
  // catalogue — no API request, no background sync, no revalidation. Fresh data
  // comes solely from the shared <SyncButton /> and the sidebar. If the cache is empty,
  // the table shows its empty state until the user syncs.
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark-theme');
    let alive = true;
    (async () => {
      // Rows mapped earlier this session are already on screen (seeded above).
      // Re-reading IndexedDB would produce the same list, so skip it. This is
      // still cache-first — and still API-free — it just skips redundant work.
      // Note the early return matches the `readCount > 0` branch below:
      // rows in memory mean the store was non-empty, so no bootstrap either.
      const memo = getRows<Product>(ROWS_KEY.supplierProducts);
      if (memo?.length) {
        setIsLoading(false);
        for (const p of memo) seenIds.current.add(p.id);
        return;
      }

      /* ── YEAR-INDEXED READ (default initial order: latest year first) ──
         Sourced from `getCachedSupplierProductsByYearDesc`, which reads the
         `year` INDEX on the store (services/db.ts v7) and only reverses the
         already-ordered result — no `Array.prototype.sort()` over the rows.
         See that function and the DB_VERSION v7 comment for why the index
         needed a one-time data migration before it could be trusted.

         Chunked into artificial "pages" purely to keep the same progressive-
         paint UX the old primary-key pager had (first slice paints
         immediately, the thread is handed back between chunks) — NOT because
         this read needs paging for correctness. The store this reads is
         bounded to the latest-only catalogue (~8,251 rows measured), so one
         `getAll()`-backed index read is cheap; that was NOT true of the old
         319,429-row non-latest store, which is why that version paged by
         primary key instead. */
      // One-time: drop historical rows left by a cache written before this page
      // became latest-only. No-op (one meta read) on every load after the first.
      await purgeHistoricalSupplierRows().catch(() => 0);
      if (!alive) return;

      const yearOrderedRows = await getCachedSupplierProductsByYearDesc().catch(
        () => [] as CachedSupplierProduct[],
      );
      if (!alive) return;

      const acc: Product[] = [];
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < yearOrderedRows.length; i += CHUNK_SIZE) {
        if (!alive) return;
        for (const row of yearOrderedRows.slice(i, i + CHUNK_SIZE)) {
          const mapped = mapSupplierToProduct(row);
          acc.push(mapped);
          // Seed the batch de-dupe set as we go. Mounting DURING a running sync
          // otherwise appends rows that are already on screen (measured: 67,500
          // duplicates) because `seenIds` starts empty on a fresh mount.
          seenIds.current.add(mapped.id);
        }
        // New array each chunk so React sees a change; copying refs is cheap
        // next to the deserialisation that just happened.
        setAllProducts([...acc]);
        setIsLoading(false);
        if (i + CHUNK_SIZE < yearOrderedRows.length) {
          // Hand the thread back so React can paint and input stays responsive.
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      const readCount = yearOrderedRows.length;
      if (!alive) return;

      /* The read is done — clear the loading flag whether or not it produced
         rows. The loop above clears it too (so the first chunk paints
         immediately), but on a COLD cache the store is empty, the loop body
         never runs, and the flag would stay true forever: rows then arrive via
         sync batches and the table sat on skeletons until a reload.
         `showSkeleton`'s bootstrap clause still covers the genuinely-empty-
         while-syncing case. */
      setIsLoading(false);


      // CACHE-FIRST IS UNCHANGED: with anything cached we render it and stop —
      // no GraphQL on load, navigation or refresh. The bootstrap below runs
      // ONLY on a cold cache, where there is nothing to be cache-first about
      // and the alternative is an empty table until the user finds Sync.
      // SOURCE OF TRUTH: does supplier data exist in IndexedDB? Anything cached
      // means no auto-sync. An empty store means bootstrap — for ANY reason:
      // first load, storage eviction, or a manual cache wipe. The
      // `bootstrapCompleted` flag is recorded for diagnostics but deliberately
      // does NOT gate this, so an evicted cache always self-heals.
      if (readCount > 0) return;

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
      setBootstrapRequested(true);
      resetIntern(); // fresh generation → let go of the previous vocabulary
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
  // Mirror the loaded rows into the session cache for the next visit.
  useEffect(() => {
    if (allProducts.length) setRows(ROWS_KEY.supplierProducts, allProducts);
  }, [allProducts]);

  /**
   * Re-read the catalogue after a sync, streamed and published ONCE.
   *
   * Same job the old `getCachedSupplierProducts()` call did here — batches arrive
   * from 8 concurrent workers, so their append order is not the catalogue's — but
   * without the multi-second `getAll` block. Pages accumulate off-screen and are
   * swapped in a single state update, so a finished sync never triggers a burst of
   * renders over a 319k-row array.
   */
  /**
   * Merge a freshly re-read catalogue into the rows already on screen.
   *
   * `reReadCatalogue` re-maps every record, so handing its result straight to
   * `setAllProducts` replaced all ~8,251 row objects even when nothing about
   * them had changed — React then rebuilt the table (measured: 38 rows removed
   * and 38 added at the end of a sync). tc-products never does this; its
   * completion handler touches no data at all.
   *
   * So rows already displayed keep BOTH their position and their object
   * identity unless a field genuinely changed, which is what lets React reuse
   * the existing DOM nodes. Changed rows update in place, new rows append, and
   * rows the re-read no longer contains drop out.
   */
  const mergeCatalogue = useCallback((prev: Product[], next: Product[]): Product[] => {
    if (!prev.length) return next;
    const incoming = new Map(next.map((p) => [p.id, p]));
    const merged: Product[] = [];
    for (const old of prev) {
      const fresh = incoming.get(old.id);
      if (!fresh) continue; // retired by the sync — genuinely gone
      incoming.delete(old.id);
      let changed = false;
      for (const k of Object.keys(fresh) as (keyof Product)[]) {
        if (old[k] !== fresh[k]) { changed = true; break; }
      }
      merged.push(changed ? fresh : old); // reuse the SAME object when identical
    }
    for (const p of incoming.values()) merged.push(p); // newly synced rows append
    return merged;
  }, []);

  const reReadCatalogue = useCallback(async (): Promise<Product[]> => {
    const acc: Product[] = [];
    const seqs: number[] = [];
    await streamCachedSupplierProducts({
      onPage: (rows) => {
        for (const row of rows) {
          acc.push(mapSupplierToProduct(row));
          seqs.push(typeof row.sort_seq === 'number' ? row.sort_seq : Number.MAX_SAFE_INTEGER);
        }
      },
    });
    const order = acc.map((_, i) => i).sort((a, b) => {
      if (seqs[a] !== seqs[b]) return seqs[a] - seqs[b];
      return String(acc[a].id).localeCompare(String(acc[b].id), undefined, { numeric: true });
    });
    return order.map((i) => acc[i]);
  }, []);

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
    void reReadCatalogue().then((rows) => {
      setAllProducts((prev) => mergeCatalogue(prev, rows));
      seenIds.current.clear();
      committedOnce.current = false;
    });
  });

  const addToast = (msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  };

  /* A page refresh upserts those rows into IndexedDB; re-read so the table shows
     them merged into the catalogue in canonical `sort_seq` order — the same thing
     the old inline handler did with this function's return value. */
  useOnSyncComplete(SYNC_TASK.supplierPage, () => {
    void reReadCatalogue().then((rows) => {
      setAllProducts((prev) => mergeCatalogue(prev, rows));
      addToast('Current page refreshed.');
    });
  });

  // Surface a failed background sync — the manager records the reason, but with
  // no page mounted at the time there was nothing to show it.
  useOnSyncError(SYNC_TASK.supplierProducts, () => {
    addToast('Could not load supplier products. Please use Sync to retry.');
  });


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
    searchQuery: dSearchQuery,
    supplierFilter,
    categoryFilter,
    brandInput: dBrandInput,
    sizeInput: dSizeInput,
    yearInput: dYearInput,
    qtyInput: dQtyInput,
    minPriceInput: dMinPriceInput,
    maxPriceInput: dMaxPriceInput,
    /* These were DEFINED at the top of this file but never passed, so the hook
       fell back to SEARCHABLE_FIELDS — the raw `SupplierProductItem` names
       (`product_name`, `sku`, `brand_category`). Those do not exist on this
       page's mapped shape, so only the three names that happen to coincide
       (brand, country, size) were ever searchable; SOURCE, Tyre Pattern and
       SKU silently matched nothing. */
    searchFields: SEARCH_FIELDS,
    searchSizeFields: SEARCH_SIZE_FIELDS,
  });

  /* ── Freeze the visible order for the duration of a sync ──
     `sortItems` ran on every arriving batch, so rows already on screen were
     re-slotted among the new ones and moved up and down.

     The freeze records the rank each row ALREADY has and reuses it, rather than
     skipping the sort outright: skipping it swaps the list from sorted order to
     append order in one step, which changes every row key at once and makes
     React rebuild the whole table (measured: 15 removed + 15 added the instant
     a sync starts). Holding the existing ranks keeps rows in their exact
     positions instead.

     `sortItems` is called ONCE per run to capture that order — never per batch.
     When the run ends the freeze lifts and the normal sort applies once, which
     is the single final ordering. An explicit header click mid-sync also lifts
     it, so sorting on demand still works. The comparator is untouched. */
  const sortSignature = `${String(sortColumn)}|${sortAsc}`;

  /* The snapshot is taken in a useMemo, not refs: reading or writing a ref
     during render is what `react-hooks/refs` forbids, and an effect would land
     one render late — that single unfrozen render is exactly the jump this
     prevents. A memo is evaluated during the same render the sync starts.

     Keyed on `fullSyncing` ALONE, deliberately: the snapshot must describe the
     run's start, so the sort and the row set are read once and then left
     untracked for the rest of the run. */
  const syncSnapshot = useMemo(() => {
    if (!fullSyncing) return null;
    return {
      signature: sortSignature,
      // Ranked over ALL products, not the filtered subset, so changing a filter
      // mid-sync still yields correctly ordered rows instead of dumping the
      // newly matched ones at the end.
      rank: new Map<number, number>(sortItems(allProducts).map((p, i) => [p.id, i])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot the run's start, not every later change
  }, [fullSyncing]);

  // An explicit header click mid-sync changes the signature and lifts the hold,
  // so sorting on demand still works.
  const holdSortDuringSync = syncSnapshot !== null && syncSnapshot.signature === sortSignature;

  const filteredProducts = useMemo(() => {
    if (!syncSnapshot || !holdSortDuringSync) return sortItems(filteredProductsRaw);
    const rank = syncSnapshot.rank;

    // Rows present when the run started hold their positions; rows the sync has
    // delivered since follow, in arrival order.
    const held: Product[] = [];
    const arrived: Product[] = [];
    for (const p of filteredProductsRaw) (rank.has(p.id) ? held : arrived).push(p);
    held.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return arrived.length ? held.concat(arrived) : held;
  }, [filteredProductsRaw, sortItems, holdSortDuringSync, syncSnapshot]);

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
      if (p.category) categories.add(normalizeCategory(p.category));
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
    const lastTerm = brandInput.split(',').pop()?.trim().toLowerCase() || '';
    if (!lastTerm) return brandOptions;
    return brandOptions.filter(b => b.toLowerCase().includes(lastTerm));
  }, [brandOptions, brandInput]);

  const selectedBrandList = useMemo(() => {
    return brandInput.split(',').map(s => s.trim()).filter(Boolean);
  }, [brandInput]);

  const partialSizeInfo = useMemo(() => {
    const q = (dSearchQuery || dSizeInput).trim();
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
  }, [dSearchQuery, dSizeInput, filteredProducts]);

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

  const hasActiveFilter = useMemo(() => {
    return Boolean(dSearchQuery || dBrandInput || dSizeInput || dYearInput || dQtyInput || dMinPriceInput || dMaxPriceInput || categoryFilter !== 'ALL' || supplierFilter !== 'ALL');
  }, [dSearchQuery, dBrandInput, dSizeInput, dYearInput, dQtyInput, dMinPriceInput, dMaxPriceInput, categoryFilter, supplierFilter]);

  // Skeleton only while reading the cache (isLoading) or during an in-progress
  // Sync that has no data yet. An empty cache with no sync shows the empty state.
  // The third clause covers the cold-start bootstrap: until the latest-products
  // phase lands, the LATEST? view can legitimately be empty while data IS on its
  // way, and "No products found" would be telling the user something false.
  const showSkeleton =
    isLoading ||
    ((fullSyncing || supplierPageSync.status === 'running') && allProducts.length === 0) ||
    // "still bootstrapping" = this page started the cold sync AND the manager
    // says it is still running. Derived rather than mirrored in state, so an
    // error or completion clears it without an effect writing state.
    (bootstrapRequested && supplierSync.status === 'running' && currentItems.length === 0);

  // Keep the current page within range whenever the result set shrinks (a
  // filter change, page-size change, or Latest toggle), so the table never sits
  // on an empty, out-of-range page.
  /* Keep the current page within range whenever the result set shrinks (a filter
     change, page-size change, or Latest toggle), so the table never sits on an
     empty, out-of-range page. `react-hooks/set-state-in-effect` dislikes this,
     but deriving the page instead would desync the "Page X of Y" readout from
     the rows — a pagination change, out of scope here. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentPage > totalPages) setCurrentPage(totalPages);
    else if (currentPage < 1) setCurrentPage(1);
  }, [currentPage, totalPages]);



  const resetFilters = () => {
    setSearchQuery('');
    setSupplierFilter('ALL');
    setCategoryFilter('ALL');
    setBrandInput('');
    setSizeInput('');
    setYearInput('');
    setQtyInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setCurrentPage(1);
    addToast('Filters reset to default.');
  };





  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast(`Copied "${text}" to clipboard!`);
  };

  const copyRowData = (item: Product) => {
    const rowString = buildRowString(item);
    navigator.clipboard.writeText(rowString);
    addToast(`Copied product details to clipboard!`);
  };

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
          title="Products"
          bookInquiry={false}
          fullscreenTone="slate"
          syncTask={SYNC_TASK.supplierPage}
          syncTitle="Sync current page"
          isOnline={isOnline}
          actions={
            <HeaderActions
              badge={
                <span className="inline-flex items-center justify-center min-w-[92px] bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200/80 tabular-nums whitespace-nowrap">
                  {fullSyncing ? (
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
            />
          }
        />

        {/* SCROLLABLE INNER DASHBOARD BODY */}
        <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 pb-4 gap-3.5 w-full mx-auto overflow-hidden">

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

          {/* Filters Bar — Supplier · Category · Brand · Search · Size · Year · Qty */}
          <Filter
            showSupplierFilter
            supplierFilter={supplierFilter}
            setSupplierFilter={setSupplierFilter}
            supplierOptions={supplierOptions}

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

            yearInput={yearInput}
            setYearInput={setYearInput}

            qtyInput={qtyInput}
            setQtyInput={setQtyInput}

            minPriceInput={minPriceInput}
            setMinPriceInput={setMinPriceInput}

            maxPriceInput={maxPriceInput}
            setMaxPriceInput={setMaxPriceInput}

            onSearch={() => setCurrentPage(1)}
            onReset={resetFilters}
          />

          {/* Data Table Container Card */}
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col flex-1 min-h-0">

            {/* Scrollable Table — fills the card and scrolls INTERNALLY so row
                count / page size never changes the card height (no layout shift). */}
            <div className={`flex-1 min-h-0 [scrollbar-gutter:stable] ${pageSize > 15 ? "overflow-y-auto" : "overflow-hidden"}`}>
              <table className="w-full text-left border-collapse table-fixed">
                <colgroup>
                  {!hiddenColumns.has('source') && <col className="w-[7%]" />}
                  {!hiddenColumns.has('type') && <col className="w-[6%]" />}
                  {!hiddenColumns.has('category') && <col className="w-[7%]" />}
                  {!hiddenColumns.has('brand') && <col className="w-[8%]" />}
                  {!hiddenColumns.has('pattern') && <col />}
                  {!hiddenColumns.has('size') && <col className="w-[10%]" />}
                  {!hiddenColumns.has('runflat') && <col className="w-[4%]" />}
                  {!hiddenColumns.has('country') && <col className="w-[5.5%]" />}
                  {!hiddenColumns.has('year') && <col className="w-[4%]" />}
                  {!hiddenColumns.has('qty') && <col className="w-[3.5%]" />}
                  {!hiddenColumns.has('cost') && <col className="w-[6.5%]" />}
                  {!hiddenColumns.has('fittingPrice') && <col className="w-[7.5%]" />}
                  {!hiddenColumns.has('date') && <col className="w-[6%]" />}
                  <col className="w-[6%]" />
                </colgroup>
                <thead className="bg-slate-50/90 backdrop-blur sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    {!hiddenColumns.has('source') && <th onClick={() => handleSort('source')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Source <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('type') && <th onClick={() => handleSort('productType')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Type <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('category') && <th onClick={() => handleSort('category')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Category <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('brand') && <th onClick={() => handleSort('brand')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Brand <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('pattern') && <th onClick={() => handleSort('pattern')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Tyre Pattern <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('size') && <th onClick={() => handleSort('size')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Size <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('runflat') && <th className="py-3 px-2 text-center whitespace-nowrap">Runflat</th>}
                    {!hiddenColumns.has('country') && <th onClick={() => handleSort('country')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Countries <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('year') && <th onClick={() => handleSort('year')} className="py-3 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap">Year <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('qty') && <th onClick={() => handleSort('qty')} className="py-3 px-2 text-center cursor-pointer hover:text-slate-900 whitespace-nowrap">Qty <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('cost') && <th onClick={() => handleSort('cost')} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap">Cost <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('fittingPrice') && <th onClick={() => handleSort('fittingPrice')} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 whitespace-nowrap">Fitting Price <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    {!hiddenColumns.has('date') && <th onClick={() => handleSort('date')} className="py-3 px-3 cursor-pointer hover:text-slate-900 whitespace-nowrap">Date <span className="ml-0.5 opacity-50 font-normal">↑↓</span></th>}
                    <th className="py-3 px-2 text-center whitespace-nowrap">Actions</th>
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
                        {!hiddenColumns.has('country') && <td className={cellPaddingClass}><Skeleton className="h-4 w-16 rounded" /></td>}
                        {!hiddenColumns.has('year') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-12 rounded mx-auto" /></td>}
                        {!hiddenColumns.has('qty') && <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-6 w-8 rounded-full mx-auto" /></td>}
                        {!hiddenColumns.has('cost') && <td className={`${cellPaddingClass} text-right`}><Skeleton className="h-4 w-14 rounded ml-auto" /></td>}
                        {!hiddenColumns.has('fittingPrice') && <td className={`${cellPaddingClass} text-right`}><Skeleton className="h-4 w-14 rounded ml-auto" /></td>}
                        {!hiddenColumns.has('date') && <td className={cellPaddingClass}><Skeleton className="h-4 w-20 rounded" /></td>}
                        <td className={`${cellPaddingClass} text-center`}><Skeleton className="h-4 w-6 rounded mx-auto" /></td>
                      </tr>
                    ))
                  ) : currentItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
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
                      return (
                        <tr
                          key={item.id}
                          onClick={() => copyRowData(item)}
                          title="Click row to copy details"
                          className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                        >
                          {!hiddenColumns.has('source') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200 uppercase whitespace-nowrap inline-block">
                                {item.source}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('type') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded uppercase whitespace-nowrap inline-block">
                                {item.productType}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('category') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase whitespace-nowrap inline-block ${categoryBadges[item.category] || 'badge-cat-default'}`}>
                                {item.category}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('brand') && (
                            <td className={`${cellPaddingClass} text-xs font-semibold text-slate-800 whitespace-nowrap`}>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase whitespace-nowrap inline-block ${brandBadges[item.brand] || 'bg-slate-100 text-slate-700'}`}>
                                {item.brand}
                              </span>
                            </td>
                          )}

                          {!hiddenColumns.has('pattern') && (
                            <td className={`${cellPaddingClass} text-xs font-bold text-slate-900 max-w-md`}>
                              <span className="line-clamp-2">{item.pattern}</span>
                            </td>
                          )}

                          {!hiddenColumns.has('size') && (
                            <td className={`${cellPaddingClass} text-xs font-mono text-slate-700 whitespace-nowrap`}>
                              {item.size}
                            </td>
                          )}

                          {!hiddenColumns.has('runflat') && (
                            <td className={`${cellPaddingClass} text-center whitespace-nowrap`}>
                              {item.runflat ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200 whitespace-nowrap inline-block">Runflat</span>
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </td>
                          )}

                          {!hiddenColumns.has('country') && (
                            <td className={`${cellPaddingClass} whitespace-nowrap`}>
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                {item.country && item.country.trim() ? item.country : <span className="text-slate-400 font-medium">-</span>}
                              </div>
                            </td>
                          )}

                          {!hiddenColumns.has('year') && (
                            <td className={`${cellPaddingClass} text-center text-xs font-medium text-slate-600 whitespace-nowrap`}>
                              {item.year && item.year > 0 ? item.year : <span className="text-slate-400 font-medium">-</span>}
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
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCostHistoryItem(item); }}
                                title="View cost history"
                                className="inline-flex items-center justify-end gap-1 text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap rounded px-1 -mx-1 hover:text-emerald-700 hover:underline decoration-dotted underline-offset-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors cursor-pointer"
                                dir="ltr"
                              >
                                <span className="whitespace-nowrap">{item.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </button>
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
                            <div className="flex items-center justify-center">
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
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
              setPageSize={(size) => { setPageSize(size); setCurrentPage(1); }}
            />

          </section>
        </div>
      </main>

      {/* Cost History — opened from a Cost value in the table. Keyed on the
          product so switching rows remounts with a clean loading state. */}
      {costHistoryItem && (
        <CostHistoryModal
          key={String(costHistoryItem.id)}
          product={{
            id: costHistoryItem.id,
            brand: costHistoryItem.brand,
            size: costHistoryItem.size,
            sizeFull: costHistoryItem.sizeFull,
            pattern: costHistoryItem.pattern,
            itemCode: costHistoryItem.itemCode,
            source: costHistoryItem.source,
            cost: costHistoryItem.cost,
            productType: costHistoryItem.productType,
          }}
          onCloseAction={() => setCostHistoryItem(null)}
        />
      )}

      {/* Quick View Slide-Up Modal */}
      {quickViewItem && (
        <QuickViewModal
          key={quickViewItem.id}
          product={quickViewItem}
          onClose={() => setQuickViewItem(null)}
          onAddToCart={(prod, qty) => {
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

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} />

    </div >
  );
}
