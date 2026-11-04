// A CoW trade's figures and their receipts. Every amount is a field of
// GPv2Settlement's `Trade` log, scaled by the token's decimals from token_meta;
// the executed price is Rails' ratio of the two amounts. Rules: rails-ops
// standards/provenance-receipts-grammar.md §3–§5, decisions/0057 (exact values
// in the receipt).

import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { formatNumber, shiftDecimal } from "@/lib/utils/format";
import type { CowTrade } from "@/lib/cow/types";

export const COW_CHAIN_ID = 1 as const;
export const GPV2_SETTLEMENT = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";
const SETTLEMENT = { name: "GPv2Settlement (CoW)", address: GPV2_SETTLEMENT };

/** A token as the page names it: the symbol token_meta holds, else none. */
export interface CowTokenLabel {
  address: string;
  symbol: string | null;
  decimals: number | null;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The token's name on the page: its symbol, or its short address. */
export const tokenText = (t: CowTokenLabel) => t.symbol ?? shortAddress(t.address);

/** A raw amount as a decimal string, or null with no decimals read. */
export function exactAmount(raw: string, decimals: number | null): string | null {
  return decimals == null ? null : shiftDecimal(raw, decimals);
}

/** The amount as a number for display, or null with no decimals read. */
export function amountNumber(raw: string, decimals: number | null): number | null {
  const e = exactAmount(raw, decimals);
  return e == null ? null : Number(e);
}

/** The amount in the site's number format, or the raw integer with a word
 *  when the token's decimals are not read. */
export function amountText(raw: string, t: CowTokenLabel): string {
  const n = amountNumber(raw, t.decimals);
  return n == null ? `${raw} (raw)` : formatNumber(n);
}

/** The executed price, stated per unit of the dearer token: "1 WETH = 2,320.4 USDT". */
export function executedPrice(
  trade: CowTrade,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
): { text: string; value: string; base: CowTokenLabel; quote: CowTokenLabel } | null {
  const s = amountNumber(trade.sellAmount, sell.decimals);
  const b = amountNumber(trade.buyAmount, buy.decimals);
  if (s == null || b == null || s === 0 || b === 0) return null;
  const perSell = b / s;
  const [base, quote, ratio] = perSell >= 1 ? [sell, buy, perSell] : [buy, sell, s / b];
  // exponent-safe: the receipt key, never drawn
  const value = ratio.toPrecision(8);
  return { text: `1 ${tokenText(base)} = ${formatNumber(ratio)} ${tokenText(quote)}`, value, base, quote };
}

const coords = (t: CowTrade) => ({ block: t.blockNumber, txHash: t.txHash });
const logsLink = (t: CowTrade) => ({
  kind: "etherscan" as const,
  href: explorerUrl(COW_CHAIN_ID, "tx-logs", t.txHash),
  text: "The settlement's Trade logs on Etherscan",
});
const scaling = (raw: string, tok: CowTokenLabel) =>
  tok.decimals == null
    ? undefined
    : { raw, from: "log" as const, places: tok.decimals, why: `${tokenText(tok)} has ${tok.decimals} decimals` };

const FIELD = { sell: "sellAmount", buy: "buyAmount", fee: "feeAmount" } as const;
const WORDS = {
  sell: (s: string) =>
    `Sold — the ${s} this wallet's order sent to the CoW settlement contract in this trade, as the contract recorded it in its Trade log.`,
  buy: (s: string) =>
    `Bought — the ${s} the settlement contract paid out for this wallet's order in this trade, as its Trade log recorded it.`,
  fee: (s: string) =>
    `Fee — the ${s} the settlement contract kept from the sold amount for this trade, as its Trade log recorded it.`,
};

/** A Trade log field's receipt. */
export function tradeAmountProv(t: CowTrade, side: keyof typeof FIELD, tok: CowTokenLabel): Provenance {
  const raw = side === "sell" ? t.sellAmount : side === "buy" ? t.buyAmount : t.feeAmount;
  return {
    kind: "chain",
    pclass: "emitted",
    summary: WORDS[side](tokenText(tok)),
    contract: SETTLEMENT,
    via: `Trade log · ${FIELD[side]}: ${raw}${tok.decimals != null ? ` · ÷10^${tok.decimals}` : ""}`,
    source: coords(t),
    scaling: scaling(raw, tok),
    verify: logsLink(t),
  };
}

/** The executed price's receipt: Rails' ratio of the two amounts. */
export function executedPriceProv(
  t: CowTrade,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
  price: NonNullable<ReturnType<typeof executedPrice>>,
): Provenance {
  const perSell = price.base.address === sell.address;
  return {
    kind: "derived",
    pclass: "emitted",
    summary: `Executed price — what one ${tokenText(price.base)} cost in ${tokenText(price.quote)} in this trade: the ${perSell ? "amount bought divided by the amount sold" : "amount sold divided by the amount bought"}, each scaled by its token's decimals.`,
    formula: perSell ? "bought ÷ sold" : "sold ÷ bought",
    inputs: [
      {
        label: `sold (${tokenText(sell)}, ${sell.decimals ?? "?"} decimals)`,
        value: t.sellAmount,
        kind: "chain",
        pclass: "emitted",
      },
      {
        label: `bought (${tokenText(buy)}, ${buy.decimals ?? "?"} decimals)`,
        value: t.buyAmount,
        kind: "chain",
        pclass: "emitted",
      },
    ],
    contract: SETTLEMENT,
    source: coords(t),
    verify: {
      kind: "recompute",
      text: "To check: divide the two amounts of this trade's Trade log, each by its token's decimals.",
    },
  };
}

/** The settlement's block. */
export function settlementBlockProv(t: CowTrade): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: "Block — the block holding the settlement transaction that carried this trade.",
    contract: SETTLEMENT,
    source: coords(t),
    verify: logsLink(t),
  };
}

/** The settlement's other trades, in words. */
export function settlementWords(t: CowTrade): string {
  const others = t.settlementTrades - 1;
  return others <= 0
    ? "Settled alone"
    : `Settled with ${others.toLocaleString("en-US")} other ${others === 1 ? "trade" : "trades"}`;
}

/** A count over the wallet's `Trade` logs at the checkpoint block: its trades,
 *  or the tokens it sold or bought. The account card (C1) and the wallet
 *  view's CoW row (W7) draw it. */
export function walletCountProv(asOf: { block: number }, what: string, value: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `${what} — counted over every Trade log of CoW's settlement contract whose owner is this wallet, through block ${asOf.block.toLocaleString("en-US")}: ${value.toLocaleString("en-US")}.`,
    contract: SETTLEMENT,
    via: "Trade logs · owner = this wallet",
    source: { block: asOf.block },
  };
}

/** The wallet's first or last trade: the block and its time. */
export function walletTradeAtProv(which: "First" | "Last", block: number): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `${which} trade — the ${which === "First" ? "earliest" : "latest"} block holding a Trade log whose owner is this wallet, and that block's time.`,
    contract: SETTLEMENT,
    via: "Trade log · block",
    source: { block },
  };
}
