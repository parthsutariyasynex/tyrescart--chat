import React from "react";

/**
 * Reusable skeleton loaders. The shimmer comes from the `.skeleton` class in
 * globals.css (theme-driven), so all placeholders look consistent app-wide.
 */

/** Base skeleton block — compose with width/height utility classes. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

/**
 * A single product-card placeholder. Mirrors the real vertical catalog card
 * (square image on top + centered details) so there is no size shift on load.
 */
export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col justify-between shadow-xs relative">
      {/* Product Image Box */}
      <div className="w-full aspect-square bg-white rounded-lg flex items-center justify-center p-3 mb-3 relative overflow-hidden">
        <Skeleton className="w-16 h-16 rounded-full opacity-40" />
      </div>

      {/* Metadata matching exact card layout */}
      <div className="flex flex-col items-center text-center w-full">
        <div className="w-full h-[2.5rem] flex flex-col items-center justify-center gap-1.5 mb-1">
          <Skeleton className="h-3 w-4/5 rounded" />
          <Skeleton className="h-3 w-3/5 rounded" />
        </div>

        <Skeleton className="h-5 w-16 rounded mt-1" />
        <Skeleton className="h-4 w-20 rounded mt-0.5" />
      </div>
    </div>
  );
}

/** Grid of product-card skeletons (same grid as the real catalog). */
export function ProductGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 pb-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * A single chat-shortcut card placeholder. Mirrors the real card layout with varied heights.
 */
export function ChatCardSkeleton({ variant = 0 }: { variant?: number }) {
  const descLines = [
    ["w-full", "w-5/6"],
    ["w-full", "w-11/12", "w-2/3"],
    ["w-full", "w-4/5"],
    ["w-full", "w-full", "w-3/4", "w-1/2"],
    ["w-full", "w-3/4"],
    ["w-full", "w-full", "w-4/5"],
  ];
  const lines = descLines[variant % descLines.length];

  return (
    <div className="bg-white border border-gray-200/80 rounded-lg p-3 shadow-2xs flex flex-col justify-between">
      <div>
        {/* category (left) + index (right) */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <Skeleton className="h-3 w-20 rounded" />
          <div className="flex items-center gap-1.5 shrink-0">
            <Skeleton className="h-3 w-6 rounded" />
            <Skeleton className="h-3.5 w-3.5 rounded" />
          </div>
        </div>
        {/* title */}
        <Skeleton className="h-4 w-4/5 rounded mb-1.5" />
        {/* description */}
        <div className="space-y-1.5">
          {lines.map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w} rounded-xs`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Grid of chat-shortcut skeletons matching the page's/modal's responsive columns. */
export function ChatGridSkeleton({
  count = 20,
  columnsClass = "columns-1 sm:columns-2 lg:columns-3 xl:columns-4",
}: {
  count?: number;
  columnsClass?: string;
}) {
  return (
    <div className={`${columnsClass} gap-4 space-y-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="break-inside-avoid mb-4">
          <ChatCardSkeleton variant={i} />
        </div>
      ))}
    </div>
  );
}

/**
 * Route-level loading skeleton for the Tyre Chat page.
 * Mirrors Header + Subheader + Chat Grid layout.
 */
export function TyresChatPageSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 shadow-xs">
          <Skeleton className="h-10 flex-1 max-w-2xl rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-[92px] rounded-full" />
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </header>

        {/* Workspace Body Skeleton */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Heading Bar Skeleton */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-6">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48 rounded" />
                <Skeleton className="h-3 w-72 rounded" />
              </div>
            </div>
          </div>

          {/* Cards Grid Skeleton */}
          <ChatGridSkeleton count={20} />
        </div>
      </main>
    </div>
  );
}

/**
 * POS content skeleton — header + product grid. Used by route-level
 * `loading.tsx` so a page shows a proper skeleton while it loads without any
 * layout shift.
 *
 * CONTENT AREA ONLY, deliberately. This used to be a `h-screen w-screen` shell
 * that drew its own placeholder sidebar; because the real Sidebar now lives in
 * the root layout, that placeholder covered the live one during every route
 * transition and made client-side navigation look like a full page reload.
 * Sized `h-full w-full` so it fills the layout's content slot instead.
 */
