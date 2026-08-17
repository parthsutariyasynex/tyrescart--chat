"use client";

import React, {
  useEffect,
  useState,
  useSyncExternalStore,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  XMarkIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  TruckIcon,
  CheckCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  fetchKleverVehicleSearchGraphQL,
  fetchKleverVehicleFitments,
  fetchKleverAllVehicles,
} from "../services/graphql";
import type { KleverVehicleItem } from "../services/types";
import Pagination from "./Pagination";

/** No external store — subscription is a no-op; module scope keeps it stable. */
const subscribeNever = () => () => {};



/**
 * "215/55 R17" / "215/55R17" / "2155517" → `{ width: 215, height: 55, rim: 17 }`.
 *
 * Digits-only, matching the tag-conversion rule the input already uses: exactly
 * 7 digits split 3-2-2. Anything else (a partial entry mid-typing, a
 * full-profile van size like "185 R14", an exotic motorcycle notation) returns
 * null so the caller can fall back rather than query a nonsense size.
 */
function parseSearchSize(
  value: string,
): { width: number; height: number; rim: number } | null {
  if (!value) return null;
  const str = String(value).trim();

  // 1. Digits-only check for 7-digit inputs (e.g. "2056016", "2155517")
  const digits = str.replace(/[^0-9]/g, "");
  if (digits.length === 7) {
    const w = Number(digits.slice(0, 3));
    const h = Number(digits.slice(3, 5));
    const r = Number(digits.slice(5, 7));
    if (w >= 100 && h >= 20 && r >= 10) return { width: w, height: h, rim: r };
  }

  // 2. Flexible separator check (e.g. "205/60 R16", "205/60/16", "205 60 16", "205-60-16")
  const match = str.match(/(\d{3})[/\s\-]+(\d{2})[/\s\-R]+(\d{2})/i);
  if (match) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    const r = Number(match[3]);
    if (w >= 100 && h >= 20 && r >= 10) return { width: w, height: h, rim: r };
  }

  return null;
}

interface TyresGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * `year_ranges` arrives as a JSON array STRING — `["2008-2025"]` or
 * `["2016-2018","2020-2026"]` — and was rendered verbatim, brackets and quotes
 * included. This formats it as "2008 – 2025" / "2016 – 2018, 2020 – 2026".
 *
 * DISPLAY ONLY: the stored value is never altered. A value that does not parse
 * as JSON falls back to stripping brackets/quotes, so an unexpected shape still
 * reads as text instead of raw JSON. Returns "" when there is nothing to show,
 * which keeps the existing "—" placeholder.
 */
