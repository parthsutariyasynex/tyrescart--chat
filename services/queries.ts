/**
 * GraphQL Queries for the TyresCart Magento endpoint.
 *
 * Centralized here so both GraphQL service calls share a single
 * source of truth. Each builder returns the query string used by
 * `services/graphql.ts`. Types live in `./types`.
 */
import type {
  ProductsQueryVars,
  SupplierProductsQueryVars,
  TyresChatQueryVars,
} from "./types";

/* ─────────────────────────────────────────────
   supplierProducts
───────────────────────────────────────────── */
export function supplierProductsQuery(vars: SupplierProductsQueryVars = {}): string {
  const {
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
    pageSize = 10,
    currentPage = 1,
    sortField = "price",
    sortDirection = "ASC",
  } = vars;

  const esc = (s: string) => s.replace(/"/g, '\\"');
  const filterParts: string[] = [];
  if (brand) filterParts.push(`brand: "${esc(brand)}"`);
  if (plain_size) filterParts.push(`plain_size: "${esc(plain_size)}"`);
  if (is_latest !== undefined) filterParts.push(`is_latest: ${is_latest}`);
  if (year) filterParts.push(`year: "${esc(year)}"`);
  if (country) filterParts.push(`country: "${esc(country)}"`);
  if (source_name) filterParts.push(`source_name: "${esc(source_name)}"`);
  if (brand_category) filterParts.push(`brand_category: "${esc(brand_category)}"`);
  if (product_name) filterParts.push(`product_name: "${esc(product_name)}"`);
  if (sku) filterParts.push(`sku: "${esc(sku)}"`);
  if (size) filterParts.push(`size: "${esc(size)}"`);
  const filterStr = filterParts.length ? `filter: { ${filterParts.join(", ")} }, ` : "";

  return `query {
    supplierProducts(
      ${filterStr}pageSize: ${pageSize}
      currentPage: ${currentPage}
      sort: { field: "${sortField}", direction: ${sortDirection} }
    ) {
      total_count
      page_info {
        current_page
        total_pages
      }
      items {
        id
        sku
        product_name
        brand
        brand_category
        size
        cost
        price
        fitting_price
        source_name
        product_source
        set_price
        product_url
        country
        year
        is_latest
        runflat
        date: source_date
      }
    }
  }`;
}

/* ─────────────────────────────────────────────
   products (default Magento storefront query)
───────────────────────────────────────────── */
/**
 * Builds the stock Magento `products` query.
 *
 * Notes for this store:
 * - `sort` only accepts `relevance`, `name`, `position` — `price` is NOT
 *   enabled by ProductAttributeSortInput and errors if used.
 * - `filter` accepts `sku`/`category_uid`/`size` (eq) and `name` (match).
 *   `price` is NOT a filterable attribute on this store's
 *   ProductAttributeFilterInput and errors if used.
 * - `search` and `filter` may be combined; Magento requires at least one
 *   of search / filter, so callers should pass one or the other.
 */
export function productsQuery(vars: ProductsQueryVars = {}): string {
  const {
    search,
    sku,
    name,
    size,
    categoryUid,
    pageSize = 20,
    currentPage = 1,
    sortField = "relevance",
    sortDirection = "ASC",
  } = vars;

  // Escape any embedded double-quotes to keep the inline string valid.
  const esc = (s: string) => s.replace(/"/g, '\\"');

  const filterParts: string[] = [];
  if (sku) filterParts.push(`sku: { eq: "${esc(sku)}" }`);
  if (name) filterParts.push(`name: { match: "${esc(name)}" }`);
  if (size) filterParts.push(`size: { eq: "${esc(size)}" }`);
  if (categoryUid) filterParts.push(`category_uid: { eq: "${esc(categoryUid)}" }`);
  const filterArg = filterParts.length ? `filter: { ${filterParts.join(", ")} }, ` : "";

  // Magento REQUIRES `search` or `filter`; omitting both errors with
  // "'search' or 'filter' input argument is required." When a caller supplies
  // neither a term nor a filter, an empty `search: ""` acts as match-all.
  const searchArg =
    search !== undefined && search !== ""
      ? `search: "${esc(search)}", `
      : filterParts.length
        ? ""
        : `search: "", `;

  return `query {
    products(
      ${searchArg}${filterArg}pageSize: ${pageSize}
      currentPage: ${currentPage}
      sort: { ${sortField}: ${sortDirection} }
    ) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      items {
        uid
        sku
        name
        stock_status
        url_key
        image {
          url
          label
        }
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
          }
        }
        categories {
          id
          uid
          name
          url_key
        }
      }
    }
  }`;
}

/* ─────────────────────────────────────────────
   tyresChat
───────────────────────────────────────────── */
export function tyresChatQuery(vars: TyresChatQueryVars = {}): string {
  const { category, status = 1, pageSize = 200 } = vars;

  const filters: string[] = [];
  if (category) filters.push(`category: "${category}"`);
  if (status !== undefined) filters.push(`status: ${status}`);
  const filterStr = filters.length ? `filter: { ${filters.join(", ")} }` : "";

  return `query {
    tyresChat(
      ${filterStr ? filterStr + ", " : ""}pageSize: ${pageSize}
    ) {
      total_count
      items {
        id
        shortcut
        description
        category
        sort_order
        status
      }
    }
  }`;
}

/* ─────────────────────────────────────────────
   tcProducts — storefront `products` for the TC Products page
   ADDITIVE. Kept separate from `productsQuery` above, which /products uses:
   widening that one would change that page's payload. Both live here so every
   GraphQL query string in the app is defined in this file.
───────────────────────────────────────────── */

export type TcSortField = "name" | "position" | "relevance";
export type TcSortDirection = "ASC" | "DESC";

export interface TcProductsQueryVars {
  search?: string;
  pageSize?: number;
  currentPage?: number;
  sortField?: TcSortField;
  sortDirection?: TcSortDirection;
}

/**
 * Attributes Magento returns as option IDs rather than text, so the caller can
 * resolve them through {@link tcAttributeLabelsQuery}.
 */
export const TC_LABELLED_ATTRIBUTES = [
  "brand",
  "tyre_size",
  "runflat",
  "year",
  "country",
  "oem_marking",
] as const;

/**
 * Storefront products for the TC Products table.
 *
 * `brand` / `tyre_size` / `runflat` / `oem_marking` / `year` / `country` come
 * back as INTEGER option ids (e.g. `oem_marking: 1571`), never as text — they
 * must be resolved with tcAttributeLabelsQuery or the table shows raw numbers.
 * `load_index` is free text ("107V").
 */
export function tcProductsQuery(vars: TcProductsQueryVars = {}): string {
  const {
    search = "",
    pageSize = 20,
    currentPage = 1,
    sortField = "name",
    sortDirection = "ASC",
  } = vars;

  // Escape any embedded double-quotes to keep the inline string valid.
  const esc = (s: string) => s.replace(/"/g, '\\"');

  // Magento REQUIRES `search` or `filter`; an empty search acts as match-all.
  return `query {
    products(
      search: "${esc(search)}"
      pageSize: ${pageSize}
      currentPage: ${currentPage}
      sort: { ${sortField}: ${sortDirection} }
    ) {
      total_count
      page_info { current_page page_size total_pages }
      items {
        uid
        sku
        name
        stock_status
        url_key
        brand
        tyre_size
        load_index
        runflat
        oem_marking
        year
        country
        offers
        image { url label }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
          }
        }
        categories { id uid name url_key }
      }
    }
  }`;
}

/** Option id → label maps for {@link TC_LABELLED_ATTRIBUTES}. Fetched once. */
export function tcAttributeLabelsQuery(): string {
  const attrs = TC_LABELLED_ATTRIBUTES
    .map((code) => `{ attribute_code: "${code}", entity_type: "catalog_product" }`)
    .join(", ");
  return `query {
    customAttributeMetadata(attributes: [${attrs}]) {
      items {
        attribute_code
        attribute_options { value label }
      }
    }
  }`;
}
