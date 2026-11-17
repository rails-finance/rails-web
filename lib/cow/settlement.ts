// A CoW settlement's trades on one directed pair, set against the
// settlement's clearing price (rails-server GET /api/cow/ethereum/settlement/
// :block/:tx, which decodes settle()'s calldata and matches it to the Trade
// logs).
//
// CoW's docs (concepts/benefits/mev-protection): trades of one pair in the
// same direction in one batch clear at the same price. On chain, settle()
// lists each token's uniform clearing price first; since 2024 each trade also
// gets entries of its own, which carry the order's fees (governance/fees:
// "All protocol fees are charged in the surplus token"). A Trade log's price
// is its own entries' price, so the log prices of one pair can differ while
// the clearing price is one. Measured on 183 same-pair groups in 24 windows of
// Ethereum history (ui-jobs 711).
//
// Prices here are raw ratios, sold (less the fee) per unit bought; the
// display scales them by decimals.

import type { CowTokenScale } from "./types";
import { soldLessFee } from "./price";

/** The first block where the sample found every trade of a settlement priced
 *  on entries of its own (17 Nov 2026 measure, ui-jobs 711). From here a
 *  trade priced worse than the clearing price on its own entries is read as
 *  carrying its fees; before it, own entries were also market makers' orders
 *  filled at their limit price, which is no fee. */
export const COW_OWN_PRICE_FEES_FROM = 19_815_319;

export interface CowSettledOrder {
  kind: "sell" | "buy";
  partiallyFillable: boolean;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  receiver: string;
}

export interface CowSettledEntries {
  sellIndex: number;
  buyIndex: number;
  sellPrice: string;
  buyPrice: string;
}

/** One Trade log of the settlement, with what the settle() call gave it. */
export interface CowSettlementTrade {
  logIndex: number;
  owner: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  orderUid: string;
  settled: {
    order: CowSettledOrder;
    own: CowSettledEntries;
    uniform: CowSettledEntries;
    ownEntries: boolean;
  } | null;
}

export type CowSettleStatus = "decoded" | "unread" | "no-selector" | "no-match";

/** The route's answer, as far as the panel reads it. */
export interface CowSettlement {
  blockNumber: number;
  txHash: string;
  trades: CowSettlementTrade[];
  /** `offset`: the byte in the transaction's input where the settle() call starts (0 on a direct call). */
  settle: { status: CowSettleStatus; call?: "direct" | "wrapped"; offset?: number; to?: string | null };
  tokens: Record<string, CowTokenScale>;
}

export const isCowSettlement = (d: unknown): d is CowSettlement =>
  d != null && typeof d === "object" && Array.isArray((d as CowSettlement).trades) && "settle" in d;

/** The card's own trade in the settlement: the same order and amounts. */
export function findTrade(
  s: CowSettlement,
  t: { orderUid: string; sellAmount: string; buyAmount: string },
): CowSettlementTrade | null {
  const uid = t.orderUid.toLowerCase();
  return (
    s.trades.find(
      (x) => x.orderUid.toLowerCase() === uid && x.sellAmount === t.sellAmount && x.buyAmount === t.buyAmount,
    ) ?? null
  );
}

const pairKey = (t: { sellToken: string; buyToken: string }) =>
  `${t.sellToken.toLowerCase()}>${t.buyToken.toLowerCase()}`;

/** A trade's log price over the clearing price, less one, in basis points:
 *  above 0 the owner paid more of the sold token per unit bought than at the
 *  clearing price. Null with no decoded entries or an amount of 0. */
