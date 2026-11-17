// A CoW trade's surplus beyond its signed limit and the fees in its price, as
// the Aave V3 and V4 timelines serve them under `?swaps=1` (rails-server
// api/src/services/cow-surplus.ts, mig 481). Sources and the measure: rails-ops
// reference/cow-surplus-measure-2026-11-17.md. Two figures, never added
// together: a sell order's surplus is received beyond the limit signed, in the
// bought token; a buy order's is returned to the wallet from the unused limit,
// in the sold token (the Aave app's slippage allowance, which the adapter
// refunds). Imports nothing through `@/`, so scripts/test reads it directly.

/** The server's `cow` object: null until the settlement is read, or where
 *  settle() did not match its Trade logs. Amounts are base-unit integers. */
export interface CowSwapFigures {
  kind: "sell" | "buy";
  surplus: string;
  surplusToken: string;
  /** The fees in the trade's price, in bp of the amount at the settlement's uniform price. */
  feeBp: number;
  /** The byte offset of settle()'s selector in the transaction's input (0 for a direct or inline call). */
  settleOffset: number;
  call: "direct" | "wrapped" | "inline";
  /** The fees in the trade's price, the signed fee included, in base units of the surplus token. */
  feeGap: string;
  /** The signed fee (the Trade log's feeAmount) in the surplus token: part of feeGap. */
  signedFee: string;
  /** Aave V4 swaps: the trade's flash loan, the Aave V3 Pool's FlashLoan log of the sold token to the order's borrower
   *  (its contract or the adapter factory), read from the receipt; null where none matched or it was not read
   *  (`flashRead`). */
  flashLoan: { lender: string; borrower: string; asset: string; amount: string; premium: string } | null;
  flashRead: boolean;
  /** The order as signed; `amount` is the limit pro rata on the executed part, in the surplus token. */
  limit: { sell: string; buy: string; fee: string; amount: string };
  partiallyFillable: boolean;
  executedAmount: string;
  prices: {
    own: { sellIndex: number; buyIndex: number; sell: string; buy: string };
    uniform: { sellIndex: number; buyIndex: number; sell: string; buy: string };
  };
}

/** The surplus token as the card names it. */
export interface CowSurplusToken {
  address: string;
  symbol: string | null;
  decimals: number | null;
}

/** The figures with the surplus token named, as a swap card reads them. */
export interface CowSwapView extends CowSwapFigures {
  token: CowSurplusToken;
  /** cow_permit: the wallet's own order; cow_adapter: an order an Aave adapter's one-order contract owns. */
  route: "cow_permit" | "cow_adapter";
}

/** The surplus line's words: a sell order received more than its limit; a buy order through an Aave adapter got
 *  the unused limit back as a refund; the wallet's own buy order paid less than its limit. */
export function cowSurplusLabel(kind: CowSwapFigures["kind"], route: CowSwapView["route"]): string {
  if (kind === "sell") return "Received beyond the limit signed";
  return route === "cow_permit" ? "Paid less than the limit signed" : "Returned to the wallet from the unused limit";
}

export const COW_FEE_LABEL = "Fees in the trade's price";

/** A base-unit integer as a decimal string, exact. */
export function shiftRaw(raw: string, decimals: number): string {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  if (decimals === 0) return (neg ? "-" : "") + digits;
  const padded = digits.padStart(decimals + 1, "0");
  const int = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return (neg ? "-" : "") + int + (frac ? `.${frac}` : "");
}

/** The decimals that turn `raw` into `amount` (a side of a V4 swap's Trade carries both), or null. */
export function decimalsOf(raw: string, amount: string | null): number | null {
  if (amount == null || !/^\d+$/.test(raw) || /^0+$/.test(raw)) return null;
  for (let d = 0; d <= 36; d++)
    if (shiftRaw(raw, d) === amount.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")) return d;
  return null;
}

/** The fee in bp as the line prints it. */
export const feeBpText = (bp: number) =>
  `${bp.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} bp`;
