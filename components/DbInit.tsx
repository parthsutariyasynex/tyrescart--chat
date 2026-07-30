"use client";

import { useEffect, useRef } from "react";
import { ensureDb } from "@/services/db";
import { resumeInterruptedSupplierSync, resumeInterruptedTcSync } from "@/services/syncTasks";

/**
 * Creates the IndexedDB database (and its object stores) as soon as the app
 * loads, so it is visible in DevTools ▸ Application ▸ IndexedDB even before any
 * data has been fetched. Renders nothing.
 *
 * Also resumes a catalogue sync that a hard page load killed. This belongs here,
 * in a component the root layout always mounts, rather than on the supplier
 * page: the sync is global, so a reload while the user is on /products or
 * /tyre_guide/chat has to recover it just the same.
 */
export default function DbInit() {
  const started = useRef(false);

  useEffect(() => {
    // React StrictMode fires effects twice in dev. The manager dedupes the sync
    // itself, but this keeps the IndexedDB probe to a single read.
    if (started.current) return;
    started.current = true;

    void (async () => {
      await ensureDb();
      await resumeInterruptedSupplierSync().catch((e) =>
        console.warn("[DbInit] could not resume interrupted supplier sync:", e),
      );
      await resumeInterruptedTcSync().catch((e) =>
        console.warn("[DbInit] could not resume interrupted tc sync:", e),
      );
    })();
  }, []);

  return null;
}
