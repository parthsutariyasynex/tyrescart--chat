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
  /**
   * Promotional offer, as an attribute OPTION ID — not a boolean.
   *
   * Measured on the live catalogue: 8,025 products null, 159 zero (no option
   * set), 245 → 3591 "Free Wheel Alignment", 97 → 3590 "Buy 3 Get 1 Free". The
   * attribute defines 8 options in total. `null` and `0` both mean "no offer";
   * any other id is a real one. (`is_offers` does NOT exist on this schema.)
   */
  offers: number | null;
  /** Tyre category attribute option ID (1498 -> Budget, 1499 -> Quality, 1500 -> Premium, etc.) */
  tyres_category?: number | null;
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

/** One entry from `custom_attributesV2`: either free text or selected options. */
export interface TcAttributeItem {
  code: string;
  /** Present on free-text attributes, e.g. `load_index: "79T"`. */
  value?: string | null;
  /** Present on select attributes, e.g. `height: [{label:"65", value:"52"}]`. */
  selected_options?: { label: string; value: string }[] | null;
}

/** A single product as returned by {@link tcQuickViewQuery}. */
export interface TcQuickViewProduct {
  sku: string;
  name: string;
  stock_status: string | null;
  url_key: string | null;
  offers: number | null;
  /** Tyre pattern as an option id (636 = "Ultra 5"). A DIRECT field: it is not
   *  reachable via `custom_attributesV2`, which currently errors out entirely.
   *  Resolve through {@link TcAttributeLabels}. */
  pattern: number | null;
  image: { url: string | null; label: string | null } | null;
  media_gallery: { url: string | null; label: string | null }[] | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number | null; currency: string | null };
      final_price: { value: number | null; currency: string | null };
    };
  } | null;
  custom_attributesV2: { items: (TcAttributeItem | null)[] | null } | null;
}

/** One point from `supplierProductPriceHistory`. `date` is "DD-MMM-YYYY". */
export interface SupplierPriceHistoryPoint {
  date: string;
  price: number;
}

/** Form payload for `createCrmBooking`. Every value comes from user input. */
export interface CrmBookingInput {
  name: string;
  phone: string;
  email?: string;
  tire_size_1?: string;
  tire_size_2?: string;
  plant_number?: string;
  make?: string;
  model?: string;
  year?: string;
  note?: string;
}

