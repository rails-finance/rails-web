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
//
// A trade's surplus and the fees in its price (ui-jobs 712, the CoW trade
// card's lines and the panel's fee column) are `tradeSurplus`, a copy of
// rails-server api/src/services/cow-surplus.ts held to the server's figures by
// scripts/test/cow-trade-surplus.test.mjs. Definitions: rails-ops
// reference/cow-surplus-measure-2026-11-17.md.

import type { CowTokenScale } from "./types";
import type { CowTokenLabel } from "./trade";
import type { CowSwapView } from "./surplus";
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
  /** settle()'s executedAmount: on a partially fillable order the part filled here. */
  executedAmount: string;
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
  settle: { status: CowSettleStatus; call?: "direct" | "wrapped" | "inline"; offset?: number; to?: string | null };
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

/** A trade's surplus beyond its signed limit and the fees in its price, in the surplus token's base units (the
 *  bought token on a sell order, the sold token on a buy order). */
export interface CowTradeSurplus {
  kind: "sell" | "buy";
  surplus: bigint;
  surplusToken: string;
  /** The signed limit, pro rata on the executed part, in the surplus token: the amount `surplus` is measured from. */
  limitAmount: bigint;
  /** The fees in the trade's price, the signed fee included. */
  feeGap: bigint;
  /** The signed fee (the Trade log's feeAmount) in the surplus token: part of feeGap. */
  signedFee: bigint;
  /** feeGap in basis points of `atUniform`, to 3 decimals. */
  feeBp: number;
  /** The trade at the settlement's uniform price, in the surplus token. */
  atUniform: bigint;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const ceilDiv = (a: bigint, b: bigint) => (a + b - ONE) / b;
const bpOf = (part: bigint, of: bigint) => (of === ZERO ? 0 : Number((part * BigInt(10_000_000)) / of) / 1000);

/** rails-server's `tradeSurplus`, to the wei:
 *    surplus, sell order: bought − ⌈limitBuy × (sold − fee) ÷ limitSell⌉
 *    surplus, buy order:  ⌊limitSell × bought ÷ limitBuy⌋ + ⌊limitFee × bought ÷ limitBuy⌋ − sold
 *    fees, sell order:    ⌊(sold − fee) × uSell ÷ uBuy⌋ − bought + ⌊fee × uSell ÷ uBuy⌋
 *    fees, buy order:     (sold − fee) − ⌈bought × uBuy ÷ uSell⌉ + fee
 *  with u the tokens' first clearingPrices entries. Null without a decoded order or with a zero price or limit. */
export function tradeSurplus(t: CowSettlementTrade): CowTradeSurplus | null {
  if (!t.settled) return null;
  const { order, uniform } = t.settled;
  const sell = BigInt(t.sellAmount);
  const buy = BigInt(t.buyAmount);
  const fee = BigInt(t.feeAmount);
  const net = sell - fee;
  const limSell = BigInt(order.sellAmount);
  const limBuy = BigInt(order.buyAmount);
  const limFee = BigInt(order.feeAmount);
  const us = BigInt(uniform.sellPrice);
  const ub = BigInt(uniform.buyPrice);
  if (us === ZERO || ub === ZERO) return null;
  if (order.kind === "sell") {
    if (limSell === ZERO) return null;
    const limitAmount = ceilDiv(limBuy * net, limSell);
    const atUniform = (net * us) / ub;
    const signedFee = (fee * us) / ub;
    const feeGap = atUniform - buy + signedFee;
    return {
      kind: "sell",
      surplus: buy - limitAmount,
      surplusToken: t.buyToken.toLowerCase(),
      limitAmount,
      feeGap,
      signedFee,
      feeBp: bpOf(feeGap, atUniform),
      atUniform,
    };
  }
  if (limBuy === ZERO) return null;
  const limitAmount = (limSell * buy) / limBuy + (limFee * buy) / limBuy;
  const atUniform = ceilDiv(buy * ub, us);
  const feeGap = net - atUniform + fee;
  return {
    kind: "buy",
    surplus: limitAmount - sell,
    surplusToken: t.sellToken.toLowerCase(),
    limitAmount,
    feeGap,
    signedFee: fee,
    feeBp: bpOf(feeGap, atUniform),
    atUniform,
  };
}

/** The fees the card states, or null where it states none.
 *  - From block COW_OWN_PRICE_FEES_FROM: the gap to the uniform price.
 *  - Before it, on the tokens' first entries: the signed fee alone, on the same base.
 *  - Before it, on entries of the trade's own: none. Those entries then also carried market makers' orders at a price
 *    of their own, and the gap cannot tell a fee from that price (0x9da9…, block 16,807,176, log 31: 41.5 bp from the
 *    clearing price with 4.87 received beyond its limit).
 *  - A negative gap (the trade priced better than the clearing price): none. A fee below zero is no fee, and the line
 *    would print a minus sign or "-0.00 bp". */
export function cardFee(
  s: CowTradeSurplus,
  block: number,
  ownEntries: boolean,
): { feeGap: bigint; feeBp: number; signedOnly: boolean } | null {
  if (block >= COW_OWN_PRICE_FEES_FROM)
    return s.feeGap < ZERO ? null : { feeGap: s.feeGap, feeBp: s.feeBp, signedOnly: false };
  if (ownEntries) return null;
  return { feeGap: s.signedFee, feeBp: bpOf(s.signedFee, s.atUniform), signedOnly: true };
}

/** The fee sentence under a panel row applies: fees in the price on the trade's own entries, from the block CoW
 *  charges fees that way, of at least 0.1 bp. Below that a gap sits at the noise level of the entries' integer
 *  rounding, which the 711 sample saw on trades at the clearing price, and is not read as a fee. */
export function feeExplains(t: CowSettlementTrade, block: number): boolean {
  const s = tradeSurplus(t);
  return s != null && !!t.settled?.ownEntries && block >= COW_OWN_PRICE_FEES_FROM && s.feeBp >= 0.1;
}

/** The card's view of a trade: the swap lines' figures, and `fee` false where the card states no fee (cardFee). */
export interface CowCardView {
  view: CowSwapView;
  fee: boolean;
}

/** A trade of a decoded settlement as the CoW swap lines read it (lib/cow/surplus.ts), its tokens named by the
 *  card's labels. Null where settle() is not decoded or the trade carries no order. */
export function cowTradeView(
  s: CowSettlement,
  t: CowSettlementTrade,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
): CowCardView | null {
  if (s.settle.status !== "decoded" || !t.settled) return null;
  const f = tradeSurplus(t);
  if (!f) return null;
  const { order, own, uniform, ownEntries } = t.settled;
  const fee = cardFee(f, s.blockNumber, ownEntries);
  const token = f.kind === "sell" ? buy : sell;
  const view: CowSwapView = {
    kind: f.kind,
    surplus: f.surplus.toString(),
    surplusToken: f.surplusToken,
    feeBp: fee?.feeBp ?? 0,
    settleOffset: s.settle.offset ?? 0,
    call: s.settle.call ?? "direct",
    feeGap: (fee?.feeGap ?? ZERO).toString(),
    signedFee: f.signedFee.toString(),
    flashLoan: null,
    flashRead: false,
    limit: { sell: order.sellAmount, buy: order.buyAmount, fee: order.feeAmount, amount: f.limitAmount.toString() },
    partiallyFillable: order.partiallyFillable,
    executedAmount: order.executedAmount,
    prices: {
      own: { sellIndex: own.sellIndex, buyIndex: own.buyIndex, sell: own.sellPrice, buy: own.buyPrice },
      uniform: {
        sellIndex: uniform.sellIndex,
        buyIndex: uniform.buyIndex,
        sell: uniform.sellPrice,
        buy: uniform.buyPrice,
      },
    },
    token: { address: token.address, symbol: token.symbol, decimals: token.decimals },
    route: "cow",
    ...(fee?.signedOnly ? { signedFeeOnly: true as const } : {}),
  };
  return { view, fee: fee != null };
}
