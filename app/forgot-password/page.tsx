"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Poppins, Quicksand } from "next/font/google";
import Image from "next/image";
import Link from "next/link";

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

type RowStatus = "pending" | "processing" | "completed";

const INITIAL_ROW_STATES: RowStatus[] = [
  "completed",
  "processing",
  "pending",
  "pending",
];

const POS_TRANSACTIONS = [
  { name: "Michelin Primacy 4 205/55R16 × 4", price: "AED 1,720" },
  { name: "Bridgestone Turanza T005 225/45R17 × 2", price: "AED 890" },
  { name: "Continental EcoContact 6 195/65R15 × 4", price: "AED 1,340" },
  { name: "Pirelli Cinturato P7 215/55R17 × 2", price: "AED 1,050" },
];

const ORDERS_TARGET = 150;

function usePosTelemetry() {
  const [ordersToday, setOrdersToday] = useState(128);
  const [todaySales, setTodaySales] = useState(24850);
  const [pendingOrders, setPendingOrders] = useState(9);
  const [customers, setCustomers] = useState(342);
  const [rowStates, setRowStates] = useState<RowStatus[]>(INITIAL_ROW_STATES);

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
      setRowStates((prev) =>
        prev.map((s) =>
          s === "processing"
            ? "completed"
            : s === "pending"
              ? Math.random() < 0.5
                ? "processing"
                : "pending"
              : "pending",
        ),
      );
    }, 2400);

    return () => clearInterval(id);
  }, []);

  const completedOrders = Math.max(0, ordersToday - pendingOrders);
  const progressPct = ((ordersToday / ORDERS_TARGET) * 100).toFixed(1);

  return {
    ordersToday,
    todaySales,
    pendingOrders,
    completedOrders,
    customers,
    progressPct,
    rowStates,
  };
}

const STATUS_LABEL: Record<RowStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function RowStatusBadge({ status }: { status: RowStatus }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        {STATUS_LABEL.pending}
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-cyan-300">
        <svg
          className="w-3 h-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        {STATUS_LABEL.processing}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      {STATUS_LABEL.completed}
    </span>
  );
}

export default function ForgotPasswordPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const telemetry = usePosTelemetry();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);

    const email = emailRef.current?.value.trim() ?? "";
    if (!email) {
      setEmailError("Email address is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmittedEmail(email);
      setIsSubmitted(true);
      setResendCooldown(30);
    }, 800);
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResendCooldown(30);
    }, 600);
  };

  return (
    <div
      className={`${poppins.variable} ${quicksand.variable} font-[family-name:var(--font-quicksand)] h-screen w-screen overflow-hidden bg-white md:max-lg:bg-[radial-gradient(480px_360px_at_8%_0%,rgba(16,185,129,0.05),transparent_60%),radial-gradient(520px_400px_at_100%_100%,rgba(56,189,248,0.05),transparent_60%),linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] md:max-lg:bg-[size:auto,auto,44px_44px,44px_44px] text-slate-900 antialiased`}
    >
      <div className="flex h-full w-full">
        {/* ================= LEFT: password recovery ================= */}
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

              {!isSubmitted ? (
                <>
                  <div className="mb-6">
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors mb-4"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                        />
                      </svg>
                      Back to sign in
                    </Link>
                    <h1 className="font-[family-name:var(--font-poppins)] text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight mb-2">
                      Reset your password
                    </h1>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Enter the email address associated with your TyresCart account and we will send you a password reset link.
                    </p>
                  </div>

                  <form noValidate onSubmit={handleSubmit}>
                    <div className="mb-6">
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-slate-700 mb-1.5"
                      >
                        Email address
                      </label>
                      <input
                        ref={emailRef}
                        type="email"
                        id="email"
                        name="email"
                        autoComplete="email"
                        required
                        className="w-full h-[50px] rounded-xl border border-slate-300 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="you@example.com"
                      />
                      {emailError && (
                        <p className="mt-1.5 text-xs text-rose-600">
                          {emailError}
                        </p>
                      )}
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
                      <span>{loading ? "Sending reset link…" : "Send reset link"}</span>
                    </button>
                  </form>
                </>
              ) : (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-5 shadow-xs">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </div>

                  <h1 className="font-[family-name:var(--font-poppins)] text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight mb-2">
                    Check your inbox
                  </h1>
                  <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                    We sent a password reset link to{" "}
                    <span className="font-semibold text-slate-900 font-mono">{submittedEmail}</span>. Please check your inbox and follow the instructions.
                  </p>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading || resendCooldown > 0}
                      className="w-full h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
                      <span>
                        {resendCooldown > 0
                          ? `Resend link in ${resendCooldown}s`
                          : "Resend reset link"}
                      </span>
                    </button>

                    <Link
                      href="/login"
                      className="w-full h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.99]"
                    >
                      Back to sign in
                    </Link>
                  </div>
                </div>
              )}

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
                    Orders today
                  </span>
                </div>
                <div className="flex items-end gap-1.5 mb-3">
                  <span className="text-white text-3xl font-[family-name:var(--font-poppins)] font-bold tabular-nums">
                    {fmt(telemetry.ordersToday)}
                  </span>
                  <span className="text-slate-500 text-sm font-mono pb-0.5">
                    / <span>{fmt(ORDERS_TARGET)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-700 ease-out"
                    style={{ width: `${telemetry.progressPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Today&apos;s sales
                    </p>
                    <p className="text-lg font-semibold text-white mt-0.5 tabular-nums">
                      AED {fmt(telemetry.todaySales)}
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

              {/* floating: batch saved */}
              <div className="absolute -bottom-11 -left-8 w-[188px] bg-[rgba(16,25,43,0.72)] border border-[rgba(255,255,255,0.08)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl rounded-2xl p-3.5 z-20 flex items-center gap-2.5 animate-[float-b_6.5s_ease-in-out_infinite] motion-reduce:animate-none">
                <span className="flex-none w-7 h-7 rounded-full bg-emerald-400/15 text-emerald-400 flex items-center justify-center text-sm">
                  ✓
                </span>
                <div>
                  <p className="text-xs font-medium text-white leading-tight">
                    Payment received
                  </p>
                  <p className="text-[10px] font-mono text-slate-500">
                    AED 1,720 · Visa •••• 4821
                  </p>
                </div>
              </div>
            </div>

            {/* data table */}
            <div className="w-full mt-16 rounded-2xl bg-[rgba(16,25,43,0.72)] border border-[rgba(255,255,255,0.08)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">
                  Recent transactions
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  live feed
                </p>
              </div>
              <table className="w-full text-xs font-mono">
                <tbody>
                  {POS_TRANSACTIONS.map((row, i) => (
                    <tr
                      key={row.name}
                      className={i < POS_TRANSACTIONS.length - 1 ? "border-b border-white/5" : ""}
                    >
                      <td className="px-4 py-2.5 text-slate-300">{row.name}</td>
                      <td className="px-2 py-2.5 text-slate-500 whitespace-nowrap">
                        {row.price}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <RowStatusBadge status={telemetry.rowStates[i]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
