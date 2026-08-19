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
  SparklesIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  fetchKleverVehicleSearchGraphQL,
  fetchKleverVehicleFitments,
  fetchKleverAllVehicles,
} from "../services/graphql";
import type { KleverVehicleItem } from "../services/types";
import Pagination from "./Pagination";
import { Skeleton } from "./Skeletons";

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

/**
 * Brand logo for a make, from Klever's own logo host.
 *
 * Keyed on `make_slug` exactly as `kleverVehicleSearch` returns it —
 * abarth → /logos/abarth.png. Verified against every make the API lists:
 * 113 / 113 present (100%), each a distinct image, and an unknown slug
 * returns a real 404 rather than a shared placeholder.
 *
 * This replaces the two jsDelivr sets that were here before
 * (car-logos-dataset + VehicleSpecs, which together reached 103/113 and left
 * dorcen, firefly, forthing, iran-khodro, kaiyi, rox, skywell, tank, vgv and
 * voyah on the truck icon). Same-origin-family host as the rest of the API, no
 * third-party CDN, no version pin to keep current, and no alias table — the
 * slugs match because both come from the same backend.
 *
 * The truck fallback is kept for a row with no slug at all, or a network
 * failure.
 */
const LOGO_BASE_URL = "https://wheel-api.klever.ae/logos";

