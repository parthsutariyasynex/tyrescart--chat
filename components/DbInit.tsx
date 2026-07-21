"use client";

import { useEffect } from "react";
import { ensureDb } from "@/services/db";

/**
 * Creates the IndexedDB database (and its object stores) as soon as the app
 * loads, so it is visible in DevTools ▸ Application ▸ IndexedDB even before any
 * data has been fetched. Renders nothing.
 */
export default function DbInit() {
  useEffect(() => {
    ensureDb();
  }, []);
  return null;
}
