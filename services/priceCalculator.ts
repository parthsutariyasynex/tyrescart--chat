/**
 * Tyre price calculator — pure math, no React, no imports (so it runs under
 * `node --test` directly, like searchFilter.ts).
 *
 * A transcription of the source workbook "Tyre-Price-Calculator 1.xlsx",
 * sheet "Price Calculator". Cell references are kept in the comments so a
 * change to the workbook can be traced here. Every rate is a FRACTION (0.05
 * for 5%); the page converts from the percentages the user types.
 *
 *   C5..C8  tyre, fitting (per tyre), courier, other (per order)
 *   C9      tyres per order (N)
 *   C10     total order cost   = N·(tyre + fitting) + courier + other
 *   C11     cost per tyre      = C10 / N
 *   C12..14 VAT, card fee, Tabby/Tamara fee (fees charged on price incl. VAT)
 *
 * The gateway fee is charged on the price INCL. VAT and VAT is charged on the
 * fee, so as a share of the price excl. VAT it is `fee·(1+VAT)²`. Every price
 * in the workbook is therefore `cost / (1 − margin − fee·(1+VAT)²)`, and
 * multiplying by (1+VAT) gives the price incl. VAT.
 *
 * The original workbook's Quick Quote block was removed at the user's request
 * (TASK_LOG #016); the updated workbook's Selling Price block now sits in
 * E4:G11 instead (TASK_LOG #024, `sellingPriceSummary`).
 *
 * NET PROFIT (E19/H19) is `order incl. VAT − order cost·(1+VAT) −
 * gateway fee incl. VAT`, a VAT-inclusive figure. It is NOT
 * `margin × price excl. VAT` (60.29 vs 51.71 at 1% / card on 1,250 × 4). It
 * is reproduced as-is.
 */

export interface CalculatorInputs {
  tyreCost: number; // C5, per tyre
  fittingCost: number; // C6, per tyre
  courierCost: number; // C7, per order
  otherCost: number; // C8, per order
  tyresPerOrder: number; // C9
  vatRate: number; // C12, fraction
  cardFeeRate: number; // C13, fraction, on price incl. VAT
  bnplFeeRate: number; // C14, fraction (Tabby / Tamara), on price incl. VAT
  sellingPrice: number; // F8, the price being checked: an order of N incl. VAT
  minMarginRate: number; // F15 (= J8), fraction
  minMarginAmount: number; // F16 (= J9), AED per order
}

export const DEFAULT_INPUTS: CalculatorInputs = {
  tyreCost: 0,
  fittingCost: 0,
  courierCost: 0,
  otherCost: 0,
  tyresPerOrder: 4,
  vatRate: 0.05,
  cardFeeRate: 0.021,
  bnplFeeRate: 0.071,
  sellingPrice: 0,
  minMarginRate: 0.05,
  minMarginAmount: 100,
};

function tyreCount(i: CalculatorInputs): number {
  return Math.max(1, Math.floor(i.tyresPerOrder) || 1);
}

export interface CostTotals {
  totalOrderCost: number; // C10
  costPerTyre: number; // C11
}

export function costTotals(i: CalculatorInputs): CostTotals {
  const n = tyreCount(i);
  const totalOrderCost =
    n * (i.tyreCost + i.fittingCost) + i.courierCost + i.otherCost;
  return { totalOrderCost, costPerTyre: totalOrderCost / n };
}

/**
 * Price excl. VAT that yields `margin` on `cost`, or `null` when no price can
 * (margin + fee share ≥ 100% — the workbook would show a negative or #DIV/0!).
 */
export function priceExclVat(
  cost: number,
  margin: number,
  feeRate: number,
  vatRate: number,
): number | null {
  const denom = 1 - margin - feeRate * (1 + vatRate) ** 2;
  if (denom <= 0) return null;
  return cost / denom;
}

export interface ChannelRow {
  /**
   * C19 / F19 — a SINGLE-tyre order incl. VAT. Uses SUM(C5:C8): one tyre
   * carries the full courier and other cost, which is not spread.
   */
  orderOfOne: number | null;
  /** D19 / G19 — the full order of N tyres incl. VAT (cost per tyre × N). */
  orderOfN: number | null;
  /** E19 / H19 — net profit per order (VAT-inclusive basis, see header). */
  netProfit: number | null;
}

export function channelRow(
  i: CalculatorInputs,
  margin: number,
  feeRate: number,
): ChannelRow {
  const n = tyreCount(i);
  const v = i.vatRate;
  const { totalOrderCost, costPerTyre } = costTotals(i);
  const singleOrderCost = i.tyreCost + i.fittingCost + i.courierCost + i.otherCost;

  const one = priceExclVat(singleOrderCost, margin, feeRate, v);
  const perTyre = priceExclVat(costPerTyre, margin, feeRate, v);
  const orderOfN = perTyre === null ? null : perTyre * (1 + v) * n;

  return {
    orderOfOne: one === null ? null : one * (1 + v),
    orderOfN,
    netProfit:
      orderOfN === null
        ? null
        : orderOfN - totalOrderCost * (1 + v) - orderOfN * feeRate * (1 + v),
  };
}

