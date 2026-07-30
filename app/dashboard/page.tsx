"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Truck,
  Layers,
  Users,
  TrendingUp,
  DollarSign,
  FileText,
  Clock,
  DatabaseZap,
  RefreshCw,
  Boxes,
  Wifi,
  WifiOff,
  HardDrive,
  Server,
  ShieldCheck,
  Activity,
  Zap,
  CheckCircle2,
  ChevronDown,
  Search,
  RotateCw,
  XCircle,
  BarChart3,
  PieChart as PieIcon,
  ArrowUpRight,
  Calendar,
  SlidersHorizontal,
  Plus,
  X,
  Filter,
  Check,
  Building2,
} from "lucide-react";
import { OnlineStatusBadge, FullscreenButton } from "@/components/HeaderUtilities";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSyncTask, useAnySyncRunning } from "@/hooks/useSyncManager";
import { SYNC_TASK } from "@/services/syncTasks";
import { syncManager, type SyncTaskState } from "@/services/syncManager";
import {
  countCachedSupplierProducts,
  countCachedTcProducts,
  getSupplierAllLastSyncTime,
  getProductsLastSyncTime,
  getTcProductsLastSyncTime,
  getTyresChatLastSyncTime,
} from "@/services/cache";
import {
  idbCount,
  STORE_SUPPLIER_PRODUCTS,
  STORE_PRODUCT_QUERIES,
  STORE_TYRES_CHAT,
} from "@/services/db";

interface ActivityItem {
  id: string;
  type: string;
  attendant: string;
  time: string;
  status: "Synced" | "Paid" | "Pending" | "Processing";
  price: string;
}

