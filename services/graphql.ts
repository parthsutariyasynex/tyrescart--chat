/**
 * Magento GraphQL API Client for TyresCart
 * Target Endpoint: process.env.GRAPHQL_ENDPOINT (server) / /api/graphql (browser)
 *
 * Query strings live in `./queries`; types live in `./types`.
 */
import {
  productsQuery,
  supplierProductsQuery,
  tyresChatQuery,
  tcProductsQuery,
  tcAttributeLabelsQuery,
  tcQuickViewQuery,
  tcQuickViewMatchQuery,
  supplierPriceHistoryQuery,
  createCrmBookingMutation,
  crmCustomerByPhoneQuery,
  crmRecentBookingsQuery,
  CREATE_KLEVER_QUOTE,
  ADD_QUOTE_HISTORY,
  kleverVehicleSearchQuery,
  kleverVehicleCatalogueQuery,
  urlTemplatesQuery,
  kleverVehicleMakesQuery,
  kleverVehicleModelsQuery,
  kleverVehicleYearsQuery,
  kleverVehicleModificationsQuery,
  type TcProductsQueryVars,
  updateCrmCustomerMutation,
} from "./queries";
import type {
  UrlTemplateItem,
  KleverVehicleItem,
  KleverVehicleCatalogueItem,
  KleverVehicleCatalogueResult,
  KleverVehicleYear,
  KleverVehicleModification,
  KleverFitmentPair,
  KleverQuote,
  KleverQuoteInput,
  KleverQuoteHistory,
  KleverQuoteHistoryInput,
  CrmCustomer,
  CrmBookingInput,
  CrmBookingResult,
  SupplierPriceHistoryPoint,
  TcQuickViewProduct,
  TcAttributeLabels,
  TcProductsResponse,
  FetchProductsParams,
  FetchSupplierProductsParams,
  ProductsResponse,
  SupplierProductsResponse,
  TyresChatResponse,
  CrmRecentBooking,
  CrmCustomerUpdateInput,
  CrmCustomerUpdateResult,
} from "./types";
import { normaliseTyreSize } from "./productFormatter";

/**
 * A GraphQL request that failed, carrying the HTTP status so callers can tell a
 * retryable fault (5xx / 429 / network) from a permanent one (4xx). `status` is
 * 0 when the request never got a response at all (DNS, offline, connection
 * reset) — those are retryable too.
 */
export class GraphQLRequestError extends Error {
  readonly status: number;
  /**
   * The `data` GraphQL returned ALONGSIDE the errors, when it returned any.
   *
   * A field-level failure is a partial success in GraphQL: the server reports
   * the error AND fills in every field it could resolve. Throwing discards that,
   * which is why Quick View showed "No image available" for a product whose
   * image had in fact come back — only `custom_attributesV2` had failed.
   *
   * Still thrown, so nothing that relies on failing fast changes; a caller that
   * can use a partial answer opts in by reading this.
   */
  readonly partialData?: unknown;

  constructor(message: string, status: number, partialData?: unknown) {
    super(message);
    this.name = "GraphQLRequestError";
    this.status = status;
    this.partialData = partialData;
  }

  /** 429 and 5xx are transient; a bare network failure (0) is too. 4xx is not. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** True for any error worth retrying — non-GraphQLRequestError throws are
 *  network/parse faults raised before a status existed, so they retry. */
export function isRetryableError(err: unknown): boolean {
  return err instanceof GraphQLRequestError ? err.retryable : true;
}

/**
 * Execute GraphQL Query through proxy or directly
 */
/**
 * Run a GraphQL document.
 *
 * `variables` is OPTIONAL and additive — every existing caller passes only a
 * query string and behaves exactly as before. It exists because operations with
 * nested inputs (e.g. the quotation module's `history: [..!]` array) cannot be
 * built safely by string interpolation: a quote or backslash in user text
 * escapes the document, and numbers get stringified.
 *
 * Exported so per-module service files can share this one client rather than
 * hand-rolling their own fetch.
 */
export async function executeGraphQLQuery(
  query: string,
  variables?: Record<string, unknown>,
) {
  const isServer = typeof window === "undefined";
  const targetUrl = isServer
    ? process.env.GRAPHQL_ENDPOINT || "https://qa.tyrescart.ae/graphql"
    : "/api/graphql";

  try {
    /* The key is attached ONLY on the server path, which talks to Magento
       directly. In the browser this posts to our own /api/graphql proxy, and
       that route adds the header server-side — so the secret never has to reach
       the client, and no NEXT_PUBLIC_ variable (which Next inlines into the
       bundle) is involved. */
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (isServer && process.env.KLEVER_API_KEY) {
      headers["X-Klever-Api-Key"] = process.env.KLEVER_API_KEY;
    }

    console.time("API Fetch");
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(variables ? { query, variables } : { query }),
    });
    console.timeEnd("API Fetch");

