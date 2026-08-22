"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Poppins, Quicksand } from "next/font/google";
import Image from "next/image";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
});

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-quicksand",
});

type FieldErrors = {
  username?: string;
  password?: string;
};

const ORDERS_TARGET = 150;

/**
 * Decorative — units sold today, ranked. "Compare magnitude" is a bar/column
 * job (see dataviz skill), one hue since the story is "which is biggest,"
 * not identity between products.
 */
const TOP_SELLERS = [
  { brand: "Michelin", units: 42 },
  { brand: "Bridgestone", units: 31 },
  { brand: "Continental", units: 24 },
  { brand: "Pirelli", units: 18 },
];
const TOP_SELLER_MAX = Math.max(...TOP_SELLERS.map((p) => p.units));

/**
 * Column chart: bars grow from a single baseline, 4px-rounded top corners,
 * square at the baseline (see dataviz skill mark specs) — built as a path
 * rather than <rect rx> because SVG's rx rounds all four corners equally.
 */
function buildColumn(x: number, width: number, top: number, baseline: number, r = 4) {
  return [
    `M ${x + r} ${top}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${top} ${x + width} ${top + r}`,
    `V ${baseline}`,
    `H ${x}`,
    `V ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    "Z",
  ].join(" ");
}

/**
 * Decorative "live POS dashboard" telemetry on the right panel — no network
 * calls, purely cosmetic so the login screen doesn't look static. Values
 * only ever move client-side (useEffect), so there's nothing for SSR to
 * mismatch against. Completed orders is a pure derivation of the other two
 * (orders minus pending) rather than its own randomized state, so it can
 * never drift out of sync with them.
 */
function usePosTelemetry() {
  const [ordersToday, setOrdersToday] = useState(128);
  const [todaySales, setTodaySales] = useState(24850);
  const [pendingOrders, setPendingOrders] = useState(9);
  const [customers, setCustomers] = useState(342);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setOrdersToday((prev) =>
        prev >= ORDERS_TARGET
          ? 118
          : Math.min(ORDERS_TARGET, prev + (Math.random() < 0.5 ? 1 : 0)),
      );
      setTodaySales((prev) => prev + Math.floor(Math.random() * 30) + 10);
      if (Math.random() < 0.06) setPendingOrders((prev) => prev + 1);
      if (Math.random() < 0.12) setCustomers((prev) => prev + 1);
    }, 2400);

    return () => clearInterval(id);
  }, []);

  const completedOrders = Math.max(0, ordersToday - pendingOrders);
  const avgOrderValue = ordersToday > 0 ? Math.round(todaySales / ordersToday) : 0;

  return {
    ordersToday,
    todaySales,
    pendingOrders,
    completedOrders,
    customers,
    avgOrderValue,
  };
}

/** Prior 6 days, decorative — today's point is appended live from
 * `telemetry.todaySales` so the chart's end always matches the "Today's
 * sales" figure shown elsewhere on the card. */
const SALES_TREND_HISTORY = [14200, 16800, 15900, 19200, 21500, 20800];

/**
 * Single-series trend → area chart, one hue (see dataviz skill: "trend over
 * time" is a line/area job, not a progress bar). Fixed viewBox coordinates;
 * the <svg> scales to the card via `w-full`, so this only ever computes in
 * the chart's own coordinate space.
 */
function buildAreaChart(values: number[], width: number, height: number, padding = 6) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (values.length - 1);
  const points = values.map((v, i) => ({
    x: padding + i * stepX,
    y: padding + (1 - (v - min) / range) * (height - padding * 2),
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const baseline = height - padding;
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`;
  return { points, linePath, areaPath, baseline };
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default function LoginPage() {
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const telemetry = usePosTelemetry();
  const salesTrend = buildAreaChart(
    [...SALES_TREND_HISTORY, telemetry.todaySales],
    400,
    72,
  );
  const salesTrendEnd = salesTrend.points[salesTrend.points.length - 1];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const username = usernameRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const nextFieldErrors: FieldErrors = {};

    if (!username) nextFieldErrors.username = "Username is required.";
    if (!password) nextFieldErrors.password = "Password is required.";
    if (nextFieldErrors.username || nextFieldErrors.password) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setFormError(data.error || "Unable to sign in. Please try again.");
        setLoading(false);
        return;
      }

      /* The HttpOnly session cookie is already set by the response above —
         nothing client-side to store. proxy.ts's flag gate still applies on
         the next request, so this redirects away from /dashboard on its own
         if that flag is ever disabled — no special-casing needed here. */
      router.push("/dashboard");
    } catch {
      setFormError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      className={`${poppins.variable} ${quicksand.variable} font-[family-name:var(--font-quicksand)] h-screen w-screen overflow-hidden bg-white md:max-lg:bg-[radial-gradient(480px_360px_at_8%_0%,rgba(16,185,129,0.05),transparent_60%),radial-gradient(520px_400px_at_100%_100%,rgba(56,189,248,0.05),transparent_60%),linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] md:max-lg:bg-[size:auto,auto,44px_44px,44px_44px] text-slate-900 antialiased`}
    >
      <div className="flex h-full w-full">
        {/* ================= LEFT: authentication ================= */}
        <div className="w-full lg:w-[42%] h-full flex flex-col overflow-y-auto">
          <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10">
            <div className="w-full max-w-[420px] min-w-[min(400px,100%)] mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <Image
                  src="/favicon-color.png"
                  alt="TyresCart"
                  width={40}
                  height={40}
                  priority
                  className="w-10 h-10 rounded-xl shadow-sm object-contain shrink-0"
                />
                <div>
                  <p className="font-[family-name:var(--font-poppins)] font-bold text-slate-900 tracking-tight leading-none">
                    TyresCart
                  </p>
                  <p className="text-xs text-slate-400 tracking-wide mt-1">
                    Point of Sale
                  </p>
                </div>
              </div>

              <h1 className="font-[family-name:var(--font-poppins)] text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight mb-2">
                Welcome back
              </h1>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                Sign in to continue managing your sales and inventory.
              </p>

              {formError && (
                <div
                  className="mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3"
                  role="alert"
                >
                  {formError}
                </div>
              )}

              <form noValidate onSubmit={handleSubmit}>
                <div className="mb-5">
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Username
                  </label>
                  <input
                    ref={usernameRef}
                    type="text"
                    id="username"
                    name="username"
                    autoComplete="username"
                    required
                    className="w-full h-[50px] rounded-xl border border-slate-300 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Enter your username"
                  />
                  {fieldErrors.username && (
                    <p className="mt-1.5 text-xs text-rose-600">
                      {fieldErrors.username}
                    </p>
                  )}
                </div>

                <div className="mb-5">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      required
                      className="w-full h-[50px] rounded-xl border border-slate-300 px-4 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? (
                        <svg
                          className="w-5 h-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1.5 text-xs text-rose-600">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mb-6">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                      ref={rememberRef}
                      type="checkbox"
                      id="remember"
                      name="remember"
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    Remember me
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Forgot password?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading && (
                    <svg
                      className="w-4 h-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  )}
                  <span>{loading ? "Signing in…" : "Sign in"}</span>
                </button>
              </form>

              {/* compact status strip, mobile/tablet only */}
              <div className="lg:hidden mt-8 rounded-2xl bg-[#0a1120] text-white px-4 py-3 flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
                <span className="text-slate-300">
                  AED {fmt(telemetry.todaySales)} today
                </span>
                <span className="text-slate-300">
                  {fmt(telemetry.ordersToday)} orders
                </span>
              </div>
            </div>
          </div>
          <p className="pb-6 text-center text-xs text-slate-400">
            © TyresCart. All rights reserved.
          </p>
        </div>

        {/* ================= RIGHT: live console ================= */}
        <div
          className="hidden lg:flex w-[58%] h-full relative overflow-x-hidden overflow-y-auto justify-center px-8 lg:px-10 xl:px-14 py-10 xl:py-12 bg-[#0a1120] bg-[radial-gradient(560px_420px_at_18%_8%,rgba(16,185,129,0.16),transparent_60%),radial-gradient(620px_480px_at_88%_92%,rgba(56,189,248,0.16),transparent_60%),linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:auto,auto,44px_44px,44px_44px]"
          aria-hidden="true"
        >
          <span className="absolute w-1 h-1 rounded-full bg-[rgba(56,189,248,0.55)] animate-[drift_7s_ease-in-out_infinite] motion-reduce:animate-none" style={{ top: "12%", left: "22%", animationDelay: "0s" }} />
          <span className="absolute w-1 h-1 rounded-full bg-[rgba(56,189,248,0.55)] animate-[drift_7s_ease-in-out_infinite] motion-reduce:animate-none" style={{ top: "24%", left: "74%", animationDelay: "1.1s" }} />
          <span className="absolute w-1 h-1 rounded-full bg-[rgba(56,189,248,0.55)] animate-[drift_7s_ease-in-out_infinite] motion-reduce:animate-none" style={{ top: "66%", left: "12%", animationDelay: "2.4s" }} />
          <span className="absolute w-1 h-1 rounded-full bg-[rgba(56,189,248,0.55)] animate-[drift_7s_ease-in-out_infinite] motion-reduce:animate-none" style={{ top: "78%", left: "64%", animationDelay: "0.6s" }} />
          <span className="absolute w-1 h-1 rounded-full bg-[rgba(56,189,248,0.55)] animate-[drift_7s_ease-in-out_infinite] motion-reduce:animate-none" style={{ top: "44%", left: "88%", animationDelay: "3s" }} />
          <span className="absolute w-1 h-1 rounded-full bg-[rgba(56,189,248,0.55)] animate-[drift_7s_ease-in-out_infinite] motion-reduce:animate-none" style={{ top: "8%", left: "52%", animationDelay: "1.8s" }} />

          <div className="relative w-full max-w-[min(460px,100%)] my-auto">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 mb-4">
              Live POS dashboard
            </p>

            <div className="relative">
              {/* floating: url in progress */}
              <div className="absolute -top-6 right-2 w-[196px] bg-[rgba(16,25,43,0.72)] border border-[rgba(255,255,255,0.08)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl rounded-2xl p-3.5 z-20 animate-[float-a_6s_ease-in-out_infinite] motion-reduce:animate-none">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                  <p className="text-[11px] font-mono text-slate-300 truncate">
                    TyresCart
                  </p>
                </div>
                <p className="text-[10px] text-slate-500 mb-2">
                  Processing new order…
                </p>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[82%] rounded-full bg-cyan-400" />
                </div>
              </div>

              {/* main card */}
              <div className="bg-[rgba(16,25,43,0.72)] border border-[rgba(255,255,255,0.08)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl rounded-[28px] p-6 relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-[family-name:var(--font-poppins)] font-semibold text-white text-base tracking-tight">
                    Sales activity
                  </h2>
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/25 px-2.5 py-1">
                    <svg
                      className="w-3 h-3 text-emerald-400 animate-[spin_3.2s_linear_infinite] motion-reduce:animate-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2" />
                    </svg>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                      Live
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 font-mono mb-5">
                  register #04 · live session
                </p>

                {/* pipeline */}
                <div className="relative flex items-center justify-between mb-6 px-0.5">
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
                  <span className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(56,189,248,0.7)] animate-[pipeline-move_3.6s_ease-in-out_infinite] motion-reduce:animate-none" />
                  {["Order", "Payment", "Invoice", "Stock", "Done"].map((step, i) => (
                    <div
                      key={step}
                      className="relative z-10 flex flex-col items-center gap-1.5 bg-[#101b2d] px-1"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${i < 2 ? "bg-emerald-400" : "bg-slate-500"}`}
                      />
                      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
                        {step}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    Sales trend
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {fmt(telemetry.ordersToday)}/{fmt(ORDERS_TARGET)} orders
                  </span>
                </div>
                <svg
                  viewBox="0 0 400 72"
                  preserveAspectRatio="none"
                  className="w-full h-[72px] mb-5"
                  role="img"
                  aria-label={`Sales trend, ending at AED ${fmt(telemetry.todaySales)} today`}
                >
                  <defs>
                    <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line
                    x1={6}
                    y1={salesTrend.baseline}
                    x2={394}
                    y2={salesTrend.baseline}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  />
                  <path d={salesTrend.areaPath} fill="url(#salesTrendFill)" />
                  <path
                    d={salesTrend.linePath}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx={salesTrendEnd.x}
                    cy={salesTrendEnd.y}
                    r={4}
                    fill="#34d399"
                    stroke="#101b2d"
                    strokeWidth={2}
                  />
                  <text
                    x={salesTrendEnd.x}
                    y={Math.max(10, salesTrendEnd.y - 10)}
                    textAnchor="end"
                    className="fill-white"
                    style={{ font: "700 11px var(--font-poppins), sans-serif" }}
                  >
                    AED {fmt(telemetry.todaySales)}
                  </text>
                </svg>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Avg. order value
                    </p>
                    <p className="text-lg font-semibold text-white mt-0.5 tabular-nums">
                      AED {fmt(telemetry.avgOrderValue)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Customers
                    </p>
                    <p className="text-lg font-semibold text-cyan-300 mt-0.5 tabular-nums">
                      {fmt(telemetry.customers)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Pending orders
                    </p>
                    <p className="text-lg font-semibold text-amber-400 mt-0.5 tabular-nums">
                      {fmt(telemetry.pendingOrders)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Completed orders
                    </p>
                    <p className="text-lg font-semibold text-emerald-400 mt-0.5 tabular-nums">
                      {fmt(telemetry.completedOrders)}
                    </p>
                  </div>
                </div>
              </div>

              {/* floating: top seller badge */}
              <div className="absolute -bottom-11 -left-8 w-[204px] bg-[rgba(16,25,43,0.85)] border border-amber-500/30 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl rounded-2xl p-3.5 z-20 flex items-center gap-2.5 animate-[float-b_6.5s_ease-in-out_infinite] motion-reduce:animate-none">
                <span className="flex-none w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-xs">
                  <svg
                    className="w-4 h-4 text-amber-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-6.75A1.125 1.125 0 0 1 6.75 15.375V18.75m9 0H6.75"
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white leading-tight truncate">
                    Top Brand: Michelin
                  </p>
                  <p className="text-[10px] font-mono text-amber-300/90 leading-tight mt-0.5">
                    42 units sold (+18%)
                  </p>
                </div>
              </div>
            </div>

            {/* column chart: top sellers */}
            <div className="w-full mt-16 rounded-2xl bg-[rgba(16,25,43,0.72)] border border-[rgba(255,255,255,0.08)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-white">
                  Top selling today
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  units sold
                </p>
              </div>
              <svg
                viewBox="0 0 400 110"
                preserveAspectRatio="none"
                className="w-full h-[110px]"
                role="img"
                aria-label={`Top sellers today: ${TOP_SELLERS.map((p) => `${p.brand} ${p.units} units`).join(", ")}`}
              >
                <line
                  x1={10}
                  y1={66}
                  x2={390}
                  y2={66}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                />
                {TOP_SELLERS.map((seller, i) => {
                  const slotWidth = 368 / TOP_SELLERS.length;
                  const centerX = 16 + slotWidth * i + slotWidth / 2;
                  const barWidth = 22;
                  const barHeight = (seller.units / TOP_SELLER_MAX) * 40;
                  const barTop = 66 - barHeight;
                  return (
                    <g key={seller.brand}>
                      <path
                        d={buildColumn(centerX - barWidth / 2, barWidth, barTop, 66)}
                        fill="#34d399"
                      />
                      <text
                        x={centerX}
                        y={barTop - 6}
                        textAnchor="middle"
                        className="fill-white"
                        style={{ font: "700 11px var(--font-poppins), sans-serif" }}
                      >
                        {seller.units}
                      </text>
                      <text
                        x={centerX}
                        y={82}
                        textAnchor="middle"
                        className="fill-slate-500 uppercase"
                        style={{ font: "500 9px var(--font-mono), monospace", letterSpacing: "0.04em" }}
                      >
                        {seller.brand}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