function formatYearRanges(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  let parts: string[];
  try {
    const parsed: unknown = JSON.parse(value);
    parts = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    parts = value.replace(/[[\]"]/g, "").split(",");
  }

  return parts
    .map((part) => part.trim().replace(/^(\d{4})\s*-\s*(\d{4})$/, "$1 – $2"))
    .filter(Boolean)
    .join(", ");
}

export default function TyresGuideModal({
  isOpen,
  onClose,
}: TyresGuideModalProps) {
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  /* Search Query & Tag States */
  const [searchQuery, setSearchQuery] = useState("");
  const [frontTag, setFrontTag] = useState("");
  const [rearTag, setRearTag] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  /* Data & Loading states */
  const [vehicles, setVehicles] = useState<KleverVehicleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  /* Dynamic page-level size resolution states */
  const [resolvedSizesMap, setResolvedSizesMap] = useState<Record<string, { front: string; rear: string }>>({});
  const [resolvingKeys, setResolvingKeys] = useState<Record<string, boolean>>({});

  /* Slide-up animation states */
  const [isAnimatedOpen, setIsAnimatedOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);



  /**
   * Load vehicles for a tyre size.
   *
   * `override` exists because the Search button commits the typed text to
   * `frontTag` in the same tick it fetches — React has not re-rendered yet, so
   * reading state here would use the PREVIOUS size. The caller passes the size
   * it just committed; everything else falls back to current state.
   */
  const handleFetchGuide = async (
    override?: { width: number; height: number; rim: number } | null,
    isUserSearch: boolean = false,
  ) => {
    setLoading(true);
    setError(null);
    if (isUserSearch) {
      setHasSearched(true);
    }

    const size =
      override !== undefined
        ? override
        : (parseSearchSize(frontTag) ?? parseSearchSize(searchQuery));

    try {
      if (size) {
        const data = await fetchKleverVehicleSearchGraphQL(
          size.width,
          size.height,
          size.rim,
        );
        if (data && data.length > 0) {
          setVehicles(data);
        } else {
          const allData = await fetchKleverAllVehicles();
          setVehicles(allData);
        }
      } else {
        const data = await fetchKleverAllVehicles();
        setVehicles(data);
      }
    } catch (err) {
      console.error("[TyresGuideModal] Vehicle search error:", err);
      setError("Failed to load vehicle fitment guide. Please try again.");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  /* Auto-fetch on initial modal open */
  useEffect(() => {
    let raf1: number;
    let raf2: number;
    if (isOpen) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsAnimatedOpen(true);
        });
      });
      if (!hasSearched) {
        handleFetchGuide();
      }
    } else {
      raf1 = requestAnimationFrame(() => {
        setIsAnimatedOpen(false);
      });
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 400);
  };

  /* Escape key to close */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* Reset to page 1 on search or page size change */
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, frontTag, rearTag, pageSize]);

  const normalizeTyreSize = (value: string) =>
    value.toLowerCase().replace(/[^0-9]/g, "");

  const { filteredVehicles, fitmentList } = useMemo(() => {
    // Only search on committed tags (frontTag & rearTag) to disable live auto-search while typing
    const qRaw: string = "";
    const fTagRaw = frontTag.trim();
    const rTagRaw = rearTag.trim();

    const fNorm = fTagRaw ? normalizeTyreSize(fTagRaw) : "";
    const rNorm = rTagRaw ? normalizeTyreSize(rTagRaw) : "";

    const exactMatches: KleverVehicleItem[] = [];
    const relatedSizeMap = new Map<
      string,
      { size: string; type: "Front" | "Rear"; count: number }
    >();

    // Helper check for partial match
    const matchesTag = (sizeNorm: string, sizeRaw: string, tagNorm: string, tagRaw: string) => {
      if (!tagNorm && !tagRaw) return false;
      if (tagNorm && sizeNorm.includes(tagNorm)) return true;
      if (tagRaw && sizeRaw.toLowerCase().includes(tagRaw.toLowerCase())) return true;
      if (!sizeNorm && !sizeRaw) return true;
      return false;
    };

    if (!fNorm && !rNorm) {
      return {
        filteredVehicles: [],
        fitmentList: [],
      };
    }

    vehicles.forEach((v) => {
      const rowKey = `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();
        const resolved = resolvedSizesMap[rowKey];

        const fSizeRaw =
          v.front_width && v.front_height && v.front_rim
            ? `${v.front_width}/${v.front_height} R${v.front_rim}`
            : resolved?.front && resolved.front !== "—"
              ? resolved.front
              : "";
        const rSizeRaw =
          v.rear_width && v.rear_height && v.rear_rim
            ? `${v.rear_width}/${v.rear_height} R${v.rear_rim}`
            : resolved?.rear && resolved.rear !== "—"
              ? resolved.rear
              : "";

        const fSizeNorm = fSizeRaw ? normalizeTyreSize(fSizeRaw) : "";
        const rSizeNorm = rSizeRaw ? normalizeTyreSize(rSizeRaw) : "";

        // 1. Both Front Tag & Rear Tag are active
        if (fNorm && rNorm) {
          const isMatch =
            (matchesTag(fSizeNorm, fSizeRaw, fNorm, fTagRaw) && matchesTag(rSizeNorm, rSizeRaw, rNorm, rTagRaw)) ||
            (matchesTag(fSizeNorm, fSizeRaw, rNorm, rTagRaw) && matchesTag(rSizeNorm, rSizeRaw, fNorm, fTagRaw));
          if (isMatch) exactMatches.push(v);
          return;
        }

        // 2. Front Tag is active
        if (fNorm || fTagRaw) {
          const isFrontMatch = matchesTag(fSizeNorm, fSizeRaw, fNorm, fTagRaw);
          const isRearMatch = matchesTag(rSizeNorm, rSizeRaw, fNorm, fTagRaw);
          if (isFrontMatch || isRearMatch || hasSearched) {
            exactMatches.push(v);

            const isStaggered = Boolean(
              fSizeNorm && rSizeNorm && fSizeNorm !== rSizeNorm,
            );

            if (isFrontMatch && isStaggered && rSizeRaw && rSizeNorm !== fNorm) {
              const existing = relatedSizeMap.get(rSizeRaw) || {
                size: rSizeRaw,
                type: "Rear" as const,
                count: 0,
              };
              existing.count += 1;
              relatedSizeMap.set(rSizeRaw, existing);
            }

            if (isRearMatch && isStaggered && fSizeRaw && fSizeNorm !== fNorm) {
              const existing = relatedSizeMap.get(fSizeRaw) || {
                size: fSizeRaw,
                type: "Front" as const,
                count: 0,
              };
              existing.count += 1;
              relatedSizeMap.set(fSizeRaw, existing);
            }
          }
        }
      });

    const fitmentMap = new Map<
      string,
      {
        front: string;
        rear: string;
        count: number;
        isStock: boolean;
        vehicles: KleverVehicleItem[];
      }
    >();

    const fallbackSize = frontTag || (parseSearchSize(searchQuery) ? `${parseSearchSize(searchQuery)?.width}/${parseSearchSize(searchQuery)?.height} R${parseSearchSize(searchQuery)?.rim}` : searchQuery);

    exactMatches.forEach((v) => {
      const rowKey = `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();
      const resolved = resolvedSizesMap[rowKey];

      const front =
        v.front_width && v.front_height && v.front_rim
          ? `${v.front_width}/${v.front_height} R${v.front_rim}`
          : resolved?.front && resolved.front !== "—"
            ? resolved.front
            : fallbackSize || "";

      const rear =
        v.rear_width && v.rear_height && v.rear_rim
          ? `${v.rear_width}/${v.rear_height} R${v.rear_rim}`
          : resolved?.rear && resolved.rear !== "—"
            ? resolved.rear
            : front;

      if (front || rear) {
        const key = `${front || "—"} / ${rear || front || "—"}`;
        const existing = fitmentMap.get(key) || {
          front: front || "—",
          rear: rear || front || "—",
          count: 0,
          isStock: Boolean(v.is_stock),
          vehicles: [],
        };
        existing.count += 1;
        if (!existing.vehicles.some((ex) => ex.make_name === v.make_name && ex.model_name === v.model_name)) {
          existing.vehicles.push(v);
        }
        fitmentMap.set(key, existing);
      }
    });

    const fitmentList = Array.from(fitmentMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      filteredVehicles: exactMatches,
      fitmentList,
    };
  }, [vehicles, searchQuery, frontTag, rearTag, resolvedSizesMap, hasSearched]);

  /* Right Panel Table vehicles: paginated list of filteredVehicles or vehicles */
  const tableVehicles = useMemo(() => {
    return filteredVehicles.length > 0 ? filteredVehicles : vehicles;
  }, [filteredVehicles, vehicles]);

  /* Pagination slices */
  const totalItems = tableVehicles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedVehicles = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return tableVehicles.slice(startIdx, startIdx + pageSize);
  }, [tableVehicles, validCurrentPage, pageSize]);

  /**
   * Page-level size resolution for the visible table rows.
   *
   * Only rows that have NO size of their own are resolved — a
   * `kleverVehicleSearch` row already carries front/rear width/height/rim, so
   * the search flow resolves nothing and issues no `kleverVehicleModifications`
   * request at all. This is the List flow's mechanism only.
   *
   * DEDUPE LIVES IN A REF, NOT IN STATE. Both `resolvedSizesMap` and
   * `resolvingKeys` are written by this effect, so having them in the dependency
   * array made it re-enter on its own writes: every resolution re-ran the whole
   * effect, which is how one search produced ~105 modification calls. The ref is
   * mutated synchronously before any request starts, so a re-render cannot
   * queue the same vehicle twice, and the effect now depends only on the page.
   *
   * Requests are issued ONE VEHICLE AT A TIME. Each `fetchKleverVehicleFitments`
   * internally fans out over that vehicle's years at concurrency 8, so firing
   * all 15 rows at once meant ~120 in-flight requests; sequential keeps the page
   * responsive and lets the cancellation below actually take effect.
   */
  const requestedSizeKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!paginatedVehicles.length) return;

    const rowKeyOf = (v: KleverVehicleItem) =>
      `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();

    const toResolve = paginatedVehicles.filter((v) => {
      // Search rows already have their sizes — never re-fetch them.
      if (v.front_width && v.front_height && v.front_rim) return false;
      return !requestedSizeKeysRef.current.has(rowKeyOf(v));
    });

    if (!toResolve.length) return;

    // Claimed up front so a re-render mid-flight cannot re-queue the same rows.
    toResolve.forEach((v) => requestedSizeKeysRef.current.add(rowKeyOf(v)));
    setResolvingKeys((prev) => {
      const next = { ...prev };
      toResolve.forEach((v) => {
        next[rowKeyOf(v)] = true;
      });
      return next;
    });

    /* Stops the queue when the page changes or the list is replaced by a
       search, instead of letting a previous page's resolutions run on. */
    let alive = true;

    void (async () => {
      for (const v of toResolve) {
        if (!alive) return;
        const make = String(v.make_slug || v.make_name || "").trim();
        const model = String(v.model_slug || v.model_name || "").trim();
        const key = `${make}|${model}`.toLowerCase();
        let resolvedPair = { front: "—", rear: "—" };
        try {
          const fitments = await fetchKleverVehicleFitments(make, model);
          /* Prefer the factory-stock fitment; `rear` is already the front size
             for a square car — `fetchKleverVehicleFitments` resolves a null
             `rear_wheel.tire_full` to the front size at source. */
          const stockFitment = fitments.find((f) => f.isStock) || fitments[0];
          if (stockFitment) {
            resolvedPair = { front: stockFitment.front, rear: stockFitment.rear };
          }
        } catch {
          // Leave the em-dash placeholder for this vehicle.
        }
        if (!alive) return;
        setResolvedSizesMap((prev) => ({ ...prev, [key]: resolvedPair }));
        setResolvingKeys((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [paginatedVehicles]);

  const startRecord =
    totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;

  if (!mounted) return null;
  if (!isOpen && !isClosing) return null;

  return createPortal(
    /* Backdrop */
    <div
      className={`fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
        isAnimatedOpen && !isClosing
          ? "opacity-100"
          : "opacity-0 pointer-events-none"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tyres-guide-modal-title"
    >
      {/* Slide-up panel */}
      <div
        className={`relative bg-slate-50 w-full max-w-full border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out h-[92vh] max-h-[92vh] rounded-t-2xl ${
          isAnimatedOpen && !isClosing ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header Bar */}
        <div className="bg-white px-5 sm:px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-2xs">
              <BookOpenIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="tyres-guide-modal-title"
                  className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900"
                >
                  Tyres Guide
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <SparklesIcon className="w-3 h-3 text-emerald-600" />
                  Vehicle Search
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Close"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body - Locked page scroll, internal list scrolling only */}
        <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4 flex flex-col justify-between gap-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center justify-between shrink-0">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => handleFetchGuide()}
                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[11px] font-bold hover:bg-rose-700 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Responsive 2-panel layout: 40% Left Panel & 60% Right Panel */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
              {/* Left Panel: 40% Width for Search Bar & Tyre Size Search Results - STICKY TOP */}
              <div className="w-full lg:w-[40%] flex flex-col gap-3 shrink-0 lg:sticky lg:top-0">
                {/* Zero-Layout-Shift Search Bar Container */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 shadow-2xs h-[88px] flex flex-col justify-between shrink-0">
                  <div className="flex items-center gap-2 h-[44px] px-3 bg-slate-50/90 border border-slate-200 rounded-lg overflow-x-auto no-scrollbar">
                    {/* Front Tag Pill */}
                    {frontTag && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-700 text-white font-bold text-xs shrink-0 shadow-2xs">
                        Front: {frontTag}
                        <button
                          type="button"
                          onClick={() => {
                            setFrontTag("");
                            void handleFetchGuide(null);
                          }}
                          className="hover:text-emerald-200 transition-colors cursor-pointer"
                          title="Remove Front size filter"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    )}

                    {/* Rear Tag Pill */}
                    {rearTag && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-700 text-white font-bold text-xs shrink-0 shadow-2xs">
                        Rear: {rearTag}
                        <button
                          type="button"
                          onClick={() => setRearTag("")}
                          className="hover:text-emerald-200 transition-colors cursor-pointer"
                          title="Remove Rear size filter"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    )}

                    {/* Text Input */}
                    {(!frontTag || !rearTag) && (
                      <input
                        autoComplete="off"
                        type="text"
                        placeholder={
                          !frontTag
                            ? "Search front size or rear size (e.g. 215/55 R17)..."
                            : "Add rear size (optional)"
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && searchQuery.trim()) {
                            const typed = searchQuery.trim();
                            const parsed = parseSearchSize(typed);
                            const tagVal = parsed
                              ? `${parsed.width}/${parsed.height} R${parsed.rim}`
                              : typed;
                            if (!frontTag) {
                              setFrontTag(tagVal);
                              setSearchQuery("");
                              void handleFetchGuide(parsed, true);
                            } else if (!rearTag) {
                              setRearTag(tagVal);
                              setSearchQuery("");
                              void handleFetchGuide(parsed, true);
                            }
                          }
                        }}
                        className="flex-1 min-w-[140px] bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400"
                      />
                    )}

                    {/* Clear Button */}
                    {(frontTag || rearTag || searchQuery.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFrontTag("");
                          setRearTag("");
                          setSearchQuery("");
                          setHasSearched(false);
                          setCurrentPage(1);
                          void handleFetchGuide(null, false);
                        }}
                        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors cursor-pointer shrink-0 border border-slate-200/80"
                        title="Clear search and show all vehicles"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                        Clear
                      </button>
                    )}

                    {/* Search Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const typed = searchQuery.trim();
                        let nextFront = frontTag;
                        const parsed = parseSearchSize(typed) || parseSearchSize(frontTag);
                        if (typed) {
                          const tagVal = parsed
                            ? `${parsed.width}/${parsed.height} R${parsed.rim}`
                            : typed;
                          if (!frontTag) {
                            nextFront = tagVal;
                            setFrontTag(tagVal);
                            setSearchQuery("");
                          } else if (!rearTag) {
                            setRearTag(tagVal);
                            setSearchQuery("");
                          }
                        }
                        setHasSearched(true);
                        void handleFetchGuide(parsed || parseSearchSize(nextFront), true);
                      }}
                      className={`${frontTag || rearTag || searchQuery.trim() ? "ml-1.5" : "ml-auto"} inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs`}
                    >
                      <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                      Search
                    </button>
                  </div>

                  {/* Helper Subtext with fixed height */}
                  <div className="text-[11px] text-slate-500 font-medium px-1 h-4 flex items-center shrink-0">
                    {!frontTag && !rearTag
                      ? "Enter front tyre size or tap Search to view all tyres"
                      : frontTag && !rearTag
                        ? "Add rear tyre size or tap Search to view all tyres"
                        : "Showing vehicle fitments for selected Front & Rear sizes"}
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <SparklesIcon className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        Search Results
                      </h3>
                    </div>
                    {(frontTag || rearTag || searchQuery.trim()) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {filteredVehicles.length} match
                        {filteredVehicles.length !== 1 ? "es" : ""}
                      </span>
                    )}
                  </div>

                  {!hasSearched && !frontTag && !rearTag ? (
                    /* Initial state before search */
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 gap-3.5 p-6">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shadow-2xs">
                        <MagnifyingGlassIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">
                          Search for Tyre Sizes
                        </p>
                        <p className="text-[11px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                          Enter a tyre size in the input box above and click <span className="font-bold text-emerald-700">Search</span> to view matching tyre sizes and vehicles.
                        </p>
                      </div>
                    </div>
                  ) : filteredVehicles.length === 0 ? (
                    /* Empty search results */
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                      <TruckIcon className="w-10 h-10 opacity-30 text-rose-500" />
                      <p className="text-xs font-bold text-slate-700">
                        No matching tyre sizes found
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-xs">
                        No fitments matched your query. Try another tyre size.
                      </p>
                    </div>
                  ) : (
                    /* Matching Fitment Sizes List + Separate Matching Vehicles Section Below */
                    <div className="flex-1 min-h-0 flex flex-col space-y-3 pr-1">
                      {fitmentList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-24 text-center text-slate-400 gap-1.5 shrink-0">
                          <p className="text-xs font-semibold text-slate-600">
                            Fitment details loading...
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 shrink-0">
                          {fitmentList.map((fitment, fIdx) => {
                            const fitmentTagVal = `${fitment.front}`;
                            const isSelected = frontTag === fitmentTagVal;

                            return (
                              <button
                                type="button"
                                key={fIdx}
                                onClick={() => {
                                  if (isSelected) {
                                    setFrontTag("");
                                    setRearTag("");
                                  } else {
                                    setFrontTag(fitment.front);
                                    if (fitment.rear && fitment.rear !== fitment.front && fitment.rear !== "—") {
                                      setRearTag(fitment.rear);
                                    } else {
                                      setRearTag("");
                                    }
                                  }
                                }}
                                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                  isSelected
                                    ? "bg-emerald-50/50 border-emerald-600 ring-1 ring-emerald-600/30 text-slate-900 shadow-2xs"
                                    : "bg-white border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 text-slate-900 shadow-2xs"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`font-extrabold text-xs font-mono px-2.5 py-1 rounded-md ${
                                    isSelected
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-slate-100 text-slate-800 border border-slate-200"
                                  }`}>
                                    {fitment.front}
                                  </span>
                                  {fitment.rear && fitment.rear !== "—" && (
                                    <>
                                      <span className="text-slate-400 text-xs">/</span>
                                      <span className={`font-extrabold text-xs font-mono px-2.5 py-1 rounded-md ${
                                        isSelected
                                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                          : "bg-slate-100 text-slate-800 border border-slate-200"
                                      }`}>
                                        {fitment.rear}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Separate Matching Vehicles List Section Below Fitment Sizes */}
                      {filteredVehicles.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/80 space-y-2 flex-1 min-h-0 flex flex-col">
                          <div className="flex items-center justify-between px-0.5 shrink-0">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                              Matching Vehicles
                            </span>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                              {filteredVehicles.length} vehicle{filteredVehicles.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1.5 pb-1">
                            {filteredVehicles.map((v, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl border border-slate-200/90 bg-white text-slate-900 shadow-2xs flex items-center gap-2 text-xs shrink-0"
                              >
                                <div className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center shrink-0">
                                  <TruckIcon className="w-3 h-3" />
                                </div>
                                <span className="font-bold text-xs truncate">
                                  {v.make_name} {v.model_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: 60% Width for Vehicle Table - Stretches Full Height */}
              <div className="w-full lg:w-[60%] flex-1 min-w-0 flex flex-col min-h-0">
                {/* Loading Skeleton state */}
                {loading ? (
                  <div className="space-y-2.5">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="bg-white border border-slate-200/80 rounded-xl p-3 flex items-center justify-between gap-4 animate-pulse shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-200" />
                          <div className="space-y-1.5">
                            <div className="w-36 h-3.5 bg-slate-200 rounded-md" />
                            <div className="w-24 h-2.5 bg-slate-150 rounded-md" />
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="w-28 h-7 bg-slate-100 rounded-lg" />
                          <div className="w-28 h-7 bg-slate-100 rounded-lg" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : tableVehicles.length > 0 ? (
                  <div className="flex flex-col gap-2 flex-1 min-h-0">
                    {/* Vehicle List Table - Fixed layout to prevent shifts on page change */}
                    <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs flex flex-col flex-1 min-h-[560px]">
                      <div className="overflow-x-auto overflow-y-auto no-scrollbar flex-1 min-h-0">
                        <table className="w-full text-left border-collapse text-xs table-fixed">
                          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200/80 z-10">
                            <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider h-9">
                              <th className="py-2 px-3 text-center w-12 bg-slate-50">
                                #
                              </th>
                              <th className="py-2 px-3.5 w-[16%] bg-slate-50">Make</th>
                              <th className="py-2 px-3.5 w-[16%] bg-slate-50">Model</th>
                              <th className="py-2 px-3.5 w-[22%] bg-slate-50">Year Ranges</th>
                              <th className="py-2 px-3.5 w-[16%] bg-slate-50">Front Size</th>
                              <th className="py-2 px-3.5 w-[16%] bg-slate-50">Rear Size</th>
                              <th className="py-2 px-3.5 w-[14%] text-center bg-slate-50">
                                Fitment Type
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 text-slate-800">
                            {paginatedVehicles.map((v, idx) => {
                              const itemIndex = startRecord + idx;
                              const rowKey = `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();
                              const resolved = resolvedSizesMap[rowKey];
                              const isResolving = resolvingKeys[rowKey];

                              const frontRaw =
                                v.front_width && v.front_height && v.front_rim
                                  ? `${v.front_width}/${v.front_height} R${v.front_rim}`
                                  : resolved?.front;

                              const rearRaw =
                                v.rear_width && v.rear_height && v.rear_rim
                                  ? `${v.rear_width}/${v.rear_height} R${v.rear_rim}`
                                  : resolved?.rear;

                              const yearRanges = formatYearRanges(
                                v.year_ranges,
                              );

                              return (
                                <tr
                                  key={idx}
                                  className="hover:bg-emerald-50/50 transition-colors group h-9"
                                >
                                  <td className="py-2 px-3 text-center font-bold text-slate-400 group-hover:text-emerald-600">
                                    {itemIndex}
                                  </td>
                                  <td className="py-2 px-3.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-800 transition-colors">
                                        <TruckIcon className="w-3.5 h-3.5" />
                                      </div>
                                      <span className="font-extrabold text-slate-900 text-xs sm:text-xs">
                                        {v.make_name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3.5">
                                    <span className="font-extrabold text-slate-900 text-xs sm:text-xs">
                                      {v.model_name}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3.5 font-semibold text-slate-600">
                                    {yearRanges ? (
                                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold">
                                        {yearRanges}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="py-2 px-3.5 font-bold text-slate-900">
                                    {frontRaw && frontRaw !== "—" ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs">
                                        {frontRaw}
                                      </span>
                                    ) : isResolving ? (
                                      <span className="inline-block w-16 h-4 rounded bg-slate-200/80 animate-pulse align-middle" />
                                    ) : (
                                      <span className="text-slate-400 font-normal">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3.5 font-bold text-slate-900">
                                    {rearRaw && rearRaw !== "—" ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs">
                                        {rearRaw}
                                      </span>
                                    ) : isResolving ? (
                                      <span className="inline-block w-16 h-4 rounded bg-slate-200/80 animate-pulse align-middle" />
                                    ) : (
                                      <span className="text-slate-400 font-normal">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3.5 text-center">
                                    {v.is_stock ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <CheckCircleIcon className="w-3 h-3 text-emerald-600" />
                                        Factory Stock
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                        Optional Size
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : hasSearched ? (
                  <div className="flex flex-col items-center justify-center h-[580px] bg-white border border-slate-200/90 rounded-xl text-slate-400 gap-3">
                    <TruckIcon className="w-12 h-12 opacity-30 text-emerald-500" />
                    <p className="text-base font-bold text-slate-700">
                      No vehicle fitments found
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm text-center">
                      No vehicles matched your search query. Try typing another
                      make, model, or year.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[580px] bg-white border border-slate-200/90 rounded-xl text-slate-400 gap-3">
                    <BookOpenIcon className="w-12 h-12 opacity-20 text-emerald-500" />
                    <p className="text-sm font-semibold text-slate-600">
                      Type vehicle name to look up fitments
                    </p>
                  </div>
                )}
              </div>
            </div>

          {/* Fixed Bottom Pagination Footer - Always visible to prevent layout shift */}
          <div className="pt-2 border-t border-slate-200/90 bg-white shrink-0 z-10">
            <Pagination
              currentPage={validCurrentPage}
              totalPages={totalPages}
              onPageChange={(page) => setCurrentPage(page)}
              pageSize={pageSize}
              setPageSize={(size) => setPageSize(size)}
              pageSizeOptions={[15, 30, 50, 100]}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