    console.time("JSON Parse");
    const data = await res.json().catch(() => null);
    console.timeEnd("JSON Parse");

    if (!res.ok) {
      // Cloudflare/WAF blocks answer with their own JSON shape (`detail`,
      // `title`) rather than GraphQL's `errors[]` — check those too so the
      // message says *why* instead of a bare status code.
      const errMsg =
        data?.errors?.[0]?.message ||
        data?.error ||
        data?.detail ||
        data?.title ||
        `GraphQL HTTP error! Status: ${res.status}`;
      throw new GraphQLRequestError(errMsg, res.status);
    }

    // A 200 carrying `errors[]` is a query-level fault (bad field, bad filter).
    // Status 200 → `retryable` is false, so the sync fails it fast instead of
    // burning three attempts on a query that will never succeed.
    if (data?.errors && data.errors.length > 0) {
      const firstMsg = data.errors[0]?.message || "GraphQL error";
      if (!/no customer found/i.test(firstMsg)) {
        console.warn("GraphQL API error response:", data.errors);
      }
      throw new GraphQLRequestError(firstMsg, res.status, data?.data);
    }

    return data?.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no customer found/i.test(msg)) {
      console.warn("GraphQL execution failed:", err);
    }
    throw err;
  }
}

/**
 * Fetch products using the default Magento storefront GraphQL query.
 *
 * This is the stock `products(...)` field every Magento 2 store exposes —
 * unlike the store-specific `supplierProducts`/`tyresChat` fields. Use it
 * for the public catalog (storefront-visible, priced products).
 *
 * Example:
 *   products(search: "dunlop", pageSize: 20, currentPage: 1, sort: { name: ASC })
 */
export async function fetchProductsGraphQL(
  params: FetchProductsParams = {},
): Promise<ProductsResponse> {
  const query = productsQuery(params);

  const data = await executeGraphQLQuery(query);
  return data?.products || { total_count: 0, items: [] };
}

/**
 * Fetch supplierProducts using Magento GraphQL
 * Query matching user's exact specification:
 * supplierProducts(filter: { brand: "...", plain_size: "..." }, pageSize: 10, currentPage: 1, sort: { field: "price", direction: ASC })
 */
export async function fetchSupplierProductsGraphQL(
  params: FetchSupplierProductsParams = {},
): Promise<SupplierProductsResponse> {
  const {
    brand,
    plain_size,
    is_latest = 1,
    year,
    country,
    source_name,
    brand_category,
    product_name,
    sku,
    size,
    pageSize = 24,
    currentPage = 1,
    sortField,
    sortDirection,
  } = params;

  const query = supplierProductsQuery({
    brand,
    plain_size,
    is_latest,
    year,
    country,
    source_name,
    brand_category,
    product_name,
    sku,
    size,
    pageSize,
    currentPage,
    sortField,
    sortDirection,
  });

  const data = await executeGraphQLQuery(query);
  return data?.supplierProducts || { total_count: 0, items: [] };
}

/**
 * Fetch tyresChat using Magento GraphQL
 * Query matching user's exact specification:
 * tyresChat(filter: { category: "car_tyres", status: 1 }, pageSize: 50)
 */
export async function fetchTyresChatGraphQL(
  params: {
    category?: string;
    status?: number;
    pageSize?: number;
  } = {},
): Promise<TyresChatResponse> {
  const { category, status = 1, pageSize = 200 } = params;

  const query = tyresChatQuery({ category, status, pageSize });

  const data = await executeGraphQLQuery(query);
  return data?.tyresChat || { total_count: 0, items: [] };
}

