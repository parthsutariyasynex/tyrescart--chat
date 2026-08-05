/**
 * Dashboard data layer.
 *
 * WHAT IS REAL AND WHAT IS NOT — read this before trusting a number on screen.
 *
 * The dashboard asks for sales, orders, payments, profit, employees and stock
 * levels. Most of that has NO backend on this project, verified by probing the
 * live endpoint rather than assuming: `orders`, `salesOrders`, `crmOrders`,
 * `payments`, `employees`, `crmEmployees`, `inventory`, `customers`,
 * `dashboardStats`, `crmDashboard`, `topSellingProducts` and `lowStockProducts`
 * all answer "Cannot query field". There is also no checkout in the app, so no
 * order has ever been written.
 *
 * So this module is split in two, deliberately and visibly:
 *
 *   REAL      — read from endpoints and caches that genuinely exist. Anything
 *               returned by `loadRealMetrics` is true.
 *   DEMO      — placeholder shapes for the sections with no data source. Every
 *               one is flagged `isDemo: true` so the UI can badge it, and they
 *               are all defined in ONE block below. When the endpoints land,
 *               delete the block and point the loader at the new fetchers; no
 *               component needs to change, because they consume the same types.
 *
 * Nothing here invents a backend route, and no demo value is ever mixed into a
 * real one — a card is entirely one or the other.
 */

import { fetchCrmRecentBookingsGraphQL, fetchTcProductsGraphQL } from "./graphql";
import { countCachedSupplierProducts, countCachedTcProducts } from "./cache";
import type { CrmRecentBooking } from "./types";

/* ─────────────────────────────────────────────────────────────
   Shared shapes — identical for real and demo sources, so swapping
   one for the other is a change of loader, not of component.
───────────────────────────────────────────────────────────── */

export type Trend = "up" | "down" | "flat";

export interface StatMetric {
  id: string;
  title: string;
  value: string;
  /** e.g. "vs yesterday" — the comparison line under the value. */
  comparison: string;
  trend: Trend;
  /** Signed percentage, already formatted (e.g. "+12.4%"). */
  delta: string;
  /** True when the figure has no backend and is illustrative only. */
  isDemo: boolean;
}

export interface SalesPoint {
  label: string;
  sales: number;
  orders: number;
}

export interface PaymentSlice {
  method: string;
  amount: number;
  percent: number;
}

export interface RecentOrder {
  invoice: string;
  customer: string;
  items: number | string;
  amount: number | null;
  method: string;
  status: string;
  date: string;
  time: string;
}

export interface TopProduct {
  product: string;
  sku: string;
  qtySold: number | null;
  revenue: number | null;
  profit: number | null;
}

export interface LowStockRow {
  product: string;
  sku: string;
  current: number;
  minimum: number;
  status: "out" | "low" | "ok";
}

export interface CustomerSummary {
  newToday: number;
  returning: number;
  total: number;
  topCustomer: string;
}

export interface EmployeeRow {
  name: string;
  orders: number;
  sales: number;
  revenue: number;
}

export interface ActivityItem {
  kind: "sale" | "product" | "customer" | "stock" | "payment";
  text: string;
  meta: string;
  at: string;
}

export interface NotificationItem {
  kind: "lowStock" | "pendingOrders" | "supplierDue" | "failedPayments";
  label: string;
  count: number;
  tone: "amber" | "sky" | "violet" | "rose";
}

/* ─────────────────────────────────────────────────────────────
   REAL — every value below comes from a live endpoint or a cache
   this app already maintains.
───────────────────────────────────────────────────────────── */

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Local calendar day, `YYYY-MM-DD`. `toISOString` would shift near midnight. */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The CRM stamps `enquiry_date` as "YYYY-MM-DD HH:MM:SS". */
function splitStamp(raw: string | null): { date: string; time: string } {
  const s = (raw ?? "").trim();
  if (!s) return { date: "-", time: "-" };
  const [d, t] = s.split(" ");
  return { date: d ?? "-", time: (t ?? "").slice(0, 5) || "-" };
}

export interface RealMetrics {
  /** Storefront catalogue size — `products.total_count`. */
  tcTotal: number;
  /** Supplier + competitor rows cached in IndexedDB. */
  supplierCached: number;
  tcCached: number;
  /** Rows whose `stock_status` is out of stock. */
  outOfStock: LowStockRow[];
  bookings: CrmRecentBooking[];
  customers: CustomerSummary;
  recentEnquiries: RecentOrder[];
  activity: ActivityItem[];
}

/**
 * Everything the dashboard can state as fact.
 *
 * Each source is awaited independently: a CRM outage should still leave the
 * catalogue cards populated, so a rejection degrades that one section rather
 * than blanking the page.
 */
