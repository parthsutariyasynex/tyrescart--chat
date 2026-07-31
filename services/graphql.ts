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
  type TcProductsQueryVars,
} from "./queries";
import type {
  TcQuickViewProduct,
  TcAttributeLabels,
  TcProductsResponse,
  FetchProductsParams,
  FetchSupplierProductsParams,
  ProductsResponse,
  SupplierProductsResponse,
  TyresChatResponse,
} from "./types";

/**
 * A GraphQL request that failed, carrying the HTTP status so callers can tell a
 * retryable fault (5xx / 429 / network) from a permanent one (4xx). `status` is
 * 0 when the request never got a response at all (DNS, offline, connection
 * reset) — those are retryable too.
 */
export class GraphQLRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GraphQLRequestError";
    this.status = status;
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
async function executeGraphQLQuery(query: string) {
  const isServer = typeof window === "undefined";
  const targetUrl = isServer ? "https://www.tyrescart.com/graphql" : "/api/graphql";

  try {
    console.time("API Fetch");
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query }),
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
      console.warn("GraphQL API error response:", data.errors);
      throw new GraphQLRequestError(data.errors[0]?.message || "GraphQL error", res.status);
    }

    return data?.data;
  } catch (err) {
    console.error("GraphQL execution failed:", err);
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
  params: FetchProductsParams = {}
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
  params: FetchSupplierProductsParams = {}
): Promise<SupplierProductsResponse> {
  const {
    brand, plain_size, is_latest, year, country, source_name,
    brand_category, product_name, sku, size,
    pageSize = 24, currentPage = 1, sortField, sortDirection,
  } = params;

  const query = supplierProductsQuery({
    brand, plain_size, is_latest, year, country, source_name,
    brand_category, product_name, sku, size,
    pageSize, currentPage, sortField, sortDirection,
  });

  const data = await executeGraphQLQuery(query);
  return data?.supplierProducts || { total_count: 0, items: [] };
}

/**
 * Fetch tyresChat using Magento GraphQL
 * Query matching user's exact specification:
 * tyresChat(filter: { category: "car_tyres", status: 1 }, pageSize: 50)
 */
export async function fetchTyresChatGraphQL(params: {
  category?: string;
  status?: number;
  pageSize?: number;
} = {}): Promise<TyresChatResponse> {
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
    for (const opt of item.attribute_options ?? []) map[String(opt.value)] = opt.label;
    out[item.attribute_code] = map;
  }
  return out;
}

/**
 * One product's full detail for the Quick View panel. Returns null when the sku
 * has no storefront product — the caller shows an empty state rather than a
 * half-populated panel.
 */
export async function fetchTcQuickViewGraphQL(sku: string): Promise<TcQuickViewProduct | null> {
  const data = await executeGraphQLQuery(tcQuickViewQuery(sku));
  return (data?.products?.items?.[0] as TcQuickViewProduct | undefined) ?? null;
}
