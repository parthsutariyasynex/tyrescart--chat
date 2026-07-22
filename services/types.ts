/**
 * Shared GraphQL types for the TyresCart Magento endpoint.
 *
 * Kept separate from queries.ts and graphql.ts so query builders and
 * the client both import from a single type source.
 */

/* ── Query variables ── */
export interface SupplierProductsQueryVars {
  brand?: string;
  plain_size?: string;
  pageSize?: number;
  currentPage?: number;
  sortField?: string;
  sortDirection?: "ASC" | "DESC";
}

export interface TyresChatQueryVars {
  category?: string;
  status?: number;
  pageSize?: number;
}

/* ── supplierProducts response ── */
export interface SupplierProductItem {
  id: string | number;
  sku: string;
  product_name: string;
  brand: string;
  brand_category: string;
  size: string;
  cost?: number;
  price?: number;
  source_name?: string;
  country?: string;
  year?: number;
  is_latest?: number;
}

export interface SupplierProductsPageInfo {
  current_page: number;
  total_pages: number;
}

export interface SupplierProductsResponse {
  total_count: number;
  page_info?: SupplierProductsPageInfo;
  items: SupplierProductItem[];
}

/* ── tyresChat response ── */
export interface TyresChatItem {
  id: string | number;
  shortcut: string;
  description: string;
  category: string;
  sort_order: number;
  status: number;
}

export interface TyresChatResponse {
  total_count: number;
  items: TyresChatItem[];
}

/* ── Service call params ── */
export interface FetchSupplierProductsParams {
  brand?: string;
  plain_size?: string;
  pageSize?: number;
  currentPage?: number;
}

/* ─────────────────────────────────────────────
   products (default Magento storefront query)
───────────────────────────────────────────── */

/** Valid Magento sort attributes exposed by ProductAttributeSortInput.
 *  `price` is NOT enabled on this store — use `relevance` or `name`. */
export type ProductsSortField = "relevance" | "name" | "position";

export interface ProductsQueryVars {
  /** Full-text search term (maps to the `search` arg). */
  search?: string;
  /** Exact SKU match (ProductAttributeFilterInput → sku: { eq }). */
  sku?: string;
  /** Partial name match (ProductAttributeFilterInput → name: { match }). */
  name?: string;
  /** Exact tyre size match (ProductAttributeFilterInput → size: { eq }). */
  size?: string;
  /** Category uid filter (ProductAttributeFilterInput → category_uid: { eq }). */
  categoryUid?: string;
  pageSize?: number;
  currentPage?: number;
  sortField?: ProductsSortField;
  sortDirection?: "ASC" | "DESC";
}

export interface ProductMoney {
  value: number;
  currency?: string;
}

export interface ProductCategory {
  id: number;
  uid: string;
  name: string;
  url_key?: string;
}

export interface ProductItem {
  uid: string;
  sku: string;
  name: string;
  stock_status?: string;
  url_key?: string;
  image?: { url: string; label: string } | null;
  price_range: {
    minimum_price: {
      regular_price: ProductMoney;
      final_price?: ProductMoney;
    };
  };
  categories?: ProductCategory[];
}

export interface ProductsPageInfo {
  current_page: number;
  page_size: number;
  total_pages: number;
}

export interface ProductsResponse {
  total_count: number;
  page_info?: ProductsPageInfo;
  items: ProductItem[];
}

export interface FetchProductsParams {
  search?: string;
  sku?: string;
  name?: string;
  size?: string;
  categoryUid?: string;
  pageSize?: number;
  currentPage?: number;
  sortField?: ProductsSortField;
  sortDirection?: "ASC" | "DESC";
}
