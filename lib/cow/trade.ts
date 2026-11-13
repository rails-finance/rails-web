// A CoW trade's figures and their receipts. Every amount is a field of
// GPv2Settlement's `Trade` log, scaled by the token's decimals from token_meta;
// the executed price is Rails' ratio of the two amounts. Rules: rails-ops
// standards/provenance-receipts-grammar.md §3–§5, decisions/0057 (exact values
// in the receipt).

import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { formatNumber, shiftDecimal } from "@/lib/utils/format";
import type { CowTrade } from "@/lib/cow/types";
import { executedRatio, soldLessFee } from "@/lib/cow/price";
import { COW_TERMS } from "@/lib/cow/terms";

export const COW_CHAIN_ID = 1 as const;
export const GPV2_SETTLEMENT = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";
const SETTLEMENT = {
  name: `${COW_TERMS.settlement} (${COW_TERMS.settlementContract})`,
  address: GPV2_SETTLEMENT,
};

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

/** The executed price, stated per unit of the dearer token: "1 WETH = 2,320.4 USDT".
 *  The sold side is the log's sellAmount less its feeAmount (`lib/cow/price.ts`). */
export function executedPrice(
  trade: CowTrade,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
): { text: string; value: string; base: CowTokenLabel; quote: CowTokenLabel } | null {
  const r = executedRatio(trade.sellAmount, trade.buyAmount, trade.feeAmount, sell.decimals, buy.decimals);
  if (r == null) return null;
  const [base, quote, ratio] = r.perSell >= 1 ? [sell, buy, r.perSell] : [buy, sell, r.perBuy];
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
    `Sold — the ${s} this wallet's order sent to ${COW_TERMS.settlement} in this trade, as the contract recorded it in its Trade log. By ${COW_TERMS.name}'s docs, fees are part of the trade's execution, so the amount is after fees.`,
  buy: (s: string) =>
    `Bought — the ${s} the settlement contract paid out for this wallet's order in this trade, as its Trade log recorded it.`,
  fee: (s: string) => `Fee — the trade's fee amount, paid in the sold token (${s}), as its Trade log recorded it.`,
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
  const fee = t.feeAmount !== "0";
  const soldSide = fee ? "amount sold less the fee" : "amount sold";
  const soldTerm = fee ? "(sold − fee)" : "sold";
  return {
    kind: "derived",
    pclass: "emitted",
    summary: `Executed price — what one ${tokenText(price.base)} cost in ${tokenText(price.quote)} in this trade: the ${perSell ? `amount bought divided by the ${soldSide}` : `${soldSide} divided by the amount bought`}, each scaled by its token's decimals.${fee ? ` ${COW_TERMS.name}'s docs state the execution price after deducting fees from the amount sold, and the Trade log's sold amount includes the fee.` : ""}`,
    formula: perSell ? `bought ÷ ${soldTerm}` : `${soldTerm} ÷ bought`,
    inputs: [
      {
        label: `sold (${tokenText(sell)}, ${sell.decimals ?? "?"} decimals)`,
        value: t.sellAmount,
        kind: "chain",
        pclass: "emitted",
      },
      ...(fee
        ? [
            {
              label: `fee (${tokenText(sell)}, ${sell.decimals ?? "?"} decimals)`,
              value: t.feeAmount,
              kind: "chain" as const,
              pclass: "emitted" as const,
            },
            {
              label: `sold − fee (${tokenText(sell)})`,
              value: soldLessFee(t.sellAmount, t.feeAmount) ?? "0",
              kind: "derived" as const,
              pclass: "emitted" as const,
            },
          ]
        : []),
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
      text: fee
        ? "To check: subtract the fee from the sold amount of this trade's Trade log, then divide the two amounts, each by its token's decimals."
        : "To check: divide the two amounts of this trade's Trade log, each by its token's decimals.",
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

/** The page head's block: the checkpoint every figure on the page is read at. */
export function checkpointProv(asOf: { block: number }): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `Block — every figure on this page is read at block ${asOf.block.toLocaleString("en-US")}, the newest block Rails had read when the page loaded.`,
    contract: SETTLEMENT,
    via: "Trade logs · read to this block",
    source: { block: asOf.block },
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
    summary: `${what} — counted over every Trade log of ${COW_TERMS.settlement} whose owner is this wallet, through block ${asOf.block.toLocaleString("en-US")}: ${value.toLocaleString("en-US")}.`,
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
