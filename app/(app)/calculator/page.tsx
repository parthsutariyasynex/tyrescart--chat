"use client";

import React, { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import Header from "@/components/Header";
import { features } from "@/config/features";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  DEFAULT_INPUTS,
  DEFAULT_TARGET_MARGIN,
  costTotals,
  marginTable,
  quickQuote,
  type CalculatorInputs,
  type ChannelRow,
  type QuickQuote,
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
const DEFAULT_TARGET_RAW = toPctString(DEFAULT_TARGET_MARGIN);

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
 * Margin table and the Quick Quote panel. Display only: the math keeps full precision. The epsilon stops
 * float noise (5430.0000000001) from bumping an exact whole number up by one.
 *
 * `|| 0` turns negative zero into 0: `Math.ceil` of anything in (−1, 0] —
 * including 0 itself once the epsilon is subtracted — returns -0, which
 * Intl prints as "-0".
 */
const wholeUp = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtCeil = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : wholeUp.format(Math.ceil(n - 1e-9) || 0);
const pct = (fraction: number, digits = 1) =>
  `${Number((fraction * 100).toFixed(digits))}%`;

/** Workbook conditional format: ROUND($B19,4)=ROUND($F$5,4). */
const sameMargin = (a: number, b: number) =>
  Math.round(a * 10000) === Math.round(b * 10000);

const INPUT_CELL =
  "w-full bg-transparent text-right text-[#0000FF] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded px-1 py-0.5";

interface InputRowProps {
  id: InputKey;
  label: React.ReactNode;
  tag: "Inputs" | "Default";
  suffix?: string;
  integer?: boolean;
  value: string;
  onChange: (key: InputKey, value: string) => void;
}

function InputRow({ id, label, tag, suffix, integer, value, onChange }: InputRowProps) {
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
      <td className="py-1.5 px-3 text-[11px] text-slate-400 w-16">{tag}</td>
    </tr>
  );
}

const PerOrder = () => <span className="text-red-600">(per order)</span>;

