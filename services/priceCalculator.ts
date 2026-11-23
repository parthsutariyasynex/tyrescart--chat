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
 * NET PROFIT (E19/H19, F13/G13) is `order incl. VAT − order cost·(1+VAT) −
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
}

export const DEFAULT_INPUTS: CalculatorInputs = {
  tyreCost: 1250,
  fittingCost: 0,
  courierCost: 0,
  otherCost: 0,
  tyresPerOrder: 4,
  vatRate: 0.05,
  cardFeeRate: 0.021,
  bnplFeeRate: 0.071,
};

/** F5 — the Quick Quote target margin; the workbook ships with 9%. */
export const DEFAULT_TARGET_MARGIN = 0.09;

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

export interface QuickQuote {
  pricePerTyreExclVat: number; // F6
  pricePerTyreInclVat: number; // F7
  gatewayFeePerTyre: number; // F8, incl. VAT on the fee
  netProfitPerTyre: number; // F9
  orderTotalInclVat: number; // F10
  orderCostInclVat: number; // F11
  gatewayFeePerOrder: number; // F12
  netProfitPerOrder: number; // F13
}

/**
 * Quick Quote block (E4:G13) for one channel at a target margin. Returns
 * `null` when the margin is unreachable on that channel.
 */
export function quickQuote(
  i: CalculatorInputs,
  targetMargin: number,
  feeRate: number,
): QuickQuote | null {
  const n = tyreCount(i);
  const v = i.vatRate;
  const { totalOrderCost, costPerTyre } = costTotals(i);
  const excl = priceExclVat(costPerTyre, targetMargin, feeRate, v);
  if (excl === null) return null;

  const incl = excl * (1 + v);
  const feePerTyre = incl * feeRate * (1 + v);
  const orderTotalInclVat = incl * n;
  const orderCostInclVat = totalOrderCost * (1 + v);
  const gatewayFeePerOrder = feePerTyre * n;
  const netProfitPerOrder = orderTotalInclVat - orderCostInclVat - gatewayFeePerOrder;

  return {
    pricePerTyreExclVat: excl,
    pricePerTyreInclVat: incl,
    gatewayFeePerTyre: feePerTyre,
    netProfitPerTyre: netProfitPerOrder / n,
    orderTotalInclVat,
    orderCostInclVat,
    gatewayFeePerOrder,
    netProfitPerOrder,
  };
}
