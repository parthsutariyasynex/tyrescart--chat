/* ─────────────────────────────────────────────────────────────
   Search / filter BUSINESS LOGIC — database-agnostic utility.

   A pure, client-side implementation of the *rules* for search,
   filtering, sorting and pagination. Contains NO database/query
   syntax, NO MongoDB/Mongoose, NO API-route code. It operates on a
   plain in-memory array of product records (e.g. the full list
   already cached in IndexedDB), so once the data is cached NO
   further API/GraphQL request is needed for search, filter, sort
   or pagination.

   Field names are aligned with the real product shape
   (see `SupplierProductItem` in ./types).

   ── SEARCH SEMANTICS (the contract this module honors) ──
   • Tokenize the free-text search on commas/whitespace.
   • AND between tokens  — every token must match.
   • OR  between fields  — a token matches if it appears in ANY
     of SEARCHABLE_FIELDS.
   • Matching is PARTIAL / substring, case-insensitive
     (intentional free-text behavior — do NOT make it exact).
   • A 4-digit token is additionally treated as a `year` match.
   • Tyre-size matching is normalization-based, not format-based: a
     size-only query is reduced to its digits before matching, so
     "205/55R16", "205/55 R16", "20555R16", "20555 R16" and "2055516"
     all normalize to "2055516" and return identical results
     (see isSizeOnlyQuery + sizeMatches).
───────────────────────────────────────────────────────────── */

/* ─── Product shape (structural, not a hard dependency) ─────────
   Kept intentionally loose so this module stays database-agnostic
   and reusable. Any non-null object works — including typed interfaces
   like SupplierProductItem / ProductItem that have no index signature. */
export type ProductRecord = object;

/** Read an arbitrary field off any object (fields are validated elsewhere). */
function getField(product: ProductRecord, field: string): unknown {
  return (product as Record<string, unknown>)[field];
}

/* ─── Searchable field list ────────────────────────────────── */

/**
 * Fields a free-text search token is compared against (OR across these).
 * Every entry must exist on the product shape (see SupplierProductItem).
 */
export const SEARCHABLE_FIELDS = [
  "product_name",
  "sku",
  "brand",
  "brand_category",
  "country",
  "size",
] as const;

export type SearchableField = (typeof SEARCHABLE_FIELDS)[number];

/** Tri-state "latest" flag: true = latest only, false = non-latest only, undefined = no filter. */
export type LatestFlag = boolean | undefined;

/* ─── Search tokenization & token rules ────────────────────── */