/**
 * Fetch the tc-products view of the storefront `products` field.
 *
 * A separate builder from {@link fetchProductsGraphQL} on purpose: /products
 * uses `productsQuery`, and widening that would change its payload. Lives here
 * rather than in the page so `syncTasks.ts` can reach it — services cannot
 * import from `app/`.
 */
export async function fetchTcProductsGraphQL(
  params: TcProductsQueryVars = {},
): Promise<TcProductsResponse> {
  const data = await executeGraphQLQuery(tcProductsQuery(params));
  return (
    data?.products ?? {
      total_count: 0,
      page_info: { current_page: 1, page_size: 0, total_pages: 1 },
      items: [],
    }
  );
}

/**
 * Option-id → label maps for the tc-products attributes.
 *
 * Magento returns brand / tyre_size / runflat / oem_marking / year / country as
 * option IDs (`brand: 1358`), so these maps are fetched once and every row is
 * resolved locally — no per-row lookup.
 */
export async function fetchTcAttributeLabelsGraphQL(): Promise<TcAttributeLabels> {
  const data = await executeGraphQLQuery(tcAttributeLabelsQuery());
  const out: TcAttributeLabels = {};
  for (const item of data?.customAttributeMetadata?.items ?? []) {
    if (!item?.attribute_code) continue;
    const map: Record<string, string> = {};
    for (const opt of item.attribute_options ?? [])
      map[String(opt.value)] = opt.label;
    out[item.attribute_code] = map;
  }
  return out;
}

/**
 * One product's full detail for the Quick View panel. Returns null when the sku
 * has no storefront product — the caller shows an empty state rather than a
 * half-populated panel.
 */
export async function fetchTcQuickViewGraphQL(
  sku: string,
): Promise<TcQuickViewProduct | null> {
  try {
    const data = await executeGraphQLQuery(tcQuickViewQuery(sku));
    return (
      (data?.products?.items?.[0] as TcQuickViewProduct | undefined) ?? null
    );
  } catch (err) {
    /* Fall back to whatever DID resolve.
       `custom_attributesV2` returns "Internal server error" on products that
       carry none of the tyre attributes — a battery, for instance — while the
       same response still contains the image, gallery, name and price. Verified
       against TYCT-BT1001: image and 2 gallery entries present, only
       `custom_attributesV2` null. Discarding that left the panel blank when it
       had everything it needed to show a picture and a price.
       The spec cells stay "-" because those genuinely did not resolve. */
    if (err instanceof GraphQLRequestError && err.partialData) {
      const partial = (
        err.partialData as { products?: { items?: TcQuickViewProduct[] } }
      )?.products?.items?.[0];
      if (partial) {
        console.warn(
          `[QuickView] partial response used for SKU "${sku}":`,
          err.message,
        );
        return partial;
      }
    }
    console.warn(`[QuickView] GraphQL query failed for SKU "${sku}":`, err);
    return null;
  }
}

/** Candidate products for the Quick View attribute fallback. Never used raw — the
 *  caller must confirm a single exact attribute match before showing one. */
export async function fetchTcQuickViewMatchesGraphQL(
  terms: string,
): Promise<TcQuickViewProduct[]> {
  try {
    const data = await executeGraphQLQuery(tcQuickViewMatchQuery(terms));
    return (data?.products?.items as TcQuickViewProduct[] | undefined) ?? [];
  } catch (err) {
    console.warn(
      `[QuickView] GraphQL matches query failed for terms "${terms}":`,
      err,
    );
    return [];
  }
}

/** Price history for one supplier product. Empty array when none is recorded. */
export async function fetchSupplierPriceHistoryGraphQL(
  id: number | string,
  source: string,
): Promise<SupplierPriceHistoryPoint[]> {
  const data = await executeGraphQLQuery(supplierPriceHistoryQuery(id, source));
  return (
    (data?.supplierProductPriceHistory as
      | SupplierPriceHistoryPoint[]
      | undefined) ?? []
  );
}

