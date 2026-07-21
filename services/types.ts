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
