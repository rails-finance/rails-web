// The shown-values arithmetic every dollar receipt rebuilds its figure with
// (ui-jobs 740, 743): an amount to six decimal places, a price to six
// decimals from $1 up and six significant figures below, each product of the
// two as shown, to the cent. Dependency-free, so a module node's type
// stripping loads (lib/morpho-at-block/position.ts) can import it, and
// lib/shared/holder-usd-receipt.ts re-exports it.

/** Rounded half away from zero: −$1,150.50 and +$1,150.50 both come to
 *  $1,151, so a signed face and its receipt agree. */
export const roundAway = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v)) || 0;
/** `v` scaled by `k` with the multiplication's float error taken out
 *  before rounding: 1.005 × 100 is 100.49999999999999 in binary, 100.5 to
 *  fifteen significant figures, so an exact half rounds as the decimal
 *  reads. Fifteen keeps every digit of a scaled amount up to 10^9 tokens
 *  at six decimals. */
// exponent-safe: the string goes straight back to a Number.
const scaled = (v: number, k: number): number => Number((v * k).toPrecision(15));
/** A dollar figure to the cent, half away from zero. */
export const centsOf = (v: number): number => roundAway(scaled(v, 100)) / 100;
/** An amount as the receipt shows it: six decimal places. */
export const shownAmount = (v: number): number => roundAway(scaled(v, 1e6)) / 1e6;
/** A price as the receipt shows it: to six decimals from $1 up (so a BTC
 *  price keeps the precision its product needs), six significant figures
 *  below $1. */
export const shownPrice = (v: number): number =>
  // exponent-safe: toPrecision's string goes straight back to a Number; priceText prints it.
  v === 0 ? 0 : Math.abs(v) >= 1 ? roundAway(scaled(v, 1e6)) / 1e6 : Number(v.toPrecision(6));
const cents = centsOf;
/** A dollar figure from an amount and a price as a receipt shows them: the
 *  product of the shown values, to the cent. Every figure whose receipt shows
 *  its rows is drawn from this. */
export const shownUsd = (amount: number, price: number): number => cents(shownAmount(amount) * shownPrice(price));
/** The same product in a numeraire other than the dollar (a Compound V2
 *  liquidation in the oracle's ETH years), to six decimal places. */
export const shownEth = (amount: number, price: number): number =>
  roundAway(scaled(shownAmount(amount) * shownPrice(price), 1e6)) / 1e6;
/** A price composed of two as shown (a collateral's price in the loan token
 *  × the loan token's dollar price), itself as shown: its row multiplies out
 *  from the two factors it prints. */
export const shownComposedPrice = (a: number, b: number): number => shownPrice(shownPrice(a) * shownPrice(b));

/** An amount as a receipt row prints it. */
export const amountText = (v: number) => shownAmount(v).toLocaleString("en-US", { maximumFractionDigits: 6 });
/** A price as a receipt row (or the asset popover beside it) prints it: up
 *  to six decimals, trailing zeros trimmed, at least the cents; below $1, six
 *  significant figures. */
export const priceText = (v: number) => {
  const p = shownPrice(v);
  if (p < 1) return "$" + p.toLocaleString("en-US", { maximumSignificantDigits: 6 });
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};