/**
 * Submit a booking enquiry. Deliberately NOT cached and never retried
 * automatically — a duplicate call creates a duplicate booking, and there is no
 * delete mutation to clean one up.
 */
export async function createCrmBookingGraphQL(
  input: CrmBookingInput,
): Promise<CrmBookingResult> {
  const data = await executeGraphQLQuery(createCrmBookingMutation(input));
  const res = data?.createCrmBooking as CrmBookingResult | undefined;
  if (!res) throw new Error("Booking failed: the server returned no result.");
  return res;
}

/**
 * CRM customer for a phone number, or null when there is none.
 *
 * "No customer found" comes back as a GraphQL error, not an empty result, so a
 * bare call would throw for the perfectly ordinary case of a new customer. That
 * one message is translated into `null`; every other failure still throws, so a
 * network or WAF problem is never mistaken for "not on file".
 */
/**
 * The CRM's recent enquiry list.
 *
 * Read-only and uncached: an enquiry log is only useful current, and the call is
 * a single request. Returns [] rather than throwing when the field answers with
 * nothing, so the table renders its empty state instead of an error.
 */
/**
 * Edit an existing CRM customer.
 *
 * Unlike `createCrmBookingGraphQL` this files NO booking — it only updates the
 * customer record, so it is safe to call from an edit form. Never retried and
 * never cached: it is a write.
 */
export async function updateCrmCustomerGraphQL(
  input: CrmCustomerUpdateInput,
): Promise<CrmCustomerUpdateResult> {
  const data = await executeGraphQLQuery(updateCrmCustomerMutation(input));
  const res = data?.updateCrmCustomer as CrmCustomerUpdateResult | undefined;
  return res ?? { success: false, message: "No response from the CRM." };
}

export async function fetchCrmRecentBookingsGraphQL(): Promise<
  CrmRecentBooking[]
> {
  const data = await executeGraphQLQuery(crmRecentBookingsQuery());
  return (data?.crmRecentBookings as CrmRecentBooking[] | undefined) ?? [];
}

/** Digits only, so "050 123 4567" and "0501234567" compare equal. */
const phoneDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Every customer the CRM returns for a phone query.
 *
 * `crmCustomerByPhone` returns an ARRAY, not one customer — "050" comes back
 * with 615 records, and a query matching nothing returns the WHOLE customer
 * table rather than an empty list. So the result is filtered here on the digits
 * actually typed; without that, any garbage input would look like a match.
 *
 * A single object is still accepted, so an older backend keeps working.
 */
export async function fetchCrmCustomersByPhoneGraphQL(
  phone: string,
): Promise<CrmCustomer[]> {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return []; // the API answers "Phone number is required."
  try {
    const data = await executeGraphQLQuery(crmCustomerByPhoneQuery(trimmed));
    const raw = data?.crmCustomerByPhone;
    const list: CrmCustomer[] = Array.isArray(raw)
      ? (raw as CrmCustomer[])
      : raw
        ? [raw as CrmCustomer]
        : [];

    const wanted = phoneDigits(trimmed);
    if (!wanted) return list;
    const matches = list.filter((c) => phoneDigits(c?.phone).includes(wanted));
    return matches;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no customer found/i.test(msg)) return [];
    throw err;
  }
}

/**
 * The single best match for a phone number, or null.
 *
 * An exact digit match wins; otherwise the first partial match. Used where one
 * customer is needed — the duplicate check and resolving `entity_id` for an
 * edit — so those paths are unaffected by the endpoint returning many rows.
 */
export async function fetchCrmCustomerByPhoneGraphQL(
  phone: string,
): Promise<CrmCustomer | null> {
  const list = await fetchCrmCustomersByPhoneGraphQL(phone);
  if (!list.length) return null;
  const wanted = phoneDigits(phone);
  return list.find((c) => phoneDigits(c?.phone) === wanted) ?? list[0];
}

/* ─────────────────────────────────────────────────────────────
   Klever Quotation

   Neither call is cached and neither is retried. The module has no delete,
   cancel or update mutation, so a repeat call files a SECOND quote that can only
   be cleared in the Magento admin — issue them from an explicit user action, and
   disable the trigger while in flight.
───────────────────────────────────────────────────────────── */

