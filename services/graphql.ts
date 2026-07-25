/**
 * Magento GraphQL API Client for TyresCart
 * Target Endpoint: https://www.tyrescart.com/graphql
 *
 * Query strings live in `./queries`; types live in `./types`.
 */
import { productsQuery, supplierProductsQuery, tyresChatQuery } from "./queries";
import type {
  FetchProductsParams,
  FetchSupplierProductsParams,
  ProductsResponse,
  SupplierProductsResponse,
  TyresChatResponse,
} from "./types";

/**
 * Execute GraphQL Query through proxy or directly
 */
async function executeGraphQLQuery(query: string) {
  const isServer = typeof window === "undefined";
  const targetUrl = isServer ? "https://www.tyrescart.com/graphql" : "/api/graphql";

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg = data?.errors?.[0]?.message || data?.error || `GraphQL HTTP error! Status: ${res.status}`;
      throw new Error(errMsg);
    }


    if (data?.errors && data.errors.length > 0) {
      console.warn("GraphQL API error response:", data.errors);
      throw new Error(data.errors[0]?.message || "GraphQL error");
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