function makeLogoUrl(makeSlug: string | null | undefined): string {
  const slug = String(makeSlug ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
  return slug ? `${LOGO_BASE_URL}/${slug}.png` : "";
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

  /**
   * The fitment chip the user has highlighted, as `front|rear`.
   *
   * SELECTION ONLY — it deliberately does not touch `frontTag`/`rearTag` and
   * does not refetch. Clicking a chip used to call `setFrontTag`/`setRearTag`
   * plus `handleFetchGuide`, which ran a NEW search and replaced the result
   * set: picking one combination out of a 4-car result collapsed the table to
   * whatever that single size returned. The search result is the source of
   * truth; a chip click only marks which combination is being looked at.
   */
  const [selectedFitmentKey, setSelectedFitmentKey] = useState<string | null>(
    null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  /* Data & Loading states */
  const [vehicles, setVehicles] = useState<KleverVehicleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  /* Dynamic page-level size resolution states */
  const [resolvedSizesMap, setResolvedSizesMap] = useState<
    Record<string, { front: string; rear: string; isStock: boolean }>
  >({});
  const [resolvingKeys, setResolvingKeys] = useState<Record<string, boolean>>(
    {},
  );

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
        : (parseSearchSize(frontTag) ??
          parseSearchSize(rearTag) ??
          parseSearchSize(searchQuery));

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
        catalogueRef.current = data;
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

  /* Focus the size input when the modal opens.
     Deferred past the 300ms slide-up: focusing an element that is still
     translating scrolls the panel and fights the transition, so the field is
     focused once it has settled. The input is conditionally rendered (it is
     removed once BOTH tags are set), hence the null check. */
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 350);
    return () => clearTimeout(t);
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
    // A new search invalidates whichever chip was highlighted.
    setSelectedFitmentKey(null);
  }, [searchQuery, frontTag, rearTag, pageSize]);

  const normalizeTyreSize = (value: string) =>
    value.toLowerCase().replace(/[^0-9]/g, "");

  const { filteredVehicles, fitmentList } = useMemo(() => {
    // Only search on committed tags (frontTag & rearTag) to disable live auto-search while typing
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
    const matchesTag = (
      sizeNorm: string,
      sizeRaw: string,
      tagNorm: string,
      tagRaw: string,
    ) => {
      if (!tagNorm && !tagRaw) return false;
      if (!sizeNorm && !sizeRaw) return false;
      if (tagNorm && sizeNorm.includes(tagNorm)) return true;
      if (tagRaw && sizeRaw.toLowerCase().includes(tagRaw.toLowerCase()))
        return true;
      return false;
    };

    if (!fNorm && !rNorm) {
      return {
        filteredVehicles: [],
        fitmentList: [],
      };
    }

    vehicles.forEach((v) => {
      const rowKey =
        `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();
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

      const targetNorm = fNorm || rNorm;
      const targetRaw = fTagRaw || rTagRaw;

      // 1. Both Front Tag & Rear Tag are active
      if (fNorm && rNorm) {
        const isMatch =
          (matchesTag(fSizeNorm, fSizeRaw, fNorm, fTagRaw) &&
            matchesTag(rSizeNorm, rSizeRaw, rNorm, rTagRaw)) ||
          (matchesTag(fSizeNorm, fSizeRaw, rNorm, rTagRaw) &&
            matchesTag(rSizeNorm, rSizeRaw, fNorm, fTagRaw));
        if (isMatch) exactMatches.push(v);
        return;
      }

      // 2. Either Front Tag or Rear Tag is active
      if (targetNorm || targetRaw) {
        const isFrontMatch = matchesTag(
          fSizeNorm,
          fSizeRaw,
          targetNorm,
          targetRaw,
        );
        const isRearMatch = matchesTag(
          rSizeNorm,
          rSizeRaw,
          targetNorm,
          targetRaw,
        );
        if (isFrontMatch || isRearMatch) {
          exactMatches.push(v);

          const isStaggered = Boolean(
            fSizeNorm && rSizeNorm && fSizeNorm !== rSizeNorm,
          );

          if (
            isFrontMatch &&
            isStaggered &&
            rSizeRaw &&
            rSizeNorm !== targetNorm
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
            fSizeNorm !== targetNorm
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

    const fallbackSize =
      frontTag ||
      (parseSearchSize(searchQuery)
        ? `${parseSearchSize(searchQuery)?.width}/${parseSearchSize(searchQuery)?.height} R${parseSearchSize(searchQuery)?.rim}`
        : searchQuery);

    exactMatches.forEach((v) => {
      const rowKey =
        `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();
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
        if (
          !existing.vehicles.some(
            (ex) =>
              ex.make_name === v.make_name && ex.model_name === v.model_name,
          )
        ) {
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
  }, [vehicles, searchQuery, frontTag, rearTag, resolvedSizesMap]);

  /* Right Panel Table vehicles: paginated list of filteredVehicles or vehicles */
  /**
   * Vehicles shown under "Matching Vehicles".
   *
   * With no chip selected this is the whole search result. Selecting a chip
   * narrows it to the cars that actually use THAT front/rear combination —
   * `fitmentMap` already collected them while grouping, so this is a lookup,
   * not a re-filter, and it costs no request. The underlying search result is
   * untouched: clearing the chip restores the full list immediately.
   */
  const selectedFitment = useMemo(() => {
    if (!selectedFitmentKey) return undefined;

    // A staggered chip carries the full `front|rear` key.
    const exact = fitmentList.find(
      (f) => `${f.front}|${f.rear}` === selectedFitmentKey,
    );
    if (exact) return exact;

    /* The "Selected Size" chip for a front-only search uses just the front
       size as its key, which never equals a `front|rear` entry — so the lookup
       missed and Matching Vehicles stayed hidden. Gather every combination
       sharing that front size instead, de-duped by make+model. */
    const sameFront = fitmentList.filter((f) => f.front === selectedFitmentKey);
    if (!sameFront.length) return undefined;

    const merged: KleverVehicleItem[] = [];
    for (const f of sameFront) {
      for (const v of f.vehicles) {
        if (
          !merged.some(
            (ex) =>
              ex.make_name === v.make_name && ex.model_name === v.model_name,
          )
        ) {
          merged.push(v);
        }
      }
    }
    return { ...sameFront[0], vehicles: merged, count: merged.length };
  }, [fitmentList, selectedFitmentKey]);

  const matchingVehicles = selectedFitment?.vehicles ?? filteredVehicles;

  const tableVehicles = useMemo(() => {
    /* Only a live size filter narrows the table. `hasSearched` used to be part
       of this condition, which meant CLEARING a search left the table on
       `filteredVehicles` — and that memo returns [] when no tag is set, so the
       table went blank instead of falling back to the catalogue. */
    /* A filter that matches nothing keeps the catalogue on screen rather than
       emptying the table. The left panel already reports the miss ("This size
       is not found in list — showing complete vehicle catalogue on the right"),
       so blanking the table as well removed the list the user was reading and
       replaced it with a second, redundant not-found message. */
    const fallback = vehicles;
    if (frontTag || rearTag) {
      return filteredVehicles.length > 0 ? filteredVehicles : fallback;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matches = vehicles.filter((v) => {
        const make = (v.make_name || "").toLowerCase();
        const model = (v.model_name || "").toLowerCase();
        const fSize =
          v.front_width && v.front_height && v.front_rim
            ? `${v.front_width}/${v.front_height}`
            : "";
        const rSize =
          v.rear_width && v.rear_height && v.rear_rim
            ? `${v.rear_width}/${v.rear_height}`
            : "";
        return (
          make.includes(q) ||
          model.includes(q) ||
          fSize.includes(q) ||
          rSize.includes(q)
        );
      });
      // Same rule for the free-text filter: no match keeps the full list.
      return matches.length > 0 ? matches : fallback;
    }
    return fallback;
  }, [filteredVehicles, vehicles, frontTag, rearTag, searchQuery]);

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
  /** The size input, focused when the modal opens so typing works immediately. */
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const requestedSizeKeysRef = useRef<Set<string>>(new Set());

  /**
   * The last full vehicle catalogue that was loaded.
   *
   * A size search REPLACES `vehicles` with its own results, so a search that
   * matches nothing leaves `vehicles` empty and there is no list left to fall
   * back to. Held in a ref (not state) because it is only ever read as a
   * fallback during render — storing it in state would re-render on every
   * catalogue load for no visual change. Never refetched: it is filled from the
   * memoised `fetchKleverAllVehicles` result the list flow already produced.
   */
  const catalogueRef = useRef<KleverVehicleItem[]>([]);

  useEffect(() => {
    if (!paginatedVehicles.length) return;
    /* Never resolve sizes while the vehicle list itself is still loading. The
       rows on screen belong to the OUTGOING list, so anything resolved for them
       is thrown away the moment the new list lands — and it competes with the
       114 in-flight list requests for the browser's connection pool, slowing
       the thing the user is actually waiting for. */
    if (loading) return;

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
        /* `isStock` defaults false so an unresolvable vehicle keeps the
           existing "Not Available" reading rather than claiming stock. */
        let resolvedPair = { front: "—", rear: "—", isStock: false };
        try {
          const fitments = await fetchKleverVehicleFitments(make, model);
          /* Prefer the factory-stock fitment; `rear` is already the front size
             for a square car — `fetchKleverVehicleFitments` resolves a null
             `rear_wheel.tire_full` to the front size at source. */
          const stockFitment = fitments.find((f) => f.isStock) || fitments[0];
          if (stockFitment) {
            resolvedPair = {
              front: stockFitment.front,
              rear: stockFitment.rear,
              isStock: stockFitment.isStock,
            };
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
  }, [paginatedVehicles, loading]);

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
          <div className="flex flex-col lg:flex-row gap-4 items-stretch flex-1 min-h-0">
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
                          const remaining = parseSearchSize(rearTag);
                          void handleFetchGuide(remaining || null);
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
                        onClick={() => {
                          setRearTag("");
                          const remaining = parseSearchSize(frontTag);
                          void handleFetchGuide(remaining || null);
                        }}
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
                      ref={searchInputRef}
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
                        /* `hasSearched` deliberately STAYS true. Resetting it
                           sent the panel back to the "Search for Tyre Sizes"
                           prompt even though the default vehicle list had been
                           restored underneath — clearing a search should show
                           that list, not the pre-search state.

                           `handleFetchGuide(null)` routes to
                           `fetchKleverAllVehicles`, which is memoised for the
                           session, so restoring the list costs NO new requests;
                           it just puts the cached catalogue back into `vehicles`
                           after the search response replaced it. */
                        setCurrentPage(1);
                        void handleFetchGuide(null, false);
                        /* Re-focus the search input so the user can immediately
                           type another size without clicking. Deferred because
                           the input is conditionally rendered — it needs a tick
                           to re-appear after the tags are cleared. */
                        setTimeout(() => searchInputRef.current?.focus(), 50);
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
                      const parsed =
                        parseSearchSize(typed) || parseSearchSize(frontTag);
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
                      void handleFetchGuide(
                        parsed || parseSearchSize(nextFront),
                        true,
                      );
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

              <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex flex-col max-h-full">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Selected Size
                    </h3>
                  </div>
                  {/* {(frontTag || rearTag || searchQuery.trim()) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {filteredVehicles.length} match
                      {filteredVehicles.length !== 1 ? "es" : ""}
                    </span>
                  )} */}
                </div>

                {!hasSearched && !frontTag && !rearTag ? (
                  /* Initial state before search */
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 gap-2 p-6">
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">
                        Search for Tyre Sizes
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                        Enter a tyre size in the input box above and click{" "}
                        <span className="font-bold text-emerald-700">
                          Search
                        </span>{" "}
                        to view matching tyre sizes and vehicles.
                      </p>
                    </div>
                  </div>
                ) : !frontTag && !rearTag ? (
                  /* Search was cleared: no size filter is active, so there is
                     nothing to report as "not found" — the full catalogue is on
                     the right. Neither the amber warning nor the pre-search
                     prompt applies here. */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2.5">
                    <p className="text-xs font-extrabold text-slate-800">
                      Showing all vehicles
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                      Enter a tyre size above to narrow the list to matching
                      fitments.
                    </p>
                  </div>
                ) : !loading &&
                  filteredVehicles.length === 0 &&
                  fitmentList.length === 0 ? (
                  /* Empty search results with Warning */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-2xs">
                      <ExclamationTriangleIcon className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-extrabold text-amber-900">
                      This size is not found in list
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                      No vehicle fitments matched your searched tyre size.
                      Showing complete vehicle catalogue on the right.
                    </p>
                  </div>
                ) : (
                  /* Matching Fitment Sizes List + Separate Matching Vehicles Section Side-by-Side */
                  <div className="flex-1 min-h-0 flex flex-col pr-1">
                    {fitmentList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-4 text-center text-slate-400 gap-1.5 shrink-0">
                        <p className="text-xs font-semibold text-slate-600">
                          Fitment details loading...
                        </p>
                      </div>
                    ) : (
                      (() => {
                        const searchedFront =
                          frontTag ||
                          (fitmentList.length > 0 ? fitmentList[0].front : "");
                        const searchedRear = rearTag;
                        const searchedKey = searchedRear
                          ? `${searchedFront}|${searchedRear}`
                          : searchedFront;

                        // Deduplicate staggered combinations so each unique pair appears only once
                        const staggeredFitments = fitmentList.filter(
                          (f, idx, arr) => {
                            const isStag =
                              f.rear && f.rear !== "—" && f.rear !== f.front;
                            if (!isStag) return false;
                            const key = `${f.front}|${f.rear}`;
                            return (
                              arr.findIndex(
                                (item) => `${item.front}|${item.rear}` === key,
                              ) === idx
                            );
                          },
                        );

                        const hasVehiclesOnSide =
                          Boolean(selectedFitment) &&
                          matchingVehicles.length > 0;

                        return (
                          <div
                            className={`grid gap-4 w-full ${
                              hasVehiclesOnSide
                                ? "grid-cols-1 md:grid-cols-2"
                                : "grid-cols-1"
                            }`}
                          >
                            {/* Part 1: Selected & Suggested Sizes */}
                            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-1 w-full">
                              {searchedFront && (
                                <div className="space-y-1.5 w-full">
                                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
                                    Selected Size
                                  </div>
                                  <div className="flex flex-col gap-2 w-full">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedFitmentKey(searchedKey);
                                      }}
                                      className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center justify-start gap-2 cursor-pointer shadow-2xs ${
                                        selectedFitmentKey === searchedKey
                                          ? "bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500/20"
                                          : "bg-white border-slate-200/90 hover:bg-slate-50 hover:border-slate-300"
                                      }`}
                                    >
                                      <span className="font-extrabold text-xs font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-900">
                                        {searchedFront}
                                        {searchedRear ? " (front)" : ""}
                                      </span>
                                      {searchedRear && (
                                        <>
                                          <span className="text-slate-600 text-xs">
                                            /
                                          </span>
                                          <span className="font-extrabold text-xs font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-950">
                                            {searchedRear} (rear)
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {staggeredFitments.length > 0 && (
                                <div className="space-y-1.5 w-full">
                                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
                                    Suggested Size
                                  </div>
                                  <div className="flex flex-col gap-2.5 w-full">
                                    {staggeredFitments.map((fitment, fIdx) => {
                                      const fitmentKey = `${fitment.front}|${fitment.rear}`;
                                      const isSelected =
                                        selectedFitmentKey === fitmentKey;

                                      return (
                                        <button
                                          type="button"
                                          key={fIdx}
                                          onClick={() => {
                                            setSelectedFitmentKey(fitmentKey);
                                          }}
                                          className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center justify-start gap-2 cursor-pointer shadow-2xs ${
                                            isSelected
                                              ? "bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500/20"
                                              : "bg-white border-slate-200/90 hover:bg-slate-50 hover:border-slate-300"
                                          }`}
                                        >
                                          <span className="font-extrabold text-xs font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-900">
                                            {fitment.front} (front)
                                          </span>
                                          <span className="text-slate-600 text-xs">
                                            /
                                          </span>
                                          <span className="font-extrabold text-xs font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-950">
                                            {fitment.rear} (rear)
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Part 2: Matching Vehicles (Appears on Side when size chip clicked) */}
                            {hasVehiclesOnSide && (
                              <div className="pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-slate-500 space-y-2 flex flex-col max-h-full min-h-0 pt-3 md:pt-0">
                                <div className="grid grid-cols-1 gap-3 w-full max-h-[500px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-2 pb-1">
                                  {/* One chip per MAKE. `matchingVehicles` holds a
                                      row per model, so listing them verbatim
                                      repeated the same make (Volvo ×4,
                                      Mercedes-Benz ×4). The first row of each
                                      make is kept so the logo still resolves
                                      from its `make_slug`. */}
                                  {matchingVehicles
                                    .filter(
                                      (v, i, arr) =>
                                        arr.findIndex(
                                          (o) =>
                                            (o.make_slug || o.make_name) ===
                                            (v.make_slug || v.make_name),
                                        ) === i,
                                    )
                                    .map((v, idx) => (
                                      <div
                                        key={idx}
                                        className="relative flex flex-col items-center justify-between p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs hover:border-emerald-500 hover:ring-1 hover:ring-emerald-500/30 transition-all text-center group cursor-pointer w-full min-h-[140px]"
                                      >
                                        <div className="h-20 sm:h-22 w-full px-2 py-1 flex items-center justify-center shrink-0 flex-1">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={makeLogoUrl(
                                              v.make_slug || v.make_name,
                                            )}
                                            alt={`${v.make_name}`}
                                            className="max-h-full max-w-full w-auto h-auto object-contain p-0.5"
                                            onError={(e) => {
                                              /* One source now, so there is
                                                 nothing to fall through to —
                                                 show the truck icon. */
                                              const img = e.currentTarget;
                                              img.onerror = null;
                                              img.style.display = "none";
                                              if (img.nextElementSibling) {
                                                (
                                                  img.nextElementSibling as HTMLElement
                                                ).style.display = "block";
                                              }
                                            }}
                                          />
                                          <TruckIcon className="w-10 h-10 text-emerald-600 hidden" />
                                        </div>
                                        <span className="font-extrabold text-sm sm:text-base text-slate-800 text-center truncate w-full pt-2 shrink-0 leading-normal">
                                          {v.make_name}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
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
                  <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs flex flex-col flex-1 min-h-0">
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
                      <table className="w-full text-left border-collapse text-xs table-fixed">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200/80 z-10">
                          <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider h-9">
                            <th className="py-2 px-3 text-center w-12 bg-slate-50">
                              #
                            </th>
                            <th className="py-2 px-3.5 w-[20%] bg-slate-50">
                              Make
                            </th>
                            <th className="py-2 px-3.5 w-[20%] bg-slate-50">
                              Model
                            </th>
                            <th className="py-2 px-3.5 w-[24%] bg-slate-50">
                              Year Ranges
                            </th>
                            <th className="py-2 px-3.5 w-[18%] bg-slate-50">
                              Front Size
                            </th>
                            <th className="py-2 px-3.5 w-[18%] bg-slate-50">
                              Rear Size
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 text-slate-800">
                          {paginatedVehicles.map((v, idx) => {
                            const itemIndex = startRecord + idx;
                            const rowKey =
                              `${v.make_slug || v.make_name}|${v.model_slug || v.model_name}`.toLowerCase();
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

                            const yearRanges = formatYearRanges(v.year_ranges);

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
                                    <div className="w-8 h-6 rounded-md bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0 overflow-hidden p-0.5 group-hover:bg-white transition-colors">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={`https://cdn.imagin.studio/getImage?customer=img&make=${(
                                          v.make_slug ||
                                          v.make_name ||
                                          ""
                                        )
                                          .toLowerCase()
                                          .trim()}&modelFamily=${(
                                          v.model_slug ||
                                          v.model_name ||
                                          ""
                                        )
                                          .toLowerCase()
                                          .split(" ")[0]
                                          .replace(
                                            /[^a-z0-9]/g,
                                            "",
                                          )}&zoomType=fullscreen&angle=01`}
                                        alt={`${v.make_name} ${v.model_name}`}
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                          e.currentTarget.onerror = null;
                                          e.currentTarget.style.display =
                                            "none";
                                          if (
                                            e.currentTarget.nextElementSibling
                                          ) {
                                            (
                                              e.currentTarget
                                                .nextElementSibling as HTMLElement
                                            ).style.display = "block";
                                          }
                                        }}
                                      />
                                      <TruckIcon className="w-3.5 h-3.5 text-emerald-600 hidden" />
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
                                    <Skeleton className="inline-block w-16 h-4 rounded align-middle" />
                                  ) : (
                                    <span className="text-slate-400 font-normal">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3.5 font-bold text-slate-900">
                                  {rearRaw && rearRaw !== "—" ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs">
                                      {rearRaw}
                                    </span>
                                  ) : isResolving ? (
                                    <Skeleton className="inline-block w-16 h-4 rounded align-middle" />
                                  ) : (
                                    <span className="text-slate-400 font-normal">
                                      —
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
              ) : (
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
              )}
            </div>
          </div>

          {/* Fixed Bottom Pagination Footer - Always visible to prevent layout shift */}
          <div className="pt-2 border-t border-slate-200/90 bg-white shrink-0 sticky bottom-0 z-20">
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
