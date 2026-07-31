/**
 * Cost history — one record per observed price CHANGE, per product.
 *
 * WHERE THE DATA COMES FROM
 * Nothing here fetches. The rows handed to {@link recordCostChanges} are the ones
 * a manual sync just wrote to IndexedDB, straight from `supplierProducts` — the
 * API stays the single source of truth for cost. This module only decides
 * "is this different from the last cost we saw?" and, if so, stamps it.
 *
 * WHY MANUAL SYNC ONLY
 * A history point should mean "the supplier's price was X when we checked",
 * which is only true when we actually re-fetched. Auto-sync fires on a cold
 * cache — the same rows a manual sync would bring — so recording there would add
 * points that say nothing about price movement, and a resumed sync would add
 * them twice. {@link markManualSync} is therefore an explicit opt-in the Sync
 * button sets; every other path leaves history untouched.
 */

import { idbGetAll, idbPutAll, idbGetAllByIndex, STORE_COST_HISTORY } from "./db";

/** One observation. Written only when `cost` differs from the previous record. */
export interface CostHistoryRecord {
  /** Auto-increment key. Absent until IndexedDB assigns it. */
  id?: number;
  /** Supplier product id, as stored on the catalogue row. */
  productId: string | number;
  sku: string;
  cost: number;
  /** Calendar day of the sync, `YYYY-MM-DD` — the x-axis for the Date Wise tab. */
  syncDate: string;
  /** Exact moment, ms epoch. Ordering key; survives multiple syncs in one day. */
  syncTimestamp: number;
}

/* ─────────────────────────────────────────────────────────────
   MANUAL-SYNC HANDSHAKE

   `SyncTaskDefinition.run` takes no arguments, so a task cannot be told how it
   was triggered. The Sync button marks the task immediately before starting it
   and the task consumes that mark — the same publish-then-read pattern
   `setSupplierPageRequest` already uses for the page-scoped sync.

   Consuming clears the mark, so a later automatic run of the same task (a cold
   cache, a resume) records nothing.
───────────────────────────────────────────────────────────── */

const manualRuns = new Set<string>();

/** Called by the Sync button just before `syncManager.start(task)`. */
export function markManualSync(taskId: string): void {
  manualRuns.add(taskId);
}

/** True once per mark. Clears it, so only the run the user asked for records. */
export function consumeManualSync(taskId: string): boolean {
  return manualRuns.delete(taskId);
}

/** `YYYY-MM-DD` in local time — `toISOString()` would shift the day near midnight. */
function localDay(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The most recent cost recorded for each product, in one pass.
 *
 * Read once per sync rather than per product: a per-product lookup across 8k
 * rows would be 8k index queries for what a single scan answers.
 */
async function lastCostByProduct(): Promise<Map<string, { cost: number; ts: number }>> {
  const all = await idbGetAll<CostHistoryRecord>(STORE_COST_HISTORY).catch(() => []);
  const last = new Map<string, { cost: number; ts: number }>();
  for (const rec of all) {
    const key = String(rec.productId);
    const prev = last.get(key);
    if (!prev || rec.syncTimestamp > prev.ts) last.set(key, { cost: rec.cost, ts: rec.syncTimestamp });
  }
  return last;
}

/**
 * Append a history point for every product whose cost changed since last time.
 *
 * Unchanged costs are skipped, so the store grows with price movement rather
 * than with sync count. A product seen for the first time gets one baseline
 * point — without it a later change would have nothing to draw a line from.
 *
 * Returns how many records were written.
 */
export async function recordCostChanges(
  rows: { id: string | number; sku?: string; cost?: number | string }[],
): Promise<number> {
  if (!rows.length) return 0;

  const last = await lastCostByProduct();
  const now = Date.now();
  const syncDate = localDay(now);
  const additions: CostHistoryRecord[] = [];

  // Guards against a product appearing twice in one sync (it shouldn't, but a
  // duplicate would otherwise write two points with the same timestamp).
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.id === undefined || row.id === null || row.id === "") continue;
    const key = String(row.id);
    if (seen.has(key)) continue;

    const cost = Number(row.cost);
    if (!Number.isFinite(cost)) continue; // never chart a NaN

    const prev = last.get(key);
    if (prev && prev.cost === cost) continue; // unchanged → no duplicate record

    seen.add(key);
    additions.push({
      productId: row.id,
      sku: String(row.sku ?? ""),
      cost,
      syncDate,
      syncTimestamp: now,
    });
  }

  if (additions.length) {
    await idbPutAll(STORE_COST_HISTORY, additions).catch((e) =>
      console.error("[costHistory] failed to persist:", e),
    );
  }
  return additions.length;
}

