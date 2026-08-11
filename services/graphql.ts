/**
 * Magento GraphQL API Client for TyresCart
 * Target Endpoint: https://www.tyrescart.com/graphql
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
  type TcProductsQueryVars,
} from "./queries";
import type {
  KleverVehicleItem,
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
} from "./types";

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
    ? "https://www.tyrescart.com/graphql"
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
export async function fetchCrmRecentBookingsGraphQL(): Promise<
  CrmRecentBooking[]
> {
  const data = await executeGraphQLQuery(crmRecentBookingsQuery());
  return (data?.crmRecentBookings as CrmRecentBooking[] | undefined) ?? [];
}

export async function fetchCrmCustomerByPhoneGraphQL(
  phone: string,
): Promise<CrmCustomer | null> {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return null; // the API answers "Phone number is required."
  try {
    const data = await executeGraphQLQuery(crmCustomerByPhoneQuery(trimmed));
    return (data?.crmCustomerByPhone as CrmCustomer | undefined) ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no customer found/i.test(msg)) return null;
    throw err;
  }
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
