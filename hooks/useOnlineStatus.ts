"use client";

/**
 * Reactive online/offline status via useSyncExternalStore — the idiomatic way
 * to read an external, mutable browser value (navigator.onLine) without a
 * hydration mismatch and without setting state inside an effect.
 *
 * During SSR/hydration React uses the server snapshot (assume online), then
 * re-renders with the real client value after commit — no mismatch error.
 */
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine, // client snapshot
    () => true, // server snapshot — assume online during SSR
  );
}
