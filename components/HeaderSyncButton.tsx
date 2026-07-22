"use client";

/**
 * Header (top-right) Sync button. Syncs ONLY the current page's data.
 * Contains no sync logic — it just calls the shared `useSync` hook.
 */
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useSync } from "@/hooks/useSync";

export default function HeaderSyncButton({
  title = "Sync this page",
  className = "",
}: {
  title?: string;
  className?: string;
}) {
  const { isSyncing, handlePageSync } = useSync();

  return (
    <button
      type="button"
      onClick={(e) => {
        handlePageSync();
        e.currentTarget.blur();
      }}
      disabled={isSyncing}
      title={title}
      aria-label={title}
      className={`p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 focus:outline-none ${className}`}
    >
      <ArrowPathIcon className={`w-5 h-5 ${isSyncing ? "animate-spin text-orange-500" : ""}`} />
    </button>
  );
}
