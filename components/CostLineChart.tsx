"use client";

/**
 * The Recharts line chart behind the Cost History modal.
 *
 * Its own module so `CostHistoryModal` can load it with `next/dynamic`
 * (`ssr: false`) — Recharts measures the DOM, and it is bundle weight the
 * supplier page should not carry until someone opens the modal.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostPoint } from "@/services/costHistory";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Matches the table's tooltip/badge styling rather than Recharts' default box. */
function CostTooltip({
  active,
  payload,
  xLabel,
}: {
  active?: boolean;
  payload?: { payload: CostPoint }[];
  xLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {xLabel}
      </div>
      <div className="text-xs font-bold text-slate-700">{point.label}</div>
      <div className="mt-1 text-sm font-extrabold font-mono text-emerald-600">
        {money(point.cost)}
      </div>
    </div>
  );
}

export default function CostLineChart({
  data,
  xLabel,
}: {
  data: CostPoint[];
  xLabel: string;
}) {
  // Pad the domain so the line never sits flush against the top or bottom edge.
  const costs = data.map((d) => d.cost);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const pad = Math.max((max - min) * 0.15, max === min ? Math.max(max * 0.05, 1) : 1);

  // Fills the card at lg+ (where the modal constrains the row height) instead
  // of the old fixed 280px that left the rest of the card blank. Below lg the
  // column is auto-height, so a definite height is required or the chart
  // collapses to zero.
  return (
    <div className="h-[280px] lg:h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            minTickGap={16}
          />
          <YAxis
            domain={[Math.max(0, min - pad), max + pad]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={62}
            tickFormatter={(v: number) => money(Number(v))}
          />
          <Tooltip
            content={<CostTooltip xLabel={xLabel} />}
            cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#059669"
            strokeWidth={2}
            // Dots are useful at low point counts and turn into noise at high
            // ones, so they are dropped once the series gets dense.
            dot={data.length <= 30 ? { r: 3, fill: "#059669", strokeWidth: 0 } : false}
            activeDot={{ r: 5, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
