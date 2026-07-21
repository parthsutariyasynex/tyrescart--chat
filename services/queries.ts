/**
 * GraphQL Queries for the TyresCart Magento endpoint.
 *
 * Centralized here so both GraphQL service calls share a single
 * source of truth. Each builder returns the query string used by
 * `services/graphql.ts`. Types live in `./types`.
 */
import type { SupplierProductsQueryVars, TyresChatQueryVars } from "./types";

/* ─────────────────────────────────────────────
   supplierProducts
───────────────────────────────────────────── */
export function supplierProductsQuery(vars: SupplierProductsQueryVars = {}): string {
  const {
    brand,
    plain_size,
    pageSize = 10,
    currentPage = 1,
    sortField = "price",
    sortDirection = "ASC",
  } = vars;

  const filterParts: string[] = [];
  if (brand) filterParts.push(`brand: "${brand}"`);
  if (plain_size) filterParts.push(`plain_size: "${plain_size}"`);
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
        source_name
        country
        year
        is_latest
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
