/**
 * Tyre Price Calculator → .xlsx export.
 *
 * Rebuilds the source workbook's "Price Calculator" sheet (same cells, fills,
 * fonts and number formats) with the page's current inputs. Every computed
 * cell is a LIVE formula, so the downloaded file still works as a calculator
 * in Excel. Each formula also carries a pre-computed result from
 * services/priceCalculator.ts, so viewers that don't recalculate (previews,
 * mobile mail apps) still show the right numbers.
 *
 * Rounding matches the page: table values are whole AED rounded UP, written as
 * `-INT(-(x - 1E-9))`. That is Math.ceil with the same epsilon, and it works in
 * every Excel version and LibreOffice (CEILING.MATH needs the `_xlfn.` prefix
 * in the file and shows #NAME? in older readers).
 *
 * exceljs (~950 KB) is loaded with a dynamic import inside the export call, so
 * it is only downloaded when someone actually exports.
 */
import type { Borders, Cell, Fill, Font, Workbook, Worksheet } from "exceljs";
import {
  costTotals,
  marginTable,
  sellingPriceSummary,
  OUTPUTS_ORDER_SIZE,
  type CalculatorInputs,
  type ChannelRow,
} from "@/services/priceCalculator";

/* ── workbook palette (read from the source file's cell styles) ── */
const C = {
  navy: "FF1F3864",
  cardDark: "FF1F4E79",
  bnplDark: "FF843C0C",
  marginHead: "FF3A3A3A",
  cardOne: "FF5B9BD5",
  cardN: "FF2E75B6",
  bnplOne: "FFF4B183",
  bnplN: "FFC55A11",
  green: "FF548235",
  inputFill: "FFDDEBF7",
  inputFont: "FF0000FF",
  cardOneBody: "FFDDEBF7",
  cardNBody: "FFBDD7EE",
  bnplOneBody: "FFFCE4D6",
  bnplNBody: "FFF8CBAD",
  profitBody: "FFE2EFDA",
  profitFont: "FF375623",
  marginBody: "FFEDEDED",
  white: "FFFFFFFF",
  red: "FFFF0000",
  border: "FFBFBFBF",
} as const;

const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: C.border } };
const BOX: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };

const MONEY = "#,##0.00";
const WHOLE = "#,##0";
const PCT1 = "0.0%";

/** Same rule as the page's fmtCeil: Math.ceil with epsilon, never -0. */
const ceilUp = (n: number) => Math.ceil(n - 1e-9) || 0;
/** Excel equivalent of ceilUp. */
const xlUp = (expr: string) => `-INT(-((${expr})-1E-9))`;

function style(cell: Cell, opts: { fill?: string; font?: Partial<Font>; numFmt?: string; align?: "left" | "center" | "right"; wrap?: boolean; border?: boolean }) {
  if (opts.fill) cell.fill = fill(opts.fill);
  if (opts.font) cell.font = { name: "Calibri", size: 11, ...opts.font };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  if (opts.align || opts.wrap) {
    cell.alignment = { horizontal: opts.align, vertical: "middle", wrapText: opts.wrap };
  }
  if (opts.border !== false) cell.border = BOX;
}

const FIRST_ROW = 19; // B19 = 1%
const LAST_ROW = 68; // B68 = 50%

