"use client";

import React, { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowPathIcon, ArrowDownTrayIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import Header from "@/components/Header";
import { useToast } from "@/components/ToastProvider";
import { downloadCalculatorXlsx } from "@/services/calculatorExport";
import { features } from "@/config/features";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  DEFAULT_INPUTS,
  costTotals,
  marginTable,
  sellingPriceSummary,
  paymentPriceText,
  OUTPUTS_ORDER_SIZE,
  type CalculatorInputs,
  type ChannelRow,
  type MarginResult,
  type MarginRow,
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
const PERCENT_KEYS: InputKey[] = ["vatRate", "cardFeeRate", "bnplFeeRate", "minMarginRate"];

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

/** Percent with one decimal, as the workbook shows it (0.05 → "5.0%"). */
const pct1 = (fraction: number | null) =>
  fraction === null || !Number.isFinite(fraction) ? "—" : `${(fraction * 100).toFixed(1)}%`;

// overflow-x-auto, not hidden: a narrow column scrolls instead of clipping figures.
const CARD = "bg-white border border-slate-200 rounded-lg shadow-2xs overflow-x-auto";
const ROW = "border-b border-slate-200 last:border-b-0";

const INPUT_CELL =
  "w-full min-w-0 bg-transparent text-right text-[#0000FF] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded px-1 py-0.5";

interface NumberInputProps {
  id: InputKey;
  suffix?: string;
  integer?: boolean;
  value: string;
  onChange: (key: InputKey, value: string) => void;
}

/** A blue workbook input cell's contents. */
function NumberInput({ id, suffix, integer, value, onChange }: NumberInputProps) {
  return (
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
  );
}

function InputRow({ label, ...input }: NumberInputProps & { label: React.ReactNode }) {
  return (
    <tr className={ROW}>
      <td className="py-1.5 px-3 text-slate-800">
        <label htmlFor={`calc-${input.id}`}>{label}</label>
      </td>
      <td className="py-1 px-2 bg-[#DDEBF7] w-32">
        <NumberInput {...input} />
      </td>
    </tr>
  );
}

/** A read-only copy of a value that is edited in the Constant block. */
function MirrorRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className={ROW} title="Edit this in the Constant table">
      <td className="py-1.5 px-3 text-slate-800">{label}</td>
      <td className="py-1.5 px-3 w-32 text-right tabular-nums text-slate-700 bg-slate-50">{value}</td>
    </tr>
  );
}

/** Margin Amount + Margin % rows of the Selling Price block, both channels. */
function MarginRows({ card, bnpl }: { card: MarginResult; bnpl: MarginResult }) {
  const amount = (m: MarginResult) => (
    <td className={`py-1.5 px-3 text-right tabular-nums ${m.amount < -0.005 ? "text-red-600" : ""}`}>
      {fmt(m.amount)}
    </td>
  );
  const rate = (m: MarginResult) => (
    <td className={`py-1.5 px-3 text-right tabular-nums ${m.rate !== null && m.rate < 0 ? "text-red-600" : ""}`}>
      {pct1(m.rate)}
    </td>
  );
  return (
    <>
      <tr className={ROW}>
        <td className="py-1.5 px-3 text-slate-800">Margin Amount</td>
        {amount(card)}
        {amount(bnpl)}
      </tr>
      <tr className={ROW}>
        <td className="py-1.5 px-3 text-slate-800">Margin %</td>
        {rate(card)}
        {rate(bnpl)}
      </tr>
    </>
  );
}

const PerOrder = () => <span className="text-red-600">(per order)</span>;

