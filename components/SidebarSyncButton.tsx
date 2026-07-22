"use client";

/**
 * Sidebar (left menu) Sync button. Triggers a FULL application sync across every
 * module. Styled to match the sidebar nav items. Contains no sync logic — it
 * just calls the shared `useSync` hook.
 */
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useSync } from "@/hooks/useSync";

export default function SidebarSyncButton({ label = "Sync" }: { label?: string }) {
  const { isSyncing, handleFullSync } = useSync();

  return (
    <button
      type="button"
      onClick={(e) => {
        handleFullSync();
        // Action, not a page — drop focus so it doesn't look "selected".
        e.currentTarget.blur();
      }}
      disabled={isSyncing}
      title="Sync all data"
      aria-label="Sync all data"
      className="w-full py-2.5 flex flex-col items-center justify-center rounded-lg transition-all relative group focus:outline-none text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-50"
    >
      <ArrowPathIcon className={`w-5 h-5 ${isSyncing ? "animate-spin text-orange-500" : ""}`} />
      <span className="text-[10px] mt-1 tracking-tight">{label}</span>
    </button>
  );
}
