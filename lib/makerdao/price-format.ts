import { formatNumber } from "@/lib/utils/format";

/** A collateral price in dollars. Under $1 it keeps three significant digits
 *  ($0.0250, $0.0226), so a cheap token's price and its liquidation line stay
 *  apart; from $1 up it uses `big` (cents by default). */
export function usdPrice(v: number, big: (n: number) => string = cents): string {
  if (!Number.isFinite(v) || v <= 0) return "–";
  if (v < 1) return `$${v.toLocaleString("en-US", { minimumSignificantDigits: 3, maximumSignificantDigits: 3 })}`;
  return big(v);
}

const cents = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A debt amount at cents, or at six decimals where cents would hide part of
 *  it: a repayment of 31.000018 DAI that cleared the debt reads 31.000018. */
export function debtDigits(n: number): string {
  const atCents = Math.round(n * 100) / 100;
  if (Math.abs(n - atCents) < 5e-7) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/** A collateral amount under one unit at four significant digits (0.2538,
 *  0.5038, 0.25), the grain the timeline spine uses; larger amounts and trace
 *  amounts as formatNumber states them. One rule for the card, the row and its
 *  opened grid. */
export function collAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e-6 && abs < 1) {
    return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  }
  return formatNumber(n);
}
