"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  ArrowsPointingOutIcon,
  WifiIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import { getTyresChatCached } from "@/services/cache";
import type { TyresChatItem } from "@/services/types";
import { useToast } from "@/components/ToastProvider";
import { ChatGridSkeleton } from "@/components/Skeletons";
import Masonry from "react-masonry-css";
import LogoutButton from "@/components/LogoutButton";
import HeaderSyncButton from "@/components/HeaderSyncButton";
import SidebarSyncButton from "@/components/SidebarSyncButton";
import { registerModuleSync } from "@/services/syncService";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export interface FormattedShortcutItem {
  id: number | string;
  index: string;
  category: string;
  title: string;
  description: string;
}

// react-masonry-css breakpoints (max-width keys): xl ≥1280 → 4 cols, lg ≥1024 → 3,
// sm ≥640 → 2, below 640 → 1. Distribution is modulo, so reading order is
// left-to-right (#3 #4 #5 #6 across the top row).
const breakpointColumnsObj = {
  default: 4,
  1279: 3,
  1023: 2,
  639: 1,
};

export default function TyreGuideChatPage() {
  const [shortcuts, setShortcuts] = useState<FormattedShortcutItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  // Online status via useSyncExternalStore (no hydration mismatch, no
  // setState-in-effect).
  const isOnline = useOnlineStatus();
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Tyre Chat Shortcuts";
  }, []);

  const mapApiItems = useCallback((items: TyresChatItem[]): FormattedShortcutItem[] => {
    const decodeHtml = (str: string) => {
      if (!str) return "";
      let decoded = str
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\?️/g, "")
        .replace(/\?\uFE0F/g, "")
        .trim();

      if (decoded.startsWith('"') && decoded.endsWith('"')) {
        decoded = decoded.slice(1, -1).trim();
      }
      return decoded;
    };

    return items.map((item: TyresChatItem, index: number) => {
      const cat = item.category ? item.category.replace(/_/g, " ").toUpperCase() : "CAR TYRES";

      return {
        id: item.id || index + 1,
        index: `#${item.sort_order || index + 1}`,
        category: cat,
        title: decodeHtml(item.shortcut || "Shortcut"),
        description: decodeHtml(item.description || ""),
      };
    });
  }, []);

  // `forceFresh` bypasses the cache TTL — the manual Sync buttons and the
  // on-page retry pass true so an explicit sync always hits GraphQL. Passive
  // mounts leave it false and reuse fresh cache (no network call).
  const loadShortcutsFromCacheAndApi = useCallback(async (forceFresh = false) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Read-through cache: Get cached items from IndexedDB instantly
      const cachedItems = await getTyresChatCached(
        { pageSize: 200 },
        {
          maxAgeMs: forceFresh ? 0 : undefined,
          onFresh: (freshItems) => {
            setShortcuts(mapApiItems(freshItems));
            setError(null);
            setLoading(false);
          },
          onError: (err) => {
            setLoading(false);
            // API-only: no static fallback. Surface the error only if nothing is cached.
            setShortcuts((prev) => {
              if (prev.length === 0) {
                setError(err.message || "Failed to load chat shortcuts");
              }
              return prev;
            });
          },
        }
      );

      if (cachedItems && cachedItems.length > 0) {
        setShortcuts(mapApiItems(cachedItems));
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch (err) {
      console.error("Cache read failed:", err);
      setLoading(false);
    }
  }, [mapApiItems]);

  useEffect(() => {
    // Fetch on mount. State updates happen after the awaited cache read, so
    // this is a legitimate data-load effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadShortcutsFromCacheAndApi();
  }, [loadShortcutsFromCacheAndApi]);

  // Register this page's live refresher so the Header/Sidebar Sync buttons
  // (via the shared useSync hook → syncService) can re-fetch chat shortcuts in
  // place, without any reload or route change. A ref keeps the registration
  // stable while always calling the latest fetch fn.
  const loadChatRef = useRef(loadShortcutsFromCacheAndApi);
  useEffect(() => {
    loadChatRef.current = loadShortcutsFromCacheAndApi;
  }, [loadShortcutsFromCacheAndApi]);
  useEffect(() => registerModuleSync("tyresChat", () => loadChatRef.current(true)), []);

  const handleCopy = (item: FormattedShortcutItem) => {
    if (!item.description) return;
    navigator.clipboard.writeText(item.description);
    setCopiedId(item.id);
    toast("Copied to clipboard", "success");
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const filteredShortcuts = shortcuts.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.index.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">

      {/* 1. LEFT SIDEBAR NAVIGATION (POSIX STYLED) */}
      <aside className="w-[68px] flex-none bg-white border-r border-gray-200 flex flex-col items-center justify-between py-3 z-20 shadow-xs">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Badge */}
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
            ].map((item) => {
              const Icon = item.icon;
              // This is the Chat page, so the Chat nav link is the active one.
              const isActive = item.name === "Chat";

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

      {/* 2. MAIN WORKSPACE CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">

        {/* TOP HEADER BAR (MATCHING POS PRODUCTS PAGE) */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 shadow-xs">

          {/* Search Box */}
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search shortcut or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-inner"
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
            <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg">
              Total: {shortcuts.length}
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
            <HeaderSyncButton title="Sync chat shortcuts" />

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

            {/* <LogoutButton /> */}
          </div>
        </header>

        {/* MAIN CHAT SHORTCUTS SCROLLABLE WORKSPACE */}
        <div className="flex-1 p-6 overflow-y-auto">

          {/* Section Heading & Sub-bar */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center text-blue-600 bg-blue-50 rounded-lg border border-blue-100">
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-none">
                  Tyre Chat Shortcuts
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                  1-Click copy responses & customer communication templates
                </p>
              </div>
            </div>

            {/* Back to Products Link */}
            {/* <Link
              href="/dashboard/products"
              cl
              assName="px-3.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-all shadow-2xs hover:shadow-xs flex items-center gap-1.5 flex-none active:scale-95"
            >
              <HomeIcon className="w-4 h-4 text-gray-500" />
              <span>Back to Catalog</span>
            </Link> */}
          </div>

          {/* Grid of Shortcut Cards */}
          <div className="min-h-[500px]">
            {/* 1. SKELETON LOADER GRID */}
            {loading && shortcuts.length === 0 ? (
              <ChatGridSkeleton count={8} />
            ) : error && shortcuts.length === 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center text-red-600 max-w-md mx-auto">
                <p className="text-xs font-semibold mb-1">Failed to load chat shortcuts from API</p>
                <p className="text-[11px] text-red-500 mb-3">{error}</p>
                <button
                  onClick={() => loadShortcutsFromCacheAndApi(true)}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 transition-colors shadow-xs"
                >
                  Retry API Call
                </button>
              </div>
            ) : filteredShortcuts.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 shadow-2xs">
                <ChatBubbleLeftRightIcon className="w-9 h-9 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-700">No shortcuts found</p>
                <p className="text-xs text-gray-400 mt-0.5">Try adjusting your search query</p>
              </div>
            ) : (
              /* 2. ACTUAL CARDS — react-masonry-css (row-reading order, gap-free) */
              <Masonry
                breakpointCols={breakpointColumnsObj}
                className="flex gap-4"
                columnClassName="flex flex-col gap-4 flex-1 min-w-0"
              >
                {filteredShortcuts.map((item) => {
                  const isCopied = copiedId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleCopy(item)}
                      className="h-auto bg-white border border-gray-200/80 rounded-lg p-3 shadow-2xs hover:shadow-xs hover:border-gray-300 transition-all duration-150 cursor-pointer flex flex-col group relative"
                    >
                      <div>
                        {/* Top Row: Category Badge & Index / Copy Button */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wide">
                            {item.category}
                          </span>

                          <div className="flex items-center gap-1.5 flex-none">
                            <span className="text-[11px] font-medium text-gray-400">
                              {item.index}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(item);
                              }}
                              className="text-gray-400 hover:text-gray-700 transition-colors p-0.5 rounded flex items-center justify-center"
                              title="Click to copy"
                            >
                              {isCopied ? (
                                <CheckIcon className="w-3.5 h-3.5 text-emerald-600 stroke-2" />
                              ) : (
                                <ClipboardDocumentIcon className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-sm font-bold text-gray-900 mb-1 leading-tight break-words [overflow-wrap:anywhere]">
                          {item.title}
                        </h3>

                        {/* Description */}
                        <p className="text-xs text-gray-500 leading-snug break-words [overflow-wrap:anywhere] whitespace-normal font-normal">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </Masonry>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}
