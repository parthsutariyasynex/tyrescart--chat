"use client";

/**
 * Recharts figures for the dashboard, in their own module.
 *
 * Same arrangement `CostHistoryModal` already uses for `CostLineChart`: the
 * page loads this with `next/dynamic({ ssr: false })`, because Recharts
 * measures the DOM and is bundle weight the dashboard should not pay for until
 * it is actually shown.
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { SalesPoint, PaymentSlice } from "@/services/dashboardData";

const AXIS = { fontSize: 11, fill: "#94a3b8" };
const GRID = "#e2e8f0";

const money = (n: number) => n.toLocaleString("en-US");

/** Shared tooltip styling so all three charts read the same. */
const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
    fontSize: 12,
  },
} as const;

export function SalesLineChart({ data }: { data: SalesPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={money} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`AED ${money(Number(v) || 0)}`, "Sales"]} />
          <Line
            type="monotone"
            dataKey="sales"
            stroke="#059669"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#059669" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesBarChart({ data }: { data: SalesPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [String(Number(v) || 0), "Orders"]} />
          <Bar dataKey="orders" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Slice colours, fixed per method so the legend never shifts meaning. */
const PAYMENT_COLORS: Record<string, string> = {
  Cash: "#059669",
  Card: "#6366f1",
  UPI: "#0ea5e9",
  Credit: "#f59e0b",
};

export function PaymentPieChart({ data }: { data: PaymentSlice[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="method"
            innerRadius={52}
            outerRadius={82}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.method} fill={PAYMENT_COLORS[d.method] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [`AED ${money(Number(v) || 0)}`, String(n)]} />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => <span className="text-[11px] text-slate-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