export default function CalculatorPage() {
  if (!features.calculator) notFound();

  const isOnline = useOnlineStatus();
  const [raw, setRaw] = useState<RawInputs>(DEFAULT_RAW);
  const [targetRaw, setTargetRaw] = useState(DEFAULT_TARGET_RAW);

  const inputs = useMemo(() => fromRaw(raw), [raw]);
  const totals = useMemo(() => costTotals(inputs), [inputs]);
  const rows = useMemo(() => marginTable(inputs), [inputs]);
  const target = parseNonNegative(targetRaw) / 100;
  const cardQuote = useMemo(() => quickQuote(inputs, target, inputs.cardFeeRate), [inputs, target]);
  const bnplQuote = useMemo(() => quickQuote(inputs, target, inputs.bnplFeeRate), [inputs, target]);
  const n = Math.max(1, Math.floor(inputs.tyresPerOrder) || 1);
  const vatLabel = pct(inputs.vatRate);

  const setField = (key: InputKey, value: string) =>
    setRaw((prev) => ({ ...prev, [key]: value }));

  const isDefault =
    targetRaw === DEFAULT_TARGET_RAW &&
    (Object.keys(DEFAULT_RAW) as InputKey[]).every((k) => raw[k] === DEFAULT_RAW[k]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f6f9] text-gray-800 font-sans relative">
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
        <Header
          title="Tyre Price Calculator"
          isOnline={isOnline}
          onlineVariant="auto"
          actions={
            <button
              type="button"
              onClick={() => {
                setRaw(DEFAULT_RAW);
                setTargetRaw(DEFAULT_TARGET_RAW);
              }}
              disabled={isDefault}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Reset
            </button>
          }
        />

        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-6">
          <p className="text-xs italic text-slate-500">
            Enter costs in the blue cells. Courier &amp; Other costs are per order and
            spread over the tyres in the order. Margin = net profit after gateway fee ÷
            price excl. VAT.
          </p>

          <div className="grid gap-6 xl:grid-cols-2 items-start">
            {/* ── Cost Inputs (B4:C14) ── */}
            <section className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1F3864] text-white">
                    <th className="py-1.5 px-3 text-left font-bold">Cost Inputs</th>
                    <th className="py-1.5 px-3 text-left font-bold">AED</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <InputRow id="tyreCost" label="Tyre Cost (per tyre)" tag="Inputs" value={raw.tyreCost} onChange={setField} />
                  <InputRow id="fittingCost" label="Fitting Cost (per tyre)" tag="Inputs" value={raw.fittingCost} onChange={setField} />
                  <InputRow id="courierCost" label={<>Courier Cost <PerOrder /></>} tag="Inputs" value={raw.courierCost} onChange={setField} />
                  <InputRow id="otherCost" label={<>Other Cost <PerOrder /></>} tag="Inputs" value={raw.otherCost} onChange={setField} />
                  <InputRow id="tyresPerOrder" label="Tyres per Order" tag="Default" integer value={raw.tyresPerOrder} onChange={setField} />
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 px-3 font-bold text-slate-900">Total Order Cost</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums">{fmt(totals.totalOrderCost)}</td>
                    <td />
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 px-3 font-bold text-slate-900">Total Cost per Tyre</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums bg-[#E2EFDA]">{fmt(totals.costPerTyre)}</td>
                    <td />
                  </tr>
                  <InputRow id="vatRate" label="VAT Rate (UAE)" tag="Default" suffix="%" value={raw.vatRate} onChange={setField} />
                  <InputRow id="cardFeeRate" label="Card Gateway Fee (on price incl. VAT)" tag="Default" suffix="%" value={raw.cardFeeRate} onChange={setField} />
                  <InputRow id="bnplFeeRate" label="Tabby / Tamara Fee (on price incl. VAT)" tag="Default" suffix="%" value={raw.bnplFeeRate} onChange={setField} />
                </tbody>
              </table>
            </section>

            {/* ── Quick Quote (E4:G13) ── */}
            <section className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white">
                    <th className="py-1.5 px-3 text-left font-bold bg-[#1F3864]">Quick Quote (AED)</th>
                    <th className="py-1.5 px-3 text-right font-bold bg-[#1F4E79] w-36">Card</th>
                    <th className="py-1.5 px-3 text-right font-bold bg-[#843C0C] w-36">Tabby / Tamara</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-slate-200 [&>tr:last-child]:border-b-0 tabular-nums">
                  <tr>
                    <td className="py-1.5 px-3 text-slate-800">
                      <label htmlFor="calc-target-margin">Target Margin %</label>
                    </td>
                    <td className="py-1 px-2 bg-[#DDEBF7]">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          id="calc-target-margin"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={targetRaw}
                          onChange={(e) => setTargetRaw(e.target.value)}
                          className={INPUT_CELL}
                        />
                        <span className="text-[#0000FF] text-xs">%</span>
                      </div>
                    </td>
                    {/* G5 is `=F5` in the workbook: the same target on both channels. */}
                    <td className="py-1.5 px-3 text-right text-slate-700">{pct(target, 2)}</td>
                  </tr>
                  <QuoteRow label="Price per Tyre (excl. VAT)" field="pricePerTyreExclVat" card={cardQuote} bnpl={bnplQuote} />
                  <QuoteRow label="Price per Tyre (incl. VAT)" field="pricePerTyreInclVat" card={cardQuote} bnpl={bnplQuote} bold />
                  <QuoteRow label={`Gateway Fee per Tyre (incl. ${vatLabel} VAT)`} field="gatewayFeePerTyre" card={cardQuote} bnpl={bnplQuote} />
                  <QuoteRow label="Net Profit per Tyre" field="netProfitPerTyre" card={cardQuote} bnpl={bnplQuote} profit />
                  <QuoteRow label={`Order Total × ${n} tyres (incl. VAT)`} field="orderTotalInclVat" card={cardQuote} bnpl={bnplQuote} bold />
                  <QuoteRow label={`Order Total Cost × ${n} tyres (incl. VAT)`} field="orderCostInclVat" card={cardQuote} bnpl={bnplQuote} />
                  <QuoteRow label={`Gateway Fee per Order (incl. ${vatLabel} VAT)`} field="gatewayFeePerOrder" card={cardQuote} bnpl={bnplQuote} />
                  <QuoteRow label="Net Profit per Order" field="netProfitPerOrder" card={cardQuote} bnpl={bnplQuote} profit bold />
                </tbody>
              </table>
            </section>
          </div>

          {/* ── Price vs Margin (B16:H68) ── */}
          <section>
            <h2 className="text-base font-bold text-[#1F3864] mb-2">
              Price vs Margin (1% – 50%) – after payment gateway fees (incl. {vatLabel} VAT on fees)
            </h2>
            <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[900px] text-sm border-collapse">
                <thead className="sticky top-0 z-10 text-white">
                  <tr>
                    <th rowSpan={2} className="py-2 px-3 font-bold bg-[#3A3A3A] w-28">Margin %</th>
                    <th colSpan={3} className="py-1.5 px-3 font-bold bg-[#1F4E79] border-l-2 border-slate-900">
                      Credit / Debit Card ({pct(inputs.cardFeeRate)} fee)
                    </th>
                    <th colSpan={3} className="py-1.5 px-3 font-bold bg-[#843C0C] border-l-2 border-slate-900">
                      Tabby / Tamara ({pct(inputs.bnplFeeRate)} fee)
                    </th>
                  </tr>
                  <tr className="text-xs">
                    <th className="py-1.5 px-2 font-bold bg-[#5B9BD5] border-l-2 border-slate-900">Order of 1 incl. VAT (AED)</th>
                    <th className="py-1.5 px-2 font-bold bg-[#2E75B6]">Order of {n} incl. VAT (AED)</th>
                    <th className="py-1.5 px-2 font-bold bg-[#548235]">Net Profit per Order (AED)</th>
                    <th className="py-1.5 px-2 font-bold bg-[#F4B183] border-l-2 border-slate-900">Order of 1 incl. VAT (AED)</th>
                    <th className="py-1.5 px-2 font-bold bg-[#C55A11]">Order of {n} incl. VAT (AED)</th>
                    <th className="py-1.5 px-2 font-bold bg-[#548235]">Net Profit per Order (AED)</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((row) => {
                    const hit = sameMargin(row.margin, target);
                    return (
                      <tr
                        key={row.margin}
                        className={`border-b border-slate-200 ${hit ? "[&>td]:!bg-[#FFD966] [&>td]:!text-black [&>td]:font-bold" : ""}`}
                      >
                        <td className="py-1 px-3 text-center font-bold bg-[#EDEDED] text-[#3A3A3A]">
                          {pct(row.margin, 0)}
                        </td>
                        <ChannelCells row={row.card} tone="card" />
                        <ChannelCells row={row.bnpl} tone="bnpl" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Order of 1 carries the full courier and other cost; Order of {n} spreads it
              across the order. Net Profit per Order = order incl. VAT − order cost × (1 +
              VAT) − gateway fee incl. VAT. The highlighted row is the Quick Quote target
              margin. Table and Quick Quote values are rounded up to the whole AED.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

const TONES = {
  card: { one: "bg-[#DDEBF7]", n: "bg-[#BDD7EE]", text: "text-[#1F4E79]" },
  bnpl: { one: "bg-[#FCE4D6]", n: "bg-[#F8CBAD]", text: "text-[#843C0C]" },
} as const;

function ChannelCells({ row, tone }: { row: ChannelRow; tone: keyof typeof TONES }) {
  const t = TONES[tone];
  return (
    <>
      <td className={`py-1 px-3 text-right border-l-2 border-slate-800 ${t.one} ${t.text}`}>
        {fmtCeil(row.orderOfOne)}
      </td>
      <td className={`py-1 px-3 text-right font-bold ${t.n} ${t.text}`}>{fmtCeil(row.orderOfN)}</td>
      <td className="py-1 px-3 text-right font-bold bg-[#E2EFDA] text-[#375623]">
        {fmtCeil(row.netProfit)}
      </td>
    </>
  );
}

function QuoteRow({
  label,
  field,
  card,
  bnpl,
  bold,
  profit,
}: {
  label: string;
  field: keyof QuickQuote;
  card: QuickQuote | null;
  bnpl: QuickQuote | null;
  bold?: boolean;
  profit?: boolean;
}) {
  const cell = (q: QuickQuote | null) => {
    const v = q?.[field];
    const negative = typeof v === "number" && v < 0;
    const color = profit ? (negative ? "text-red-600" : "text-[#375623]") : "text-slate-900";
    return <td className={`py-1.5 px-3 text-right ${bold ? "font-bold" : ""} ${color}`}>{fmtCeil(v)}</td>;
  };
  return (
    <tr className={profit && bold ? "bg-[#E2EFDA]" : ""}>
      <td className={`py-1.5 px-3 ${bold ? "font-bold text-slate-900" : "text-slate-800"}`}>{label}</td>
      {cell(card)}
      {cell(bnpl)}
    </tr>
  );
}
