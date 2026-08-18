import type { CrmBookingInput, CrmCustomerUpdateInput } from "./types";
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

  const esc = (s: string) => String(s ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
        qty
        tyre_marking
        offers
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
  const esc = (s: string) => String(s ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

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
  "offers",
  "tyres_category",
  /* Tyre pattern. Fetched as a DIRECT product field because
     `custom_attributesV2` — Quick View's only other route to it — currently
     returns an Internal server error and zero attributes for ordinary tyres. */
  "pattern",
] as const;

/**
 * Storefront products for the TC Products table.
 *
 * `brand` / `tyre_size` / `runflat` / `oem_marking` / `year` / `country` /
 * `offers` / `tyres_category` come back as INTEGER option ids (e.g. `oem_marking: 1571`), never as text — they
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
  const esc = (s: string) => String(s ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

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
        status
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
        tyres_category
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

/**
 * Quick View — everything the detail panel shows for ONE product.
 *
 * Stock Magento apart from `offers`, which is a store EAV attribute Magento
 * auto-exposes on ProductInterface (verified: the query runs unchanged with that
 * line removed).
 *
 * The spec grid reads `custom_attributesV2` rather than the top-level fields
 * because it returns labels ALREADY RESOLVED — `height → "65"`, not the option id
 * `52` — so the panel needs no second `customAttributeMetadata` round-trip.
 *
 * Attribute codes do not match the on-screen labels: PROFILE is `height` and
 * LOAD/SPEED is `load_index`. See QUICK_VIEW_SPEC in the modal.
 */
export function tcQuickViewQuery(sku: string): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    products(filter: { sku: { eq: "${esc(sku)}" } }, pageSize: 1) {
      items {
        sku
        name
        stock_status
        url_key
        offers
        pattern
        image { url label }
        media_gallery { url label }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
          }
        }
        custom_attributesV2 {
          items {
            code
            ... on AttributeValue { value }
            ... on AttributeSelectedOptions { selected_options { label value } }
          }
        }
      }
    }
  }`;
}

/**
 * Candidates for the Quick View attribute fallback, when a SKU has no storefront
 * product.
 *
 * Uses `search`, deliberately, not `filter`:
 * - `tyre_size` is NOT in `ProductAttributeFilterInput` (verified — the server
 *   suggests `tyre_type`), so size cannot be filtered on.
 * - `pattern` option labels are not unique: "PorTran KC53" resolves to both 3660
 *   and 819 in `customAttributeMetadata`, and filtering on the wrong id silently
 *   returns nothing.
 *
 * Magento's search ANDs the terms against the product name, which carries brand,
 * size and pattern ("Kumho 215/65 R17 108H PorTran KC53 2026"), so a combined
 * term narrows correctly — and returns nothing when the combination genuinely is
 * not stocked. The caller still verifies each candidate attribute-by-attribute
 * and only accepts a SINGLE exact match; this query merely narrows the field.
 */
export function tcQuickViewMatchQuery(terms: string, pageSize = 20): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    products(search: "${esc(terms)}", pageSize: ${pageSize}) {
      total_count
      items {
        sku
        name
        stock_status
        url_key
        offers
        image { url label }
        media_gallery { url label }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
          }
        }
        custom_attributesV2 {
          items {
            code
            ... on AttributeValue { value }
            ... on AttributeSelectedOptions { selected_options { label value } }
          }
        }
      }
    }
  }`;
}

/**
 * Price history for ONE supplier product, straight from the API.
 *
 * `source` is the row's `product_source` discriminator:
 * - "supplier"   → the series is the COST we pay
 * - "competitor" → the series is the competitor's retail PRICE
 * Either way the field comes back as `price`; the caller labels it.
 *
 * Dates arrive as "08-May-2025" (DD-MMM-YYYY), not ISO — see `parseHistoryDate`.
 */
