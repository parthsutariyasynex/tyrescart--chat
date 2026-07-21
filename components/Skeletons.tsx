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
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col justify-between shadow-2xs">
      {/* Image box */}
      <div className="w-full aspect-square bg-slate-100/80 border border-gray-100 rounded-lg flex items-center justify-center p-3 mb-3 relative overflow-hidden">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
      {/* Metadata */}
      <div className="flex flex-col items-center text-center">
        <Skeleton className="h-3.5 w-3/4 rounded mb-2" />
        <div className="flex items-center justify-center gap-1.5 mb-1.5 w-full">
          <Skeleton className="h-3 w-12 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
        <Skeleton className="h-2.5 w-1/2 rounded mb-2" />
        <Skeleton className="h-3.5 w-1/3 rounded" />
      </div>
    </div>
  );
}

/** Grid of product-card skeletons (same grid as the real catalog). */
export function ProductGridSkeleton({ count = 14 }: { count?: number }) {
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
 * Full-page POS skeleton — mirrors the products page chrome (sidebar, header,
 * brand tabs) plus the product grid. Used by route-level `loading.tsx` so the
 * home page shows a proper skeleton while it loads.
 */
export function PosPageSkeleton() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f9]">
      {/* Sidebar */}
      <aside className="w-[68px] flex-none bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-6">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex flex-col gap-3 w-full px-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-9 rounded-lg" />
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]">
        {/* Header */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-6 flex items-center gap-4">
          <Skeleton className="h-10 flex-1 max-w-xl rounded-lg" />
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-7 w-28 rounded-lg" />
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </header>

        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {/* Brand tabs */}
          <div className="flex items-center gap-6 border-b border-gray-200 pb-3 mb-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-16 rounded" />
            ))}
          </div>

          {/* Product grid */}
          <ProductGridSkeleton count={14} />
        </div>
      </main>
    </div>
  );
}
