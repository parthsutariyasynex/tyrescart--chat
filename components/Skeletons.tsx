import React from "react";

/**
 * Reusable skeleton loaders. The shimmer comes from the `.skeleton` class in
 * globals.css (theme-driven), so all placeholders look consistent app-wide.
 */

/** Base skeleton block — compose with width/height utility classes. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
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
 * A single chat-shortcut card placeholder. Mirrors the real card EXACTLY.
 */
export function ChatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200/80 rounded-lg p-3.5 shadow-2xs break-inside-avoid mb-4">
      <div>
        {/* category (left) + index (right) */}
        <div className="flex items-start justify-between mb-2">
          <Skeleton className="h-3.5 w-24 rounded" />
          <Skeleton className="h-3 w-6 rounded" />
        </div>
        {/* title */}
        <Skeleton className="h-4 w-3/4 rounded mb-2" />
        {/* description */}
        <div className="space-y-1.5 mt-2">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-5/6 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Grid of chat-shortcut skeletons. */
export function ChatGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <ChatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Full-page POS skeleton — mirrors the products page chrome (sidebar, header)
 * plus the product grid. Used by route-level `loading.tsx` so the home page
 * shows a proper skeleton while it loads without any layout shift.
 */
export function PosPageSkeleton() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f9]">
      {/* Sidebar */}
      <aside className="w-[68px] flex-none bg-white border-r border-gray-200 flex flex-col items-center justify-between py-3 z-20 shadow-xs">
        <div className="flex flex-col items-center gap-6 w-full">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="flex flex-col gap-2 w-full px-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="w-full h-11 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-gray-100 w-full">
          <Skeleton className="w-9 h-9 rounded-full" />
        </div>
      </aside>

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

/** Full Supplier Products Page Skeleton */
export function SupplierProductsPageSkeleton() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans">
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
