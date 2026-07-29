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
  /** 1 = current/latest records only, 0 = historical. Omit for all. */
  is_latest?: number;
  year?: string;
  country?: string;
  source_name?: string;
  brand_category?: string;
  product_name?: string;
  sku?: string;
  size?: string;
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

/**
 * Which side of the catalogue a row belongs to.
 *
 * `supplierProducts` is a COMBINED feed despite its name — it returns both
 * sides, and `product_source` is the discriminator. Verified against the live
 * endpoint: `product_source: "supplier"` → 51,266 rows,
 * `product_source: "competitor"` → 267,402 rows, summing exactly to the
 * unfiltered 318,668. The field is also accepted as a `filter` argument, so
 * either side can be requested server-side.
 *
 * Typed as a union plus `(string & {})` so unknown values the backend may add
 * later still type-check instead of silently narrowing to the two known ones.
 */
export type ProductSource = "supplier" | "competitor" | (string & {});

export interface SupplierProductItem {
  id: string | number;
  sku: string;
  product_name: string;
  brand: string;
  brand_category: string;
  size: string;
  cost?: number;
  price?: number;
  /** Supplier's fitting/fitment charge. Mostly 0, but genuinely populated on
   *  some rows (e.g. GCC sku BR1756515-25A = 450), so it must come from the
   *  API rather than being defaulted client-side. */
  fitting_price?: number;
  source_name?: string;
  /** "supplier" | "competitor" — see ProductSource. Absent on rows cached
   *  before this field was added to the query; re-sync populates it. */
  product_source?: ProductSource;
  /** Competitor listing price. 0 on supplier rows. */
  set_price?: number;
  /** Competitor product page URL. Empty string on supplier rows. */
  product_url?: string;
  country?: string;
  year?: number;
  is_latest?: number;
  runflat?: boolean | string | number;
  date?: string;
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
  /** 1 = current/latest records only, 0 = historical. Omit for all. */
  is_latest?: number;
  year?: string;
  country?: string;
  source_name?: string;
  brand_category?: string;
  product_name?: string;
  sku?: string;
  size?: string;
  pageSize?: number;
  currentPage?: number;
  sortField?: string;
  sortDirection?: "ASC" | "DESC";
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

/* ─────────────────────────────────────────────────────────────
   TC Products — the storefront `products` field as the tc-products page reads
   it. Declared here (rather than in the page's data layer) because the sync
   task in `syncTasks.ts` consumes the same shapes, and services must not import
   from `app/`.
───────────────────────────────────────────────────────────── */

export interface TcApiProduct {
  uid: string;
  sku: string;
  name: string;
  stock_status: string | null;
  url_key: string | null;
  /** Option IDs — resolve through {@link TcAttributeLabels}. */
  brand: number | null;
  tyre_size: number | null;
  runflat: number | null;
  /** OEM approval marking (e.g. "* MOE", "* ZP"). The attribute is
   *  `oem_marking`, NOT `oem` — 274 options, null on non-OE-fitment tyres. */
  oem_marking: number | null;
  year: number | null;
  country: number | null;
  /** Free-text on this store, e.g. "107V". */
  load_index: string | null;
  image: { url: string | null; label: string | null } | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number | null; currency: string | null };
      final_price: { value: number | null; currency: string | null };
    };
  } | null;
  categories: { id: number; uid: string; name: string; url_key: string }[] | null;
}

export interface TcProductsResponse {
  total_count: number;
  page_info: { current_page: number; page_size: number; total_pages: number };
  items: TcApiProduct[];
}

/** attribute_code → (option id → label). */
export type TcAttributeLabels = Record<string, Record<string, string>>;

/** One page of tc products as streamed by the sync task. Page-keyed so a batch
 *  arriving twice overwrites its slot instead of duplicating rows. */
export interface TcProductsBatch {
  page: number;
  items: TcApiProduct[];
}
