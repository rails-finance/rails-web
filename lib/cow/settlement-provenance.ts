// The settlement panel's figures and their receipts (ui-jobs 711): each
// trade's price on the card's pair, from its Trade log; the settlement's
// clearing price, from settle()'s calldata; each trade's distance from it.
// Rules: rails-ops standards/provenance-receipts-grammar.md §3–§5.

import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { soldLessFee } from "@/lib/cow/price";
import { COW_TERMS } from "@/lib/cow/terms";
import { COW_CHAIN_ID, GPV2_SETTLEMENT, shortAddress, tokenText, type CowTokenLabel } from "@/lib/cow/trade";
import { gapBp, type CowSettlement, type CowSettlementTrade } from "@/lib/cow/settlement";

const SETTLEMENT = {
  name: `${COW_TERMS.settlement} (${COW_TERMS.settlementContract})`,
  address: GPV2_SETTLEMENT,
};

/** A price, sold per bought or bought per sold, to seven significant digits. */
export const priceNumber = (v: number) => v.toLocaleString("en-US", { maximumSignificantDigits: 7 });

/** A raw ratio sold-per-bought as display units both ways round, or null without decimals. */
function scaled(
  soldPerBoughtRaw: number,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
): { perBuy: number; perSell: number } | null {
  if (sell.decimals == null || buy.decimals == null || !(soldPerBoughtRaw > 0)) return null;
  const perBuy = soldPerBoughtRaw * 10 ** (buy.decimals - sell.decimals);
  return { perBuy, perSell: 1 / perBuy };
}

/** How the panel states the pair's prices: one dearer token per unit, as the card's Executed price does. */
export interface PairPricing {
  base: CowTokenLabel;
  quote: CowTokenLabel;
  /** sold-per-bought display ratio → the printed figure. */
  pick: (s: { perBuy: number; perSell: number }) => number;
}

export function pairPricing(self: CowSettlementTrade, sell: CowTokenLabel, buy: CowTokenLabel): PairPricing | null {
  const net = soldLessFee(self.sellAmount, self.feeAmount);
  if (net == null) return null;
  const s = scaled(Number(net) / Number(self.buyAmount), sell, buy);
  if (!s) return null;
  return s.perSell >= 1
    ? { base: sell, quote: buy, pick: (x) => x.perSell }
    : { base: buy, quote: sell, pick: (x) => x.perBuy };
}

/** A trade's price from its Trade log, as the pair states it. */
export function tradePrice(
  t: CowSettlementTrade,
  p: PairPricing,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
): number | null {
  const net = soldLessFee(t.sellAmount, t.feeAmount);
  if (net == null || t.buyAmount === "0") return null;
  const s = scaled(Number(net) / Number(t.buyAmount), sell, buy);
  return s ? p.pick(s) : null;
}

/** The clearing price from the trade's uniform entries, as the pair states it. */
export function clearingPrice(
  t: CowSettlementTrade,
  p: PairPricing,
  sell: CowTokenLabel,
  buy: CowTokenLabel,
): number | null {
  if (!t.settled) return null;
  const s = scaled(Number(t.settled.uniform.buyPrice) / Number(t.settled.uniform.sellPrice), sell, buy);
  return s ? p.pick(s) : null;
}

const coords = (s: CowSettlement) => ({ block: s.blockNumber, txHash: s.txHash });
const logsLink = (s: CowSettlement) => ({
  kind: "etherscan" as const,
  href: explorerUrl(COW_CHAIN_ID, "tx-logs", s.txHash),
  text: "The settlement's Trade logs on Etherscan",
});
const txLink = (s: CowSettlement) => ({
  kind: "etherscan" as const,
  href: explorerUrl(COW_CHAIN_ID, "tx", s.txHash),
  text: "The settlement transaction and its input on Etherscan",
});

