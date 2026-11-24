"use client";

import React, { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import Header from "@/components/Header";
import { useToast } from "@/components/ToastProvider";
import { downloadCalculatorXlsx } from "@/services/calculatorExport";
import { features } from "@/config/features";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  DEFAULT_INPUTS,
  costTotals,
  marginTable,
  type CalculatorInputs,
  type ChannelRow,
} from "@/services/priceCalculator";

/**
 * Tyre Price Calculator — the "Tyre-Price-Calculator 1.xlsx" workbook as a
 * page. All math lives in services/priceCalculator.ts (a cell-by-cell
 * transcription); this file is layout only. No API calls and no IndexedDB, so
 * it works offline and has nothing to sync.
 *
 * Colours are the workbook's own fills, used as arbitrary values because they
 * have no Tailwind equivalent and are specific to this one page.
 */

/** Raw input strings, so a half-typed "1." or "" doesn't snap back to 0. */
type InputKey = keyof CalculatorInputs;
type RawInputs = Record<InputKey, string>;

/** Fields the user types as a percentage; stored as a fraction. */
const PERCENT_KEYS: InputKey[] = ["vatRate", "cardFeeRate", "bnplFeeRate"];

/** Fraction → percent string without float noise (0.021 → "2.1"). */
const toPctString = (fraction: number) => String(Number((fraction * 100).toFixed(6)));

function toRaw(i: CalculatorInputs): RawInputs {
  const out = {} as RawInputs;
  for (const k of Object.keys(i) as InputKey[]) {
    out[k] = PERCENT_KEYS.includes(k) ? toPctString(i[k]) : String(i[k]);
  }
  return out;
}

const parseNonNegative = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function fromRaw(raw: RawInputs): CalculatorInputs {
  const out = {} as CalculatorInputs;
  for (const k of Object.keys(raw) as InputKey[]) {
    const n = parseNonNegative(raw[k]);
    out[k] = PERCENT_KEYS.includes(k) ? n / 100 : n;
  }
  return out;
}

const DEFAULT_RAW = toRaw(DEFAULT_INPUTS);

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Round first, then `|| 0`, so -0 and tiny negatives (-0.001) print "0.00", not "-0.00".
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : money.format(Math.round(n * 100) / 100 || 0);
/**
 * Whole AED, always rounded UP (5,430.02 → 5,431). Used for the Price vs
 * Margin table. Display only: the math keeps full precision. The epsilon stops
 * float noise (5430.0000000001) from bumping an exact whole number up by one.
 *
 * `|| 0` turns negative zero into 0: `Math.ceil` of anything in (−1, 0] —
 * including 0 itself once the epsilon is subtracted — returns -0, which
 * Intl prints as "-0".
 */
const wholeUp = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const ceilUp = (n: number) => Math.ceil(n - 1e-9) || 0;
const fmtCeil = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : wholeUp.format(ceilUp(n));
const pct = (fraction: number, digits = 1) =>
  `${Number((fraction * 100).toFixed(digits))}%`;

const INPUT_CELL =
  "w-full bg-transparent text-right text-[#0000FF] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded px-1 py-0.5";

interface InputRowProps {
  id: InputKey;
  label: React.ReactNode;
  suffix?: string;
  integer?: boolean;
  value: string;
  onChange: (key: InputKey, value: string) => void;
}

function InputRow({ id, label, suffix, integer, value, onChange }: InputRowProps) {
  return (
    <tr className="border-b border-slate-200 last:border-b-0">
      <td className="py-1.5 px-3 text-slate-800">
        <label htmlFor={`calc-${id}`}>{label}</label>
      </td>
      <td className="py-1 px-2 bg-[#DDEBF7] w-40">
        <div className="flex items-center justify-end gap-1">
          <input
            id={`calc-${id}`}
            type="number"
            inputMode="decimal"
            min={integer ? 1 : 0}
            step={integer ? 1 : "any"}
            value={value}
            onChange={(e) => onChange(id, e.target.value)}
            className={INPUT_CELL}
          />
          {suffix && <span className="text-[#0000FF] text-xs">{suffix}</span>}
        </div>
      </td>
    </tr>
  );
}

const PerOrder = () => <span className="text-red-600">(per order)</span>;