export interface MarginRow {
  margin: number; // B19..B68, fraction
  card: ChannelRow;
  bnpl: ChannelRow;
}

/* ── Selling Price block (E4:G11) ──────────────────────────────────────────
 * Reverse-engineered from the updated workbook screenshot (2026-11-26, tyre
 * 70 × 4, price 430); every figure below reproduces it to the cent:
 *   F8          the price typed in (order of N incl. VAT); G8 = F8
 *   F5          order of 1 incl. VAT = F8 / 4 (fixed, see OUTPUTS_ORDER_SIZE); G5 = F5
 *   Margin Amt  price excl. VAT − cost − price incl. VAT · fee · (1+VAT)
 *               (the order of 1 carries SUM(C5:C8), like the table's C19)
 *   Margin %    margin amount ÷ price excl. VAT (the sheet's own definition)
 *   Lowest      the lowest order-of-N price incl. VAT that meets BOTH minimums
 *               (min margin % and min margin amount), i.e. the larger of the two.
 * Unlike the table's Net Profit, this margin amount is excl. VAT.
 */

export interface MarginResult {
  amount: number;
  /** null when the price is 0 (no price excl. VAT to divide by). */
  rate: number | null;
}

/** Margin left after cost and the gateway fee incl. VAT, at a price incl. VAT. */
export function marginAt(
  priceInclVat: number,
  cost: number,
  feeRate: number,
  vatRate: number,
): MarginResult {
  const excl = priceInclVat / (1 + vatRate);
  const amount = excl - cost - priceInclVat * feeRate * (1 + vatRate);
  return { amount, rate: excl > 0 ? amount / excl : null };
}

export interface SellingChannel {
  one: MarginResult; // F6:F7
  n: MarginResult; // F9:F10
  /** F11 — lowest order-of-N price incl. VAT meeting both minimums; null if unreachable. */
  lowestOrderOfN: number | null;
}

export interface SellingPriceSummary {
  orderOfOnePrice: number; // F5
  orderOfNPrice: number; // F8
  card: SellingChannel;
  bnpl: SellingChannel;
}

function sellingChannel(i: CalculatorInputs, feeRate: number): SellingChannel {
  const v = i.vatRate;
  const { totalOrderCost } = costTotals(i);
  const singleOrderCost = i.tyreCost + i.fittingCost + i.courierCost + i.otherCost;

  const forRate = priceExclVat(totalOrderCost, i.minMarginRate, feeRate, v);
  const forAmount = priceExclVat(totalOrderCost + i.minMarginAmount, 0, feeRate, v);
  return {
    one: marginAt(i.sellingPrice / OUTPUTS_ORDER_SIZE, singleOrderCost, feeRate, v),
    n: marginAt(i.sellingPrice, totalOrderCost, feeRate, v),
    lowestOrderOfN:
      forRate === null || forAmount === null ? null : Math.max(forRate, forAmount) * (1 + v),
  };
}

/**
 * F5 is `=F8/4` in "Tyre-Price-Calculator 2.xlsx": the Outputs block always
 * treats F8 as a 4-tyre order, whatever Tyres per Order (C9) says. Kept
 * deliberately at the user's request ("match Excel exactly", TASK_LOG #025).
 * When C9 ≠ 4 this disagrees with the cost side (SUM(C5:C8) is one tyre's
 * cost), so Order of 1 is only meaningful at 4 tyres per order.
 */
export const OUTPUTS_ORDER_SIZE = 4;

export function sellingPriceSummary(i: CalculatorInputs): SellingPriceSummary {
  return {
    orderOfOnePrice: i.sellingPrice / OUTPUTS_ORDER_SIZE,
    orderOfNPrice: i.sellingPrice,
    card: sellingChannel(i, i.cardFeeRate),
    bnpl: sellingChannel(i, i.bnplFeeRate),
  };
}

/**
 * Clipboard text for one payment channel of a Price vs Margin row, e.g.
 *
 *   Credit Card Payment Price
 *   1 Tyre: AED 174.00
 *   4 Tyres: AED 533.00
 *
 * Prices are rounded UP to the whole AED, exactly as the table shows them, so
 * the copied quote never undercuts the margin on screen. null when either
 * price is unreachable (margin + fees ≥ 100%).
 */
export function paymentPriceText(
  title: string,
  orderOfOne: number | null,
  orderOfN: number | null,
  n: number,
): string | null {
  if (orderOfOne === null || orderOfN === null) return null;
  const aed = (x: number) =>
    `AED ${(Math.ceil(x - 1e-9) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${title}\n1 Tyre: ${aed(orderOfOne)}\n${n} ${n === 1 ? "Tyre" : "Tyres"}: ${aed(orderOfN)}`;
}

/** Rows 19–68: one per whole-percent margin, `from`..`to` inclusive. */
export function marginTable(
  i: CalculatorInputs,
  from = 1,
  to = 50,
): MarginRow[] {
  const rows: MarginRow[] = [];
  for (let pct = from; pct <= to; pct++) {
    const margin = pct / 100;
    rows.push({
      margin,
      card: channelRow(i, margin, i.cardFeeRate),
      bnpl: channelRow(i, margin, i.bnplFeeRate),
    });
  }
  return rows;
}
