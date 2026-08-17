"use client";

import React, {
  useEffect,
  useState,
  useSyncExternalStore,
  useMemo,
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
import { fetchKleverVehicleSearchGraphQL } from "../services/graphql";
import type { KleverVehicleItem } from "../services/types";
import Pagination from "./Pagination";

/** No external store — subscription is a no-op; module scope keeps it stable. */
const subscribeNever = () => () => {};

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
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  /* Data & Loading states */
  const [vehicles, setVehicles] = useState<KleverVehicleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  /* Slide-up animation states */
  const [isAnimatedOpen, setIsAnimatedOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  /* Fetch fitment guide from API */
  const handleFetchGuide = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const data = await fetchKleverVehicleSearchGraphQL(215, 55, 17);
      setVehicles(data);
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

  const { filteredVehicles, relatedSizes } = useMemo(() => {
    const qRaw = searchQuery.trim();
    const fTagRaw = frontTag.trim();
    const rTagRaw = rearTag.trim();

    if (!qRaw && !fTagRaw && !rTagRaw) {
      return { filteredVehicles: vehicles, relatedSizes: [] };
    }

    const qNorm = qRaw ? normalizeTyreSize(qRaw) : "";
    const fNorm = fTagRaw ? normalizeTyreSize(fTagRaw) : "";
    const rNorm = rTagRaw ? normalizeTyreSize(rTagRaw) : "";

    const exactMatches: KleverVehicleItem[] = [];
    const relatedSizeMap = new Map<
      string,
      { size: string; type: "Front" | "Rear"; count: number }
    >();

    vehicles.forEach((v) => {
      const fSizeRaw =
        v.front_width && v.front_height && v.front_rim
          ? `${v.front_width}/${v.front_height} R${v.front_rim}`
          : "";
      const rSizeRaw =
        v.rear_width && v.rear_height && v.rear_rim
          ? `${v.rear_width}/${v.rear_height} R${v.rear_rim}`
          : "";

      const fSizeNorm = fSizeRaw ? normalizeTyreSize(fSizeRaw) : "";
      const rSizeNorm = rSizeRaw ? normalizeTyreSize(rSizeRaw) : "";

      // 1. Both Front Tag & Rear Tag are active
      if (fNorm && rNorm) {
        const isMatch =
          (fSizeNorm === fNorm && rSizeNorm === rNorm) ||
          (fSizeNorm === rNorm && rSizeNorm === fNorm);
        if (isMatch) exactMatches.push(v);
        return;
      }

      // 2. Front Tag is active + user is typing in input
      if (fNorm && qNorm) {
        const isMatch =
          (fSizeNorm === fNorm &&
            (rSizeNorm.includes(qNorm) || fSizeNorm.includes(qNorm))) ||
          (rSizeNorm === fNorm &&
            (fSizeNorm.includes(qNorm) || rSizeNorm.includes(qNorm)));
        if (isMatch) exactMatches.push(v);
        return;
      }

      // 3. Front Tag is active (no typing)
      if (fNorm) {
        const isFrontMatch = fSizeNorm === fNorm;
        const isRearMatch = rSizeNorm === fNorm;
        if (isFrontMatch || isRearMatch) {
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
        return;
      }

      // 4. Instant Live Search while typing (no tags set)
      if (qNorm) {
        const isFrontMatch = fSizeNorm.includes(qNorm);
        const isRearMatch = rSizeNorm.includes(qNorm);

        if (isFrontMatch || isRearMatch) {
          exactMatches.push(v);

          const isStaggered = Boolean(
            fSizeNorm && rSizeNorm && fSizeNorm !== rSizeNorm,
          );

          if (
            isFrontMatch &&
            isStaggered &&
            rSizeRaw &&
            !rSizeNorm.includes(qNorm)
          ) {
            const existing = relatedSizeMap.get(rSizeRaw) || {
              size: rSizeRaw,
              type: "Rear" as const,
              count: 0,
            };
            existing.count += 1;
            relatedSizeMap.set(rSizeRaw, existing);
          }

          if (
            isRearMatch &&
            isStaggered &&
            fSizeRaw &&
            !fSizeNorm.includes(qNorm)
          ) {
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

    const relatedList = Array.from(relatedSizeMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      filteredVehicles: exactMatches,
      relatedSizes: relatedList,
    };
  }, [vehicles, searchQuery, frontTag, rearTag]);

  /* API-Ready Brand Grouping for Left Panel Search Results */
  const brandGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        make_name: string;
        logoUrl?: string | null;
        vehicles: KleverVehicleItem[];
      }
    >();

    filteredVehicles.forEach((v) => {
      const make = v.make_name || "Other";
      const rawLogo =
        v.brand_logo ||
        v.make_logo ||
        v.logo_url ||
        v.logo ||
        v.image;

      const logoUrl =
        typeof rawLogo === "string" && rawLogo.trim() ? rawLogo.trim() : null;

      const existing = map.get(make);
      if (!existing) {
        map.set(make, {
          make_name: make,
          logoUrl,
          vehicles: [v],
        });
      } else {
        existing.vehicles.push(v);
        if (!existing.logoUrl && logoUrl) {
          existing.logoUrl = logoUrl;
        }
      }
    });

    return Array.from(map.values());
  }, [filteredVehicles]);

  /* Right Panel Table vehicles: filter by selected vehicle card if active */
  const tableVehicles = useMemo(() => {
    const list = filteredVehicles.length > 0 ? filteredVehicles : vehicles;
    if (selectedVehicleKey) {
      return list.filter(
        (v) => `${v.make_name}-${v.model_name}` === selectedVehicleKey,
      );
    }
    return list;
  }, [filteredVehicles, vehicles, selectedVehicleKey]);

  /* Pagination slices */
  const totalItems = tableVehicles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedVehicles = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return tableVehicles.slice(startIdx, startIdx + pageSize);
  }, [tableVehicles, validCurrentPage, pageSize]);

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
                          onClick={() => setFrontTag("")}
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
                        onChange={(e) => {
                          const val = e.target.value;
                          const norm = val.toLowerCase().replace(/[^0-9]/g, "");
                          // Auto convert to tag pill as soon as a full 7-digit tyre size (e.g. 2155517) is entered
                          if (norm.length === 7) {
                            if (!frontTag) {
                              setFrontTag(val.trim());
                              setSearchQuery("");
                              return;
                            } else if (!rearTag) {
                              setRearTag(val.trim());
                              setSearchQuery("");
                              return;
                            }
                          }
                          setSearchQuery(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && searchQuery.trim()) {
                            if (!frontTag) {
                              setFrontTag(searchQuery.trim());
                              setSearchQuery("");
                            } else if (!rearTag) {
                              setRearTag(searchQuery.trim());
                              setSearchQuery("");
                            }
                          }
                        }}
                        className="flex-1 min-w-[140px] bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400"
                      />
                    )}

                    {/* Search Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (searchQuery.trim()) {
                          if (!frontTag) {
                            setFrontTag(searchQuery.trim());
                            setSearchQuery("");
                          } else if (!rearTag) {
                            setRearTag(searchQuery.trim());
                            setSearchQuery("");
                          }
                        }
                      }}
                      className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
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

                <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs max-h-[670px] flex flex-col">
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

                  {!frontTag && !rearTag && !searchQuery.trim() ? (
                    /* Clean empty state when there is no search query */
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                      <MagnifyingGlassIcon className="w-10 h-10 opacity-25 text-emerald-500" />
                      <p className="text-xs font-bold text-slate-700">
                        Search for a tyre size
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                        Enter a tyre size in the search bar above to view
                        matching results.
                      </p>
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
                    /* Matching Vehicles List - Grouped by Brand (API-Ready for Logo URLs) */
                    <div className="flex-1 min-h-0 space-y-3 overflow-y-auto no-scrollbar pr-1">
                      {brandGroups.map((group, gIdx) => (
                        <div key={gIdx} className="space-y-1.5">
                          {/* Styled Brand Header Bar */}
                          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100/70 border border-slate-200/60 shadow-2xs">
                            <div className="flex items-center gap-2">
                              {group.logoUrl ? (
                                <img
                                  src={group.logoUrl}
                                  alt={group.make_name}
                                  className="w-4 h-4 object-contain shrink-0"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-md bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                                  <TruckIcon className="w-3 h-3" />
                                </div>
                              )}
                              <span className="font-extrabold text-[11px] uppercase tracking-wider text-slate-800">
                                {group.make_name}
                              </span>
                            </div>
                            <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                              {group.vehicles.length} model
                              {group.vehicles.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          {/* Vehicles under this Brand - 2 Column Grid */}
                          <div className="grid grid-cols-2 gap-1.5">
                            {group.vehicles.map((v, idx) => {
                              const vehicleKey = `${v.make_name}-${v.model_name}`;
                              const isSelected =
                                selectedVehicleKey === vehicleKey;

                              return (
                                <button
                                  type="button"
                                  key={idx}
                                  onClick={() =>
                                    setSelectedVehicleKey(
                                      isSelected ? null : vehicleKey,
                                    )
                                  }
                                  className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 text-xs cursor-pointer ${
                                    isSelected
                                      ? "bg-emerald-700 text-white border-emerald-800 shadow-xs"
                                      : "bg-white border-slate-200/90 hover:bg-emerald-50/60 hover:border-emerald-300 text-slate-900 shadow-2xs"
                                  }`}
                                >
                                  <div
                                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                      isSelected
                                        ? "bg-emerald-800 text-white"
                                        : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                    }`}
                                  >
                                    <TruckIcon className="w-3 h-3" />
                                  </div>
                                  <span className="font-bold text-xs truncate">
                                    {v.model_name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
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
                  <div className="flex flex-col gap-2">
                    {/* Vehicle List Table - All 15 rows fit with max-h-[670px] and zero scrollbars */}
                    <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs max-h-[670px] flex flex-col">
                      <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[670px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200/80 z-10">
                            <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              <th className="py-2.5 px-3 text-center w-12 bg-slate-50">
                                #
                              </th>
                              <th className="py-2.5 px-3.5 bg-slate-50">Make</th>
                              <th className="py-2.5 px-3.5 bg-slate-50">Model</th>
                              <th className="py-2.5 px-3.5 bg-slate-50">Year Ranges</th>
                              <th className="py-2.5 px-3.5 bg-slate-50">Front Size</th>
                              <th className="py-2.5 px-3.5 bg-slate-50">Rear Size</th>
                              <th className="py-2.5 px-3.5 text-center bg-slate-50">
                                Fitment Type
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 text-slate-800">
                            {paginatedVehicles.map((v, idx) => {
                              const itemIndex = startRecord + idx;
                              const frontSize =
                                v.front_width && v.front_height && v.front_rim
                                  ? `${v.front_width}/${v.front_height} R${v.front_rim}`
                                  : "—";
                              const rearSize =
                                v.rear_width && v.rear_height && v.rear_rim
                                  ? `${v.rear_width}/${v.rear_height} R${v.rear_rim}`
                                  : "—";
                              const yearRanges = formatYearRanges(
                                v.year_ranges,
                              );

                              return (
                                <tr
                                  key={idx}
                                  className="hover:bg-emerald-50/50 transition-colors group"
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
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs">
                                      {frontSize}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3.5 font-bold text-slate-900">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs">
                                      {rearSize}
                                    </span>
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

          {/* Restored Bottom Pagination Footer */}
          {!loading && totalItems > 0 && (
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
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