/** Split a free-text query clause into trimmed, non-empty tokens (whitespace separated). */
export function tokenize(search: string): string[] {
  return search
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True if the token is exactly four digits (treated as a year). */
export function isYearToken(token: string): boolean {
  return /^\d{4}$/.test(token);
}

/** Strip everything except digits (numeric token detection). */
export function toNumericOnly(value: string): string {
  return value.replace(/\D/g, "");
}


/**
 * Normalization-based tyre-size match — format-agnostic, but ANCHORED so a
 * short query like "195" means "195-width", not "contains 195 anywhere".
 *
 * Both query and candidate are reduced to digit sequences, then it matches when
 * the query is EITHER:
 *   • a prefix of the full size digits — width-anchored, so "195" → 195/…,
 *     "2055" → 205/5…, and "2055516" → exactly 205/55 R16; or
 *   • equal to a whole size component — so "16" matches the R16 diameter,
 *     "55" the aspect ratio.
 * It deliberately does NOT match a substring in the MIDDLE of the sequence
 * (that is what let "195" leak into 255/35 R21 etc.). Callers pass only the
 * structured size fields here, never name/sku.
 *
 * Every spelling of a full size still collapses identically:
 * "205/55R16", "205/55 R16", "20555R16", "20555 R16", "2055516" → "2055516".
 */
export function sizeMatches(query: string, sizeText: string): boolean {
  const q = toNumericOnly(query);
  if (!q) return false;
  const groups = sizeText.match(/\d+/g); // "205/55R16" → ["205","55","16"]
  if (!groups || groups.length === 0) return false;
  return groups.join("").startsWith(q) || groups.includes(q);
}

/* ─── Rim-only queries ─────────────────────────────────────── */

/**
 * Parse a RIM-ONLY query — "R17", "ZR17", "r 17", "R-17" → "17".
 * Returns null for anything else (a bare "17", a full size, text).
 *
 * This has to be detected BEFORE the size normalization, which strips
 * everything non-digit and would reduce "R17" to "17". That collapse is what
 * made a deliberate rim query behave like a width prefix: "17" is a prefix of
 * "1756515", so every 175-width tyre matched. Typing the R is the user stating
 * which component they mean, so it must survive.
 */
export function parseRimOnly(query: string): string | null {
  const m = query.trim().match(/^[Zz]?[Rr]\s*[-/]?\s*(\d{2,3})$/);
  return m ? m[1] : null;
}

/** The rim component of a size string: the number after R/ZR, else the last group. */
function rimOf(sizeText: string): string | null {
  const withR = sizeText.match(/[Zz]?[Rr]\s*(\d{2,3})/);
  if (withR) return withR[1];
  const groups = sizeText.match(/\d+/g);
  return groups && groups.length ? groups[groups.length - 1] : null;
}

/** True when any size field's RIM equals `rim` — never a width or aspect. */
export function matchesRim(
  product: ProductRecord,
  rim: string,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): boolean {
  return sizeFields.some((f) => rimOf(fieldAsString(product, f)) === rim);
}

/**
 * True when the ENTIRE search string is a single tyre-size expression — only
 * digits and size punctuation/letters (/, \, ., -, space, R, Z, C, X). Such a
 * query is normalized to its digits BEFORE tokenizing (see matchesSearch), so a
 * size that contains a space ("20555 R16") is treated as ONE token rather than
 * being split — guaranteeing every spelling of a size returns identical results.
 */
export function isSizeOnlyQuery(search: string): boolean {
  const s = search.trim();
  if (!/\d/.test(s)) return false; // must contain at least one digit
  return /^[\d\s/\\.\-rzcxRZCX]+$/.test(s);
}

/* ─── Latest flag handling ─────────────────────────────────── */

/** Interpret the raw "latest" param as a tri-state flag. */
export function parseLatest(latestParam: string | null): LatestFlag {
  if (latestParam === "1") return true;
  if (latestParam === "0") return false;
  return undefined;
}

/* ─── Field access helpers ─────────────────────────────────── */

/** Read a field as a string (empty string for null/undefined). */
function fieldAsString(product: ProductRecord, field: string): string {
  const v = getField(product, field);
  return v === null || v === undefined ? "" : String(v);
}

/* ─── Search matching (the actual runtime filter) ──────────── */

/** Structured size fields a numeric token is matched against (never name/sku). */
export const DEFAULT_SIZE_FIELDS = ["size", "plain_size"] as const;

/**
 * A "size token" is all digits + size punctuation/letters (/, \, ., -, R, Z,
 * C, X) — e.g. "195", "2055516", "R16", "205/55R16". Such a token is matched
 * ONLY against the size fields (never name/sku), so "195" can't leak in via a
 * SKU like "TCKL-19523". A token containing other letters (e.g. "ep150",
 * "michelin") is a text token, matched as a substring across all fields.
 */
function isSizeToken(token: string): boolean {
  return /\d/.test(token) && /^[\d/\\.\-rzcxRZCX]+$/.test(token);
}

/**
 * Does a SINGLE token match this product?
 *  • Size token  → matched against `sizeFields` only (width-anchored / whole
 *    component; see sizeMatches), plus an exact `year` match for a 4-digit one.
 *  • Text token  → OR across `fields` (case-insensitive substring).
 * `fields`/`sizeFields` default to the supplier shape but are overridable so
 * the module stays database- AND schema-agnostic.
 */
export function matchesToken(
  product: ProductRecord,
  token: string,
  fields: readonly string[] = SEARCHABLE_FIELDS,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): boolean {
  if (isSizeToken(token)) {
    // "R17" / "ZR17" means the RIM specifically — checked before the digit
    // normalization below, which would turn it into a plain "17" and let it
    // prefix-match 175-width tyres.
    const rimOnly = parseRimOnly(token);
    if (rimOnly) return matchesRim(product, rimOnly, sizeFields);

    // A 4-digit token also matches an exact `year`.
    if (isYearToken(token) && Number(getField(product, "year")) === Number(token)) {
      return true;
    }
    // Size match against structured size fields ONLY (no name/sku pollution).
    for (const field of sizeFields) {
      if (sizeMatches(token, fieldAsString(product, field))) return true;
    }
    return false;
  }

  // Text token: OR across the searchable fields (partial, case-insensitive).
  const needle = token.toLowerCase();
  for (const field of fields) {
    if (fieldAsString(product, field).toLowerCase().includes(needle)) return true;
  }
  return false;
}

/**
 * Does the product match the full free-text search?
 * Comma-separated clauses evaluate with OR logic between clauses.
 * Tokens within a single clause evaluate with AND logic.
 * An empty / whitespace-only search matches everything.
 */
export function matchesSearch(
  product: ProductRecord,
  search: string,
  fields: readonly string[] = SEARCHABLE_FIELDS,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): boolean {
  const trimmed = search.trim();
  if (!trimmed) return true;

  if (trimmed.includes(",")) {
    const clauses = trimmed.split(",").map((c) => c.trim()).filter(Boolean);
    if (clauses.length > 0) {
      return clauses.some((clause) => matchesSingleSearchClause(product, clause, fields, sizeFields));
    }
  }

  return matchesSingleSearchClause(product, trimmed, fields, sizeFields);
}

function matchesSingleSearchClause(
  product: ProductRecord,
  search: string,
  fields: readonly string[] = SEARCHABLE_FIELDS,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): boolean {
  const rimOnly = parseRimOnly(search);
  if (rimOnly) return matchesRim(product, rimOnly, sizeFields);

  const normalized = isSizeOnlyQuery(search) ? toNumericOnly(search) : search;
  const tokens = tokenize(normalized);
  if (tokens.length === 0) return true;
  return tokens.every((t) => matchesToken(product, t, fields, sizeFields));
}

/** Does the product satisfy the tri-state latest flag? undefined → always true. */
export function matchesLatest(product: ProductRecord, latest: LatestFlag): boolean {
  if (latest === undefined) return true;
  const isLatest = Number(getField(product, "is_latest")) === 1;
  return latest ? isLatest : !isLatest;
}

/* ─── Aspect + rim (width-omitted) FALLBACK matching ───────────
   ADDITIVE ONLY. This never runs inside the exact size matching above
   (sizeMatches / matchesToken) and never changes it. It is applied by
   queryProducts as a Priority-2 fallback, and only when the query omits
   the width (e.g. "55R16") AND exact matching returned nothing. */

/**
 * Parse a WIDTH-OMITTED tyre-size query into its aspect + rim, e.g.
 * "55R16" → { aspect: "55", rim: "16" }, "40R17" → { aspect: "40", rim: "17" },
 * "4017" → { aspect: "40", rim: "17" }.
 * Returns null for anything that is not aspect+rim (e.g. full sizes like "205/55R16").
 */
export function parseAspectRim(query: string): { aspect: string; rim: string } | null {
  const s = query.trim();
  if (!s) return null;

  // Match "55R16", "40R17", "40 R17", "40ZR17", "40/17", "40 R 17"
  const mWithR = s.match(/^(\d{2})\s*[Zz]?[Rr/]?\s*(\d{2})$/);
  if (mWithR) return { aspect: mWithR[1], rim: mWithR[2] };

  // Match 4 digits "4017", "5516", "6515", etc.
  const m4Digits = s.match(/^(\d{2})(\d{2})$/);
  if (m4Digits) {
    const aspect = parseInt(m4Digits[1], 10);
    const rim = parseInt(m4Digits[2], 10);
    if (aspect >= 20 && aspect <= 85 && rim >= 10 && rim <= 30) {
      return { aspect: m4Digits[1], rim: m4Digits[2] };
    }
  }

  return null;
}

/** True if a size string has the given aspect ratio immediately followed by the rim (any width). */
function sizeHasAspectRim(sizeText: string, aspect: string, rim: string): boolean {
  // e.g. aspect 40 + rim 17 → matches "…/40 R17" / "…/40R17" / "…/40ZR17" / "…/40/17"
  return new RegExp(`(^|\\D)${aspect}\\s*[Zz]?[Rr/]?\\s*${rim}(\\D|$)`).test(sizeText);
}

/** True if any of the product's size fields matches the aspect + rim (width-omitted). */
export function matchesAspectRim(
  product: ProductRecord,
  aspect: string,
  rim: string,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): boolean {
  return sizeFields.some((f) => sizeHasAspectRim(fieldAsString(product, f), aspect, rim));
}

/**
 * Extract distinct numeric tyre widths (e.g. "205", "215", "225") from a list of products.
 * Looks for standard width pattern before slash/space (e.g. 205 from "205/40R17").
 */
export function extractWidthsFromProducts<T extends ProductRecord>(
  products: T[],
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): string[] {
  const widths = new Set<string>();
  for (const p of products) {
    for (const field of sizeFields) {
      const val = fieldAsString(p, field);
      const m = val.match(/\b(\d{3})\s*[\/\s]/);
      if (m) {
        widths.add(m[1]);
      }
    }
  }
  return Array.from(widths).sort((a, b) => Number(a) - Number(b));
}

/**
 * Free-text search WITH the width-omitted aspect+rim fallback, as one call.
 *
 * Priority 1: normal `matchesSearch` over the list.
 * Priority 2: only when that returns NOTHING and the query is an aspect+rim
 *   (e.g. "55R17"), fall back to matching that pattern at any width.
 *
 * This exact two-step was duplicated inline in /supplier-products and
 * /tc-products; `queryProducts` already had it internally, but those pages
 * can't use `queryProducts` (their dropdown filters and custom sort aren't
 * expressible in it), so the step is exposed on its own here.
 *
 * Returns the input array untouched for an empty query — same as before.
 */
export function searchWithAspectRimFallback<T extends ProductRecord>(
  items: T[],
  search: string,
  fields: readonly string[] = SEARCHABLE_FIELDS,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): T[] {
  const q = search.trim();
  if (!q) return items;

  const matched = items.filter((item) => matchesSearch(item, q, fields, sizeFields));
  if (matched.length > 0) return matched;

  const ar = parseAspectRim(q);
  if (!ar) return matched;
  return items.filter((item) => matchesAspectRim(item, ar.aspect, ar.rim, sizeFields));
}

/* ─── Filtering ────────────────────────────────────────────── */

export interface FilterCriteria {
  /** Free-text search (tokenized, AND across tokens, OR across fields). */
  search?: string;
  /** Tri-state latest flag. */
  latest?: LatestFlag;
}

/** Apply search + latest filtering to an array, returning the matching subset. */
export function filterProducts<T extends ProductRecord>(
  products: T[],
  criteria: FilterCriteria = {},
  fields: readonly string[] = SEARCHABLE_FIELDS,
  sizeFields: readonly string[] = DEFAULT_SIZE_FIELDS,
): T[] {
  const { search = "", latest } = criteria;
  return products.filter(
    (p) => matchesLatest(p, latest) && matchesSearch(p, search, fields, sizeFields),
  );
}

/* ─── Sort field validation ────────────────────────────────── */

export const SORTABLE_FIELDS = [
  "product_name",
  "brand",
  "sku",
  "size",
  "year",
  "country",
  "is_latest",
] as const;

export type SortField = (typeof SORTABLE_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export const DEFAULT_SORT_FIELD: SortField = "product_name";
export const DEFAULT_SORT_DIRECTION: SortDirection = "asc";

/** True if `field` is in the given sort allowlist (defaults to SORTABLE_FIELDS). */
export function isSortableField(
  field: string,
  allow: readonly string[] = SORTABLE_FIELDS,
): boolean {
  return allow.includes(field);
}

/**
 * Validate a requested sort field/direction against an allowlist, falling back
 * to `fallback` for anything unrecognized. `allow`/`fallback` default to the
 * supplier SORTABLE_FIELDS but can be overridden for a different product shape.
 */
export function validateSort(
  field: string | null,
  direction: string | null,
  allow: readonly string[] = SORTABLE_FIELDS,
  fallback: string = DEFAULT_SORT_FIELD,
): { field: string; direction: SortDirection } {
  return {
    field: field && isSortableField(field, allow) ? field : fallback,
    direction: direction === "desc" ? "desc" : DEFAULT_SORT_DIRECTION,
  };
}

/* ─── Sorting (the actual runtime sort) ────────────────────── */

/** Compare two raw field values: numeric when both are numbers, else case-insensitive string. */
function compareValues(a: unknown, b: unknown): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1; // missing values sort last
  if (bMissing) return -1;

  const aNum = typeof a === "number" ? a : Number(a);
  const bNum = typeof b === "number" ? b : Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

/**
 * Return a NEW sorted array (does not mutate the input). Direction is
 * applied on top of the natural comparison. Only validated sort fields
 * should be passed (see validateSort).
 */
export function sortProducts<T extends ProductRecord>(
  products: T[],
  field: string,
  direction: SortDirection,
): T[] {
  const dir = direction === "desc" ? -1 : 1;
  return [...products].sort(
    (a, b) => dir * compareValues(getField(a, field), getField(b, field)),
  );
}

/* ─── Pagination calculation ───────────────────────────────── */

export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

export interface Pagination {
  page: number; // 1-based, clamped to >= 1
  pageSize: number; // clamped to 1..MAX_PAGE_SIZE
  offset: number; // items to skip = (page - 1) * pageSize
  limit: number; // items to take = pageSize
  totalPages: number; // total pages for the given totalCount
}

/**
 * Compute clamped pagination values from raw inputs.
 * `page` is 1-based; out-of-range values are clamped, not rejected.
 */
export function calcPagination(
  page: number,
  pageSize: number,
  totalCount: number,
): Pagination {
  const safePageSize = Math.min(
    Math.max(Math.trunc(pageSize) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const safeTotal = Math.max(Math.trunc(totalCount) || 0, 0);
  const totalPages = Math.max(Math.ceil(safeTotal / safePageSize), 1);
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages);

  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
    limit: safePageSize,
    totalPages,
  };
}

/** Slice one page out of an array using calcPagination's clamped math. */
export function paginate<T>(
  products: T[],
  page: number,
  pageSize: number,
): { items: T[]; pagination: Pagination } {
  const pagination = calcPagination(page, pageSize, products.length);
  const items = products.slice(pagination.offset, pagination.offset + pagination.limit);
  return { items, pagination };
}

/* ─── Turnkey query: filter → sort → paginate ──────────────── */

export interface QueryParams {
  search?: string;
  /** Raw "latest" param: "1" | "0" | null (see parseLatest). */
  latest?: string | null;
  sortBy?: string | null;
  sortOrder?: string | null;
  page?: number;
  pageSize?: number;
  /** Override the searchable fields to match the product shape being queried. */
  searchableFields?: readonly string[];
  /** Structured size fields a numeric token matches against (never name/sku). */
  sizeFields?: readonly string[];
  /** Override the sort allowlist to match the product shape being queried. */
  sortableFields?: readonly string[];
  /** Fallback sort field when the requested one isn't allowed. */
  defaultSortField?: string;
}

export interface QueryResult<T> {
  items: T[]; // the current page after filter + sort
  total: number; // total AFTER filtering, before pagination
  page: number;
  pageSize: number;
  totalPages: number;
  /** True when the width-omitted aspect+rim FALLBACK produced these results. */
  isPartialSizeMatch: boolean;
  /** The size pattern that matched — the query for exact, wild-card 40R17 for a fallback. */
  matchedPattern: string;
  /** Distinct width options available for the matched partial size (e.g. ["205", "215", "225"]). */
  availableWidths: string[];
}

/**
 * Run the whole client-side pipeline over a cached array in one call:
 * filter (search + latest) → sort (validated) → paginate.
 * No API/GraphQL involved — pure array work on already-cached data.
 */
export function queryProducts<T extends ProductRecord>(
  products: T[],
  params: QueryParams = {},
): QueryResult<T> {
  const {
    search = "",
    latest = null,
    sortBy = null,
    sortOrder = null,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchableFields = SEARCHABLE_FIELDS,
    sizeFields = DEFAULT_SIZE_FIELDS,
    sortableFields = SORTABLE_FIELDS,
    defaultSortField = sortableFields[0] ?? DEFAULT_SORT_FIELD,
  } = params;

  // ── Priority 1: existing exact matching (UNCHANGED) ──
  const latestFlag = parseLatest(latest);
  let matched = filterProducts(
    products,
    { search, latest: latestFlag },
    searchableFields,
    sizeFields,
  );
  let isPartialSizeMatch = false;
  let matchedPattern = search.trim();
  let availableWidths: string[] = [];

  // ── Priority 2: width-omitted aspect+rim FALLBACK (ADDITIVE) ──
  // Runs ONLY after exact matching, only when the query omits the width
  // (e.g. "40R17" or "4017") AND exact matching produced no results. It never
  // alters Priority-1 output — a full size like "205/40R17" keeps its exact result.
  if (matched.length === 0) {
    const ar = parseAspectRim(search);
    if (ar) {
      matched = products.filter(
        (p) => matchesLatest(p, latestFlag) && matchesAspectRim(p, ar.aspect, ar.rim, sizeFields),
      );
      if (matched.length > 0) {
        isPartialSizeMatch = true;
        matchedPattern = `***/${ar.aspect}R${ar.rim}`;
        availableWidths = extractWidthsFromProducts(matched, sizeFields);
      }
    }
  }

  const { field, direction } = validateSort(
    sortBy,
    sortOrder,
    sortableFields,
    defaultSortField,
  );
  const sorted = sortProducts(matched, field, direction);

  const { items, pagination } = paginate(sorted, page, pageSize);

  return {
    items,
    total: matched.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    isPartialSizeMatch,
    matchedPattern,
    availableWidths,
  };
}