export function gapBp(t: CowSettlementTrade): number | null {
  if (!t.settled) return null;
  const net = soldLessFee(t.sellAmount, t.feeAmount);
  const buy = BigInt(t.buyAmount);
  const uSell = BigInt(t.settled.uniform.sellPrice);
  const uBuy = BigInt(t.settled.uniform.buyPrice);
  if (net == null || buy === BigInt(0) || uSell === BigInt(0) || uBuy === BigInt(0)) return null;
  // trade = net / buy; clearing = uBuy / uSell (sold per unit bought); trade / clearing = net·uSell / (buy·uBuy)
  const num = BigInt(net) * uSell;
  const den = buy * uBuy;
  const scale = BigInt(1_000_000_000);
  return (Number(((num - den) * scale) / den) / 1e9) * 1e4;
}

/** The gap as the panel prints it, from the owner's side whichever way round
 *  the price is stated: "1.5 bp worse", "0.4 bp better", "<0.1 bp" below 0.1 bp. */
export function gapText(bp: number): string {
  if (Math.abs(bp) < 0.1) return "<0.1 bp";
  const r = Math.abs(Math.round(bp * 10) / 10);
  return `${r.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bp ${bp > 0 ? "worse" : "better"}`;
}

/** Two log prices equal within the integer rounding of computeTradeExecution. */
function samePrice(a: CowSettlementTrade, b: CowSettlementTrade): boolean {
  const na = soldLessFee(a.sellAmount, a.feeAmount);
  const nb = soldLessFee(b.sellAmount, b.feeAmount);
  if (na == null || nb == null) return false;
  const ba = BigInt(a.buyAmount);
  const bb = BigInt(b.buyAmount);
  if (ba === BigInt(0) || bb === BigInt(0)) return false;
  const d = BigInt(na) * bb - BigInt(nb) * ba;
  const diff = Number(((d < BigInt(0) ? -d : d) * BigInt(1_000_000_000_000)) / (BigInt(nb) * ba)) / 1e12;
  const bound = 2 * (1 / Number(ba) + 1 / Number(BigInt(na)) + 1 / Number(bb) + 1 / Number(BigInt(nb)));
  return diff <= bound;
}

/** The token a trade's fees are charged in: the token received on a sell
 *  order, the token paid on a buy order (governance/fees, the surplus token). */
export function feeToken(t: CowSettlementTrade): string | null {
  if (!t.settled) return null;
  return t.settled.order.kind === "sell" ? t.buyToken.toLowerCase() : t.sellToken.toLowerCase();
}

/** The fee sentence applies: priced worse than the clearing price by at least
 *  what the panel prints, on the trade's own entries, from the block CoW
 *  charges fees that way. */
export function feeExplains(t: CowSettlementTrade, block: number): boolean {
  const g = gapBp(t);
  return g != null && g >= 0.1 && !!t.settled?.ownEntries && block >= COW_OWN_PRICE_FEES_FROM;
}

export interface CowPairView {
  /** The card's own trade in the settlement. */
  self: CowSettlementTrade;
  /** Every trade on the card's directed pair, the card's own first, then by log. */
  pair: CowSettlementTrade[];
  /** The other directed pairs in the settlement. */
  otherPairs: number;
  /** Every price on the pair equal within rounding (two trades or more). */
  onePrice: boolean;
  /** The settle() call decoded and matched: clearing price and gaps can be drawn. */
  decoded: boolean;
}

/** The panel's view of a settlement from the card's trade, or null where the
 *  trade is not in it. */
export function pairView(
  s: CowSettlement,
  t: { orderUid: string; sellAmount: string; buyAmount: string },
): CowPairView | null {
  const self = findTrade(s, t);
  if (!self) return null;
  const key = pairKey(self);
  const pair = [
    self,
    ...s.trades.filter((x) => x !== self && pairKey(x) === key).sort((a, b) => a.logIndex - b.logIndex),
  ];
  const otherPairs = new Set(s.trades.map(pairKey).filter((k) => k !== key)).size;
  const decoded = s.settle.status === "decoded" && pair.every((x) => x.settled != null);
  const onePrice = pair.length >= 2 && pair.every((x) => samePrice(self, x));
  return { self, pair, otherPairs, onePrice, decoded };
}