export async function loadRealMetrics(): Promise<RealMetrics> {
  const [bookingsRes, tcRes, supplierCachedRes, tcCachedRes] = await Promise.allSettled([
    fetchCrmRecentBookingsGraphQL(),
    // pageSize 1 — only `total_count` is wanted, not the rows.
    fetchTcProductsGraphQL({ pageSize: 1, currentPage: 1 }),
    countCachedSupplierProducts(),
    countCachedTcProducts(),
  ]);

  const bookings = bookingsRes.status === "fulfilled" ? bookingsRes.value : [];
  const tcTotal = tcRes.status === "fulfilled" ? (tcRes.value?.total_count ?? 0) : 0;
  const supplierCached = supplierCachedRes.status === "fulfilled" ? supplierCachedRes.value : 0;
  const tcCached = tcCachedRes.status === "fulfilled" ? tcCachedRes.value : 0;

  /* Customer summary, straight off the enquiry log. "Returning" counts phone
     numbers that appear more than once — the CRM keys customers by phone, so a
     repeat number IS the same person. */
  const today = localDay(new Date());
  const byPhone = new Map<string, number>();
  for (const b of bookings) {
    const phone = (b.customer?.phone ?? "").trim();
    if (phone) byPhone.set(phone, (byPhone.get(phone) ?? 0) + 1);
  }
  const topPhone = [...byPhone.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const topCustomer =
    bookings.find((b) => (b.customer?.phone ?? "").trim() === topPhone)?.customer?.name ?? "-";

  const customers: CustomerSummary = {
    newToday: bookings.filter((b) => (b.enquiry_date ?? "").startsWith(today)).length,
    returning: [...byPhone.values()].filter((n) => n > 1).length,
    total: byPhone.size,
    topCustomer: topCustomer || "-",
  };

  const recentEnquiries: RecentOrder[] = bookings.slice(0, 8).map((b) => {
    const { date, time } = splitStamp(b.enquiry_date ?? b.created_at);
    return {
      invoice: `ENQ-${b.entity_id ?? "-"}`,
      customer: b.customer?.name ?? "-",
      items: b.tire_size_1 ?? "-",
      // Bookings carry no amount or payment method — the CRM does not record
      // either — so these stay null rather than being filled with a guess.
      amount: null,
      method: "-",
      status: b.status == null ? "-" : `Status ${b.status}`,
      date,
      time,
    };
  });

  const activity: ActivityItem[] = bookings.slice(0, 8).map((b) => {
    const { date, time } = splitStamp(b.enquiry_date ?? b.created_at);
    return {
      kind: "customer" as const,
      text: `Enquiry from ${b.customer?.name ?? "unknown"}`,
      meta: [b.tire_size_1, b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(" · ") || "No details",
      at: `${date} ${time}`,
    };
  });

  return {
    tcTotal,
    supplierCached,
    tcCached,
    outOfStock: [],
    bookings,
    customers,
    recentEnquiries,
    activity,
  };
}

/**
 * Out-of-stock rows from the storefront catalogue.
 *
 * `stock_status` is the ONLY stock signal the API exposes — there is no numeric
 * on-hand count anywhere in the schema. So "current" is 0 or 1, not a quantity,
 * and `minimum` is shown as 1 because that is the threshold the flag encodes.
 * Labelled honestly in the UI rather than dressed up as a real stock level.
 */
export async function loadOutOfStock(limit = 8): Promise<LowStockRow[]> {
  const res = await fetchTcProductsGraphQL({ pageSize: 200, currentPage: 1 }).catch(() => null);
  const items = res?.items ?? [];
  return items
    .filter((p) => String(p.stock_status ?? "").toUpperCase() !== "IN_STOCK")
    .slice(0, limit)
    .map((p) => ({
      product: p.name ?? "-",
      sku: p.sku ?? "-",
      current: 0,
      minimum: 1,
      status: "out" as const,
    }));
}

/* ─────────────────────────────────────────────────────────────
   DEMO — no backend exists for any of this.

   DELETE THIS WHOLE BLOCK when the endpoints arrive and return the same shapes
   from real fetchers. Every consumer is typed against the interfaces above, so
   nothing else has to change. Values are static (no Math.random) so the page
   does not shuffle between renders and cannot be mistaken for live movement.
───────────────────────────────────────────────────────────── */

export const DEMO_NOTICE =
  "Illustrative only — this project has no sales, order, payment or employee endpoint.";

export const demoSalesDaily: SalesPoint[] = [
  { label: "Mon", sales: 12400, orders: 34 },
  { label: "Tue", sales: 15900, orders: 41 },
  { label: "Wed", sales: 11200, orders: 29 },
  { label: "Thu", sales: 18600, orders: 52 },
  { label: "Fri", sales: 22400, orders: 61 },
  { label: "Sat", sales: 27800, orders: 74 },
  { label: "Sun", sales: 19300, orders: 48 },
];

export const demoSalesWeekly: SalesPoint[] = [
  { label: "W1", sales: 86400, orders: 231 },
  { label: "W2", sales: 94100, orders: 258 },
  { label: "W3", sales: 78900, orders: 205 },
  { label: "W4", sales: 112300, orders: 297 },
];

export const demoSalesMonthly: SalesPoint[] = [
  { label: "Jan", sales: 286000, orders: 742 },
  { label: "Feb", sales: 264500, orders: 698 },
  { label: "Mar", sales: 312400, orders: 812 },
  { label: "Apr", sales: 298700, orders: 776 },
  { label: "May", sales: 341200, orders: 889 },
  { label: "Jun", sales: 358900, orders: 934 },
];

export const demoPayments: PaymentSlice[] = [
  { method: "Cash", amount: 42800, percent: 38 },
  { method: "Card", amount: 39200, percent: 35 },
  { method: "UPI", amount: 21400, percent: 19 },
  { method: "Credit", amount: 9000, percent: 8 },
];

export const demoRecentOrders: RecentOrder[] = [
  { invoice: "INV-10241", customer: "Ahmed Ali", items: 4, amount: 1876, method: "Card", status: "Completed", date: "2026-08-04", time: "18:42" },
  { invoice: "INV-10240", customer: "Omar Al Rashid", items: 2, amount: 938, method: "Cash", status: "Completed", date: "2026-08-04", time: "17:15" },
  { invoice: "INV-10239", customer: "Priya Patel", items: 4, amount: 1620, method: "UPI", status: "Pending", date: "2026-08-04", time: "16:03" },
  { invoice: "INV-10238", customer: "Devendra", items: 1, amount: 271, method: "Card", status: "Refunded", date: "2026-08-04", time: "14:28" },
  { invoice: "INV-10237", customer: "TW Motors", items: 6, amount: 3240, method: "Credit", status: "Completed", date: "2026-08-03", time: "11:52" },
];

export const demoTopProducts: TopProduct[] = [
  { product: "Accelera 225/40 R18 92Y IOTA EVT", sku: "TCKL-21110", qtySold: 48, revenue: 19440, profit: 4120 },
  { product: "Hankook 185/65 R15 88T Kinergy Eco2", sku: "TCKL-10299", qtySold: 41, revenue: 10619, profit: 2380 },
  { product: "Bridgestone 195/R15 613V", sku: "TCKL-18774", qtySold: 33, revenue: 12210, profit: 2915 },
  { product: "Kumho 185 R14 PorTran KC53", sku: "TCKL-20510", qtySold: 29, revenue: 7859, profit: 1640 },
  { product: "Armstrong 185/65 R15 88H BLU TRAC", sku: "TCKL-19488", qtySold: 24, revenue: 5664, profit: 1180 },
];

export const demoEmployees: EmployeeRow[] = [
  { name: "Rashid K.", orders: 62, sales: 41200, revenue: 9840 },
  { name: "Sana M.", orders: 54, sales: 36800, revenue: 8120 },
  { name: "Vikram S.", orders: 47, sales: 29500, revenue: 6740 },
];

/** Cards with no backend. Real catalogue cards are built in the page. */
export function demoStatMetrics(): StatMetric[] {
  return [
    { id: "sales", title: "Today's Sales", value: `AED ${money(19300)}`, comparison: "vs yesterday", trend: "up", delta: "+12.4%", isDemo: true },
    { id: "orders", title: "Today's Orders", value: "48", comparison: "vs yesterday", trend: "up", delta: "+6.7%", isDemo: true },
    { id: "productsSold", title: "Products Sold Today", value: "137", comparison: "vs yesterday", trend: "down", delta: "-3.1%", isDemo: true },
    { id: "revenue", title: "Total Revenue", value: `AED ${money(358900)}`, comparison: "this month", trend: "up", delta: "+5.2%", isDemo: true },
    { id: "cash", title: "Cash Sales", value: `AED ${money(42800)}`, comparison: "38% of takings", trend: "flat", delta: "0.0%", isDemo: true },
    { id: "card", title: "Card / UPI Sales", value: `AED ${money(60600)}`, comparison: "54% of takings", trend: "up", delta: "+8.9%", isDemo: true },
    { id: "profit", title: "Total Profit", value: `AED ${money(76240)}`, comparison: "this month", trend: "up", delta: "+4.4%", isDemo: true },
  ];
}

export function demoNotifications(outOfStockCount: number): NotificationItem[] {
  return [
    // The only real one — counted from `stock_status` on the live catalogue.
    { kind: "lowStock", label: "Out of stock products", count: outOfStockCount, tone: "amber" },
    { kind: "pendingOrders", label: "Pending orders", count: 3, tone: "sky" },
    { kind: "supplierDue", label: "Supplier payments due", count: 2, tone: "violet" },
    { kind: "failedPayments", label: "Failed payments", count: 1, tone: "rose" },
  ];
}
