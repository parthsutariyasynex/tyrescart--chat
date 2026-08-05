"use client";

/**
 * The three dashboard panels that are not tables or charts: the activity
 * timeline, the notification list and the customer summary tiles.
 *
 * Grouped in one module because each is small and they share the same tone
 * vocabulary; splitting them into three files would be more ceremony than
 * substance. Each is a plain presentational component — all data arrives as
 * props, so the page decides what is real and what is illustrative.
 */

import type { ComponentType } from "react";
import {
  ShoppingCartIcon,
  CubeIcon,
  UserPlusIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  TruckIcon,
  XCircleIcon,
  UsersIcon,
  ArrowPathRoundedSquareIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import type { ActivityItem, NotificationItem, CustomerSummary } from "@/services/dashboardData";

/* ── Activity timeline ─────────────────────────────────────── */

const ACTIVITY_ICON: Record<ActivityItem["kind"], { Icon: ComponentType<{ className?: string }>; cls: string }> = {
  sale: { Icon: ShoppingCartIcon, cls: "bg-emerald-50 text-emerald-600" },
  product: { Icon: CubeIcon, cls: "bg-indigo-50 text-indigo-600" },
  customer: { Icon: UserPlusIcon, cls: "bg-sky-50 text-sky-600" },
  stock: { Icon: ArchiveBoxIcon, cls: "bg-amber-50 text-amber-600" },
  payment: { Icon: BanknotesIcon, cls: "bg-violet-50 text-violet-600" },
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  return (
    <ol className="relative space-y-4">
      {items.map((a, i) => {
        const { Icon, cls } = ACTIVITY_ICON[a.kind];
        const isLast = i === items.length - 1;
        return (
          <li key={`${a.at}-${i}`} className="relative flex gap-3">
            {/* Connector, drawn between dots rather than after the last one. */}
            {!isLast && <span className="absolute left-[15px] top-8 bottom-[-16px] w-px bg-slate-200" aria-hidden="true" />}
            <span className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cls}`}>
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-semibold text-slate-800 truncate">{a.text}</p>
              <p className="text-[11px] text-slate-500 truncate">{a.meta}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{a.at}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Notifications ─────────────────────────────────────────── */

const NOTIF_ICON: Record<NotificationItem["kind"], ComponentType<{ className?: string }>> = {
  lowStock: ExclamationTriangleIcon,
  pendingOrders: ClockIcon,
  supplierDue: TruckIcon,
  failedPayments: XCircleIcon,
};

const NOTIF_TONE: Record<NotificationItem["tone"], string> = {
  amber: "bg-amber-50 text-amber-600 border-amber-200/60",
  sky: "bg-sky-50 text-sky-600 border-sky-200/60",
  violet: "bg-violet-50 text-violet-600 border-violet-200/60",
  rose: "bg-rose-50 text-rose-600 border-rose-200/60",
};

export function NotificationList({ items }: { items: NotificationItem[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((n) => {
        const Icon = NOTIF_ICON[n.kind];
        return (
          <li
            key={n.kind}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200/70 hover:border-slate-300 hover:bg-slate-50/60 transition-colors duration-150"
          >
            <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${NOTIF_TONE[n.tone]}`}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">{n.label}</span>
            <span className="shrink-0 min-w-[26px] text-center px-1.5 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-extrabold tabular-nums">
              {n.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Customer summary ──────────────────────────────────────── */

export function CustomerSummaryTiles({ data }: { data: CustomerSummary }) {
  const tiles: { label: string; value: string; Icon: ComponentType<{ className?: string }>; cls: string }[] = [
    { label: "New today", value: String(data.newToday), Icon: UserPlusIcon, cls: "bg-emerald-50 text-emerald-600" },
    { label: "Returning", value: String(data.returning), Icon: ArrowPathRoundedSquareIcon, cls: "bg-sky-50 text-sky-600" },
    { label: "Total customers", value: String(data.total), Icon: UsersIcon, cls: "bg-indigo-50 text-indigo-600" },
    { label: "Top customer", value: data.topCustomer, Icon: StarIcon, cls: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200/70 hover:border-slate-300 transition-colors duration-150 min-w-0"
        >
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.cls}`}>
            <t.Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">{t.label}</p>
            <p className="text-sm font-extrabold text-slate-900 truncate">{t.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
