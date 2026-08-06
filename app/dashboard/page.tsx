"use client";

/**
 * POS dashboard.
 *
 * REAL vs DEMO. Sales, orders, payments, profit and employees have no backend
 * on this project — `orders`, `salesOrders`, `payments`, `employees`,
 * `inventory`, `dashboardStats` and friends all answer "Cannot query field",
 * and the app has no checkout, so no order has ever been written. Those
 * sections render illustrative figures and are BADGED "Demo data". Everything
 * else is live: catalogue size, cached row counts, out-of-stock products and
 * the CRM enquiry log. See the header of `services/dashboardData.ts`.
 *
 * Layout is 4 / 2 / 1 cards per row (desktop / tablet / mobile) and every table
 * scrolls horizontally inside its own card rather than widening the page.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  BanknotesIcon,
  ShoppingCartIcon,
  CubeIcon,
  ChartBarIcon,
  CreditCardIcon,
  ArrowTrendingUpIcon,
  BuildingStorefrontIcon,
  TruckIcon,
  ArrowDownTrayIcon,
  BellIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import Header from "@/components/Header";
import HeaderActions from "@/components/HeaderActions";
import QuotationModal from "@/components/QuotationModal";
import ChatModal from "@/components/ChatModal";
import TyresGuideModal from "@/components/TyresGuideModal";
import DashboardCard from "@/components/DashboardCard";
import DashboardStatCard, { type StatTone } from "@/components/DashboardStatCard";
import DashboardTable, { StatusBadge, type DashboardColumn } from "@/components/DashboardTable";
import { ActivityTimeline, NotificationList, CustomerSummaryTiles } from "@/components/DashboardPanels";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  loadRealMetrics,
  loadOutOfStock,
  demoStatMetrics,
  demoSalesDaily,
  demoSalesWeekly,
  demoSalesMonthly,
  demoPayments,
  demoRecentOrders,
  demoTopProducts,
  demoEmployees,
  demoNotifications,
  DEMO_NOTICE,
  type RealMetrics,
  type LowStockRow,
  type RecentOrder,
  type TopProduct,
  type EmployeeRow,
  type SalesPoint,
} from "@/services/dashboardData";

/* Recharts measures the DOM, so it is client-only and lazily loaded — the same
   arrangement CostHistoryModal already uses for CostLineChart. */