/**
 * File a new quotation.
 *
 * The response is the only place `quote_id` and `quote_number` ever appear —
 * there is no query to read a quote back — so the caller must persist whatever
 * it needs from the returned record.
 */
export async function createKleverQuote(
  input: KleverQuoteInput,
): Promise<KleverQuote> {
  const data = await executeGraphQLQuery(CREATE_KLEVER_QUOTE, { input });
  const res = data?.createKleverQuote as KleverQuote | undefined;
  if (!res) throw new Error("Quotation failed: the server returned no record.");
  return res;
}

/**
 * Append an activity row to an existing quote.
 *
 * `quote_id` is validated server-side: an unknown id fails with
 * "Quote N does not exist." rather than creating an orphan row.
 */
export async function addKleverQuoteHistory(
  input: KleverQuoteHistoryInput,
): Promise<KleverQuoteHistory> {
  const data = await executeGraphQLQuery(ADD_QUOTE_HISTORY, { input });
  const res = data?.addKleverQuoteHistory as KleverQuoteHistory | undefined;
  if (!res)
    throw new Error("Quote history failed: the server returned no record.");
  return res;
}

/**
 * Search vehicles fitting a specific tyre size (width, height, rim).
 */
export async function fetchKleverVehicleSearchGraphQL(
  width: number,
  height: number,
  rim: number,
): Promise<KleverVehicleItem[]> {
  const query = kleverVehicleSearchQuery(width, height, rim);
  const data = await executeGraphQLQuery(query);
  return (
    (data?.kleverVehicleSearch?.data as KleverVehicleItem[] | undefined) ?? []
  );
}

/**
 * One page of the full vehicle catalogue, sizes included — see
 * `kleverVehicleCatalogueQuery` for why this exists alongside
 * `fetchKleverAllVehicles`/`fetchKleverVehicleFitments`. `total` is returned
 * so a caller can page through the whole catalogue (`limit` caps at 1000
 * server-side, so 1,362 vehicles is 2 calls).
 */
export async function fetchKleverVehicleCatalogueGraphQL(
  offset: number,
  limit: number,
): Promise<{ vehicles: KleverVehicleCatalogueItem[]; total: number }> {
  const query = kleverVehicleCatalogueQuery(offset, limit);
  const data = await executeGraphQLQuery(query);
  const result = data?.kleverVehicleSearch as
    | KleverVehicleCatalogueResult
    | undefined;
  return {
    vehicles: (result?.data as KleverVehicleCatalogueItem[] | undefined) ?? [],
    total: typeof result?.total === "number" ? result.total : 0,
  };
}

/**
 * The WHOLE offset/limit vehicle catalogue — pages through
 * `fetchKleverVehicleCatalogueGraphQL` at the server's 1000-row cap (1,362
 * vehicles today = 2 requests) and returns every row, sizes included. This is
 * the Tyres Guide's catalogue source: unlike `fetchKleverAllVehicles`, every
 * row already carries `front_size`/`rear_size`, so no per-vehicle
 * `fetchKleverVehicleFitments` follow-up is needed.
 *
 * Memoised for the session, same pattern as `fetchKleverAllVehicles`.
 */
let vehicleCatalogueCache: Promise<KleverVehicleCatalogueItem[]> | null = null;
const VEHICLE_CATALOGUE_PAGE_LIMIT = 1000;

export function fetchKleverVehicleCatalogueAll(): Promise<
  KleverVehicleCatalogueItem[]
> {
  if (vehicleCatalogueCache) return vehicleCatalogueCache;

  const task = (async () => {
    const all: KleverVehicleCatalogueItem[] = [];
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const page = await fetchKleverVehicleCatalogueGraphQL(
        offset,
        VEHICLE_CATALOGUE_PAGE_LIMIT,
      );
      total = page.total || page.vehicles.length;
      if (!page.vehicles.length) break;
      all.push(...page.vehicles);
      offset += page.vehicles.length;
    }
    return all;
  })();

  vehicleCatalogueCache = task;
  task.catch(() => {
    vehicleCatalogueCache = null;
  });
  return task;
}

