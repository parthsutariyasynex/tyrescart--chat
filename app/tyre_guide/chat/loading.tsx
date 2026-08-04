import { ChatGridSkeleton } from "@/components/Skeletons";
import { Skeleton } from "@/components/Skeletons";

/**
 * Route-level loading UI for the chat shortcuts page.
 *
 * This was the only route without one — the other four have had a `loading.tsx`
 * since the skeletons went in. The page's own `ChatGridSkeleton` covered the
 * data fetch, but not the window before the page component itself is ready.
 *
 * CONTENT AREA ONLY, like the others: the real Sidebar lives in the root
 * layout, so drawing a placeholder one here would cover the live sidebar during
 * every route transition and make client-side navigation look like a reload.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f8fafc]">
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — matches the live header's h-16 shell so nothing shifts. */}
        <header className="h-16 flex-none bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between gap-4 shadow-xs">
          <Skeleton className="h-5 w-40 rounded" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-[95px] rounded-full" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <ChatGridSkeleton count={8} />
        </div>
      </main>
    </div>
  );
}