export function PosPageSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f6f9]">
      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        {/* Header */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 shadow-xs">
          <Skeleton className="h-10 flex-1 max-w-2xl rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-[105px] rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-[95px] rounded-full" />
          </div>
        </header>

        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {/* Product grid + footer wrapper */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col justify-between h-full">
              <ProductGridSkeleton count={24} />
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 pt-4 mt-2 text-xs text-gray-600">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-4 w-48 rounded" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Table Skeleton Loader for Supplier Products */
export function SupplierTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col w-full">
      {/* Table Top Header Summary Skeleton */}
      <div className="px-5 py-2.5 flex items-center justify-end border-b border-slate-200/70 bg-slate-50/70">
        <Skeleton className="h-7 w-36 rounded-lg" />
      </div>

      {/* Table Rows Skeleton */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th className="py-3 px-4"><Skeleton className="h-4 w-16 rounded" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-20 rounded" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-20 rounded" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-16 rounded" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-28 rounded" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-20 rounded" /></th>
              <th className="py-3 px-4 text-center"><Skeleton className="h-4 w-14 rounded mx-auto" /></th>
              <th className="py-3 px-4 text-center"><Skeleton className="h-4 w-12 rounded mx-auto" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-16 rounded" /></th>
              <th className="py-3 px-4 text-center"><Skeleton className="h-4 w-12 rounded mx-auto" /></th>
              <th className="py-3 px-4 text-right"><Skeleton className="h-4 w-16 rounded ml-auto" /></th>
              <th className="py-3 px-4 text-right"><Skeleton className="h-4 w-16 rounded ml-auto" /></th>
              <th className="py-3 px-4"><Skeleton className="h-4 w-20 rounded" /></th>
              <th className="py-3 px-4 text-center"><Skeleton className="h-4 w-16 rounded mx-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="hover:bg-slate-50/50">
                <td className="py-3.5 px-4"><Skeleton className="h-5 w-16 rounded-md" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-4 w-24 rounded font-mono" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-5 w-20 rounded-md" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-4 w-20 rounded" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-4 w-32 rounded" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-4 w-20 rounded" /></td>
                <td className="py-3.5 px-4 text-center"><Skeleton className="h-4 w-12 rounded mx-auto" /></td>
                <td className="py-3.5 px-4 text-center"><Skeleton className="h-4 w-10 rounded mx-auto" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-4 w-16 rounded" /></td>
                <td className="py-3.5 px-4 text-center"><Skeleton className="h-6 w-8 rounded-full mx-auto" /></td>
                <td className="py-3.5 px-4 text-right"><Skeleton className="h-4 w-14 rounded ml-auto" /></td>
                <td className="py-3.5 px-4 text-right"><Skeleton className="h-4 w-14 rounded ml-auto" /></td>
                <td className="py-3.5 px-4"><Skeleton className="h-4 w-20 rounded" /></td>
                <td className="py-3.5 px-4 text-center"><Skeleton className="h-7 w-16 rounded-lg mx-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Supplier / TC Products content skeleton — header, filter bar, table card.
 *
 * `h-full w-full`, not `h-screen w-screen`: it renders inside the root layout's
 * content slot, beside the persistent Sidebar. As a full-viewport element it
 * overlaid the whole window during route transitions, so the sidebar vanished
 * for a frame and navigation looked like a browser reload.
 */
export function SupplierProductsPageSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 font-sans">
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
        {/* Header Skeleton */}
        <header className="h-16 flex-none bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 shadow-2xs">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 w-full">
          {/* Filters Bar Skeleton */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex flex-wrap items-end gap-3">
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-10 flex-1 min-w-[200px] rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>

          {/* Table Skeleton */}
          <SupplierTableSkeleton rows={10} />
        </div>
      </div>
    </div>
  );
}

/**
 * Route-level loading skeleton for the Dashboard page.
 * Mirrors the exact layout of DashboardPage (Header, Quick Stats Grid, Quick Actions Grid, Analytics Chart Box).
 */
export function DashboardPageSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 shadow-xs">
          <div>
            <Skeleton className="h-6 w-32 rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-7 w-[95px] rounded-full" />
          </div>
        </header>

        {/* Dashboard Body Skeleton */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton className="h-6 w-20 rounded" />
                  <Skeleton className="h-3 w-28 rounded" />
                </div>
                <Skeleton className="w-12 h-12 rounded-xl shrink-0 ml-3" />
              </div>
            ))}
          </div>

          {/* Quick Action Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                  <div className="space-y-2 flex-1 max-w-sm">
                    <Skeleton className="h-5 w-36 rounded" />
                    <Skeleton className="h-3.5 w-full rounded" />
                  </div>
                </div>
                <Skeleton className="h-8 w-28 rounded-lg shrink-0 ml-4" />
              </div>
            ))}
          </div>

          {/* Placeholder Section for Graphs & Charts */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center justify-center text-center min-h-[320px]">
            <Skeleton className="w-16 h-16 rounded-2xl mb-4" />
            <Skeleton className="h-5 w-48 rounded mb-2" />
            <Skeleton className="h-3.5 w-80 rounded" />
          </div>
        </div>
      </main>
    </div>
  );
}