/** One trade's price on the pair. */
export function pairTradePriceProv(
  s: CowSettlement,
  t: CowSettlementTrade,
  p: PairPricing,
  sell: CowTokenLabel,
): Provenance {
  const fee = t.feeAmount !== "0";
  const perSell = p.base.address === sell.address;
  const soldTerm = fee ? "(sold − fee)" : "sold";
  return {
    kind: "derived",
    pclass: "emitted",
    summary: `Price — what one ${tokenText(p.base)} cost in ${tokenText(p.quote)} in the trade of ${shortAddress(t.owner)}, from its Trade log, each amount scaled by its token's decimals.`,
    formula: perSell ? `bought ÷ ${soldTerm}` : `${soldTerm} ÷ bought`,
    inputs: [
      { label: "sold", value: t.sellAmount, kind: "chain", pclass: "emitted" },
      ...(fee ? [{ label: "fee", value: t.feeAmount, kind: "chain" as const, pclass: "emitted" as const }] : []),
      { label: "bought", value: t.buyAmount, kind: "chain", pclass: "emitted" },
    ],
    contract: SETTLEMENT,
    via: `Trade log · log index ${t.logIndex}`,
    source: coords(s),
    verify: logsLink(s),
  };
}

/** The settlement's clearing price for the pair: each token's first entry in settle()'s clearingPrices. */
export function clearingPriceProv(s: CowSettlement, t: CowSettlementTrade, p: PairPricing): Provenance {
  const u = t.settled!.uniform;
  return {
    kind: "derived",
    pclass: "emitted",
    summary: `Clearing price — the price the settlement transaction's settle() call set for ${tokenText(p.base)} in ${tokenText(p.quote)}: each token's first entry in its clearingPrices, one sold-token price over the bought token's, scaled by decimals.`,
    formula: "clearingPrices[buy] ÷ clearingPrices[sell] = sold per unit bought",
    inputs: [
      { label: `clearingPrices[${u.sellIndex}] (sold token)`, value: u.sellPrice, kind: "chain", pclass: "emitted" },
      { label: `clearingPrices[${u.buyIndex}] (bought token)`, value: u.buyPrice, kind: "chain", pclass: "emitted" },
    ],
    contract: SETTLEMENT,
    via: `settle() input${s.settle.call === "wrapped" ? ", inside the solver contract's call" : ""} · tokens and clearingPrices`,
    source: coords(s),
    verify: txLink(s),
  };
}

/** A trade's distance from the clearing price, in basis points. */
export function gapProv(s: CowSettlement, t: CowSettlementTrade): Provenance {
  const g = gapBp(t);
  return {
    kind: "derived",
    pclass: "emitted",
    summary: `From the clearing price — how far the trade of ${shortAddress(t.owner)} sits from the settlement's clearing price, in basis points (0.01%). Above 0, the owner paid more of the sold token per unit bought than at the clearing price.${t.settled?.ownEntries ? " The trade's settle() indices point past the tokens' first entries." : " The trade was settled on the tokens' first entries."}`,
    formula: "(trade price ÷ clearing price − 1) × 10,000, both as sold per unit bought",
    inputs: [
      { label: "sold − fee", value: soldLessFee(t.sellAmount, t.feeAmount) ?? "0", kind: "chain", pclass: "emitted" },
      { label: "bought", value: t.buyAmount, kind: "chain", pclass: "emitted" },
      { label: "clearing price, sold token", value: t.settled?.uniform.sellPrice, kind: "chain", pclass: "emitted" },
      { label: "clearing price, bought token", value: t.settled?.uniform.buyPrice, kind: "chain", pclass: "emitted" },
      ...(g != null ? [{ label: "gap (bp)", value: g.toFixed(4), kind: "derived" as const }] : []),
    ],
    contract: SETTLEMENT,
    source: coords(s),
    verify: txLink(s),
  };
}

/** The other pairs in the batch: a count over the settlement's Trade logs. */
export function otherPairsProv(s: CowSettlement, n: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary: `Other pairs — the sold-and-bought token pairs of the settlement's other Trade logs, each direction counted once: ${n.toLocaleString("en-US")}.`,
    contract: SETTLEMENT,
    via: `Trade logs · ${s.trades.length.toLocaleString("en-US")} in the transaction`,
    source: coords(s),
    verify: logsLink(s),
  };
}

/** The trades on the pair: a count over the settlement's Trade logs. */
export function pairCountProv(s: CowSettlement, n: number, sell: CowTokenLabel, buy: CowTokenLabel): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary: `Trades — the settlement's Trade logs that sold ${tokenText(sell)} for ${tokenText(buy)}: ${n.toLocaleString("en-US")}.`,
    contract: SETTLEMENT,
    via: "Trade logs · sellToken and buyToken",
    source: coords(s),
    verify: logsLink(s),
  };
}
