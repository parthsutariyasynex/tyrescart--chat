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

  /* Search Query & Pagination States */
  const [searchQuery, setSearchQuery] = useState("");
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
  }, [searchQuery, pageSize]);

  /* old Filter vehicles by search query */
  // const filteredVehicles = useMemo(() => {
  //   if (!searchQuery.trim()) return vehicles;
  //   const q = searchQuery.toLowerCase().trim();
  //   return vehicles.filter((v) => {
  //     // const make = (v.make_name || "").toLowerCase();
  //     // const model = (v.model_name || "").toLowerCase();
  //     // const years = (v.year_ranges || "").toLowerCase();
  //     const fSize =
  //       `${v.front_width}/${v.front_height} r${v.front_rim}`.toLowerCase();
  //     const rSize =
  //       `${v.rear_width}/${v.rear_height} r${v.rear_rim}`.toLowerCase();
  //     return (
  //       // make.includes(q) ||
  //       // model.includes(q) ||
  //       // years.includes(q) ||
  //       fSize.includes(q) || rSize.includes(q)
  //     );
  //   });
  // }, [vehicles, searchQuery]);

  /* New Filter vehicles by search query */
  const normalizeTyreSize = (value: string) =>
    value.toLowerCase().replace(/[^0-9]/g, "");

  const filteredVehicles = useMemo(() => {
    if (!searchQuery.trim()) return vehicles;

    const q = normalizeTyreSize(searchQuery);

    return vehicles.filter((v) => {
      // const make = (v.make_name || "").toLowerCase();
      // const model = (v.model_name || "").toLowerCase();
      // const years = (v.year_ranges || "").toLowerCase();

      const fSize = normalizeTyreSize(
        `${v.front_width}/${v.front_height} r${v.front_rim}`,
      );

      const rSize = normalizeTyreSize(
        `${v.rear_width}/${v.rear_height} r${v.rear_rim}`,
      );

      return (
        // make.includes(q) ||
        // model.includes(q) ||
        // years.includes(q) ||
        fSize === q || rSize === q
      );
    });
  }, [vehicles, searchQuery]);

  /* Pagination slices */
  const totalItems = filteredVehicles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedVehicles = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return filteredVehicles.slice(startIdx, startIdx + pageSize);
  }, [filteredVehicles, validCurrentPage, pageSize]);

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
        {/* Modal Header Bar with integrated Search */}
        <div className="bg-white px-5 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
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

          {/* Header Search Input */}
          <div className="relative flex-1 max-w-md mx-2 min-w-[200px]">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoComplete="off"
              type="text"
              placeholder="Search tyre size..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
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

        {/* Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 flex flex-col justify-between">
          <div>
            {error && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center justify-between">
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
            ) : filteredVehicles.length > 0 ? (
              <div className="flex flex-col gap-2">
                {/* Vehicle List Table */}
                <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3 text-center w-12">#</th>
                          <th className="py-2.5 px-3.5">Make</th>
                          <th className="py-2.5 px-3.5">Model</th>
                          <th className="py-2.5 px-3.5">Year Ranges</th>
                          <th className="py-2.5 px-3.5">Front Axle Size</th>
                          <th className="py-2.5 px-3.5">Rear Axle Size</th>
                          <th className="py-2.5 px-3.5 text-center">
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
                          const yearRanges = formatYearRanges(v.year_ranges);

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
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
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
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                <BookOpenIcon className="w-12 h-12 opacity-20 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-600">
                  Type vehicle name to look up fitments
                </p>
              </div>
            )}
          </div>

          {/* Pagination Footer */}
          {!loading && totalItems > 0 && (
            <div className="mt-2 shrink-0">
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