/* ─────────────────────────────────────────────────────────────
   API-SOURCED HISTORY

   `supplierProductPriceHistory` is the authoritative series. The IndexedDB
   records above predate it — they were the only way to observe a price change
   before the endpoint existed — and are now the offline fallback.
───────────────────────────────────────────────────────────── */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse the API's "08-May-2025" into a timestamp.
 *
 * `new Date("08-May-2025")` is not reliably parseable across engines, so the
 * parts are read explicitly. Returns NaN on anything unrecognised, and the
 * caller drops those points rather than plotting them at the epoch.
 */
export function parseHistoryDate(value: string): number {
  const m = String(value ?? "").trim().match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) return new Date(Number(m[3]), month, Number(m[1])).getTime();
  }
  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? NaN : fallback;
}

/**
 * Convert the API series into the same shape the chart already consumes, so the
 * date/month builders and the summary work unchanged.
 *
 * Points with an unparseable date or a non-numeric price are dropped — a chart
 * is better short one point than plotting a NaN.
 */
export function fromApiHistory(
  points: { date: string; price: number }[],
  productId: string | number,
  sku = "",
): CostHistoryRecord[] {
  return points
    .map((p) => {
      const ts = parseHistoryDate(p.date);
      const cost = Number(p.price);
      if (Number.isNaN(ts) || !Number.isFinite(cost)) return null;
      return {
        productId,
        sku,
        cost,
        syncDate: new Date(ts).toISOString().slice(0, 10),
        syncTimestamp: ts,
      } satisfies CostHistoryRecord;
    })
    .filter((r): r is CostHistoryRecord => r !== null)
    .sort((a, b) => a.syncTimestamp - b.syncTimestamp);
}

/** One product's history, oldest first — the order the chart plots. */
export async function getCostHistory(productId: string | number): Promise<CostHistoryRecord[]> {
  // The store's `productId` index keeps this off a full scan. Records are read
  // for both the raw id and its string form: the catalogue's `id` is typed
  // `string | number`, so a row synced as a number and queried as a string (or
  // vice versa) would otherwise miss.
  const [byRaw, byString] = await Promise.all([
    idbGetAllByIndex<CostHistoryRecord>(STORE_COST_HISTORY, "productId", productId).catch(() => []),
    typeof productId === "number"
      ? idbGetAllByIndex<CostHistoryRecord>(STORE_COST_HISTORY, "productId", String(productId)).catch(() => [])
      : Promise.resolve([] as CostHistoryRecord[]),
  ]);

  const merged = new Map<number | string, CostHistoryRecord>();
  for (const r of [...byRaw, ...byString]) merged.set(r.id ?? `${r.productId}:${r.syncTimestamp}`, r);

  return [...merged.values()].sort((a, b) => a.syncTimestamp - b.syncTimestamp);
}

export interface CostPoint {
  /** Axis label — a day for Date Wise, a month for Month Wise. */
  label: string;
  cost: number;
  /** Sort key behind the label. */
  ts: number;
}

export interface CostHistoryStats {
  current: number;
  highest: number;
  lowest: number;
  average: number;
  /** ms epoch of the newest record, or null when there is no history. */
  lastUpdated: number | null;
  points: number;
}

/** Day-level series: one point per record, in observation order. */
export function toDateSeries(history: CostHistoryRecord[]): CostPoint[] {
  return history.map((r) => ({
    label: new Date(r.syncTimestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    cost: r.cost,
    ts: r.syncTimestamp,
  }));
}

/**
 * Month-level series: the LAST observed cost in each calendar month.
 *
 * Last rather than average, so the line matches what the product actually cost
 * leaving that month — averaging would invent a value never quoted.
 */
export function toMonthSeries(history: CostHistoryRecord[]): CostPoint[] {
  const byMonth = new Map<string, CostHistoryRecord>();
  for (const r of history) {
    const d = new Date(r.syncTimestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const prev = byMonth.get(key);
    if (!prev || r.syncTimestamp > prev.syncTimestamp) byMonth.set(key, r);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, r]) => ({
      label: new Date(r.syncTimestamp).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      cost: r.cost,
      ts: r.syncTimestamp,
    }));
}

/** Summary figures for the modal header. All derived from the same records. */
export function summarise(history: CostHistoryRecord[]): CostHistoryStats {
  if (!history.length) {
    return { current: 0, highest: 0, lowest: 0, average: 0, lastUpdated: null, points: 0 };
  }
  const costs = history.map((r) => r.cost);
  const total = costs.reduce((a, b) => a + b, 0);
  return {
    current: costs[costs.length - 1],
    highest: Math.max(...costs),
    lowest: Math.min(...costs),
    average: total / costs.length,
    lastUpdated: history[history.length - 1].syncTimestamp,
    points: history.length,
  };
}
