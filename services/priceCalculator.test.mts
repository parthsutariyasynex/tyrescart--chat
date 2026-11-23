/**
 * Checks services/priceCalculator.ts against the source workbook
 * "Tyre-Price-Calculator 1.xlsx" ("Price Calculator" sheet).
 *
 * Two fixtures:
 *  - WORKBOOK: values Excel itself cached in the file (tyre 450, 4 per order,
 *    VAT 5%, card 2.1%, Tabby/Tamara 7.1%, target margin 9%).
 *  - SCREENSHOT: values read off the user's screenshot at tyre 1,250.
 *
 * Run: node --test services/priceCalculator.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INPUTS,
  DEFAULT_TARGET_MARGIN,
  costTotals,
  marginTable,
  quickQuote,
  priceExclVat,
  type CalculatorInputs,
} from "./priceCalculator.ts";

const close = (actual: number | null, expected: number, label: string) => {
  assert.notEqual(actual, null, label);
  assert.ok(Math.abs(actual! - expected) < 1e-6, `${label}: ${actual} ≠ ${expected}`);
};
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

const WORKBOOK_INPUTS: CalculatorInputs = { ...DEFAULT_INPUTS, tyreCost: 450 };

test("cost totals (C10, C11)", () => {
  assert.deepEqual(costTotals(WORKBOOK_INPUTS), { totalOrderCost: 1800, costPerTyre: 450 });
  const withCourier = { ...DEFAULT_INPUTS, courierCost: 40, otherCost: 20 };
  assert.deepEqual(costTotals(withCourier), { totalOrderCost: 5060, costPerTyre: 1265 });
});

// Excel's cached values: [margin %, C, D, E, F, G, H]
const WORKBOOK_ROWS: [number, number, number, number, number, number, number][] = [
  [1, 488.7016825300785, 1954.806730120314, 21.703241721160964, 518.2497964018658, 2072.999185607463, 28.457096320426643],
  [2, 493.80909706092143, 1975.2363882436857, 41.682425882912455, 523.997127719448, 2095.988510877792, 49.73256739185274],
  [5, 509.7926034218143, 2039.1704136872572, 104.2067060654532, 542.0302906028008, 2168.1211624112034, 116.48772975344818],
];
const WORKBOOK_TAIL: [number, number, number, number][] = [
  // [margin %, E, G, H]
  [42, 1429.2669447200533, 3767.0226071184766, 1596.1910717577941],
  [50, 1986.135452109952, 4481.620022645223, 2257.5152499570213],
];

test("margin table matches the workbook's cached values", () => {
  const rows = marginTable(WORKBOOK_INPUTS);
  assert.equal(rows.length, 50);
  for (const [pct, c, d, e, f, g, h] of WORKBOOK_ROWS) {
    const row = rows[pct - 1];
    close(row.card.orderOfOne, c, `C @ ${pct}%`);
    close(row.card.orderOfN, d, `D @ ${pct}%`);
    close(row.card.netProfit, e, `E @ ${pct}%`);
    close(row.bnpl.orderOfOne, f, `F @ ${pct}%`);
    close(row.bnpl.orderOfN, g, `G @ ${pct}%`);
    close(row.bnpl.netProfit, h, `H @ ${pct}%`);
  }
  for (const [pct, e, g, h] of WORKBOOK_TAIL) {
    const row = rows[pct - 1];
    close(row.card.netProfit, e, `E @ ${pct}%`);
    close(row.bnpl.orderOfN, g, `G @ ${pct}%`);
    close(row.bnpl.netProfit, h, `H @ ${pct}%`);
  }
});

test("quick quote matches the workbook (F6:G13 at 9%)", () => {
  const card = quickQuote(WORKBOOK_INPUTS, DEFAULT_TARGET_MARGIN, WORKBOOK_INPUTS.cardFeeRate)!;
  close(card.pricePerTyreExclVat, 507.41531097511125, "F6");
  close(card.pricePerTyreInclVat, 532.7860765238669, "F7");
  close(card.gatewayFeePerTyre, 11.747932987351264, "F8");
  close(card.netProfitPerTyre, 48.53814353651562, "F9");
  close(card.orderTotalInclVat, 2131.1443060954675, "F10");
  close(card.orderCostInclVat, 1890, "F11");
  close(card.gatewayFeePerOrder, 46.99173194940506, "F12");
  close(card.netProfitPerOrder, 194.15257414606248, "F13");

  const bnpl = quickQuote(WORKBOOK_INPUTS, DEFAULT_TARGET_MARGIN, WORKBOOK_INPUTS.bnplFeeRate)!;
  close(bnpl.pricePerTyreExclVat, 541.0458416118356, "G6");
  close(bnpl.pricePerTyreInclVat, 568.0981336924274, "G7");
  close(bnpl.gatewayFeePerTyre, 42.35171586677046, "G8");
  close(bnpl.netProfitPerTyre, 53.24641782565692, "G9");
  close(bnpl.orderTotalInclVat, 2272.3925347697095, "G10");
  close(bnpl.gatewayFeePerOrder, 169.40686346708185, "G12");
  close(bnpl.netProfitPerOrder, 212.98567130262768, "G13");
});

test("Order of 1 carries the FULL courier/other cost (C19 = SUM(C5:C8)/…)", () => {
  const i = { ...DEFAULT_INPUTS, courierCost: 40, otherCost: 20 };
  const row = marginTable(i)[0]; // 1%
  const share = 1 - 0.01 - 0.021 * 1.05 ** 2;
  close(row.card.orderOfOne, ((1250 + 40 + 20) / share) * 1.05, "C19 with courier");
  close(row.card.orderOfN, ((5060 / 4) / share) * 1.05 * 4, "D19 with courier");
});

// Screenshot at tyre 1,250: [margin %, card 1, card 4, card net, bnpl 1, bnpl 4, bnpl net]
const SCREENSHOT: [number, number, number, number, number, number, number][] = [
  [1, 1357.5, 5430.02, 60.29, 1439.58, 5758.33, 79.05],
  [10, 1496.84, 5987.36, 605.34, 1597.25, 6389.02, 662.72],
  [15, 1587.35, 6349.42, 959.41, 1700.74, 6802.96, 1045.8],
];

test("margin table matches the screenshot at 1,250", () => {
  const rows = marginTable(DEFAULT_INPUTS);
  for (const [pct, c1, c4, cNet, b1, b4, bNet] of SCREENSHOT) {
    const row = rows[pct - 1];
    assert.deepEqual(
      [row.card.orderOfOne, row.card.orderOfN, row.card.netProfit, row.bnpl.orderOfOne, row.bnpl.orderOfN, row.bnpl.netProfit].map(r2),
      [c1, c4, cNet, b1, b4, bNet],
      `row ${pct}%`,
    );
  }
});

test("unreachable margin yields null, not a negative price", () => {
  assert.equal(priceExclVat(5000, 0.95, 0.071, 0.05), null);
  assert.equal(quickQuote(DEFAULT_INPUTS, 0.95, 0.071), null);
});