export default function CalculatorPage() {
  if (!features.calculator) notFound();

  const isOnline = useOnlineStatus();
  const [raw, setRaw] = useState<RawInputs>(DEFAULT_RAW);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const inputs = useMemo(() => fromRaw(raw), [raw]);
  const totals = useMemo(() => costTotals(inputs), [inputs]);
  const rows = useMemo(() => marginTable(inputs), [inputs]);
  const n = Math.max(1, Math.floor(inputs.tyresPerOrder) || 1);
  const vatLabel = pct(inputs.vatRate);

  const setField = (key: InputKey, value: string) =>
    setRaw((prev) => ({ ...prev, [key]: value }));

  const isDefault = (Object.keys(DEFAULT_RAW) as InputKey[]).every(
    (k) => raw[k] === DEFAULT_RAW[k],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCalculatorXlsx(inputs);
      toast("Excel file downloaded", "success");
    } catch (e) {
      console.error("[calculator] xlsx export failed:", e);
      toast("Could not create the Excel file", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        <Header
          title="Tyre Price Calculator"
          isOnline={isOnline}
          onlineVariant="auto"
          actions={
            <>
            {features.exportCsv && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                title="Download this calculator as an Excel file (.xlsx) with live formulas"
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait transition-colors"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                {exporting ? "Exporting…" : "Export Excel"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRaw(DEFAULT_RAW)}
              disabled={isDefault}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Reset
            </button>
            </>
          }
        />

        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-6">
          <p className="text-xs italic text-slate-500">
            Enter costs in the blue cells. Courier &amp; Other costs are per order and
            spread over the tyres in the order. Margin = net profit after gateway fee ÷
            price excl. VAT.
          </p>

          {/* ── Cost Inputs (B4:C14) ── */}
          <section className="max-w-3xl bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1F3864] text-white">
                    <th className="py-1.5 px-3 text-left font-bold">Cost Inputs</th>
                    <th className="py-1.5 px-3 text-left font-bold">AED</th>
                  </tr>
                </thead>
                <tbody>
                  <InputRow id="tyreCost" label="Tyre Cost (per tyre)" value={raw.tyreCost} onChange={setField} />
                  <InputRow id="fittingCost" label="Fitting Cost (per tyre)" value={raw.fittingCost} onChange={setField} />
                  <InputRow id="courierCost" label={<>Courier Cost <PerOrder /></>} value={raw.courierCost} onChange={setField} />
                  <InputRow id="otherCost" label={<>Other Cost <PerOrder /></>} value={raw.otherCost} onChange={setField} />
                  <InputRow id="tyresPerOrder" label="Tyres per Order" integer value={raw.tyresPerOrder} onChange={setField} />
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 px-3 font-bold text-slate-900">Total Order Cost</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums">{fmt(totals.totalOrderCost)}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 px-3 font-bold text-slate-900">Total Cost per Tyre</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums bg-[#E2EFDA]">{fmt(totals.costPerTyre)}</td>
                  </tr>
                  <InputRow id="vatRate" label="VAT Rate (UAE)" suffix="%" value={raw.vatRate} onChange={setField} />
                  <InputRow id="cardFeeRate" label="Card Gateway Fee (on price incl. VAT)" suffix="%" value={raw.cardFeeRate} onChange={setField} />
                  <InputRow id="bnplFeeRate" label="Tabby / Tamara Fee (on price incl. VAT)" suffix="%" value={raw.bnplFeeRate} onChange={setField} />
                </tbody>
              </table>
            </section>

          {/* ── Price vs Margin (B16:H68) ── */}
          <section>
            <h2 className="text-base font-bold text-slate-800 mb-2">
              Price vs Margin (1% – 50%) – after payment gateway fees (incl. {vatLabel} VAT on fees)
            </h2>
            {/* Styled like the /tc-products table (section card, light sticky
                header, divide-y rows, emerald hover, mono figures). */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-slate-50/90 backdrop-blur sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-[11px] font-bold text-slate-700 uppercase tracking-wider select-none">
                    <th rowSpan={2} className="py-2.5 px-2 w-28 text-center align-middle text-slate-500">Margin %</th>
                    <th colSpan={3} className="py-2 px-2 text-center border-l border-slate-200">
                      Credit / Debit Card ({pct(inputs.cardFeeRate)} fee)
                    </th>
                    <th colSpan={3} className="py-2 px-2 text-center border-l border-slate-200">
                      Tabby / Tamara ({pct(inputs.bnplFeeRate)} fee)
                    </th>
                  </tr>
                  <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none border-t border-slate-200">
                    <th className="py-2 px-2 text-right whitespace-nowrap border-l border-slate-200">Order of 1 incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap">Order of {n} incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap">Net Profit / Order (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap border-l border-slate-200">Order of 1 incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap">Order of {n} incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap">Net Profit / Order (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {rows.map((row) => (
                    <tr key={row.margin} className="transition-colors duration-150 hover:bg-emerald-50/50 align-middle">
                      <td className="py-2 px-2 text-center">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-100/80 text-slate-700 border border-slate-200/80 font-mono whitespace-nowrap">
                          {pct(row.margin, 0)}
                        </span>
                      </td>
                      <ChannelCells row={row.card} />
                      <ChannelCells row={row.bnpl} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Order of 1 carries the full courier and other cost; Order of {n} spreads it
              across the order. Net Profit per Order = order incl. VAT − order cost × (1 +
              VAT) − gateway fee incl. VAT. Table values are rounded up to the whole AED.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

/** One payment channel's three cells, using the /tc-products cell styles:
 *  "Set of 4" grey mono for Order of 1, "Price" bold mono for Order of N,
 *  emerald for net profit (red if negative). */
function ChannelCells({ row }: { row: ChannelRow }) {
  const loss = typeof row.netProfit === "number" && ceilUp(row.netProfit) < 0;
  return (
    <>
      <td className="py-2 px-2 text-right text-xs font-semibold text-slate-600 font-mono whitespace-nowrap border-l border-slate-100">
        {fmtCeil(row.orderOfOne)}
      </td>
      <td className="py-2 px-2 text-right text-xs font-extrabold text-slate-900 font-mono whitespace-nowrap">
        {fmtCeil(row.orderOfN)}
      </td>
      <td className={`py-2 px-2 text-right text-xs font-bold font-mono whitespace-nowrap ${loss ? "text-red-600" : "text-emerald-700"}`}>
        {fmtCeil(row.netProfit)}
      </td>
    </>
  );
}
