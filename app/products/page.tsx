"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  ShoppingBagIcon,
  MagnifyingGlassIcon,
  ArrowsPointingOutIcon,
  WifiIcon,
  PlusIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  TruckIcon
} from "@heroicons/react/24/outline";
import {
  fetchStorefrontBatch,
  getTyresChatCached,
  getKnownBrands,
  addKnownBrands,
} from "@/services/cache";
import type {
  ProductItem,
  ProductsResponse,
  TyresChatItem,
} from "@/services/types";

/** The default `products` query has no brand field — approximate it from the
 *  leading word of the product name (e.g. "Dunlop 700 R16 …" → "Dunlop"). */
const brandOf = (name?: string) => (name || "").trim().split(/\s+/)[0] || "";
import { ProductGridSkeleton, Skeleton } from "@/components/Skeletons";
import Image from "next/image";
import HeaderSyncButton from "@/components/HeaderSyncButton";
import SidebarSyncButton from "@/components/SidebarSyncButton";
import { registerModuleSync } from "@/services/syncService";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { queryProducts, parseAspectRim } from "@/services/searchFilter";
import { enrichProducts, type EnrichedProduct } from "@/services/productEnrich";

export default function PosProductsPage() {
  const pathname = usePathname();

  // `products` is the FULL list loaded into cache so far (grows as background
  // batches arrive). The UI never renders all of it at once — it renders only a
  // fixed-size window (see VIEW_SIZE), and Next/Prev move that window over this
  // already-cached list WITHOUT any API call.
  // Enriched with derived brand/size/plain_size/year (see productEnrich) so
  // search/sort run on structured fields, entirely client-side.
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [tyresChatItems, setTyresChatItems] = useState<TyresChatItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Zero-based index of the visible window. `products.slice(viewPage*VIEW_SIZE,
  // …)` is what actually renders. Purely client-side — never triggers a fetch.
  const [viewPage, setViewPage] = useState<number>(0);

  // `loading` covers the very first batch (skeleton). `loadingMore` is the
  // quiet background fill of the remaining batches into the cache — the grid
  // stays interactive throughout.
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeBrand, setActiveBrand] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  // Online status via useSyncExternalStore (no hydration mismatch, no
  // setState-in-effect).
  const isOnline = useOnlineStatus();

  // Debounce the search box so each keystroke doesn't fire its own GraphQL
  // request. A new search restarts the batch loader from the first batch.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // A new client-side search always resets the visible window to the first page.
  useEffect(() => {
    setViewPage(0);
  }, [debouncedSearch]);

  // Brands are derived from real product data (not hardcoded) and persisted
  // in IndexedDB; the list grows as more products are seen.
  const [brands, setBrands] = useState<string[]>([]);
  void brands;
  void tyresChatItems;
  void activeBrand;

  // How many products each GraphQL request pulls into the cache.
  const BATCH_SIZE = 500;

  // How many products are VISIBLE in the grid at once.
  const VIEW_SIZE = 400;

  // Monotonic id for the active load.
  const loadIdRef = useRef(0);

  const loadGraphQLProducts = useCallback(async (forceFresh = false) => {
    const loadId = ++loadIdRef.current;
    setError(null);
    setLoading(true);
    setViewPage(0);

    const terms = "";

    const baseParams = {
      search: terms,
      pageSize: BATCH_SIZE,
      sortField: "name" as const,
      sortDirection: "ASC" as const,
    };
    const maxAgeMs = forceFresh ? 0 : undefined;

    const harvestBrands = (items?: ProductItem[]) => {
      if (items?.length) {
        addKnownBrands(items.map((i) => brandOf(i.name))).then(setBrands);
      }
    };

    const isCurrent = () => loadId === loadIdRef.current;

    try {
      const first = await fetchStorefrontBatch({ ...baseParams, currentPage: 1 }, maxAgeMs);
      if (!isCurrent()) return;

      setProducts(enrichProducts(first.items || []));
      setTotalCount(first.total_count || 0);
      harvestBrands(first.items);
      setLoading(false);

      const totalPages = first.page_info?.total_pages || 1;
      if (totalPages <= 1) return;

      setLoadingMore(true);
      for (let page = 2; page <= totalPages; page++) {
        let batch: ProductsResponse;
        try {
          batch = await fetchStorefrontBatch({ ...baseParams, currentPage: page }, maxAgeMs);
        } catch (err) {
          console.warn(`[products] background batch ${page}/${totalPages} failed — stopping fill:`, err);
          break;
        }
        if (!isCurrent()) return;
        setProducts((prev) => [...prev, ...enrichProducts(batch.items || [])]);
        harvestBrands(batch.items);
      }
    } catch (err) {
      if (!isCurrent()) return;
      setProducts((prev) => {
        if (prev.length === 0) setError(err instanceof Error ? err.message : "Products request failed");
        return prev;
      });
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const loadProductsRef = useRef(loadGraphQLProducts);
  useEffect(() => {
    loadProductsRef.current = loadGraphQLProducts;
  }, [loadGraphQLProducts]);
  useEffect(() => registerModuleSync("products", () => loadProductsRef.current(true)), []);

  const loadTyresChat = useCallback(async () => {
    const cached = await getTyresChatCached(
      { pageSize: 200 },
      { onFresh: (items) => setTyresChatItems(items) },
    );
    if (cached.length) setTyresChatItems(cached);
  }, []);

  useEffect(() => {
    getKnownBrands().then(setBrands);
  }, []);

  useEffect(() => {
    loadGraphQLProducts();
    loadTyresChat();
  }, [loadGraphQLProducts, loadTyresChat]);

  const view = useMemo(
    () =>
      queryProducts<EnrichedProduct>(products, {
        search: debouncedSearch,
        sortBy: "name",
        sortOrder: "asc",
        page: viewPage + 1,
        pageSize: VIEW_SIZE,
        searchableFields: ["name", "brand", "size", "plain_size", "sku"],
        sortableFields: ["name", "brand", "size", "year", "price"],
        defaultSortField: "name",
      }),
    [products, debouncedSearch, viewPage],
  );
  const displayedProducts = view.items;
  const windowStart = (view.page - 1) * VIEW_SIZE;
  const windowEnd = windowStart + displayedProducts.length;
  const canPrevPage = view.page > 1;
  const canNextPage = view.page < view.totalPages;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">

      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="w-[68px] flex-none bg-white border-r border-gray-200 flex flex-col items-center justify-between py-3 z-20 shadow-xs">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Badge (Links directly to /dashboard) */}
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
              { name: "Dashboard", icon: HomeIcon, href: "/dashboard" },
              { name: "Products", icon: ShoppingBagIcon, href: "/products" },
              { name: "Chat", icon: ChatBubbleLeftRightIcon, href: "/tyre_guide/chat" },
              { name: "Supplier", icon: TruckIcon, href: "/supplier-products" },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === "/products" && pathname === "/products");

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={item.name}
                  className={`w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none ${isActive
                    ? "text-orange-500 bg-orange-50 font-semibold"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                    }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />
                  )}
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] mt-1 tracking-tight">{item.name}</span>
                </Link>
              );
            })}

            {/* Sidebar Sync — full application sync (shared useSync hook) */}
            <SidebarSyncButton />
          </nav>
        </div>

        {/* User Profile Avatar at Bottom Left */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-gray-100 w-full">
          <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs shadow-inner">
            KL
          </div>
          <span className="text-[9px] text-gray-500 font-medium truncate max-w-[60px]">Klever</span>
        </div>
      </aside>

      {/* 2. MAIN FULL-WIDTH PRODUCT CATALOG AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">

        {/* TOP HEADER BAR */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 shadow-xs">

          {/* Search Box */}
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search product, brand, size..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Total Count Badge — shows current count matching active filters */}
            {loading && products.length === 0 ? (
              <Skeleton className="h-7 w-[105px] rounded-lg" />
            ) : (
              <span className="text-xs font-semibold h-7 min-w-[105px] inline-flex items-center justify-center px-2.5 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg text-center whitespace-nowrap">
                Total: {view.total}
              </span>
            )}

            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else if (document.exitFullscreen) {
                  document.exitFullscreen();
                }
              }}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Fullscreen"
            >
              <ArrowsPointingOutIcon className="w-5 h-5" />
            </button>

            {/* Header Sync — current-page-only sync (shared useSync hook) */}
            <HeaderSyncButton title="Sync products" />

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

        {/* MAIN CONTENT CONTAINER */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">

          {/* Width-omitted (aspect+rim) fallback notice — only for partial size matches */}
          {view.isPartialSizeMatch && (
            <div className="mb-3 p-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>
                  Showing tyres matching <strong className="font-bold text-amber-950">{view.matchedPattern}</strong>. Select width for a more accurate result:
                </span>
              </div>

              {view.availableWidths && view.availableWidths.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-amber-800 mr-1">Widths:</span>
                  {view.availableWidths.map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        const ar = parseAspectRim(searchQuery);
                        if (ar) {
                          setSearchQuery(`${w}/${ar.aspect}R${ar.rim}`);
                        } else {
                          setSearchQuery(`${w}/${view.matchedPattern.replace('***/', '')}`);
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

          {/* DYNAMIC GRAPHQL PRODUCT GRID CONTAINER */}
          <div className="flex-1 overflow-y-auto pr-1">
            {/* 1. SKELETON LOADERS FOR PRODUCT CARDS */}
            {loading && products.length === 0 ? (
              <div className="flex flex-col justify-between h-full">
                <ProductGridSkeleton count={24} />
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 pt-4 mt-2 text-xs text-gray-600">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-4 w-48 rounded" />
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 text-red-500 bg-red-50/50 rounded-2xl border border-red-100 p-6">
                <p className="text-sm font-semibold mb-1">Magento GraphQL API Call Issue</p>
                <p className="text-xs text-red-400 max-w-md text-center mb-4">{error}</p>
                <button
                  onClick={() => loadGraphQLProducts(true)}
                  className="px-4 py-2 text-xs bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 shadow-md transition-colors"
                >
                  Retry Magento GraphQL
                </button>
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <ShoppingBagIcon className="w-12 h-12 stroke-1 mb-2 text-gray-300" />
                <p className="text-sm font-medium">No products returned from GraphQL query</p>
                <button
                  onClick={() => {
                    setActiveBrand("All");
                    setSearchQuery("");
                  }}
                  className="mt-3 text-xs text-orange-500 font-semibold hover:underline"
                >
                  Reset brand and size filters
                </button>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 pb-6">
                  {displayedProducts.map((item) => {
                    const title = item.name;
                    const minPrice = item.price_range?.minimum_price;
                    const priceVal =
                      minPrice?.final_price?.value ??
                      minPrice?.regular_price?.value ??
                      0;
                    const currency = minPrice?.regular_price?.currency || "AED";
                    const brand = item.brand || brandOf(item.name);
                    const imgUrl = item.image?.url;
                    const inStock = item.stock_status !== "OUT_OF_STOCK";

                    return (
                      <div
                        key={item.uid}
                        className="group bg-white rounded-xl border border-gray-100 p-3 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-orange-200 transition-all duration-200 cursor-pointer relative"
                      >
                        <div className="w-full aspect-square bg-white rounded-lg flex items-center justify-center p-3 mb-3 relative overflow-hidden group-hover:scale-[1.02] transition-transform">
                          {imgUrl ? (
                            <Image
                              src={imgUrl}
                              alt={item.image?.label || title}
                              fill
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 12vw"
                              className="object-contain p-2"
                            />
                          ) : (
                            <svg className="w-16 h-16 text-gray-800 drop-shadow-xs" viewBox="0 0 64 64" fill="none" stroke="currentColor">
                              <circle cx="32" cy="32" r="22" strokeWidth="6" className="text-gray-800" fill="#1e293b" />
                              <circle cx="32" cy="32" r="12" strokeWidth="3" className="text-gray-400" fill="#f8fafc" />
                              <circle cx="32" cy="32" r="4" fill="#64748b" />
                            </svg>
                          )}

                          {!inStock && (
                            <span className="absolute top-2 left-2 text-[9px] font-semibold px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded border border-rose-200">
                              Out of stock
                            </span>
                          )}

                          <span className="absolute bottom-2 right-2 w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                            <PlusIcon className="w-4 h-4 stroke-2" />
                          </span>
                        </div>

                        {/* Metadata */}
                        <div className="flex flex-col items-center text-center w-full">
                          <h3
                            className="text-xs font-medium text-gray-700 w-full leading-snug h-[2.5rem] line-clamp-2 flex items-center justify-center text-center group-hover:text-gray-900 mb-1"
                            title={title}
                          >
                            {title}
                          </h3>

                          {brand ? (
                            <span className="text-[11px] px-2 py-0.5 mt-1 bg-orange-50 text-orange-600 rounded border border-orange-200 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                              {brand}
                            </span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 mt-1 opacity-0 pointer-events-none select-none">
                              &nbsp;
                            </span>
                          )}

                          <span className="text-xs font-semibold text-gray-800 mt-0.5">
                            {currency} {priceVal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 pt-4 mt-2 text-xs text-gray-600">
                  <span className="flex items-center gap-2">
                    {loadingMore && (
                      <span className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>
                      Loaded in cache:{" "}
                      <strong className="text-gray-800">
                        {debouncedSearch
                          ? `${view.total} / ${products.length}`
                          : `${products.length}${totalCount ? ` / ${totalCount}` : ""}`}
                      </strong>
                    </span>
                  </span>

                  <div className="flex items-center gap-3">
                    <span>
                      Showing{" "}
                      <strong className="text-gray-800">
                        {view.total === 0 ? 0 : `${windowStart + 1}–${windowEnd}`}
                      </strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={!canPrevPage}
                        onClick={() => setViewPage((p) => Math.max(0, p - 1))}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 font-medium transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        disabled={!canNextPage}
                        onClick={() => setViewPage((p) => p + 1)}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 font-medium transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}
