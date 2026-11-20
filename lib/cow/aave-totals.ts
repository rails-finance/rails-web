// The CoW figures across Aave's position swaps on Ethereum, as rails-server's
// /api/cow/ethereum/aave/:family/{totals,swaps} serve them (api/src/services/
// cow-aave-totals.ts states the scope, the price rule and the figures). Two
// figures, never added together: the surplus beyond the limits signed and the
// fees in the swaps' prices, each in USD at the trade's block. Imports nothing
// through `@/`, so scripts/test reads it directly.

export type CowAaveFamily = "aave-v3" | "aave-v4";
export const COW_AAVE_FAMILIES: readonly CowAaveFamily[] = ["aave-v3", "aave-v4"];

/** What the swap card calls a trade's surplus (lib/cow/surplus.ts `cowSurplusLabel`). */
export type CowSurplusShape = "received" | "returned" | "paidLess";

export const COW_SHAPE_LABEL: Record<CowSurplusShape, string> = {
  received: "Received beyond the limit signed",
  returned: "Returned to the wallet from the unused limit",
  paidLess: "Paid less than the limit signed",
};

export const COW_SHAPES: readonly CowSurplusShape[] = ["received", "returned", "paidLess"];

export type CowUnpricedReason = "no-price" | "no-decimals";

export interface CowAaveTotals {
  family: CowAaveFamily;
  chainId: 1;
  asOf: { block: number | null; timestamp: number | null; cursor: number | null };
  counts: {
    swaps: number;
    trades: number;
    notDecoded: number;
    priced: number;
    unpriced: number;
    pricedAtBlock: number;
    pricedEarlier: number;
    noFee: number;
    flashPremiumRead: number;
  };
  surplus: { usd: number; byShape: Record<CowSurplusShape, { usd: number; trades: number }> };
  fees: { usd: number; trades: number; medianBp: number | null };
  priceAge: { maxBlocks: number; medianBlocks: number | null; p90Blocks: number | null; over7200: number };
  unpricedTokens: { address: string; symbol: string | null; trades: number; reason: CowUnpricedReason }[];
  freshnessBlocks: number;
}

export interface CowAaveSwap {
  swapKey: string;
  txHash: string;
  logIndex: number | null;
  block: number;
  timestamp: number;
  wallet: string;
  /** The V3 market ("core", "prime", "etherfi") or the V4 spoke's slug. */
  market: string;
  kind: string;
  route: string;
  given: string;
  received: string;
  /** The legs' amounts, base units of `given` and `received`; where the server sends none, the spine draws the
   *  legs without amounts. */
  givenAmount?: string;
  receivedAmount?: string;
  trade: {
    orderKind: "sell" | "buy";
    shape: CowSurplusShape;
    token: { address: string; symbol: string | null; decimals: number | null };
    surplus: string;
    feeGap: string;
    feeBp: number;
    price: { usd: string; block: number; source: string; asset: string } | null;
    unpriced: CowUnpricedReason | null;
    surplusUsd: number | null;
    feeUsd: number | null;
    flashPremium: string | null;
  } | null;
}

export type CowAaveFigure = "surplus" | "fees" | "no-fee" | "unpriced" | "not-decoded";
export const COW_AAVE_FIGURES: readonly CowAaveFigure[] = ["surplus", "fees", "no-fee", "unpriced", "not-decoded"];
export type CowAaveSort = "recent" | "usd";

export interface CowAaveSwapsPage {
  family: CowAaveFamily;
  chainId: 1;
  asOf: CowAaveTotals["asOf"];
  figure: CowAaveFigure;
  sort: CowAaveSort;
  matched: number;
  offset: number;
  limit: number;
  swaps: CowAaveSwap[];
  tokens: Record<string, { symbol: string | null; decimals: number | null }>;
}

export const COW_AAVE_FAMILY_NAME: Record<CowAaveFamily, string> = { "aave-v3": "Aave V3", "aave-v4": "Aave V4" };

/** The listing behind a figure. */
export function cowSwapsHref(family: CowAaveFamily, figure: CowAaveFigure, sort?: CowAaveSort): string {
  const p = new URLSearchParams({ figure });
  if (sort && sort !== "recent") p.set("sort", sort);
  return `/ethereum/${family}/cow-swaps?${p.toString()}`;
}

/** The query a listing URL carries; anything unknown falls back to the surplus, newest first. */
export function parseCowSwapsQuery(sp: { get(k: string): string | null }): {
  figure: CowAaveFigure;
  sort: CowAaveSort;
} {
  const f = sp.get("figure") as CowAaveFigure | null;
  const s = sp.get("sort");
  return {
    figure: f && COW_AAVE_FIGURES.includes(f) ? f : "surplus",
    sort: s === "usd" ? "usd" : "recent",
  };
}

/** The swap's kind as its card names it. */
export const COW_SWAP_KIND: Record<string, string> = {
  collateral_swap: "Collateral swap",
  debt_swap: "Debt swap",
  repay_with_collateral: "Repay with collateral",
  withdraw_and_swap: "Withdraw and swap",
  supply_from_swap: "Supply from swap",
  leverage: "Leverage",
};

export const swapKindText = (kind: string) => COW_SWAP_KIND[kind] ?? kind.replace(/_/g, " ");

/** The swap's position page: the V3 account, or the V4 spoke position. */
export function cowSwapPositionHref(family: CowAaveFamily, s: Pick<CowAaveSwap, "wallet" | "market">): string {
  return family === "aave-v3"
    ? `/ethereum/aave-v3/${s.wallet}`
    : `/ethereum/aave-v4/spoke/${encodeURIComponent(s.market)}/${s.wallet}`;
}

/** The swap's event page on its position's timeline. */
export function cowSwapEventHref(family: CowAaveFamily, s: Pick<CowAaveSwap, "wallet" | "market" | "swapKey">): string {
  return `${cowSwapPositionHref(family, s)}/event/${encodeURIComponent(s.swapKey)}`;
}

/** A dollar figure: whole dollars from $10,000, cents below. */
export function usdText(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 10_000 ? 0 : 2;
  return `${v < 0 ? "−" : ""}$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const countText = (n: number) => n.toLocaleString("en-US");

/** Basis points to two places. */
export const bpText = (bp: number) =>
  `${bp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bp`;

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

/** A token amount for a row: up to six significant places below 1, two above. */
export function tokenAmountText(raw: string, decimals: number | null): string {
  if (decimals == null) return `${raw} (raw)`;
  const v = Number(shiftRaw(raw, decimals));
  const abs = Math.abs(v);
  const opts: Intl.NumberFormatOptions = abs >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 };
  return v.toLocaleString("en-US", opts);
}