/**
 * The WHOLE vehicle catalogue as flat make/model rows — 1,362 vehicles across
 * 113 makes, measured.
 *
 * `kleverVehicleSearch` can only answer "which vehicles use THIS tyre size"
 * (width/height/rim are all `Int!`), so it can never list everything. Makes →
 * Models can, at 1 + 113 = 114 requests / ~25 s at concurrency 8.
 *
 * The rows carry NO tyre sizes: `kleverVehicleModels` exposes only name, slug
 * and year_ranges. Sizes come from `fetchKleverVehicleFitments` when a vehicle
 * is selected — filling them in for all 1,362 up front would be ~27,000
 * requests.
 *
 * Memoised for the session: the catalogue does not change between page loads,
 * and 25 s is far too long to repeat on every toggle.
 */
let allVehiclesCache: Promise<KleverVehicleItem[]> | null = null;

export function fetchKleverAllVehicles(): Promise<KleverVehicleItem[]> {
  if (allVehiclesCache) return allVehiclesCache;

  const task = (async () => {
    const makesData = await executeGraphQLQuery(kleverVehicleMakesQuery());
    const makes =
      (makesData?.kleverVehicleMakes?.data as
        | { name: string | null; slug: string | null }[]
        | undefined) ?? [];

    const perMake = await pool(makes, 8, async (mk) => {
      const slug = String(mk?.slug ?? "").trim();
      if (!slug) return [] as KleverVehicleItem[];
      try {
        const data = await executeGraphQLQuery(kleverVehicleModelsQuery(slug));
        const models =
          (data?.kleverVehicleModels?.data as
            | {
                name: string | null;
                slug: string | null;
                year_ranges: unknown;
              }[]
            | undefined) ?? [];
        return models.map((m) => ({
          make_name: mk.name ?? null,
          model_name: m.name ?? null,
          make_slug: slug,
          model_slug: m.slug ?? null,
          /* `kleverVehicleModels` returns a real ARRAY here while
             `kleverVehicleSearch` returns a JSON-encoded STRING. The table's
             formatter handles both, so the array is passed through as the
             string form it already parses. */
          year_ranges:
            m.year_ranges == null ? null : JSON.stringify(m.year_ranges),
          /* No size data on this endpoint — left null so the table renders "—"
             rather than inventing a fitment. */
          front_width: null,
          front_height: null,
          front_rim: null,
          rear_width: null,
          rear_height: null,
          rear_rim: null,
          is_stock: null,
        })) as KleverVehicleItem[];
      } catch {
        // One failed make must not lose the other 112.
        return [] as KleverVehicleItem[];
      }
    });

    return perMake.flat();
  })();

  allVehiclesCache = task;
  task.catch(() => {
    allVehiclesCache = null;
  });
  return task;
}

/**
 * Configured browse-tyres links for a tyre size.
 *
 * Front-only values → square fitment; add the rear three for staggered. The
 * backend decides which templates apply and returns a ready `resolved_url` for
 * each, so no URL is ever built here — that keeps the links correct whichever
 * GraphQL endpoint is configured.
 *
 * Memoised per value-set for the session: the same size resolves to the same
 * links, and the popup can be opened repeatedly without re-querying.
 */
const urlTemplateCache = new Map<string, Promise<UrlTemplateItem[]>>();

export function fetchUrlTemplates(
  values: { code: string; value: string }[],
): Promise<UrlTemplateItem[]> {
  const clean = values.filter(
    (v) => v && v.code && String(v.value ?? "").trim() !== "",
  );
  if (!clean.length) return Promise.resolve([]);

  const key = clean.map((v) => `${v.code}=${v.value}`).join("&");
  const hit = urlTemplateCache.get(key);
  if (hit) return hit;

  const task = executeGraphQLQuery(urlTemplatesQuery(clean)).then(
    (data) =>
      (data?.urlTemplates?.items as UrlTemplateItem[] | undefined) ?? [],
  );
  urlTemplateCache.set(key, task);
  // A failed lookup must not be cached, or the size can never be retried.
  task.catch(() => urlTemplateCache.delete(key));
  return task;
}