export interface CrmBookingResult {
  success: boolean;
  message: string | null;
  booking: {
    entity_id: number | string | null;
    tire_size_1: string | null;
    tire_size_2: string | null;
    detail: string | null;
    enquiry_date: string | null;
    status: string | null;
    priority: string | null;
    vehicle: {
      make: string | null;
      model: string | null;
      year: string | null;
      plant_number: string | null;
    } | null;
  } | null;
  customer: {
    entity_id: number | string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

export interface CrmVehicle {
  entity_id: number | string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  plant_number: string | null;
  tire_size_1: string | null;
  tire_size_2: string | null;
}

/**
 * One row of `crmRecentBookings` — the CRM's own recent-enquiry list.
 *
 * This endpoint did NOT exist when the list-query candidates were probed
 * (`crmBookings`, `crmCustomerList`, `crmCustomerSearch`, `crmInquiries` and the
 * rest all failed), which is why the enquiry table used to open empty and fill
 * only from a phone lookup. It takes NO arguments — verified against the live
 * API: limit, pageSize, count, first and currentPage are all rejected as
 * "Unknown argument" — so it returns a fixed recent window (34 rows when
 * measured), newest first.
 *
 * `customer` and `vehicle` are both nullable: 18 of 34 rows carried a vehicle
 * and 23 of 34 an email.
 */
export interface CrmRecentBooking {
  entity_id: number | string | null;
  detail: string | null;
  tire_size_1: string | null;
  /** NUMERIC CODE, e.g. 2 — the schema publishes no label mapping. */
  priority: number | string | null;
  /** NUMERIC CODE, e.g. 1 — see the note on `priority`. */
  status: number | string | null;
  enquiry_date: string | null;
  created_at: string | null;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    make: string | null;
    model: string | null;
    year: string | null;
    plant_number: string | null;
  } | null;
}

export interface CrmBooking {
  entity_id: number | string | null;
  contact_method: string | null;
  tire_size_1: string | null;
  quantity: number | string | null;
  brand_preference: string | null;
  quoted_price: number | string | null;
  enquiry_date: string | null;
  follow_up_date: string | null;
  /** NUMERIC CODE, e.g. 2 — not a label. The schema exposes no mapping
   *  (`crm_booking` is not a valid customAttributeMetadata entity_type), so the
   *  UI shows the code rather than inventing a name for it. */
  priority: number | string | null;
  /** NUMERIC CODE, e.g. 1 — see the note on `priority`. */
  status: number | string | null;
  detail: string | null;
  notes: string | null;
  vehicle: {
    make: string | null;
    model: string | null;
    year: string | null;
    plant_number: string | null;
  } | null;
}

/** A CRM customer with their vehicles and booking history. */
export interface CrmCustomer {
  entity_id: number | string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  emirates: string | null;
  area: string | null;
  status: string | null;
  vehicles: CrmVehicle[];
  bookings: CrmBooking[];
}

/* ── Klever Quotation ── */

/** A history row recorded together with a new quote. */
export interface KleverQuoteHistoryEntryInput {
  /** Short action key, e.g. "payment_request", "payment_response". */
  action?: string;
  status?: string;
  /** Free text / JSON payload for this activity. */
  comment?: string;
  changed_by?: string;
}

export interface KleverQuoteInput {
  customer_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  car_plate?: string;
  car_make?: string;
  car_model?: string;
  /** Int upstream, not a string. */
  car_year?: number;
  /** The ONLY required field. */
  amount: number;
  notes?: string;
  /** Defaults to "draft" server-side. */
  status?: string;
  /** "payment_link" | "manual" — defaults to "manual" server-side. */
  quote_mode?: string;
  /** Gateway, e.g. "tabby", "tamara". */
  payment_method?: string;
  created_by?: string;
  history?: KleverQuoteHistoryEntryInput[];
}

/** Standalone history row appended to an EXISTING quote. */
export interface KleverQuoteHistoryInput {
  /** Rejected with "Quote N does not exist." if unknown. */
  quote_id: number;
  action?: string;
  status?: string;
  comment?: string;
  changed_by?: string;
}

export interface KleverQuote {
  quote_id: number | null;
  /** Server-generated, e.g. "TC-Q-030820260002". Never supplied by the caller. */
  quote_number: string | null;
  /** Server-set, e.g. "2026-08-03". Not an input field. */
  date: string | null;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  car_plate: string | null;
  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  amount: number | null;
  /** Server-computed (observed 5). Output only — cannot be sent. */
  vat_percent: number | null;
  notes: string | null;
  status: string | null;
  quote_mode: string | null;
  payment_method: string | null;
  /** Observed to return null on create, despite being in the schema. */
  created_at: string | null;
}

export interface KleverQuoteHistory {
  history_id: number | null;
  klever_quote_id: number | null;
  action: string | null;
  status: string | null;
  comment: string | null;
  changed_by: string | null;
  created_at: string | null;
}

/* ── Klever Vehicle Search ── */

export interface KleverVehicleItem {
  make_name: string | null;
  model_name: string | null;
  year_ranges: string | null;
  front_width: number | string | null;
  front_height: number | string | null;
  front_rim: number | string | null;
  rear_width: number | string | null;
  rear_height: number | string | null;
  rear_rim: number | string | null;
  is_stock: boolean | number | string | null;
}

export interface KleverVehicleSearchResult {
  status: boolean | number | string | null;
  data: KleverVehicleItem[] | null;
}

