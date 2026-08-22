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
  fetchKleverVehicleCatalogueAll,
  fetchUrlTemplates,
} from "../services/graphql";
import type {
  KleverVehicleCatalogueItem,
  UrlTemplateItem,
} from "../services/types";
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
 * Case-insensitive, separators-only stripped: "215/55 R17" / "215/55R17" →
 * "21555r17". Strips ONLY formatting characters (`/`, `-`, spaces) — NOT
 * letters — so the tyre's construction code (`R`, `ZR`, ...) survives the
 * normalization. Stripping letters too (as this used to) made "245/35 R19"
 * and "245/35ZR19" normalize to the identical "2453519", so a plain-R19
 * search matched a ZR19-only tyre and vice versa; keeping the construction
 * letters distinguishes them while still treating "195-15-R15" / "195/15 R15"
 * / "19515R15" as equivalent, since those differ only by separator.
 */
function normalizeTyreSize(value: string): string {
  return value.toLowerCase().replace(/[\s/-]/g, "");
}

/**
 * `front_size`/`rear_size` from `kleverVehicleCatalogueQuery` are COMMA-JOINED
 * lists ("205/40R18, 205/45R17"), not a single value — a model can have
 * several factory tyre options across trims/years. Splitting before matching
 * (rather than normalizing the whole joined string in one shot) avoids a
 * digit-substring query spuriously matching across the boundary between two
 * adjacent sizes.
 */