export default function CalculatorPage() {
  if (!features.calculator) notFound();

  const isOnline = useOnlineStatus();
  const [raw, setRaw] = useState<RawInputs>(DEFAULT_RAW);
  /** Margin (fraction) of the clicked Price vs Margin row; null = none. */
  const [selectedMargin, setSelectedMargin] = useState<number | null>(null);
  const toggleRow = (margin: number) =>
    setSelectedMargin((cur) => (cur === margin ? null : margin));
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const inputs = useMemo(() => fromRaw(raw), [raw]);
  const totals = useMemo(() => costTotals(inputs), [inputs]);
  const rows = useMemo(() => marginTable(inputs), [inputs]);
  const selling = useMemo(() => sellingPriceSummary(inputs), [inputs]);
  const n = Math.max(1, Math.floor(inputs.tyresPerOrder) || 1);

  const setField = (key: InputKey, value: string) =>
    setRaw((prev) => ({ ...prev, [key]: value }));

  const isDefault = (Object.keys(DEFAULT_RAW) as InputKey[]).every(
    (k) => raw[k] === DEFAULT_RAW[k],
  );

  /**
   * Selects the row and copies its prices (TASK_LOG #030):
   *  - a Card or Tabby cell copies that channel's block,
   *    "Credit Card Payment Price / 1 Tyre: AED … / 4 Tyres: AED …";
   *  - the Margin % cell copies both blocks, separated by a blank line.
   * Always selects (never toggles off), so a second copy keeps the highlight.
   */
  const copyPrices = async (row: MarginRow, channel: "card" | "bnpl" | "both") => {
    setSelectedMargin(row.margin);
    const block = (c: "card" | "bnpl") =>
      paymentPriceText(PAYMENT_TITLES[c], row[c].orderOfOne, row[c].orderOfN, n);
    const parts = channel === "both" ? [block("card"), block("bnpl")] : [block(channel)];
    if (parts.some((p) => p === null)) {
      toast("No price is possible at this margin", "error");
      return;
    }
    const text = parts.join("\n\n");
    const what = channel === "both" ? "card + Tabby/Tamara" : channel === "card" ? "card" : "Tabby/Tamara";
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${what} prices at ${pct(row.margin, 0)} margin`, "success");
    } catch (e) {
      console.error("[calculator] clipboard write failed:", e);
      toast("Could not copy to the clipboard", "error");
    }
  };

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
              onClick={() => {
                setRaw(DEFAULT_RAW);
                setSelectedMargin(null);
              }}
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
          {/* Cost Inputs | Outputs + Min. Margin | Constant. Rates and minimums
              are edited ONLY in Constant (TASK_LOG #024); Min. Margin under
              Outputs is a read-only copy, like the workbook referencing J8:J9. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] gap-6 items-start">
            {/* ── Cost Inputs (B4:C14) ── */}
            <section className={CARD}>
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
                  <tr className={ROW}>
                    <td className="py-1.5 px-3 font-bold text-slate-900">Total Order Cost</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums">{fmt(totals.totalOrderCost)}</td>
                  </tr>
                  <tr className={ROW}>
                    <td className="py-1.5 px-3 font-bold text-slate-900">Total Cost per Tyre</td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums bg-[#E2EFDA]">{fmt(totals.costPerTyre)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ── Outputs (E4:G11) + Min. Margin (E13:F14) ── */}
            <div className="space-y-4">
              <section className={CARD}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white">
                      <th className="py-1.5 px-3 text-left font-bold bg-[#1F3864]">Outputs</th>
                      <th className="py-1.5 px-3 text-left font-bold bg-[#1F3864] whitespace-nowrap">Card ({pct1(inputs.cardFeeRate)})</th>
                      <th className="py-1.5 px-3 text-left font-bold bg-[#843C0C] whitespace-nowrap">Tabby / Tamara ({pct1(inputs.bnplFeeRate)})</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={ROW}>
                      <td className="py-1.5 px-3 font-bold text-[#00B050]">Order of 1 Incl. VAT</td>
                      <td className="py-1.5 px-3 text-right tabular-nums bg-[#E2EFDA]">{fmt(selling.orderOfOnePrice)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums bg-[#E2EFDA]">{fmt(selling.orderOfOnePrice)}</td>
                    </tr>
                    <MarginRows card={selling.card.one} bnpl={selling.bnpl.one} />
                    <tr className={ROW}>
                      <td className="py-1.5 px-3 font-bold text-[#00B050]">
                        <label htmlFor="calc-sellingPrice">Order of {OUTPUTS_ORDER_SIZE} Incl. VAT</label>
                      </td>
                      <td className="py-1 px-2 bg-[#DDEBF7]">
                        <NumberInput id="sellingPrice" value={raw.sellingPrice} onChange={setField} />
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(selling.orderOfNPrice)}</td>
                    </tr>
                    <MarginRows card={selling.card.n} bnpl={selling.bnpl.n} />
                    <tr className="bg-[#E2EFDA] font-bold text-slate-900">
                      <td className="py-1.5 px-3 whitespace-nowrap">Lowest Order of {OUTPUTS_ORDER_SIZE} Inc. VAT</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(selling.card.lowestOrderOfN)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(selling.bnpl.lowestOrderOfN)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className={CARD}>
                <table className="w-full text-sm">
                  <tbody>
                    <MirrorRow label="Min. Margin % per Order" value={pct1(inputs.minMarginRate)} />
                    <MirrorRow label="Min. Margin Amount (AED)" value={fmt(inputs.minMarginAmount)} />
                  </tbody>
                </table>
              </section>
            </div>

            {/* ── Constant (I4:J9) — the one place rates and minimums are edited ── */}
            <section className={CARD}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1F3864] text-white">
                    <th className="py-1.5 px-3 text-left font-bold">Constant</th>
                    <th className="py-1.5 px-3 text-left font-bold">AED</th>
                  </tr>
                </thead>
                <tbody>
                  <InputRow id="vatRate" label="VAT Rate (UAE)" suffix="%" value={raw.vatRate} onChange={setField} />
                  <InputRow id="cardFeeRate" label="Card Gateway Fee (on price incl. VAT)" suffix="%" value={raw.cardFeeRate} onChange={setField} />
                  <InputRow id="bnplFeeRate" label="Tabby / Tamara Fee (on price incl. VAT)" suffix="%" value={raw.bnplFeeRate} onChange={setField} />
                  <InputRow id="minMarginRate" label="Min. Margin % per Order" suffix="%" value={raw.minMarginRate} onChange={setField} />
                  <InputRow id="minMarginAmount" label="Min. Margin Amount (AED)" value={raw.minMarginAmount} onChange={setField} />
                </tbody>
              </table>
            </section>
          </div>
          {/* ── Price vs Margin (B16:H68) ── */}
          <section>
            {/* Each column carries the workbook's own fill (TASK_LOG #027):
                Card in blues, Tabby / Tamara in oranges, Net Profit in green,
                Margin % in grey. Colours live on the cells, so hover and the
                clicked row swap every cell to emerald-200 to light the row. */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="sticky top-0 z-10 text-white">
                  <tr className="text-[11px] font-bold uppercase tracking-wider select-none">
                    <th rowSpan={2} className="py-2.5 px-2 w-28 text-center align-middle bg-[#3A3A3A]">Margin %</th>
                    <th colSpan={3} className="py-2 px-2 text-center bg-[#1F4E79] border-l border-white/30">
                      Credit / Debit Card ({pct(inputs.cardFeeRate)} fee)
                    </th>
                    <th colSpan={3} className="py-2 px-2 text-center bg-[#843C0C] border-l border-white/30">
                      Tabby / Tamara ({pct(inputs.bnplFeeRate)} fee)
                    </th>
                  </tr>
                  <tr className="text-[11px] font-bold uppercase tracking-wider select-none">
                    <th className="py-2 px-2 text-right whitespace-nowrap bg-[#5B9BD5] border-l border-white/30">Order of 1 incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap bg-[#2E75B6]">Order of {n} incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap bg-[#548235]">Net Profit / Order (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap bg-[#F4B183] border-l border-white/30">Order of 1 incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap bg-[#C55A11]">Order of {n} incl. VAT (AED)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap bg-[#548235]">Net Profit / Order (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white font-sans">
                  {rows.map((row) => {
                    // A clicked row keeps the hover colour until clicked again.
                    const selected = selectedMargin === row.margin;
                    return (
                      <tr
                        key={row.margin}
                        onClick={() => toggleRow(row.margin)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRow(row.margin);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={selected}
                        className="group cursor-pointer align-middle focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600"
                      >
                        <td
                          title="Click to copy the card and Tabby/Tamara prices"
                          onClick={(e) => {
                            // The row's own onClick would toggle the selection off again.
                            e.stopPropagation();
                            copyPrices(row, "both");
                          }}
                          className={`px-2 text-center ${cellBg("bg-[#EDEDED]", selected)}`}
                        >
                          <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-white text-[#3A3A3A] border border-slate-300/80 font-mono whitespace-nowrap">
                            {pct(row.margin, 0)}
                          </span>
                        </td>
                        <ChannelCells row={row.card} selected={selected} palette={CARD_COLS} copyLabel="Click to copy the card prices" onCopy={() => copyPrices(row, "card")} />
                        <ChannelCells row={row.bnpl} selected={selected} palette={BNPL_COLS} copyLabel="Click to copy the Tabby / Tamara prices" onCopy={() => copyPrices(row, "bnpl")} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** First line of each copied price block, as the user wrote them. */
const PAYMENT_TITLES = {
  card: "Credit Card Payment Price",
  bnpl: "Tabby/Tamara Payment Price",
} as const;

/**
 * A body cell's column fill, or the row highlight. Hover and selection both
 * use emerald-200 across the whole row; the column colour is dropped (not
 * overridden) while selected so no class-order tie decides the winner.
 */
const cellBg = (columnBg: string, selected: boolean) =>
  selected
    ? "bg-emerald-200 transition-colors duration-150"
    : `${columnBg} group-hover:bg-emerald-200 transition-colors duration-150`;

/** Body fills and font colours per column, from the workbook (C19:H19). */
interface ChannelPalette {
  one: string; // Order of 1
  n: string; // Order of N
  text: string; // figures in both price columns
}
const CARD_COLS: ChannelPalette = { one: "bg-[#DDEBF7]", n: "bg-[#BDD7EE]", text: "text-[#1F4E79]" };
const BNPL_COLS: ChannelPalette = { one: "bg-[#FCE4D6]", n: "bg-[#F8CBAD]", text: "text-[#843C0C]" };

interface ChannelCellsProps {
  row: ChannelRow;
  selected: boolean;
  palette: ChannelPalette;
  /** Tooltip for the three cells, e.g. "Click to copy the card prices". */
  copyLabel: string;
  /** Selects the row and copies this channel's prices (TASK_LOG #030). */
  onCopy: () => void;
}

/** One payment channel's three cells: Order of 1, Order of N (bold) and Net
 *  Profit on the workbook's green (dark green figures, red for a loss).
 *  Clicking any of them copies this channel's prices for the row; a copy icon
 *  shows in the Order of 1 cell of the selected row. */
function ChannelCells({ row, selected, palette, copyLabel, onCopy }: ChannelCellsProps) {
  const loss = typeof row.netProfit === "number" && ceilUp(row.netProfit) < 0;
  // stopPropagation: the row's own onClick toggles the selection, which would
  // immediately undo the selection a copy makes.
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy();
  };
  return (
    <>
      <td title={copyLabel} onClick={copy} className={`relative px-2 text-right text-xs font-semibold font-mono whitespace-nowrap border-l border-white ${palette.text} ${cellBg(palette.one, selected)}`}>
        {/* Rendered only on the selected row, with an inline opacity: no new
            Tailwind classes, so it can't be hit by the stale dev CSS
            (TASK_LOG #028). */}
        {selected && (
          <ClipboardDocumentIcon
            aria-hidden
            style={{ opacity: 0.7 }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4"
          />
        )}
        {fmtCeil(row.orderOfOne)}
      </td>
      <td title={copyLabel} onClick={copy} className={`px-2 text-right text-xs font-extrabold font-mono whitespace-nowrap ${palette.text} ${cellBg(palette.n, selected)}`}>
        {fmtCeil(row.orderOfN)}
      </td>
      <td title={copyLabel} onClick={copy} className={`px-2 text-right text-xs font-bold font-mono whitespace-nowrap ${loss ? "text-red-700" : "text-[#375623]"} ${cellBg("bg-[#E2EFDA]", selected)}`}>
        {fmtCeil(row.netProfit)}
      </td>
    </>
  );
}