export function supplierPriceHistoryQuery(id: number | string, source: string): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    supplierProductPriceHistory(id: ${Number(id)}, source: "${esc(source)}") {
      date
      price
    }
  }`;
}

/**
 * Create a CRM booking enquiry.
 *
 * Every value is interpolated from the form — nothing here is fixed. Optional
 * fields are OMITTED rather than sent empty, so a blank input never overwrites
 * something already on the customer record.
 *
 * NOTE this is a WRITE with no counterpart: the schema has no
 * deleteCrmBooking / cancelCrmBooking / updateCrmBooking, so a mistake can only
 * be undone in the Magento admin. It must never be issued automatically — only
 * from an explicit user submit.
 */
export function createCrmBookingMutation(input: CrmBookingInput): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const field = (k: string, v: string | undefined) =>
    v !== undefined && String(v).trim() !== "" ? `${k}: "${esc(String(v).trim())}"` : "";

  const fields = [
    field("name", input.name),
    field("phone", input.phone),
    field("email", input.email),
    field("tire_size_1", input.tire_size_1),
    field("tire_size_2", input.tire_size_2),
    field("plant_number", input.plant_number),
    field("make", input.make),
    field("model", input.model),
    field("year", input.year),
    field("note", input.note),
  ].filter(Boolean).join("\n      ");

  return `mutation {
    createCrmBooking(input: {
      ${fields}
    }) {
      success
      message
      booking {
        entity_id
        tire_size_1
        tire_size_2
        detail
        enquiry_date
        status
        priority
        vehicle { make model year plant_number }
      }
      customer { entity_id name phone email }
    }
  }`;
}

/**
 * Look up a CRM customer by phone, with their vehicles and booking history.
 *
 * The phone is matched as an EXACT STRING — the endpoint does no normalising.
 * Measured on the live data: "0501234567" and "501234567" return two DIFFERENT
 * customers, and "+971501234567" / "050 123 4567" / "050-123-4567" all miss. The
 * caller must send the number in the form it is stored.
 *
 * A miss is reported as a GraphQL ERROR (`graphql-no-such-entity`) alongside
 * `data.crmCustomerByPhone: null`, not as a plain null — see
 * `fetchCrmCustomerByPhoneGraphQL`, which turns that into an empty result.
 */
/**
 * The CRM's recent enquiries. Takes no arguments (verified: limit / pageSize /
 * count / first / currentPage are all rejected), so there is nothing to page or
 * filter with server-side — the modal filters the returned window client-side,
 * exactly as it already does for a looked-up customer's bookings.
 */
/**
 * Update an existing CRM customer.
 *
 * `entity_id` is REQUIRED and typed `Int!` upstream — it identifies the record,
 * so it is the one field that is never omitted.
 *
 * Every other field is omitted when blank rather than sent as "", for the same
 * reason `createCrmBookingMutation` does it: an empty string would overwrite
 * data already on the customer's record. Unlike `createCrmBooking` this does
 * NOT file a booking — it only edits the customer.
 */
export function updateCrmCustomerMutation(input: CrmCustomerUpdateInput): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const fields: string[] = [`entity_id: ${Number(input.entity_id)}`];
  const optional: [keyof CrmCustomerUpdateInput, string][] = [
    ["name", "name"],
    ["phone", "phone"],
    ["email", "email"],
    ["city", "city"],
  ];
  for (const [key, gql] of optional) {
    const value = String(input[key] ?? "").trim();
    /* City must be sent even when blank so the user can clear it.
       Other optional fields are still omitted when empty to avoid
       overwriting data already on the customer record. */
    if (value || key === "city") fields.push(`${gql}: "${esc(value)}"`);
  }
  return `mutation {
    updateCrmCustomer(input: { ${fields.join(", ")} }) {
      success
      message
      customer {
        entity_id
        name
        phone
        email
        area
      }
    }
  }`;
}

export function crmRecentBookingsQuery(): string {
  return `query {
    crmRecentBookings {
      entity_id
      detail
      tire_size_1
      tire_size_2
      priority
      status
      enquiry_date
      created_at
      customer {
        entity_id
        name
        phone
        email
      }
      vehicle {
        make
        model
        year
        plant_number
      }
    }
  }`;
}

export function crmCustomerByPhoneQuery(phone: string): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    crmCustomerByPhone(phone: "${esc(phone)}") {
      entity_id
      name
      email
      phone
      nationality
      emirates
      area
      status
      vehicles {
        entity_id
        make
        model
        year
        plant_number
        tire_size_1
        tire_size_2
      }
      bookings {
        entity_id
        contact_method
        tire_size_1
        tire_size_2
        quantity
        brand_preference
        quoted_price
        enquiry_date
        follow_up_date
        priority
        status
        detail
        notes
        vehicle {
          make
          model
          year
          plant_number
        }
      }
    }
  }`;
}

/* ─────────────────────────────────────────────────────────────
   Klever Quotation

   WRITE-ONLY module: two mutations and NO queries (verified against the live
   endpoint and the published docs). Once created, a quote cannot be read back —
   the mutation response is the only chance to capture quote_id / quote_number.

   There is also no delete / cancel / update, so neither operation may be cached
   or retried: a repeat call files a SECOND quote.

   These are the only documents in this file that take VARIABLES. `history` is a
   nested array and `amount` / `car_year` are numeric, so interpolation would
   mis-type the numbers and break on an apostrophe in a customer name.
───────────────────────────────────────────────────────────── */

