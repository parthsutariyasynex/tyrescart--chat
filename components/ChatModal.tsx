"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { getTyresChatCached, CACHE_ANY_AGE } from "@/services/cache";
import type { TyresChatItem } from "@/services/types";
import { useToast } from "@/components/ToastProvider";
import { ChatGridSkeleton } from "@/components/Skeletons";
import Masonry from "react-masonry-css";

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface FormattedShortcutItem {
  id: number | string;
  index: string;
  category: string;
  title: string;
  description: string;
}

const breakpointColumnsObj = {
  default: 3,
  1023: 2,
  639: 1,
};

export default function ChatModal({ isOpen, onClose }: ChatModalProps) {
  const [shortcuts, setShortcuts] = useState<FormattedShortcutItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const { toast } = useToast();

  // Animation states matching BookInquiryModal
  const [isAnimatedOpen, setIsAnimatedOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let raf1: number;
    let raf2: number;
    if (isOpen) {
      setIsClosing(false);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsAnimatedOpen(true);
        });
      });
    } else {
      setIsAnimatedOpen(false);
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 500);
  };

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

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getTyresChatCached(
      { pageSize: 200 },
      {
        maxAgeMs: CACHE_ANY_AGE,
        onFresh: (freshItems) => {
          if (isMounted) {
            setShortcuts(mapApiItems(freshItems));
            setError(null);
            setLoading(false);
          }
        },
        onError: (err) => {
          if (isMounted) {
            setLoading(false);
            setShortcuts((prev) => {
              if (prev.length === 0) {
                setError(err.message || "Failed to load chat shortcuts");
              }
              return prev;
            });
          }
        },
      }
    )
      .then((cachedItems) => {
        if (isMounted && cachedItems && cachedItems.length > 0) {
          setShortcuts(mapApiItems(cachedItems));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Cache read failed:", err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, mapApiItems]);

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

  if (!isOpen && !isClosing) return null;
  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-500 ease-out ${
        isAnimatedOpen && !isClosing ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative bg-slate-50 w-full max-w-full border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden transition-transform duration-500 ease-out max-h-[90vh] rounded-none ${
          isAnimatedOpen && !isClosing ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Toolbar */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600 border border-sky-200/60">
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                Tyre Chat Shortcuts
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                1-Click copy responses & customer templates ({shortcuts.length} shortcuts)
              </p>
            </div>
          </div>

          {/* Search Field */}
          <div className="relative flex-1 max-w-md mx-4">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search shortcut..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
          {loading && shortcuts.length === 0 ? (
            <ChatGridSkeleton count={6} />
          ) : error && shortcuts.length === 0 ? (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center text-rose-600 max-w-md mx-auto my-8">
              <p className="text-xs font-semibold mb-1">Failed to load chat shortcuts</p>
              <p className="text-[11px] text-rose-500">{error}</p>
            </div>
          ) : filteredShortcuts.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500 shadow-2xs my-8 max-w-md mx-auto">
              <ChatBubbleLeftRightIcon className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No shortcuts found</p>
              <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search query</p>
            </div>
          ) : (
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
                    className="h-auto bg-white border border-slate-200/80 rounded-lg p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all duration-150 cursor-pointer flex flex-col group relative"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wide">
                        {item.category}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-medium text-slate-400">
                          {item.index}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(item);
                          }}
                          className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 rounded flex items-center justify-center"
                          title="Click to copy"
                        >
                          {isCopied ? (
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-600 stroke-2" />
                          ) : (
                            <ClipboardDocumentIcon className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                          )}
                        </button>
                      </div>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 mb-1 leading-tight break-words">
                      {item.title}
                    </h3>

                    <p className="text-xs text-slate-500 leading-snug break-words font-normal">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </Masonry>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