function splitSizeValues(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Does ANY individual size in a (possibly multi-value) size field match a
 * query? `norm` compares via `normalizeTyreSize` (separators stripped,
 * construction letters like R/ZR preserved), `raw` is a case-insensitive
 * substring check for free text that doesn't parse as a size.
 *
 * A query with NO letters at all (e.g. "2054018") has no construction code to
 * be wrong about, so it ALSO matches by a plain digits-only comparison — this
 * restores "195/15 R15" / "19515R15" / "1951515"-style equivalence for a
 * bare numeric query without reopening the R-vs-ZR bug: a query that DOES
 * include a letter ("R19", "ZR19") never takes this branch, since
 * `normIsPureDigits` is false for it, so it still only matches that exact
 * construction code.
 */
function sizeFieldMatches(
  sizeField: string | null | undefined,
  norm: string,
  raw: string,
): boolean {
  if (!norm && !raw) return false;
  const values = splitSizeValues(sizeField);
  if (!values.length) return false;
  const normIsPureDigits = norm !== "" && !/[a-z]/i.test(norm);
  return values.some((val) => {
    if (norm && normalizeTyreSize(val).includes(norm)) return true;
    if (normIsPureDigits && val.replace(/[^0-9]/g, "").includes(norm))
      return true;
    if (raw && val.toLowerCase().includes(raw.toLowerCase())) return true;
    return false;
  });
}

/**
 * Display-only spacing fix: "205/40R18" → "205/40 R18", "245/35ZR19" →
 * "245/35 ZR19". Never touches the underlying API value — this only runs at
 * render time on a value already read out of `front_size`/`rear_size`.
 */
function formatSizeDisplay(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.replace(/^(\d+\/\d+)\s*([A-Z]{0,2}R\d+.*)$/i, "$1 $2");
}

interface FitmentPair {
  front: string;
  rear: string;
  isStaggered: boolean;
}

/**
 * Extracts individual (front, rear) size pairs from a vehicle record.
 * Handles single sizes, comma-separated lists, square fitments, and staggered fitments.
 * Never leaves multiple comma-separated sizes grouped in a single pair.
 */
function extractVehicleFitmentPairs(
  v: KleverVehicleCatalogueItem,
): FitmentPair[] {
  const frontList = splitSizeValues(v.front_size);
  const rearList = splitSizeValues(v.rear_size);

  if (frontList.length === 0 && rearList.length === 0) return [];
  if (frontList.length === 0) {
    return rearList.map((r) => ({ front: r, rear: r, isStaggered: false }));
  }
  if (rearList.length === 0) {
    return frontList.map((f) => ({ front: f, rear: f, isStaggered: false }));
  }

  // 1 front size, multiple rear staggered options (e.g. Acura NSX)
  if (frontList.length === 1 && rearList.length > 1) {
    return rearList.map((r) => ({
      front: frontList[0],
      rear: r,
      isStaggered: frontList[0].toLowerCase() !== r.toLowerCase(),
    }));
  }

  // 1-to-1 mapping for each front size with corresponding rear size
  return frontList.map((f, i) => {
    const r = rearList[i] || rearList[0] || f;
    return {
      front: f,
      rear: r,
      isStaggered: f.toLowerCase() !== r.toLowerCase(),
    };
  });
}

/**
 * Does this individual (front, rear) fitment pair match a searched
 * front/rear tag? Mirrors the matching predicate the tag-matching memo uses
 * (same digit-normalized substring rule, same front/rear-swap tolerance) —
 * kept as its own function purely so the per-row "which exact size matched"
 * lookup below can reuse it without duplicating the memo's inline logic.
 */
function pairMatchesQuery(pair: FitmentPair, fNorm: string, rNorm: string) {
  const pFNorm = normalizeTyreSize(pair.front);
  const pRNorm = normalizeTyreSize(pair.rear);
  if (fNorm && rNorm) {
    return (
      (pFNorm.includes(fNorm) && pRNorm.includes(rNorm)) ||
      (pFNorm.includes(rNorm) && pRNorm.includes(fNorm))
    );
  }
  if (fNorm) return pFNorm.includes(fNorm) || pRNorm.includes(fNorm);
  if (rNorm) return pRNorm.includes(rNorm) || pFNorm.includes(rNorm);
  return false;
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

/**
 * The links shown inside a "View Tyres for …" popup.
 *
 * Every URL comes from `urlTemplates.resolved_url` — the backend owns the host
 * and query shape, so nothing is constructed here and the same code works
 * against QA and production. The raw `url_template` is deliberately never
 * rendered.
 *
 * The backend OMITS templates whose variables were not supplied, so a square
 * fitment normally returns TyresCart alone and a staggered one returns
 * TyresCart plus Tire.ae. `missing_variables` is not used to decide
 * availability — the returned items are the availability.
 */
function UrlTemplateLinks({
  front,
  rear,
  onNavigate,
}: {
  front: string;
  rear?: string;
  onNavigate?: () => void;
}) {
  const [items, setItems] = useState<UrlTemplateItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const f = parseSearchSize(front);
    let alive = true;
    if (!f) {
      /* Deferred rather than set synchronously: a setState in the effect body
         runs during commit and triggers a cascading render. */
      queueMicrotask(() => {
        if (alive) setItems([]);
      });
      return () => {
        alive = false;
      };
    }
    const values = [
      { code: "width", value: String(f.width) },
      { code: "height", value: String(f.height) },
      { code: "rim", value: String(f.rim) },
    ];
    /* Rear variables only for a genuine staggered fitment — sending them for a
       square one would resolve templates that do not apply. */
    const r =
      rear && rear !== "—" && rear !== front ? parseSearchSize(rear) : null;
    if (r) {
      values.push(
        { code: "rwidth", value: String(r.width) },
        { code: "rheight", value: String(r.height) },
        { code: "rrim", value: String(r.rim) },
      );
    }

    /* `failed` is cleared on success rather than up-front: a setState in the
       effect body runs during commit and cascades a render. */
    fetchUrlTemplates(values)
      .then((list) => {
        if (alive) {
          setItems(list);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) {
          setItems([]);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [front, rear]);

  if (items === null) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <p className="px-1 py-1.5 text-[11px] font-semibold text-slate-500">
        {failed
          ? "Could not load tyre links. Please try again."
          : "No tyre links configured for this size."}
      </p>
    );
  }

  // Deduplicate items by name/label + resolved_url so identical links are never rendered twice
  const seenKeys = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = `${String(item?.name ?? "").trim()}|${String(item?.resolved_url ?? "").trim()}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  return (
    <>
      {uniqueItems.map((item, i) => {
        const url = String(item?.resolved_url ?? "").trim();
        const label = String(item?.name ?? "").trim() || "Tyres";
        /* An item without a resolved URL is shown but not clickable, rather
           than silently dropped — the template exists, it just cannot resolve. */
        if (!url) {
          return (
            <span
              key={i}
              aria-disabled="true"
              title="No link available for this size"
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 font-bold cursor-not-allowed"
            >
              <span>{label}</span>
            </span>
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
            className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 font-bold transition-all cursor-pointer group"
          >
            <span className="underline decoration-emerald-400 decoration-2">
              {label}
            </span>
            <span className="text-xs font-extrabold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
              ➔
            </span>
          </a>
        );
      })}
    </>
  );
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
  /** Separate state for the header bar ("Make, model or size…") so it does
   *  NOT bleed into the left-panel tyre-size input. */
  const [headerQuery, setHeaderQuery] = useState("");
  const [frontTag, setFrontTag] = useState("");
  const [rearTag, setRearTag] = useState("");

  /**
   * The fitment chip the user has highlighted, as `front|rear`.
   *
   * SELECTION ONLY — it deliberately does not touch `frontTag`/`rearTag`.
   * Clicking a chip used to also set those tags directly, which re-ran the
   * tag-matching memo against a single size and collapsed the table to just
   * that combination. The search result is the source of truth; a chip click
   * only marks which combination is being looked at.
   */
  const [selectedFitmentKey, setSelectedFitmentKey] = useState<string | null>(
    null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  /* Data & Loading states */
  const [vehicles, setVehicles] = useState<KleverVehicleCatalogueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [expandedMake, setExpandedMake] = useState<string | null>(null);

  /* Slide-up animation states */
  const [isAnimatedOpen, setIsAnimatedOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  /** Ref tracking the current fetch request ID to ignore stale out-of-order responses */
  const fetchRequestIdRef = useRef<number>(0);

  /**
   * Load the whole vehicle catalogue (make/model/year/front_size/rear_size)
   * via `fetchKleverVehicleCatalogueAll`, paginated at the server's 1000-row
   * cap.
   *
   * This replaces the old dual-mode flow (`fetchKleverVehicleSearchGraphQL`
   * for an exact size + `fetchKleverAllVehicles`'s 114-request make/model walk
   * as a fallback, plus a per-row `fetchKleverVehicleFitments` resolver for
   * whichever rows were on screen). The new API returns sizes for every
   * vehicle up front, so there is nothing left to search for server-side —
   * `vehicles` is loaded ONCE and every filter (tag-based or free-text) below
   * runs entirely client-side against it.
   */
  const loadCatalogue = async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchKleverVehicleCatalogueAll();
      if (requestId !== fetchRequestIdRef.current) return;
      setVehicles(data);
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      console.error("[TyresGuideModal] Vehicle catalogue load error:", err);
      setError("Failed to load vehicle fitment guide. Please try again.");
      setVehicles([]);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const resetFormState = () => {
    setSearchQuery("");
    setHeaderQuery("");
    setFrontTag("");
    setRearTag("");
    setSelectedFitmentKey(null);
    setExpandedMake(null);
    setCurrentPage(1);
    setError(null);
    setHasSearched(false);
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
      // The catalogue loads once and is never replaced afterwards — a search
      // is a client-side filter, not a new fetch — so this only fires when
      // nothing has been loaded yet (first open; the module-level cache in
      // `fetchKleverVehicleCatalogueAll` makes a re-open free either way).
      if (vehicles.length === 0 && !loading) {
        void loadCatalogue();
      }
    } else {
      raf1 = requestAnimationFrame(() => {
        setIsAnimatedOpen(false);
      });
      resetFormState();
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
      resetFormState();
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
  }, [searchQuery, headerQuery, frontTag, rearTag, pageSize]);

  const { filteredVehicles, fitmentList } = useMemo(() => {
    // Only search on committed tags (frontTag & rearTag) to disable live auto-search while typing
    const fTagRaw = frontTag.trim();
    const rTagRaw = rearTag.trim();

    const fNorm = fTagRaw ? normalizeTyreSize(fTagRaw) : "";
    const rNorm = rTagRaw ? normalizeTyreSize(rTagRaw) : "";

    if (!fNorm && !rNorm) {
      return {
        filteredVehicles: [] as KleverVehicleCatalogueItem[],
        fitmentList: [],
      };
    }

    const exactMatches: KleverVehicleCatalogueItem[] = [];
    const fitmentMap = new Map<
      string,
      {
        front: string;
        rear: string;
        count: number;
        isStock: boolean;
        vehicles: KleverVehicleCatalogueItem[];
      }
    >();

    vehicles.forEach((v) => {
      const pairs = extractVehicleFitmentPairs(v);
      let matchedVehicle = false;

      pairs.forEach((pair) => {
        const pFNorm = normalizeTyreSize(pair.front);
        const pRNorm = normalizeTyreSize(pair.rear);

        let matches = false;
        if (fNorm && rNorm) {
          matches =
            (pFNorm.includes(fNorm) && pRNorm.includes(rNorm)) ||
            (pFNorm.includes(rNorm) && pRNorm.includes(fNorm));
        } else if (fNorm) {
          matches = pFNorm.includes(fNorm) || pRNorm.includes(fNorm);
        } else if (rNorm) {
          matches = pRNorm.includes(rNorm) || pFNorm.includes(rNorm);
        }

        if (matches) {
          matchedVehicle = true;
          const key = `${pair.front}|${pair.rear}`;
          const existing = fitmentMap.get(key) || {
            front: pair.front,
            rear: pair.rear,
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

      if (matchedVehicle) {
        exactMatches.push(v);
      }
    });

    const fitmentList = Array.from(fitmentMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      filteredVehicles: exactMatches,
      fitmentList,
    };
  }, [vehicles, frontTag, rearTag]);

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

    const merged: KleverVehicleCatalogueItem[] = [];
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

  const tableVehicles = useMemo<KleverVehicleCatalogueItem[]>(() => {
    const fallback = vehicles;

    if (selectedFitmentKey && selectedFitment) {
      return selectedFitment.vehicles;
    }

    if (frontTag || rearTag) {
      return filteredVehicles.length > 0 ? filteredVehicles : fallback;
    }

    /* headerQuery filters the right-panel table by make / model / size. */
    if (headerQuery.trim()) {
      const q = headerQuery.trim().toLowerCase();
      const qDigitsRaw = normalizeTyreSize(q);
      const qDigits = qDigitsRaw.length >= 3 ? qDigitsRaw : "";
      const matches = fallback.filter((v) => {
        const make = (v.make_name || "").toLowerCase();
        const model = (v.model_name || "").toLowerCase();
        return (
          make.includes(q) ||
          model.includes(q) ||
          sizeFieldMatches(v.front_size, qDigits, q) ||
          sizeFieldMatches(v.rear_size, qDigits, q)
        );
      });
      return matches.length > 0 ? matches : fallback;
    }
    return fallback;
  }, [
    filteredVehicles,
    vehicles,
    frontTag,
    rearTag,
    headerQuery,
    selectedFitmentKey,
    selectedFitment,
  ]);

  /* Pagination slices */
  const totalItems = tableVehicles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedVehicles = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return tableVehicles.slice(startIdx, startIdx + pageSize);
  }, [tableVehicles, validCurrentPage, pageSize]);

  /**
   * Front/rear sizes now come straight from `fetchKleverVehicleCatalogueAll`
   * on every row — the per-vehicle/year size resolution that used to run here
   * (`fetchKleverVehicleFitments`, fanning out over years/modifications for
   * whichever rows were paginated into view) is gone; there is nothing left
   * to resolve.
   */
  /** The size input, focused when the modal opens so typing works immediately. */
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

          <div className="flex-1 min-w-0 max-w-[240px] sm:max-w-xs">
            <div className="flex items-center gap-1.5 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                autoComplete="off"
                placeholder="Make, model or size…"
                value={headerQuery}
                onChange={(e) => setHeaderQuery(e.target.value)}
                aria-label="Filter the list by make, model, or front/rear tyre size"
                className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400 placeholder:font-medium"
              />
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
                onClick={() => void loadCatalogue()}
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
                          // The whole catalogue is already loaded — committing
                          // a tag only sets state; the tag-matching memo does
                          // the (client-side) filtering. No fetch here.
                          if (!frontTag) {
                            setFrontTag(tagVal);
                            setSearchQuery("");
                            setHasSearched(true);
                          } else if (!rearTag) {
                            setRearTag(tagVal);
                            setSearchQuery("");
                            setHasSearched(true);
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

                           `vehicles` is never replaced by a search anymore —
                           it is the whole catalogue, loaded once — so clearing
                           the tags/query is enough for the table to fall back
                           to it; no fetch needed. */
                        setCurrentPage(1);
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
                      const parsed =
                        parseSearchSize(typed) || parseSearchSize(frontTag);
                      if (typed) {
                        const tagVal = parsed
                          ? `${parsed.width}/${parsed.height} R${parsed.rim}`
                          : typed;
                        if (!frontTag) {
                          setFrontTag(tagVal);
                          setSearchQuery("");
                        } else if (!rearTag) {
                          setRearTag(tagVal);
                          setSearchQuery("");
                        }
                      }
                      // Committing a tag only sets state — the whole catalogue
                      // is already loaded, so this is a client-side filter,
                      // never an independent search/fetch.
                      setHasSearched(true);
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

                {!hasSearched &&
                !frontTag &&
                !rearTag &&
                !searchQuery.trim() ? (
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
                  /* Non-parseable input (partial width like "195") or
                     full size with no matches — show appropriate message */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-2xs">
                      <ExclamationTriangleIcon className="w-5 h-5" />
                    </div>
                    {!parseSearchSize(frontTag) && !parseSearchSize(rearTag) ? (
                      /* Partial / non-parseable size like "195" */
                      <>
                        <p className="text-xs font-extrabold text-amber-900">
                          Please enter full tyre size
                        </p>
                        <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                          Enter the complete size including width, height and
                          rim &mdash; e.g.{" "}
                          <span className="font-bold text-emerald-700">
                            {frontTag || rearTag}/65 R15
                          </span>
                        </p>
                      </>
                    ) : (
                      /* Full size but no matches */
                      <>
                        <p className="text-xs font-extrabold text-amber-900">
                          This size is not found in list
                        </p>
                        <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                          No vehicle fitments matched your searched tyre size.
                          Showing complete vehicle catalogue on the right.
                        </p>
                      </>
                    )}
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

                        // Deduplicate staggered combinations so each unique pair appears only once,
                        // and exclude searchedKey so it isn't rendered twice (under Selected Size AND Suggested Size)
                        const staggeredFitments = fitmentList.filter(
                          (f, idx, arr) => {
                            const isStag =
                              f.rear && f.rear !== "—" && f.rear !== f.front;
                            if (!isStag) return false;
                            const key = `${f.front}|${f.rear}`;
                            if (key === searchedKey) return false;
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
                                    <div className="relative w-full">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedFitmentKey(
                                            selectedFitmentKey === searchedKey
                                              ? null
                                              : searchedKey,
                                          );
                                        }}
                                        className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center justify-start gap-2 cursor-pointer shadow-2xs ${
                                          selectedFitmentKey === searchedKey
                                            ? "bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500/20"
                                            : "bg-white border-slate-200/90 hover:bg-slate-50 hover:border-slate-300"
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
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
                                        </div>
                                      </button>

                                      {selectedFitmentKey === searchedKey && (
                                        <div className="absolute top-full left-0 mt-2 z-40 w-72 sm:w-80 bg-white border-2 border-emerald-500 rounded-xl p-3 shadow-xl space-y-2 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150">
                                          <div className="absolute -top-2 left-8 w-3.5 h-3.5 bg-white border-t-2 border-l-2 border-emerald-500 rotate-45" />
                                          <UrlTemplateLinks
                                            front={searchedFront}
                                            rear={searchedRear}
                                            onNavigate={onClose}
                                          />
                                        </div>
                                      )}
                                    </div>
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
                                        <div
                                          key={fIdx}
                                          className="relative w-full"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedFitmentKey(
                                                isSelected ? null : fitmentKey,
                                              );
                                            }}
                                            className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center justify-start gap-2 cursor-pointer shadow-2xs ${
                                              isSelected
                                                ? "bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500/20"
                                                : "bg-white border-slate-200/90 hover:bg-slate-50 hover:border-slate-300"
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="font-extrabold text-xs font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-900">
                                                {fitment.front} (front)
                                              </span>
                                              <span className="text-slate-600 text-xs">
                                                /
                                              </span>
                                              <span className="font-extrabold text-xs font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-950">
                                                {fitment.rear} (rear)
                                              </span>
                                            </div>
                                          </button>

                                          {isSelected && (
                                            <div className="absolute top-full left-0 mt-2 z-40 w-72 sm:w-80 bg-white border-2 border-emerald-500 rounded-xl p-3 shadow-xl space-y-2 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150">
                                              <div className="absolute -top-2 left-8 w-3.5 h-3.5 bg-white border-t-2 border-l-2 border-emerald-500 rotate-45" />
                                              <UrlTemplateLinks
                                                front={fitment.front}
                                                rear={fitment.rear}
                                                onNavigate={onClose}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Part 2: Matching Vehicles */}
                            {hasVehiclesOnSide && (
                              <div className="pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-slate-500 space-y-2 flex flex-col max-h-full min-h-0 pt-3 md:pt-0">
                                <div
                                  onScroll={() => {
                                    if (expandedMake) setExpandedMake(null);
                                  }}
                                  className="grid grid-cols-3 gap-2.5 w-full max-h-[450px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-1 pt-2 pb-48 relative"
                                >
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
                                    .map((v, idx) => {
                                      const makeKey = (
                                        v.make_slug ||
                                        v.make_name ||
                                        ""
                                      ).toLowerCase();
                                      const isExpanded =
                                        expandedMake === makeKey;
                                      const makeModels =
                                        matchingVehicles.filter(
                                          (m) =>
                                            (
                                              m.make_slug ||
                                              m.make_name ||
                                              ""
                                            ).toLowerCase() === makeKey,
                                        );
                                      const isSingleModel =
                                        makeModels.length === 1;
                                      const openUpward = idx >= 6;

                                      return (
                                        <div
                                          key={idx}
                                          className="relative w-full"
                                        >
                                          <div
                                            onClick={() =>
                                              setExpandedMake(
                                                isExpanded ? null : makeKey,
                                              )
                                            }
                                            className={`relative flex flex-col items-center justify-between p-2.5 rounded-xl border transition-all text-center group cursor-pointer w-full h-28 ${
                                              isExpanded
                                                ? "bg-emerald-50/90 border-2 border-emerald-500 ring-2 ring-emerald-500/40 shadow-md z-20"
                                                : "bg-white border-slate-200/90 hover:border-emerald-500 hover:ring-1 hover:ring-emerald-500/30 shadow-2xs"
                                            }`}
                                          >
                                            <div className="h-14 w-full flex items-center justify-center shrink-0 flex-1">
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img
                                                src={makeLogoUrl(
                                                  v.make_slug || v.make_name,
                                                )}
                                                alt={`${v.make_name}`}
                                                className="max-h-full max-w-full w-auto h-auto object-contain p-0.5"
                                                onError={(e) => {
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
                                              <TruckIcon className="w-7 h-7 text-emerald-600 hidden" />
                                            </div>
                                            <span className="font-extrabold text-[11px] sm:text-xs text-slate-800 text-center truncate w-full pt-1 shrink-0 leading-normal">
                                              {v.make_name}
                                            </span>
                                          </div>

                                          {isExpanded && (
                                            <div
                                              className={`absolute z-40 ${openUpward ? "bottom-full mb-2" : "top-full mt-2"} ${isSingleModel ? "w-48 sm:w-56" : "w-72 sm:w-80"} bg-white border-2 border-emerald-500 rounded-xl p-3 shadow-xl space-y-2 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150 ${
                                                idx % 3 === 0
                                                  ? "left-0"
                                                  : idx % 3 === 1
                                                    ? "left-1/2 -translate-x-1/2"
                                                    : "right-0"
                                              }`}
                                            >
                                              {/* Upward/Downward pointing arrow visually connecting details to the clicked logo card */}
                                              <div
                                                className={`absolute w-3.5 h-3.5 bg-white border-emerald-500 rotate-45 ${
                                                  openUpward
                                                    ? "-bottom-2 border-b-2 border-r-2"
                                                    : "-top-2 border-t-2 border-l-2"
                                                } ${
                                                  idx % 3 === 0
                                                    ? "left-8"
                                                    : idx % 3 === 1
                                                      ? "left-1/2 -translate-x-1/2"
                                                      : "right-8"
                                                }`}
                                              />

                                              <div
                                                className={`grid ${
                                                  isSingleModel
                                                    ? "grid-cols-1"
                                                    : "grid-cols-2"
                                                } gap-1.5 max-h-56 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-0.5`}
                                              >
                                                {makeModels.map((m, mIdx) => {
                                                  const isLastOdd =
                                                    !isSingleModel &&
                                                    makeModels.length % 2 !==
                                                      0 &&
                                                    mIdx ===
                                                      makeModels.length - 1;
                                                  const yearStr =
                                                    formatYearRanges(
                                                      m.year_ranges,
                                                    );
                                                  return (
                                                    <div
                                                      key={mIdx}
                                                      className={`flex flex-col items-center justify-center text-center bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-200/80 hover:bg-emerald-50/60 hover:border-emerald-300 transition-all ${
                                                        isLastOdd
                                                          ? "col-span-2"
                                                          : ""
                                                      }`}
                                                    >
                                                      <span className="font-bold text-slate-800 text-xs leading-snug break-words text-center w-full">
                                                        {m.model_name}
                                                      </span>
                                                      {yearStr && (
                                                        <span className="text-[10px] font-semibold text-emerald-700/90 leading-tight pt-0.5 whitespace-nowrap text-center">
                                                          {yearStr}
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
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
                            const yearRanges = formatYearRanges(v.year_ranges);

                            const fNorm = frontTag
                              ? normalizeTyreSize(frontTag)
                              : "";
                            const rNorm = rearTag
                              ? normalizeTyreSize(rearTag)
                              : "";

                            // Exactly one Front/Rear value per row, in priority order:
                            let displayFront = "";
                            let displayRear = "";

                            // 1) A selected fitment/related-size chip wins outright —
                            //    show exactly that pair.
                            if (selectedFitmentKey) {
                              const exact = fitmentList.find(
                                (f) =>
                                  `${f.front}|${f.rear}` === selectedFitmentKey,
                              );
                              if (exact) {
                                displayFront = exact.front;
                                displayRear = exact.rear;
                              }
                            }

                            // 2) Otherwise, a specific size search (the Front/Rear
                            //    tag input) shows the exact pair that matched
                            //    THIS vehicle — not the catalogue's
                            //    first/primary size.
                            if (
                              !displayFront &&
                              !displayRear &&
                              (fNorm || rNorm)
                            ) {
                              const matched = extractVehicleFitmentPairs(
                                v,
                              ).find((p) => pairMatchesQuery(p, fNorm, rNorm));
                              if (matched) {
                                displayFront = matched.front;
                                displayRear = matched.rear;
                              }
                            }

                            // 2b) A size-shaped header search (e.g. "245/35 R19")
                            //     narrows the table the same way — show the exact
                            //     pair that matched here too, not the default.
                            if (
                              !displayFront &&
                              !displayRear &&
                              headerQuery.trim()
                            ) {
                              const hqRaw = headerQuery.trim();
                              const hqDigits = normalizeTyreSize(hqRaw);
                              const hqNorm =
                                hqDigits.length >= 3 ? hqDigits : "";
                              if (hqNorm || hqRaw) {
                                const matched = extractVehicleFitmentPairs(
                                  v,
                                ).find(
                                  (p) =>
                                    sizeFieldMatches(p.front, hqNorm, hqRaw) ||
                                    sizeFieldMatches(p.rear, hqNorm, hqRaw),
                                );
                                if (matched) {
                                  displayFront = matched.front;
                                  displayRear = matched.rear;
                                }
                              }
                            }

                            // 3) Default catalogue view: only the first/primary
                            //    size from each (possibly comma-joined) field.
                            if (!displayFront) {
                              displayFront =
                                splitSizeValues(v.front_size)[0] || "";
                            }
                            if (!displayRear) {
                              displayRear =
                                splitSizeValues(v.rear_size)[0] || "";
                            }

                            return (
                              <tr
                                key={idx}
                                className="hover:bg-emerald-50/50 transition-colors group h-9"
                              >
                                <td className="py-2 px-3 text-center font-bold text-slate-400 group-hover:text-emerald-600">
                                  {itemIndex}
                                </td>
                                <td className="py-2 px-3.5">
                                  <span className="font-extrabold text-slate-900 text-xs sm:text-xs">
                                    {v.make_name}
                                  </span>
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
                                  {displayFront ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono font-bold">
                                      {formatSizeDisplay(displayFront)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-normal">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3.5 font-bold text-slate-900">
                                  {displayRear ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono font-bold">
                                      {formatSizeDisplay(displayRear)}
                                    </span>
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