export const CREATE_KLEVER_QUOTE = /* GraphQL */ `
  mutation CreateKleverQuote($input: KleverQuoteInput!) {
    createKleverQuote(input: $input) {
      quote_id
      quote_number
      date
      customer_name
      phone
      email
      address
      city
      country
      car_plate
      car_make
      car_model
      car_year
      amount
      vat_percent
      notes
      status
      quote_mode
      payment_method
      created_at
    }
  }
`;

export const ADD_QUOTE_HISTORY = /* GraphQL */ `
  mutation AddQuoteHistory($input: KleverQuoteHistoryInput!) {
    addKleverQuoteHistory(input: $input) {
      history_id
      klever_quote_id
      action
      status
      comment
      changed_by
      created_at
    }
  }
`;

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

/* ─────────────────────────────────────────────────────────────
   Klever Vehicle Search (wheel fitment lookup)

   Query builder only — NOT wired to a fetcher and not called anywhere yet.
   `width` / `height` / `rim` are the tyre size's own numbers (e.g. 215/55 R17),
   and the API returns the vehicles that size fits: make, model, the year range
   it applies to, both axles' fitment (front/rear can differ), and whether that
   fitment is the vehicle's stock (factory) size.

   All three args are plain numbers, so they are interpolated directly — no
   string escaping is needed the way the filter-string queries above need it.
───────────────────────────────────────────────────────────── */
/**
 * Vehicles fitting one tyre size.
 *
 * `make_slug` / `model_slug` are selected because they are the keys
 * `kleverVehicleYears` and `kleverVehicleModifications` take — "Audi"/"A5"
 * arrive as "audi"/"a5", so a selected row needs no name→slug lookup.
 *
 * NOTE: GraphQL has no /* *\/ comment syntax — only `#`. A block comment inside
 * one of these documents is a parse error, not an annotation.
 */
export function kleverVehicleSearchQuery(width: number, height: number, rim: number): string {
  return `query {
    kleverVehicleSearch(width: ${width}, height: ${height}, rim: ${rim}) {
      status
      data {
        make_name
        model_name
        make_slug
        model_slug
        year_ranges
        front_width
        front_height
        front_rim
        rear_width
        rear_height
        rear_rim
        is_stock
      }
    }
  }`;
}

/** Every vehicle make. Takes no required arguments. */
export function kleverVehicleMakesQuery(): string {
  return `query {
    kleverVehicleMakes {
      data {
        name
        slug
      }
      meta {
        count
      }
    }
  }`;
}

/**
 * Every model for one make.
 *
 * Returns the FULL list — `limit` is optional and omitting it gives all of them
 * (measured: Toyota returns 41 with and without `limit: 1000`). Carries no
 * wheel/tyre fields: sizes live only on `kleverVehicleModifications`.
 */
export function kleverVehicleModelsQuery(make: string): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    kleverVehicleModels(make: "${esc(make)}") {
      data {
        name
        slug
        year_ranges
      }
      meta {
        count
      }
    }
  }`;
}

/**
 * Production years for a make/model, newest first.
 *
 * `data` is `[KleverVehicleYear]!` — an OBJECT list, so it needs a sub-selection;
 * asking for `data` bare fails with "must have a sub selection". `slug` and
 * `name` both carry the year as an Int.
 */
export function kleverVehicleYearsQuery(make: string, model: string): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    kleverVehicleYears(make: "${esc(make)}", model: "${esc(model)}") {
      data {
        slug
        name
      }
      meta {
        count
      }
    }
  }`;
}

/**
 * Trim/engine variants for ONE year, with their wheel specs.
 *
 * `year` is `Int!` and there is no bulk form — `years: [...]`, `generation:` and
 * omitting it are all rejected, so a full fitment list costs one request per
 * year (Camry 25, Porsche 911 23). Fetch only when a vehicle is selected.
 */
export function kleverVehicleModificationsQuery(
  make: string,
  model: string,
  year: number,
): string {
  const esc = (v: string) => String(v ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `query {
    kleverVehicleModifications(make: "${esc(make)}", model: "${esc(model)}", year: ${Number(year)}) {
      data {
        name
        trim
        is_stock
        front_wheel {
          tire_full
        }
        rear_wheel {
          tire_full
        }
      }
    }
  }`;
}