/** Production years for a make/model, newest first. */
export async function fetchKleverVehicleYearsGraphQL(
  make: string,
  model: string,
): Promise<number[]> {
  const data = await executeGraphQLQuery(kleverVehicleYearsQuery(make, model));
  const rows =
    (data?.kleverVehicleYears?.data as KleverVehicleYear[] | undefined) ?? [];
  return rows
    .map((r) => Number(r?.slug ?? r?.name))
    .filter((y) => Number.isFinite(y) && y > 0);
}

/** Trim variants for one year. */
export async function fetchKleverVehicleModificationsGraphQL(
  make: string,
  model: string,
  year: number,
): Promise<KleverVehicleModification[]> {
  const data = await executeGraphQLQuery(
    kleverVehicleModificationsQuery(make, model, year),
  );
  return (
    (data?.kleverVehicleModifications?.data as
      | KleverVehicleModification[]
      | undefined) ?? []
  );
}

/**
 * Every distinct front/rear fitment pair for one vehicle.
 *
 * `kleverVehicleModifications` takes a single mandatory `year: Int!` — there is
 * no bulk form (`years: [...]`, `generation:` and omitting it are all rejected)
 * — so this fans out one request per year. Measured: Camry 25 years / 26 calls,
 * Porsche 911 23 / 24, Audi A5 18 / 19. At the pool size below that is ~4-5 s
 * rather than the ~24 s a sequential loop costs.
 *
 * CALL ONLY WHEN A VEHICLE IS SELECTED. A size search returns ~79 vehicles;
 * resolving all of them up front would be ~1,600 requests.
 *
 * Results are memoised per `make|model` for the session — reopening a vehicle
 * is then free, and the fitment list does not change between page loads.
 */
const fitmentCache = new Map<string, Promise<KleverFitmentPair[]>>();

/** Same worker-pool shape the catalogue syncs use. */
async function pool<T, R>(
  items: readonly T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    }),
  );
  return out;
}

export function fetchKleverVehicleFitments(
  make: string,
  model: string,
): Promise<KleverFitmentPair[]> {
  const key = `${make}|${model}`.toLowerCase();
  const hit = fitmentCache.get(key);
  if (hit) return hit;

  const task = (async () => {
    const years = await fetchKleverVehicleYearsGraphQL(make, model);
    if (!years.length) return [];

    const perYear = await pool(years, 8, (year) =>
      fetchKleverVehicleModificationsGraphQL(make, model, year).catch(() => []),
    );

    /* Deduped on the NORMALISED pair, so "225/50R17 98H" and "225/50ZR17 94W"
       collapse to one entry instead of two spellings of the same size. */
    const byPair = new Map<string, KleverFitmentPair>();
    for (const mod of perYear.flat()) {
      const frontRaw = mod?.front_wheel?.tire_full;
      if (!frontRaw) continue;
      /* A NULL rear means SQUARE — the same size on both axles — not missing
         data. Verified across 510 modifications: `rear_wheel.tire_full` is
         non-null if and only if front ≠ rear, and rear === front never occurs.
         Falling back to the front size is therefore the correct reading;
         treating null as "unknown" would blank the rear column on every
         non-staggered car (Camry, Audi A5 …). */
      const rearRaw = mod?.rear_wheel?.tire_full || frontRaw;

      const front = normaliseTyreSize(frontRaw);
      const rear = normaliseTyreSize(rearRaw);
      if (!front) continue;

      const pairKey = `${front}|${rear}`;
      const prev = byPair.get(pairKey);
      const isStock = Boolean(
        mod?.is_stock === true ||
        mod?.is_stock === 1 ||
        String(mod?.is_stock) === "1",
      );
      if (prev) {
        // One stock variant is enough to mark the pair as a factory fitment.
        if (isStock) prev.isStock = true;
      } else {
        byPair.set(pairKey, {
          front,
          rear,
          staggered: front !== rear,
          isStock,
        });
      }
    }
    return [...byPair.values()];
  })();

  fitmentCache.set(key, task);
  // A failed lookup must not be cached, or the vehicle can never be retried.
  task.catch(() => fitmentCache.delete(key));
  return task;
}
