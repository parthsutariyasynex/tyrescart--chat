"use client";

/**
 * One table for every dashboard panel that shows rows.
 *
 * Recent Orders, Top Products, Low Stock and Employee Performance are the same
 * table with different columns, so they share this instead of carrying four
 * copies of the same thead/tbody/scroll markup. A column declares its own
 * alignment and renderer, which is what keeps badge cells (status, stock) out
 * of the shared code.
 *
 * Horizontal scrolling lives here too: `min-w` on the table plus an
 * `overflow-x-auto` wrapper with `min-w-0`, so narrow screens scroll the table
 * rather than squashing the columns or pushing the card off-screen.
 */

import type { ReactNode } from "react";

export interface DashboardColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  /** Cell renderer. Return a string for plain text, or JSX for badges. */
  render: (row: T) => ReactNode;
  /** Tailwind width utility, e.g. "w-28". Optional. */
  width?: string;
}

export interface DashboardTableProps<T> {
  columns: DashboardColumn<T>[];
  rows: T[];
  /** Stable React key per row — never an index. */
  rowKey: (row: T, index: number) => string;
  /** Tailwind min-width for the table, so columns keep their shape on mobile. */
  minWidth?: string;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export default function DashboardTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = "min-w-[720px]",
}: DashboardTableProps<T>) {
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table className={`w-full ${minWidth} text-xs border-collapse`}>
        <thead>
          <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`py-2.5 px-4 whitespace-nowrap font-bold ${ALIGN[c.align ?? "left"]} ${c.width ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors duration-150"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2.5 px-4 text-slate-700 ${ALIGN[c.align ?? "left"]}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shared pill used by the status / stock columns. */
export function StatusBadge({ label, tone }: { label: string; tone: "emerald" | "amber" | "rose" | "sky" | "slate" }) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
    amber: "bg-amber-50 text-amber-700 border-amber-200/70",
    rose: "bg-rose-50 text-rose-700 border-rose-200/70",
    sky: "bg-sky-50 text-sky-700 border-sky-200/70",
    slate: "bg-slate-100 text-slate-600 border-slate-200/70",
  }[tone];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}
