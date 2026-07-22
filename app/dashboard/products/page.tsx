"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  HomeIcon,
  ShoppingBagIcon,
  MagnifyingGlassIcon,
  ArrowsPointingOutIcon,
  WifiIcon,
  PlusIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon
} from "@heroicons/react/24/outline";
import {
  getStorefrontProductsCached,
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
import { ProductGridSkeleton } from "@/components/Skeletons";
import Image from "next/image";
import LogoutButton from "@/components/LogoutButton";
import HeaderSyncButton from "@/components/HeaderSyncButton";
import SidebarSyncButton from "@/components/SidebarSyncButton";
import { useSyncOverlay } from "@/components/SyncProvider";
import { registerModuleSync } from "@/services/syncService";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function PosProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [tyresChatItems, setTyresChatItems] = useState<TyresChatItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // The "Point Of Sales is syncing..." popup is global (see SyncProvider): it
  // shows once for the initial app sync and never again on route changes.
  const { requestInitialSyncOverlay, completeInitialSync } = useSyncOverlay();

  const [activeBrand, setActiveBrand] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  // Online status via useSyncExternalStore (no hydration mismatch, no
  // setState-in-effect).
  const isOnline = useOnlineStatus();

  // Debounce the search box so each keystroke doesn't fire its own GraphQL
  // request; searching resets back to the first page of results.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Brands are derived from real product data (not hardcoded) and persisted
  // in IndexedDB; the list grows as more products are seen.
  const [brands, setBrands] = useState<string[]>([]);
  // Brand filter tabs are temporarily hidden (not needed right now). The list
  // is still harvested in the background, so the tabs can be brought back by
  // uncommenting this line and the tabs block in the JSX below.
  // const brandOptions = ["All", ...brands];
  // These feed only the (currently disabled) filter bar; still fetched in the
  // background so the tabs / TyresChat button can be re-enabled instantly.
  void brands;
  void tyresChatItems;

  // 1. Storefront products — cache-first (instant paint) + background GraphQL sync
  const loadGraphQLProducts = useCallback(async () => {
    setError(null);

    // Both the brand tab and the search box drive Magento's full-text `search`
    // argument (the default `products` query has no brand/size filter fields).
    // Empty string → match-all, which the query builder passes through safely.
    const terms = [activeBrand === "All" ? "" : activeBrand, debouncedSearch]
      .filter(Boolean)
      .join(" ");

    const params = {
      search: terms,
      pageSize: 24,
      currentPage,
      sortField: "name" as const,
      sortDirection: "ASC" as const,
    };

    const applyResult = (res: ProductsResponse) => {
      setProducts(res.items || []);
      setTotalCount(res.total_count || 0);
      if (res.page_info) setTotalPages(res.page_info.total_pages || 1);
      // Grow the dynamic brand tab list from the leading word of each name.
      if (res.items?.length) {
        addKnownBrands(res.items.map((i) => brandOf(i.name))).then(setBrands);
      }
    };

    // Request the one-time initial POS overlay. Returns true only on the very
    // first app load; navigation/filter changes never re-show it.
    const showedInitial = requestInitialSyncOverlay("Products");

    // Reads IndexedDB immediately, then refreshes from GraphQL in the background.
    const cached = await getStorefrontProductsCached(params, {
      onFresh: (res) => {
        applyResult(res);
        setError(null);
        setLoading(false);
        completeInitialSync();
      },
      onError: (err) => {
        setLoading(false);
        completeInitialSync();
        setProducts((prev) => {
          if (prev.length === 0) setError(err.message);
          return prev;
        });
      },
    });

    if (cached && (cached.items?.length ?? 0) > 0) {
      applyResult(cached); // instant paint from cache
      setLoading(false);
      // Keep the initial overlay up briefly for a smooth first paint.
      if (showedInitial) setTimeout(() => completeInitialSync(), 1200);
      else completeInitialSync();
    } else {
      // No cache yet — the initial overlay (if this is the first load) stays up
      // until fresh data arrives; filter/page changes just fetch in background.
      setLoading(true);
    }
  }, [activeBrand, debouncedSearch, currentPage, requestInitialSyncOverlay, completeInitialSync]);

  // Register this page's live refresher so the Header/Sidebar Sync buttons
  // (via the shared useSync hook → syncService) can re-fetch products in place,
  // updating this component's state without any reload or route change. A ref
  // keeps the registration stable while always calling the latest fetch fn.
  const loadProductsRef = useRef(loadGraphQLProducts);
  useEffect(() => {
    loadProductsRef.current = loadGraphQLProducts;
  }, [loadGraphQLProducts]);
  useEffect(() => registerModuleSync("products", () => loadProductsRef.current()), []);

  // 2. TyresChat — cache-first + background GraphQL sync (fetches all chat items)
  const loadTyresChat = useCallback(async () => {
    const cached = await getTyresChatCached(
      { pageSize: 200 },
      { onFresh: (items) => setTyresChatItems(items) },
    );
    if (cached.length) setTyresChatItems(cached);
  }, []);

  // Seed the brand tabs from previously-discovered brands (persisted in IndexedDB).
  useEffect(() => {
    getKnownBrands().then(setBrands);
  }, []);

  useEffect(() => {
    // Fetch on mount / when filters change. State updates happen after the
    // awaited cache read, so this is a legitimate data-load effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGraphQLProducts();
    loadTyresChat();
  }, [loadGraphQLProducts, loadTyresChat]);

  // Search and brand filtering now happen server-side via Magento's full-text
  // `search` argument, so render exactly what the query returned.
  const displayedProducts = products;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">

      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="w-[68px] flex-none bg-white border-r border-gray-200 flex flex-col items-center justify-between py-3 z-20 shadow-xs">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Badge (Links directly to /dashboard/products) */}
          <Link
            href="/dashboard/products"
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
              { name: "Home", icon: HomeIcon, href: "/dashboard/products" },
              { name: "Chat", icon: ChatBubbleLeftRightIcon, href: "/tyre_guide/chat" },
              // { name: "Cashier", icon: BanknotesIcon, action: () => {} },
              // { name: "Orders", icon: ShoppingBagIcon, action: () => {} },
              // { name: "Reports", icon: ChartBarIcon, action: () => {} },
            ].map((item) => {
              const Icon = item.icon;
              // Only the current page (Home on this route) is active.
              const isActive = item.name === "Home";

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
            AF
          </div>
          <span className="text-[9px] text-gray-500 font-medium truncate max-w-[60px]">Alexa Frans</span>
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
            {/* Total Count Badge */}
            <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg min-w-[75px] text-center">
              Total: {totalCount}
            </span>

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
              <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-semibold border border-emerald-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <WifiIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full text-xs font-semibold border border-rose-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <WifiIcon className="w-3.5 h-3.5 text-rose-600" />
                <span>Offline</span>
              </div>
            )}

            <LogoutButton />
          </div>
        </header>

        {/* BRAND TABS & MAIN CONTENT CONTAINER */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">

          {/* Filter bar (brand tabs + TyresChat button) temporarily hidden —
              not needed right now. Re-enable by uncommenting this whole block
              and the `brandOptions` line above.

          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-6 gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-4">
              {brandOptions.map((brand) => (
                <button
                  key={brand}
                  onClick={() => {
                    setActiveBrand(brand);
                    setCurrentPage(1);
                  }}
                  className={`text-sm font-medium transition-colors relative pb-3 -mb-3 whitespace-nowrap ${activeBrand === brand
                    ? "text-orange-500 font-semibold border-b-2 border-orange-500"
                    : "text-gray-500 hover:text-gray-800"
                    }`}
                >
                  {brand}
                </button>
              ))}
            </div>

            <Link
              href="/tyre_guide/chat"
              className="px-3.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg text-xs font-semibold transition-all shadow-2xs hover:shadow-xs flex items-center gap-1.5 flex-none active:scale-95 z-10"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4 text-orange-500" />
              <span>TyresChat ({tyresChatItems.length > 0 ? tyresChatItems.length : 26})</span>
            </Link>
          </div>
          */}

          {/* DYNAMIC GRAPHQL PRODUCT GRID CONTAINER */}
          <div className="flex-1 overflow-y-auto pr-1">
            {/* 1. SKELETON LOADERS FOR PRODUCT CARDS */}
            {loading && products.length === 0 ? (
              <ProductGridSkeleton count={14} />
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 text-red-500 bg-red-50/50 rounded-2xl border border-red-100 p-6">
                <p className="text-sm font-semibold mb-1">Magento GraphQL API Call Issue</p>
                <p className="text-xs text-red-400 max-w-md text-center mb-4">{error}</p>
                <button
                  onClick={loadGraphQLProducts}
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
                    setCurrentPage(1);
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
                    const brand = brandOf(item.name);
                    const imgUrl = item.image?.url;
                    const inStock = item.stock_status !== "OUT_OF_STOCK";

                    return (
                      <div
                        key={item.uid}
                        className="group bg-white rounded-xl border border-gray-100 p-3 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-orange-200 transition-all duration-200 cursor-pointer relative"
                      >
                        {/* Product Image Box (real Magento media, SVG fallback) */}
                        <div className="w-full aspect-square bg-white border border-gray-100 rounded-lg flex items-center justify-center p-3 mb-3 relative overflow-hidden group-hover:scale-[1.02] transition-transform">
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
                        <div className="flex flex-col items-center text-center">
                          {/* Full product name — no truncation/ellipsis; wraps
                              to 2-3 lines. min-height reserves ~2 lines so cards
                              stay a consistent height for short names. */}
                          <h3
                            className="text-xs font-medium text-gray-700 w-full break-words [overflow-wrap:anywhere] leading-snug min-h-[2.5rem] group-hover:text-gray-900"
                            title={title}
                          >
                            {title}
                          </h3>

                          {brand && (
                            <span className="text-[11px] px-2 py-0.5 mt-1 bg-orange-50 text-orange-600 rounded border border-orange-200">
                              {brand}
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

                {/* Pagination bar */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-2 text-xs text-gray-600">
                    <span>Page {currentPage} of {totalPages} ({totalCount} items)</span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 font-medium transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 font-medium transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* The POS syncing overlay is rendered globally in SyncProvider so it
          shows once on the initial app sync, not on every route change. */}
    </div>
  );
}