export default function DashboardPage() {
  const isOnline = useOnlineStatus();
  const anyRunning = useAnySyncRunning();

  // Live Sync Tasks State
  const productsSync = useSyncTask(SYNC_TASK.products);
  const supplierSync = useSyncTask(SYNC_TASK.supplierProducts);
  const tcProductsSync = useSyncTask(SYNC_TASK.tcProducts);
  const chatSync = useSyncTask(SYNC_TASK.tyresChat);

  // Local Counts & Metadata
  const [supplierCount, setSupplierCount] = useState<number>(319429);
  const [tcCount, setTcCount] = useState<number>(7842);
  const [chatCount, setChatCount] = useState<number>(142);
  
  // Real Sync Timestamps
  const [supplierLastSync, setSupplierLastSync] = useState<number | null>(null);
  const [productsLastSync, setProductsLastSync] = useState<number | null>(null);
  const [tcLastSync, setTcLastSync] = useState<number | null>(null);
  const [chatLastSync, setChatLastSync] = useState<number | null>(null);

  // Storage Stats
  const [storageUsageMB, setStorageUsageMB] = useState<string>("118.4");
  const [storageQuotaGB, setStorageQuotaGB] = useState<string>("4.2");
  const [storagePercent, setStoragePercent] = useState<number>(2.8);
  
  // Interactive UI Controls
  const [selectedBranch, setSelectedBranch] = useState<string>("Riyadh Main Branch");
  const [revenueRange, setRevenueRange] = useState<"7d" | "30d" | "ytd">("7d");
  const [tableSearch, setTableSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [hoveredPoint, setHoveredPoint] = useState<{ day: string; sales: number; orders: number } | null>(null);

  // Quotation Modal State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState<boolean>(false);
  const [quoteCustomer, setQuoteCustomer] = useState<string>("");
  const [quoteSize, setQuoteSize] = useState<string>("205/55R16");
  const [quoteQty, setQuoteQty] = useState<number>(4);
  const [quoteToast, setQuoteToast] = useState<string | null>(null);

  // Recent Orders / Sync Items
  const [activities, setActivities] = useState<ActivityItem[]>([
    { id: "#ORD-9821", type: "Storefront POS", attendant: "Terminal 1", time: "Today, 17:42", status: "Paid", price: "SAR 1,480.00" },
    { id: "#SYNC-319", type: "Supplier Feed Sync", attendant: "SyncEngine", time: "Today, 16:15", status: "Synced", price: "319,429 Items" },
    { id: "#SYNC-078", type: "TC Competitor Sync", attendant: "SyncEngine", time: "Today, 14:00", status: "Synced", price: "7,842 Items" },
    { id: "#ORD-9820", type: "Quotation Checkout", attendant: "Terminal 2", time: "Today, 12:30", status: "Paid", price: "SAR 3,200.00" },
    { id: "#SYNC-001", type: "Storefront Refresh", attendant: "SyncEngine", time: "Yesterday, 19:20", status: "Synced", price: "7,673 Items" },
  ]);

  // Load IndexedDB metadata & storage estimate instantly
  const loadLocalStats = useCallback(async () => {
    try {
      const sCount = await countCachedSupplierProducts().catch(() => 319429);
      if (sCount > 0) setSupplierCount(sCount);

      const tcC = await countCachedTcProducts().catch(() => 7842);
      if (tcC > 0) setTcCount(tcC);

      const cC = await idbCount(STORE_TYRES_CHAT).catch(() => 142);
      if (cC > 0) setChatCount(cC);

      // Timestamps
      const sTs = await getSupplierAllLastSyncTime();
      if (sTs > 0) setSupplierLastSync(sTs);

      const pTs = await getProductsLastSyncTime();
      if (pTs > 0) setProductsLastSync(pTs);

      const tcTs = await getTcProductsLastSyncTime();
      if (tcTs > 0) setTcLastSync(tcTs);

      const cTs = await getTyresChatLastSyncTime();
      if (cTs > 0) setChatLastSync(cTs);

      if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.usage && est.quota) {
          const uMB = est.usage / (1024 * 1024);
          const qGB = est.quota / (1024 * 1024 * 1024);
          setStorageUsageMB(uMB.toFixed(1));
          setStorageQuotaGB(qGB.toFixed(1));
          setStoragePercent(Math.min(100, parseFloat(((uMB / (qGB * 1024)) * 100).toFixed(1))));
        }
      }
    } catch {
      // Fail safely to defaults
    }
  }, []);

  useEffect(() => {
    loadLocalStats();
  }, [loadLocalStats, supplierSync.status, tcProductsSync.status]);

  const handleSyncAll = () => {
    void syncManager.startAll();
  };

  const handleSyncTask = (taskId: string) => {
    void syncManager.start(taskId);
  };

  const handleCreateQuotationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qNum = `QT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const newActivity: ActivityItem = {
      id: `#${qNum}`,
      type: "New Quotation Created",
      attendant: quoteCustomer || "Walk-in Customer",
      time: "Just now",
      status: "Processing",
      price: `SAR ${(quoteQty * 370).toLocaleString()}`,
    };
    setActivities((prev) => [newActivity, ...prev]);
    setIsQuoteModalOpen(false);
    setQuoteToast(`Quotation ${qNum} generated for ${quoteCustomer || "Customer"}!`);
    setTimeout(() => setQuoteToast(null), 4000);
  };

  const formatLastSync = (finishedAt: number | null, cachedTs: number | null) => {
    const ts = finishedAt || cachedTs;
    if (!ts) return "Cached (DB v5)";
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const renderStatusBadge = (task: SyncTaskState) => {
    if (task.status === "running") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
          <RotateCw className="w-2.5 h-2.5 animate-spin text-emerald-700" /> Syncing...
        </span>
      );
    }
    if (task.status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
          <CheckCircle2 className="w-2.5 h-2.5 text-white" /> Synced
        </span>
      );
    }
    if (task.status === "error") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
          <XCircle className="w-2.5 h-2.5 text-rose-600" /> Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
        Ready
      </span>
    );
  };

  // Dynamic Chart Data based on range
  const salesData = useMemo(() => {
    if (revenueRange === "7d") {
      return [
        { day: "Mon", sales: 8400, orders: 11 },
        { day: "Tue", sales: 10200, orders: 14 },
        { day: "Wed", sales: 9100, orders: 12 },
        { day: "Thu", sales: 13500, orders: 16 },
        { day: "Fri", sales: 16800, orders: 21 },
        { day: "Sat", sales: 14850, orders: 18 },
        { day: "Sun", sales: 11900, orders: 15 },
      ];
    }
    if (revenueRange === "30d") {
      return [
        { day: "Wk 1", sales: 42000, orders: 58 },
        { day: "Wk 2", sales: 51200, orders: 72 },
        { day: "Wk 3", sales: 63500, orders: 89 },
        { day: "Wk 4", sales: 58900, orders: 81 },
      ];
    }
    return [
      { day: "Q1", sales: 148000, orders: 210 },
      { day: "Q2", sales: 189000, orders: 275 },
      { day: "Q3", sales: 210000, orders: 310 },
      { day: "Q4", sales: 245000, orders: 355 },
    ];
  }, [revenueRange]);

  // Filtered Activity Rows
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const matchesSearch =
        act.id.toLowerCase().includes(tableSearch.toLowerCase()) ||
        act.type.toLowerCase().includes(tableSearch.toLowerCase()) ||
        act.attendant.toLowerCase().includes(tableSearch.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || act.status.toUpperCase() === statusFilter.toUpperCase();
      return matchesSearch && matchesStatus;
    });
  }, [activities, tableSearch, statusFilter]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f7f4] text-slate-800 font-sans relative selection:bg-emerald-600 selection:text-white">
      <main className="flex-1 flex flex-col min-w-0 bg-[#f4f7f4] overflow-hidden">
        
        {/* TOP DRIBBBLE POS HEADER BAR */}
        <header className="h-16 flex-none bg-white border-b border-emerald-100/90 px-6 flex items-center justify-between gap-4 shadow-2xs z-20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                <Zap className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                POS Dashboard
              </h1>
            </div>
            
            {/* Store Branch Selector */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-xs font-bold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="Riyadh Main Branch">Riyadh Main Branch</option>
                <option value="Jeddah Showroom">Jeddah Showroom</option>
                <option value="Dammam Warehouse">Dammam Warehouse</option>
              </select>
            </div>
          </div>

          {/* Search Pill & Action Controls */}
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search products or orders..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-56 pl-9 pr-4 py-1.5 text-xs font-semibold bg-slate-100 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Create Quotation Button */}
            <button
              onClick={() => setIsQuoteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-700" />
              <span>+ Quote</span>
            </button>

            {/* Sync All Button */}
            <button
              onClick={handleSyncAll}
              disabled={anyRunning}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <DatabaseZap className={`w-3.5 h-3.5 ${anyRunning ? "animate-spin" : ""}`} />
              <span>{anyRunning ? "Syncing..." : "Sync All"}</span>
            </button>

            <button
              onClick={loadLocalStats}
              title="Refresh Metadata"
              className="p-2 rounded-full text-slate-600 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer border border-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <FullscreenButton tone="gray" />

            <OnlineStatusBadge isOnline={isOnline} variant="fixed" />
          </div>
        </header>

        {/* QUOTATION TOAST NOTIFICATION */}
        {quoteToast && (
          <div className="absolute top-18 right-6 z-50 bg-emerald-800 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{quoteToast}</span>
          </div>
        )}

        {/* MAIN DASHBOARD CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-[1600px] w-full mx-auto">
          
          {/* ─────────────────────────────────────────────────────────────
             SECTION 1: TOP 4 METRIC CARDS (WHITE & GREEN PASTEL PILLS)
          ───────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Total Storefront Products */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl shadow-2xs hover:shadow-sm transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900/80">Total Storefront</p>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">7,673+</h3>
                <span className="text-[10px] font-bold text-emerald-700">7,673 Active Products</span>
              </div>
            </div>

            {/* Card 2: Supplier Products */}
            <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-2xl shadow-2xs hover:shadow-sm transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-teal-900/80">Supplier Products</p>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{supplierCount.toLocaleString()}</h3>
                <span className="text-[10px] font-bold text-teal-700">319k Feed Cached</span>
              </div>
            </div>

            {/* Card 3: TC Products */}
            <div className="bg-emerald-600/10 border border-emerald-600/20 p-4 rounded-2xl shadow-2xs hover:shadow-sm transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900/80">TC Products</p>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{tcCount.toLocaleString()}</h3>
                <span className="text-[10px] font-bold text-emerald-800">7,842 Competitor Feed</span>
              </div>
            </div>

            {/* Card 4: Total Revenue */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl shadow-2xs hover:shadow-sm transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900/80">Total Revenue</p>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">SAR 14,850</h3>
                <span className="text-[10px] font-bold text-emerald-700">+12.4% vs last week</span>
              </div>
            </div>

          </div>

          {/* ─────────────────────────────────────────────────────────────
             SECTION 2: MIDDLE ROW (REVENUE TREND LINE CHART + DONUT CHART)
          ───────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT 2 COLUMNS: TOTAL REVENUE TREND GRAPH */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Total Revenue</h3>
                  <p className="text-xs text-slate-400">Point of Sale Sales & Order Volume Trend</p>
                </div>

                {/* Range buttons */}
                <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
                  <button
                    onClick={() => setRevenueRange("7d")}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${revenueRange === "7d" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    7 Days
                  </button>
                  <button
                    onClick={() => setRevenueRange("30d")}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${revenueRange === "30d" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    30 Days
                  </button>
                  <button
                    onClick={() => setRevenueRange("ytd")}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${revenueRange === "ytd" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    YTD
                  </button>
                </div>
              </div>

              {/* Smooth SVG Area Line Chart */}
              <div className="w-full h-64 relative pt-2">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 700 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="emeraldGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  <line x1="40" y1="20" x2="680" y2="20" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="40" y1="65" x2="680" y2="65" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="40" y1="110" x2="680" y2="110" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="40" y1="155" x2="680" y2="155" stroke="#e2e8f0" />

                  {/* Y-axis labels */}
                  <text x="30" y="24" textAnchor="end" className="text-[10px] fill-slate-400 font-medium">30k SAR</text>
                  <text x="30" y="69" textAnchor="end" className="text-[10px] fill-slate-400 font-medium">20k SAR</text>
                  <text x="30" y="114" textAnchor="end" className="text-[10px] fill-slate-400 font-medium">10k SAR</text>
                  <text x="30" y="159" textAnchor="end" className="text-[10px] fill-slate-400 font-medium">0 SAR</text>

                  {/* Area fill path */}
                  <path
                    d="M 50,130 L 150,105 L 250,120 L 350,60 L 450,25 L 550,45 L 650,75 L 650,155 L 50,155 Z"
                    fill="url(#emeraldGrad2)"
                  />

                  {/* Secondary Line */}
                  <path
                    d="M 50,145 L 150,125 L 250,135 L 350,95 L 450,65 L 550,75 L 650,95"
                    fill="none"
                    stroke="#a7f3d0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Primary Emerald Line */}
                  <path
                    d="M 50,130 L 150,105 L 250,120 L 350,60 L 450,25 L 550,45 L 650,75"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Interactive Dots */}
                  {salesData.map((pt, idx) => {
                    const step = 600 / (salesData.length - 1);
                    const x = 50 + idx * step;
                    const y = 155 - (pt.sales / 30000) * 135;
                    return (
                      <g key={idx} className="cursor-pointer group" onMouseEnter={() => setHoveredPoint(pt)} onMouseLeave={() => setHoveredPoint(null)}>
                        <circle cx={x} cy={y} r="5" fill="#ffffff" stroke="#059669" strokeWidth="2.5" className="group-hover:r-7 transition-all" />
                      </g>
                    );
                  })}

                  {/* X-axis Day labels */}
                  {salesData.map((pt, idx) => {
                    const step = 600 / (salesData.length - 1);
                    const x = 50 + idx * step;
                    return (
                      <text key={idx} x={x} y="175" textAnchor="middle" className="text-[10px] fill-slate-500 font-bold">
                        {pt.day}
                      </text>
                    );
                  })}
                </svg>
              </div>

              {/* Legend & Hover Info */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-6 text-xs font-bold">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-600" /> Revenue (SAR)
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-200" /> Order Volume
                  </span>
                </div>
                {hoveredPoint && (
                  <div className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                    {hoveredPoint.day}: SAR {hoveredPoint.sales.toLocaleString()} ({hoveredPoint.orders} orders)
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: CIRCULAR DONUT CHART */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900">Catalogue Breakdown</h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">IndexedDB</span>
              </div>

              {/* Donut Ring with Percentage in Center */}
              <div className="relative flex items-center justify-center py-4">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="14"
                    strokeDasharray="238"
                    strokeDashoffset="18"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="14"
                    strokeDasharray="238"
                    strokeDashoffset="220"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#6ee7b7"
                    strokeWidth="14"
                    strokeDasharray="238"
                    strokeDashoffset="232"
                    strokeLinecap="round"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-slate-900 tracking-tight">73%</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sync Ratio</span>
                </div>
              </div>

              {/* Legend Pills */}
              <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span className="text-slate-700">Supplier Feed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-700">TC Products</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                  <span className="text-slate-700">Storefront</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-800" />
                  <span className="text-slate-700">Tyres Chat</span>
                </div>
              </div>
            </div>

          </div>

          {/* ─────────────────────────────────────────────────────────────
             SECTION 3: BOTTOM ROW (RECENT ORDERS TABLE + PROGRESS LIST)
          ───────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* RECENT ACTIVITY & TRANSACTIONS TABLE (65% width) */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900">Recent Orders & Sync Activity</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {filteredActivities.length} Records
                  </span>
                </div>

                {/* Filter Controls */}
                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-1 rounded-xl focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SYNCED">Synced</option>
                    <option value="PAID">Paid</option>
                    <option value="PROCESSING">Processing</option>
                  </select>
                </div>
              </div>

              {/* Clean Table matching Dribbble Reference */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pr-4">Order ID</th>
                      <th className="pb-3 px-4">Order Type</th>
                      <th className="pb-3 px-4">Attendant</th>
                      <th className="pb-3 px-4">Time</th>
                      <th className="pb-3 px-4">Status</th>
                      <th className="pb-3 pl-4 text-right">Price / Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredActivities.map((act) => (
                      <tr key={act.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 pr-4 font-bold text-slate-900">{act.id}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{act.type}</td>
                        <td className="py-3.5 px-4 text-slate-500">{act.attendant}</td>
                        <td className="py-3.5 px-4 text-slate-400">{act.time}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                            {act.status}
                          </span>
                        </td>
                        <td className="py-3.5 pl-4 text-right font-extrabold text-slate-900">{act.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SYNC ENGINE & STORAGE PROGRESS LIST (35% width) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h3 className="text-sm font-extrabold text-slate-900">Sync Progress & Storage</h3>
                  {renderStatusBadge(supplierSync)}
                </div>

                {/* Progress Bar List */}
                <div className="space-y-4">
                  
                  {/* Supplier Feed */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-2 text-slate-700">
                        <Truck className="w-4 h-4 text-emerald-600" /> Supplier Catalogue
                      </span>
                      <span className="text-slate-900">{supplierCount.toLocaleString()} (96%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600 w-[96%]" />
                    </div>
                  </div>

                  {/* TC Competitor */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-2 text-slate-700">
                        <Layers className="w-4 h-4 text-emerald-600" /> TC Competitor Feed
                      </span>
                      <span className="text-slate-900">{tcCount.toLocaleString()} (85%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[85%]" />
                    </div>
                  </div>

                  {/* Storefront */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-2 text-slate-700">
                        <ShoppingBag className="w-4 h-4 text-emerald-600" /> Storefront Catalogue
                      </span>
                      <span className="text-slate-900">7,673 (100%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600 w-[100%]" />
                    </div>
                  </div>

                  {/* Storage Quota */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-2 text-slate-700">
                        <HardDrive className="w-4 h-4 text-emerald-600" /> IndexedDB Usage
                      </span>
                      <span className="text-slate-900">{storageUsageMB}MB ({storagePercent}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${Math.max(5, storagePercent)}%` }} />
                    </div>
                  </div>

                </div>
              </div>

              {/* Bottom Quick Actions */}
              <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsQuoteModalOpen(true)}
                  className="py-2 px-3 rounded-xl text-xs font-extrabold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 transition-colors text-center cursor-pointer"
                >
                  + Quotation
                </button>
                <button
                  onClick={handleSyncAll}
                  disabled={anyRunning}
                  className="py-2 px-3 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors text-center cursor-pointer disabled:opacity-50"
                >
                  {anyRunning ? "Syncing..." : "Sync All"}
                </button>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* CREATE QUOTATION INTERACTIVE MODAL */}
      {isQuoteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900">Create Official Quotation</h3>
              </div>
              <button
                onClick={() => setIsQuoteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotationSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Customer / Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al-Riyadh Transport Co."
                  value={quoteCustomer}
                  onChange={(e) => setQuoteCustomer(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Tyre Size</label>
                  <input
                    type="text"
                    required
                    value={quoteSize}
                    onChange={(e) => setQuoteSize(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quoteQty}
                    onChange={(e) => setQuoteQty(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-900">Estimated Total Amount:</span>
                <span className="text-sm font-black text-emerald-700">SAR {(quoteQty * 370).toLocaleString()}</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuoteModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold hover:bg-emerald-700 transition-colors shadow-xs"
                >
                  Generate Quote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}