function buildSheet(wb: Workbook, inputs: CalculatorInputs): Worksheet {
  const ws = wb.addWorksheet("Price Calculator", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 3 }, // A
    { width: 42 }, // B
    { width: 18 }, // C
    { width: 18 }, // D
    { width: 28 }, // E
    { width: 18 }, // F
    { width: 18 }, // G
    { width: 22 }, // H
    { width: 42 }, // I
    { width: 14 }, // J
  ];

  const n = Math.max(1, Math.floor(inputs.tyresPerOrder) || 1);
  const totals = costTotals(inputs);
  const v = inputs.vatRate;
  const pctLabel = (f: number) => `${(f * 100).toFixed(1)}%`;

  /* ── title ── */
  ws.getCell("B1").value = "TyresCart.ae – Tyre Price Calculator";
  ws.getCell("B1").font = { name: "Calibri", size: 16, bold: true, color: { argb: C.navy } };
  ws.getCell("B2").value =
    "Enter costs in the blue cells. Courier & Other costs are per order and spread over the tyres in the order. Margin = net profit after gateway fee ÷ price excl. VAT.";
  ws.getCell("B2").font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF595959" } };

  /* ── Cost Inputs (B4:C11) — rates live in the Constant block (J5:J9) ── */
  for (const [addr, text] of [["B4", "Cost Inputs"], ["C4", "AED"]] as const) {
    ws.getCell(addr).value = text;
    style(ws.getCell(addr), { fill: C.navy, font: { bold: true, color: { argb: C.white } } });
  }

  const perOrder = (label: string) => ({
    richText: [
      { text: `${label} `, font: { name: "Calibri", size: 11 } },
      { text: "(per order)", font: { name: "Calibri", size: 11, color: { argb: C.red } } },
    ],
  });

  type Row = { r: number; label: string | ReturnType<typeof perOrder>; value?: number; formula?: string; result?: number; numFmt: string; input?: boolean; bold?: boolean; greenFill?: boolean };
  const rows: Row[] = [
    { r: 5, label: "Tyre Cost (per tyre)", value: inputs.tyreCost, numFmt: MONEY, input: true },
    { r: 6, label: "Fitting Cost (per tyre)", value: inputs.fittingCost, numFmt: MONEY, input: true },
    { r: 7, label: perOrder("Courier Cost"), value: inputs.courierCost, numFmt: MONEY, input: true },
    { r: 8, label: perOrder("Other Cost"), value: inputs.otherCost, numFmt: MONEY, input: true },
    { r: 9, label: "Tyres per Order", value: n, numFmt: "0", input: true },
    { r: 10, label: "Total Order Cost", formula: "C9*(C5+C6)+C7+C8", result: totals.totalOrderCost, numFmt: MONEY, bold: true },
    { r: 11, label: "Total Cost per Tyre", formula: "C10/C9", result: totals.costPerTyre, numFmt: MONEY, bold: true, greenFill: true },
  ];
  for (const row of rows) {
    const label = ws.getCell(`B${row.r}`);
    label.value = row.label;
    style(label, { font: { bold: row.bold } });

    const val = ws.getCell(`C${row.r}`);
    val.value = row.formula ? { formula: row.formula, result: row.result } : row.value;
    style(val, {
      numFmt: row.numFmt,
      align: "right",
      fill: row.input ? C.inputFill : row.greenFill ? C.profitBody : undefined,
      font: row.input ? { color: { argb: C.inputFont } } : { bold: row.bold },
    });
  }

  /* ── Constant (I4:J9) — the editable rates ── */
  for (const [addr, text] of [["I4", "Constant"], ["J4", "AED"]] as const) {
    ws.getCell(addr).value = text;
    style(ws.getCell(addr), { fill: C.navy, font: { bold: true, color: { argb: C.white } } });
  }
  const constants: [number, string, number, string][] = [
    [5, "VAT Rate (UAE)", inputs.vatRate, PCT1],
    [6, "Card Gateway Fee (on price incl. VAT)", inputs.cardFeeRate, PCT1],
    [7, "Tabby / Tamara Fee (on price incl. VAT)", inputs.bnplFeeRate, PCT1],
    [8, "Min. Margin % per Order", inputs.minMarginRate, PCT1],
    [9, "Min. Margin Amount (AED)", inputs.minMarginAmount, MONEY],
  ];
  for (const [r, label, value, numFmt] of constants) {
    ws.getCell(`I${r}`).value = label;
    style(ws.getCell(`I${r}`), {});
    ws.getCell(`J${r}`).value = value;
    style(ws.getCell(`J${r}`), { numFmt, align: "right", fill: C.inputFill, font: { color: { argb: C.inputFont } } });
  }

  /* ── Outputs (E4:G11), as in "Tyre-Price-Calculator 2.xlsx" ── */
  const selling = sellingPriceSummary(inputs);
  ws.getCell("E4").value = "Outputs";
  style(ws.getCell("E4"), { fill: C.navy, font: { bold: true, color: { argb: C.white } } });
  ws.getCell("F4").value = { formula: `"Card ("&TEXT($J$6,"0.0%")&")"`, result: `Card (${pctLabel(inputs.cardFeeRate)})` };
  style(ws.getCell("F4"), { fill: C.navy, font: { bold: true, color: { argb: C.white } } });
  ws.getCell("G4").value = { formula: `"Tabby / Tamara ("&TEXT($J$7,"0.0%")&")"`, result: `Tabby / Tamara (${pctLabel(inputs.bnplFeeRate)})` };
  style(ws.getCell("G4"), { fill: C.bnplDark, font: { bold: true, color: { argb: C.white } } });

  const greenLabel = { bold: true, color: { argb: "FF00B050" } };
  // The workbook's own formats: negatives in brackets, zero as "-".
  const AMOUNT = "#,##0.00;\\(#,##0.00\\);\\-";
  const RATE = "0.0%;\\(0.0%\\);\\-";
  const label = (addr: string, text: string | { formula: string; result: string }, font: Partial<Font> = {}, bg?: string) => {
    ws.getCell(addr).value = text;
    style(ws.getCell(addr), { font, fill: bg });
  };
  const formula = (addr: string, f: string, result: number | string, numFmt: string, extra: { bold?: boolean; bg?: string } = {}) => {
    ws.getCell(addr).value = { formula: f, result };
    style(ws.getCell(addr), { numFmt, align: "right", font: { bold: extra.bold }, fill: extra.bg });
  };
  const rateOrZero = (x: number | null) => x ?? 0;
  // Margin amount / % for a price cell, with the channel's fee cell.
  const marginFormulas = (priceCell: string, costExpr: string, fee: string) => ({
    amount: `${priceCell}/(1+$J$5)-${costExpr}-${priceCell}*${fee}*(1+$J$5)`,
    rate: (amountCell: string) => `IFERROR(${amountCell}/(${priceCell}/(1+$J$5)),0)`,
  });
  const lowest = (fee: string) => {
    const dRate = `(1-$F$13-${fee}*(1+$J$5)^2)`;
    const dAmt = `(1-${fee}*(1+$J$5)^2)`;
    return `IF(OR(${dRate}<=0,${dAmt}<=0),"—",MAX($C$10/${dRate},($C$10+$F$14)/${dAmt})*(1+$J$5))`;
  };

  label("E5", "Order of 1 Incl. VAT", greenLabel);
  formula("F5", `F8/${OUTPUTS_ORDER_SIZE}`, selling.orderOfOnePrice, MONEY, { bg: C.profitBody });
  formula("G5", "F5", selling.orderOfOnePrice, MONEY, { bg: C.profitBody });
  label("E8", `Order of ${OUTPUTS_ORDER_SIZE} Incl. VAT`, greenLabel);
  ws.getCell("F8").value = inputs.sellingPrice;
  style(ws.getCell("F8"), { numFmt: MONEY, align: "right", fill: C.inputFill, font: { color: { argb: C.inputFont } } });
  formula("G8", "F8", selling.orderOfNPrice, MONEY);
  for (const [col, fee, ch] of [["F", "$J$6", selling.card], ["G", "$J$7", selling.bnpl]] as const) {
    const one = marginFormulas(`${col}5`, "SUM($C$5:$C$8)", fee);
    const all = marginFormulas(`${col}8`, "$C$10", fee);
    formula(`${col}6`, one.amount, ch.one.amount, AMOUNT);
    formula(`${col}7`, one.rate(`${col}6`), rateOrZero(ch.one.rate), RATE);
    formula(`${col}9`, all.amount, ch.n.amount, AMOUNT);
    formula(`${col}10`, all.rate(`${col}9`), rateOrZero(ch.n.rate), RATE);
    formula(`${col}11`, lowest(fee), ch.lowestOrderOfN ?? "—", MONEY, { bold: true, bg: C.profitBody });
  }
  for (const r of [6, 9]) label(`E${r}`, "Margin Amount");
  for (const r of [7, 10]) label(`E${r}`, "Margin %");
  label("E11", `Lowest Order of ${OUTPUTS_ORDER_SIZE} Inc. VAT`, { bold: true }, C.profitBody);

  /* ── Min. Margin (E13:F14) — references the Constant block ── */
  label("E13", "Min. Margin % per Order");
  formula("F13", "$J$8", inputs.minMarginRate, PCT1);
  label("E14", "Min. Margin Amount (AED)");
  formula("F14", "$J$9", inputs.minMarginAmount, MONEY);

  /* ── Price vs Margin (B16:H68) ── */
  ws.getCell("B16").value = {
    formula: `"Price vs Margin (1% – 50%) – after payment gateway fees (incl. "&TEXT($J$5,"0%")&" VAT on fees)"`,
    result: `Price vs Margin (1% – 50%) – after payment gateway fees (incl. ${Math.round(v * 100)}% VAT on fees)`,
  };
  ws.getCell("B16").font = { name: "Calibri", size: 12, bold: true, color: { argb: C.navy } };

  ws.mergeCells("B17:B18");
  ws.getCell("B17").value = "Margin %";
  style(ws.getCell("B17"), { fill: C.marginHead, font: { bold: true, color: { argb: C.white } }, align: "center" });

  ws.mergeCells("C17:E17");
  ws.getCell("C17").value = {
    formula: `"Credit / Debit Card ("&TEXT($J$6,"0.0%")&" fee)"`,
    result: `Credit / Debit Card (${pctLabel(inputs.cardFeeRate)} fee)`,
  };
  style(ws.getCell("C17"), { fill: C.cardDark, font: { bold: true, color: { argb: C.white } }, align: "center" });
  ws.mergeCells("F17:H17");
  ws.getCell("F17").value = {
    formula: `"Tabby / Tamara ("&TEXT($J$7,"0.0%")&" fee)"`,
    result: `Tabby / Tamara (${pctLabel(inputs.bnplFeeRate)} fee)`,
  };
  style(ws.getCell("F17"), { fill: C.bnplDark, font: { bold: true, color: { argb: C.white } }, align: "center" });

  const orderOfN = { formula: `"Order of "&$C$9&" incl. VAT (AED)"`, result: `Order of ${n} incl. VAT (AED)` };
  const subHeads: [string, string | typeof orderOfN, string][] = [
    ["C18", "Order of 1 incl. VAT (AED)", C.cardOne],
    ["D18", orderOfN, C.cardN],
    ["E18", "Net Profit per Order (AED)", C.green],
    ["F18", "Order of 1 incl. VAT (AED)", C.bnplOne],
    ["G18", orderOfN, C.bnplN],
    ["H18", "Net Profit per Order (AED)", C.green],
  ];
  for (const [addr, text, color] of subHeads) {
    ws.getCell(addr).value = text;
    style(ws.getCell(addr), { fill: color, font: { bold: true, color: { argb: C.white } }, align: "center", wrap: true });
  }
  ws.getRow(18).height = 32;

  const table = marginTable(inputs);
  const channel = (r: number, feeCell: "$J$6" | "$J$7") => {
    const den = `(1-$B${r}-${feeCell}*(1+$J$5)^2)`;
    const exactN = `$C$11/${den}*(1+$J$5)*$C$9`;
    const guard = (expr: string) => `IF(${den}<=0,"—",${xlUp(expr)})`;
    return {
      one: guard(`SUM($C$5:$C$8)/${den}*(1+$J$5)`),
      n: guard(exactN),
      profit: guard(`(${exactN})*(1-${feeCell}*(1+$J$5))-$C$10*(1+$J$5)`),
    };
  };
  const cached = (x: number | null) => (x === null ? "—" : ceilUp(x));

  table.forEach((row, i) => {
    const r = FIRST_ROW + i;
    const m = ws.getCell(`B${r}`);
    m.value = row.margin;
    style(m, { fill: C.marginBody, font: { bold: true, color: { argb: C.marginHead } }, numFmt: "0%", align: "center" });

    const put = (col: string, formula: string, data: ChannelRow, key: keyof ChannelRow, bg: string, font: Partial<Font>) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = { formula, result: cached(data[key]) };
      style(cell, { fill: bg, font, numFmt: WHOLE, align: "right" });
    };
    const card = channel(r, "$J$6");
    put("C", card.one, row.card, "orderOfOne", C.cardOneBody, { color: { argb: C.cardDark } });
    put("D", card.n, row.card, "orderOfN", C.cardNBody, { bold: true, color: { argb: C.cardDark } });
    put("E", card.profit, row.card, "netProfit", C.profitBody, { bold: true, color: { argb: C.profitFont } });
    const bnpl = channel(r, "$J$7");
    put("F", bnpl.one, row.bnpl, "orderOfOne", C.bnplOneBody, { color: { argb: C.bnplDark } });
    put("G", bnpl.n, row.bnpl, "orderOfN", C.bnplNBody, { bold: true, color: { argb: C.bnplDark } });
    put("H", bnpl.profit, row.bnpl, "netProfit", C.profitBody, { bold: true, color: { argb: C.profitFont } });
  });

  const note = ws.getCell(`B${LAST_ROW + 2}`);
  note.value =
    "Order of 1 carries the full courier and other cost; Order of N spreads it across the order. Net Profit per Order = order incl. VAT − order cost × (1 + VAT) − gateway fee incl. VAT. Table values are rounded up to the whole AED.";
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF595959" } };

  return ws;
}

/** Builds the .xlsx in memory. Separate from the download so it can be tested. */
export async function buildCalculatorXlsx(inputs: CalculatorInputs): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "TyresCart POS";
  wb.created = new Date();
  // Excel recalculates every formula on open; the cached results above cover
  // readers that don't.
  wb.calcProperties.fullCalcOnLoad = true;
  buildSheet(wb, inputs);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Builds the workbook and hands it to the browser as a download. */
export async function downloadCalculatorXlsx(inputs: CalculatorInputs): Promise<void> {
  const data = await buildCalculatorXlsx(inputs);
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Tyre-Price-Calculator-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