const chartLoading = () => <div className="h-[260px] w-full skeleton rounded-xl" aria-hidden="true" />;
const SalesLineChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.SalesLineChart), { ssr: false, loading: chartLoading });
const SalesBarChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.SalesBarChart), { ssr: false, loading: chartLoading });
const PaymentPieChart = dynamic(() => import("@/components/DashboardCharts").then((m) => m.PaymentPieChart), { ssr: false, loading: chartLoading });

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Range = "daily" | "weekly" | "monthly";
const RANGES: { id: Range; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

/** Status text → badge tone. Unknown statuses fall back to slate, never throw. */
function statusTone(s: string): "emerald" | "amber" | "rose" | "sky" | "slate" {
  const v = s.toLowerCase();
  if (v.includes("complete") || v.includes("paid")) return "emerald";
  if (v.includes("pending")) return "amber";
  if (v.includes("refund") || v.includes("fail") || v.includes("cancel")) return "rose";
  if (v.includes("status")) return "sky";
  return "slate";
}

export default function DashboardPage() {
  const isOnline = useOnlineStatus();
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isTyresGuideModalOpen, setIsTyresGuideModalOpen] = useState(false);

  /* ── Live data ── */
  const [real, setReal] = useState<RealMetrics | null>(null);
  const [stock, setStock] = useState<LowStockRow[] | null>(null);
  const [realError, setRealError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadRealMetrics()
      .then((m) => { if (alive) setReal(m); })
      .catch((e: unknown) => { if (alive) setRealError(e instanceof Error ? e.message : String(e)); });
    void loadOutOfStock()
      .then((rows) => { if (alive) setStock(rows); })
      .catch((e: unknown) => { if (alive) setStockError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  /* Header clock. Set after mount so the server and client markup agree, and
     ticked once a minute — seconds would re-render the page for nothing. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    // Deferred rather than called inline: a synchronous setState inside an
    // effect triggers a cascading render (and the lint rule that guards it).
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const [range, setRange] = useState<Range>("daily");
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const salesSeries: SalesPoint[] = useMemo(
    () => (range === "daily" ? demoSalesDaily : range === "weekly" ? demoSalesWeekly : demoSalesMonthly),
    [range],
  );

  const loadingReal = real === null && realError === null;

  /* Summary cards — the two real ones first, then the illustrative figures. */
  const realCards = useMemo(
    () => [
      {
        title: "Catalogue Products",
        value: real ? real.tcTotal.toLocaleString() : "—",
        comparison: "live from Magento",
        trend: "flat" as const,
        delta: "live",
        icon: BuildingStorefrontIcon,
        tone: "emerald" as StatTone,
      },
      {
        title: "Supplier Rows Cached",
        value: real ? real.supplierCached.toLocaleString() : "—",
        comparison: "supplier + competitor",
        trend: "flat" as const,
        delta: "live",
        icon: TruckIcon,
        tone: "sky" as StatTone,
      },
    ],
    [real],
  );

  const demoCards = useMemo(() => {
    const icons: Record<string, { icon: typeof BanknotesIcon; tone: StatTone }> = {
      sales: { icon: BanknotesIcon, tone: "emerald" },
      orders: { icon: ShoppingCartIcon, tone: "indigo" },
      productsSold: { icon: CubeIcon, tone: "violet" },
      revenue: { icon: ChartBarIcon, tone: "teal" },
      cash: { icon: BanknotesIcon, tone: "amber" },
      card: { icon: CreditCardIcon, tone: "sky" },
      profit: { icon: ArrowTrendingUpIcon, tone: "rose" },
    };
    return demoStatMetrics().map((m) => ({ ...m, ...icons[m.id] }));
  }, []);

  const exportCsv = useCallback(() => {
    const rows = [["Period", "Sales", "Orders"], ...salesSeries.map((p) => [p.label, String(p.sales), String(p.orders)])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [salesSeries, range]);

  /* Column definitions live here so DashboardTable itself stays generic. */
  const orderCols: DashboardColumn<RecentOrder>[] = [
    { key: "invoice", header: "Invoice", render: (r) => <span className="font-mono font-bold text-slate-800">{r.invoice}</span> },
    { key: "customer", header: "Customer", render: (r) => <span className="font-semibold text-slate-800">{r.customer}</span> },
    { key: "items", header: "Items", align: "center", render: (r) => String(r.items) },
    { key: "amount", header: "Amount", align: "right", render: (r) => (r.amount === null ? <span className="text-slate-300">—</span> : <span className="font-bold tabular-nums">AED {money(r.amount)}</span>) },
    { key: "method", header: "Payment", render: (r) => r.method },
    { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} tone={statusTone(r.status)} /> },
    { key: "date", header: "Date", render: (r) => <span className="font-mono text-slate-500">{r.date}</span> },
    { key: "time", header: "Time", align: "right", render: (r) => <span className="font-mono text-slate-500">{r.time}</span> },
  ];

  const productCols: DashboardColumn<TopProduct>[] = [
    { key: "product", header: "Product", render: (r) => <span className="font-semibold text-slate-800">{r.product}</span> },
    { key: "sku", header: "SKU", render: (r) => <span className="font-mono text-slate-500">{r.sku}</span> },
    { key: "qty", header: "Qty Sold", align: "center", render: (r) => String(r.qtySold ?? "—") },
    { key: "revenue", header: "Revenue", align: "right", render: (r) => (r.revenue === null ? "—" : <span className="font-bold tabular-nums">AED {money(r.revenue)}</span>) },
    { key: "profit", header: "Profit", align: "right", render: (r) => (r.profit === null ? "—" : <span className="font-bold tabular-nums text-emerald-700">AED {money(r.profit)}</span>) },
  ];

  const stockCols: DashboardColumn<LowStockRow>[] = [
    { key: "product", header: "Product", render: (r) => <span className="font-semibold text-slate-800">{r.product}</span> },
    { key: "sku", header: "SKU", render: (r) => <span className="font-mono text-slate-500">{r.sku}</span> },
    { key: "current", header: "Current", align: "center", render: (r) => <span className="font-bold text-rose-600 tabular-nums">{r.current}</span> },
    { key: "minimum", header: "Minimum", align: "center", render: (r) => <span className="tabular-nums">{r.minimum}</span> },
    { key: "status", header: "Status", align: "right", render: () => <StatusBadge label="Out of stock" tone="rose" /> },
  ];

  const employeeCols: DashboardColumn<EmployeeRow>[] = [
    { key: "name", header: "Employee", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
    { key: "orders", header: "Orders", align: "center", render: (r) => String(r.orders) },
    { key: "sales", header: "Sales", align: "right", render: (r) => <span className="tabular-nums">AED {money(r.sales)}</span> },
    { key: "revenue", header: "Revenue", align: "right", render: (r) => <span className="font-bold tabular-nums text-emerald-700">AED {money(r.revenue)}</span> },
  ];

  const notifications = useMemo(() => demoNotifications(stock?.length ?? 0), [stock]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f8fafc] text-slate-800 font-sans">
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          bookInquiry={false}
          syncTitle="Sync Dashboard"
          syncTone="orange"
          isOnline={isOnline}
          left={
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-800 tracking-tight">Dashboard</h1>
              <p className="text-[11px] text-slate-500 truncate" suppressHydrationWarning>
                {now
                  ? `${now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : " "}
              </p>
            </div>
          }
          search={
            <div className="hidden md:flex flex-1 max-w-md mx-4 min-w-0">
              <div className="relative w-full">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dashboard…"
                  aria-label="Search dashboard"
                  className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
          }
          actions={
            <HeaderActions
              onCreateQuote={() => setIsQuotationModalOpen(true)}
              onChat={() => setIsChatModalOpen(true)}
              onTyresGuide={() => setIsTyresGuideModalOpen(true)}
            />
          }
        >
          {/* Notifications + profile, after the shared trailing controls. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
              title="Notifications"
              aria-label="Notifications"
              aria-expanded={notifOpen}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <BellIcon className="w-4 h-4" />
              {notifications.some((n) => n.count > 0) && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 z-30 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Notifications</p>
                <NotificationList items={notifications} />
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
              title="Account"
              aria-label="Account"
              aria-expanded={profileOpen}
              className="h-9 flex items-center gap-1.5 pl-1 pr-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-md bg-emerald-600 text-white text-[11px] font-extrabold flex items-center justify-center">KL</span>
              <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-11 z-30 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-800">Klever</p>
                  <p className="text-[11px] text-slate-500">Store operator</p>
                </div>
                {/* Presentational only: this project has no auth to sign out of. */}
                <p className="px-3 py-2 text-[11px] text-slate-400">No account system is configured.</p>
              </div>
            )}
          </div>
        </Header>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Summary cards — 4 / 2 / 1 per row. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {realCards.map((c) => (
              <DashboardStatCard key={c.title} {...c} loading={loadingReal} />
            ))}
            {demoCards.map((c) => (
              <DashboardStatCard
                key={c.id}
                title={c.title}
                value={c.value}
                comparison={c.comparison}
                trend={c.trend}
                delta={c.delta}
                icon={c.icon}
                tone={c.tone}
                isDemo
              />
            ))}
          </div>

          {/* Sales analytics + payment breakdown. */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <DashboardCard
              className="xl:col-span-2"
              title="Sales Overview"
              subtitle={DEMO_NOTICE}
              isDemo
              action={
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {RANGES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRange(r.id)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                          range === r.id ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={exportCsv}
                    title="Export the chart series as CSV"
                    className="h-7 flex items-center gap-1 px-2 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer"
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    Export
                  </button>
                </div>
              }
            >
              <SalesLineChart data={salesSeries} />
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Orders</p>
                <SalesBarChart data={salesSeries} />
              </div>
            </DashboardCard>

            <DashboardCard title="Payment Breakdown" subtitle={DEMO_NOTICE} isDemo>
              <PaymentPieChart data={demoPayments} />
              <ul className="mt-3 space-y-1.5">
                {demoPayments.map((p) => (
                  <li key={p.method} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{p.method}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400 tabular-nums">{p.percent}%</span>
                      <span className="font-bold text-slate-900 tabular-nums">AED {money(p.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </DashboardCard>
          </div>

          {/* Recent orders (demo) + recent enquiries (real). */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DashboardCard title="Recent Orders" subtitle={DEMO_NOTICE} isDemo flush>
              <DashboardTable columns={orderCols} rows={demoRecentOrders} rowKey={(r) => r.invoice} minWidth="min-w-[760px]" />
            </DashboardCard>

            <DashboardCard
              title="Recent Enquiries"
              subtitle="Live from the CRM enquiry log"
              flush
              loading={loadingReal}
              error={realError}
              empty={!!real && real.recentEnquiries.length === 0}
              emptyLabel="No enquiries recorded yet"
            >
              <DashboardTable
                columns={orderCols}
                rows={real?.recentEnquiries ?? []}
                rowKey={(r) => r.invoice}
                minWidth="min-w-[760px]"
              />
            </DashboardCard>
          </div>

          {/* Top products + out of stock. */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DashboardCard title="Top Selling Products" subtitle={DEMO_NOTICE} isDemo flush>
              <DashboardTable columns={productCols} rows={demoTopProducts} rowKey={(r) => r.sku} minWidth="min-w-[620px]" />
            </DashboardCard>

            <DashboardCard
              title="Out of Stock Products"
              subtitle="Live — stock_status is the only stock signal the API exposes, so there is no on-hand count"
              flush
              loading={stock === null && stockError === null}
              error={stockError}
              empty={!!stock && stock.length === 0}
              emptyLabel="Everything in the sampled page is in stock"
            >
              <DashboardTable columns={stockCols} rows={stock ?? []} rowKey={(r) => r.sku} minWidth="min-w-[620px]" />
            </DashboardCard>
          </div>

          {/* Customers, activity, notifications. */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <DashboardCard
              title="Customer Summary"
              subtitle="Live from the CRM enquiry log"
              loading={loadingReal}
              error={realError}
            >
              {real && <CustomerSummaryTiles data={real.customers} />}
            </DashboardCard>

            <DashboardCard
              title="Recent Activity"
              subtitle="Live — CRM enquiries"
              loading={loadingReal}
              error={realError}
              empty={!!real && real.activity.length === 0}
              emptyLabel="No activity yet"
            >
              {real && <ActivityTimeline items={real.activity} />}
            </DashboardCard>

            <DashboardCard title="Notifications" subtitle="Out-of-stock count is live; the rest are illustrative" isDemo>
              <NotificationList items={notifications} />
            </DashboardCard>
          </div>

          {/* Employee performance — no endpoint, so this doubles as the reusable
              placeholder the brief asked for: with an empty array it renders the
              shared empty state instead of a table. */}
          <DashboardCard
            title="Employee Performance"
            subtitle={DEMO_NOTICE}
            isDemo
            flush
            empty={demoEmployees.length === 0}
            emptyLabel="No employee data source is configured"
          >
            <DashboardTable columns={employeeCols} rows={demoEmployees} rowKey={(r) => r.name} minWidth="min-w-[520px]" />
          </DashboardCard>
        </div>
      </main>

      <QuotationModal isOpen={isQuotationModalOpen} onClose={() => setIsQuotationModalOpen(false)} />
      <ChatModal isOpen={isChatModalOpen} onClose={() => setIsChatModalOpen(false)} />
      <TyresGuideModal isOpen={isTyresGuideModalOpen} onClose={() => setIsTyresGuideModalOpen(false)} />
    </div>
  );
}
