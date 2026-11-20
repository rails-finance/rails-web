// Receipts for the CoW figures block on the Aave V3 and V4 info pages and for
// the rows of its listings (lib/cow/aave-totals.ts). Rules: rails-ops
// standards/provenance-receipts-grammar.md §3–§5. A figure adds up many trades'
// surplus or fees, each priced at its block, so it is checked against its
// listing, where every row carries its own receipt. Surplus is cited to
// docs.cow.fi Definitions and CoW Explorer's "Order surplus"; fees to docs.cow.fi Fees.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { COW_TERMS } from "@/lib/cow/terms";
import { COW_CHAIN_ID } from "@/lib/cow/trade";
import { DEFINITIONS, EXPLORER_ORDER, FEES } from "@/lib/cow/surplus-provenance";
import { ORACLE_BY_MARKET } from "@/lib/aave-v3/asset-catalog";
import {
  COW_AAVE_FAMILY_NAME,
  COW_SHAPE_LABEL,
  bpText,
  countText,
  shiftRaw,
  swapKindText,
  type CowAaveFamily,
  type CowAaveSwap,
  type CowAaveTotals,
  type CowSurplusShape,
} from "@/lib/cow/aave-totals";

const SURPLUS_DOCS: ProvInput[] = [
  {
    label: "surplus",
    value: "docs.cow.fi Definitions",
    kind: "offchain",
    pclass: "offchain",
    definition: true,
    verify: { kind: "link", href: DEFINITIONS, text: `${COW_TERMS.name}'s docs: Definitions` },
  },
  {
    label: "Order surplus",
    value: "CoW Explorer",
    kind: "offchain",
    pclass: "offchain",
    definition: true,
    verify: { kind: "link", href: EXPLORER_ORDER, text: `${COW_TERMS.name}'s docs: CoW Explorer, by order` },
  },
];

const FEES_DOCS: ProvInput = {
  label: "fees in the surplus token",
  value: "docs.cow.fi Fees",
  kind: "offchain",
  pclass: "offchain",
  definition: true,
  verify: { kind: "link", href: FEES, text: `${COW_TERMS.name}'s docs: Fees` },
};

/** Whose prices, in words, for a family. */
function priceWords(family: CowAaveFamily): string {
  return family === "aave-v3"
    ? "the price the swap's Aave V3 market's oracle gave at the trade's block"
    : "the price Aave V4's oracle feeds gave at the trade's block";
}

/** The price rule, once: at the trade's block, else the newest earlier price within the window, with the age stated. */
export function priceRuleSentence(t: CowAaveTotals): string {
  const { pricedAtBlock, pricedEarlier } = t.counts;
  const window = `${countText(t.freshnessBlocks)} blocks (about two days)`;
  if (pricedEarlier === 0) return `Every priced trade takes ${priceWords(t.family)}.`;
  const age = t.priceAge;
  return `${countText(pricedAtBlock)} trades take ${priceWords(t.family)}; ${countText(pricedEarlier)} take the newest price before it, within ${window}: a median of ${countText(age.medianBlocks ?? 0)} blocks earlier, ${countText(age.maxBlocks)} at most.`;
}

const asOfSource = (t: CowAaveTotals) => (t.asOf.block != null ? { block: t.asOf.block } : undefined);

const tradesLeaf = (t: CowAaveTotals, n: number, label: string): ProvInput => ({
  label,
  value: countText(n),
  kind: "chain",
  pclass: "input",
  note: "Each trade's surplus and fees come from its settlement transaction's settle() call and its Trade log, read on chain.",
});

const priceLeaf = (t: CowAaveTotals): ProvInput => ({
  label: "price at the trade's block",
  value: priceRuleSentence(t),
  kind: "chain",
  pclass: "oracle",
  ...(t.family === "aave-v3" ? { contract: { name: "Aave V3 Core oracle", address: ORACLE_BY_MARKET.core } } : {}),
});

const unpricedLeaf = (t: CowAaveTotals): ProvInput[] =>
  t.counts.unpriced > 0
    ? [
        {
          label: "trades with no price, left out",
          value: countText(t.counts.unpriced),
          kind: "derived",
          step: true,
          note: `No Aave price for their token within the window: ${t.unpricedTokens
            .slice(0, 5)
            .map((u) => u.symbol ?? u.address)
            .join(
              ", ",
            )}${t.unpricedTokens.length > 5 ? ` and ${countText(t.unpricedTokens.length - 5)} more tokens` : ""}.`,
        },
      ]
    : [];

const flashSentence = (t: CowAaveTotals) =>
  t.counts.flashPremiumRead > 0 ? ` The flash-loan fee the swaps paid to the lending pool is in neither figure.` : "";

/** The surplus figure, or one of its three shapes. */
export function cowSurplusTotalProv(t: CowAaveTotals, shape?: CowSurplusShape, listingText?: string): Provenance {
  const fam = COW_AAVE_FAMILY_NAME[t.family];
  const n = shape ? t.surplus.byShape[shape].trades : t.counts.priced;
  const what = shape ? `${COW_SHAPE_LABEL[shape]} — ` : "The surplus beyond the limits signed — ";
  const scope = shape
    ? shape === "received"
      ? `the sell orders' surplus: what each received above the least its order would accept`
      : shape === "returned"
        ? `the Aave adapters' buy orders' surplus: the unused part of each order's limit, which the adapter sends back to the wallet in the same transaction`
        : `the wallets' own buy orders' surplus: what each paid below the most its order would pay`
    : `each trade's surplus beyond the limit its order signed`;
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `${what}${scope}, across the ${countText(n)} priced ${COW_TERMS.name} trades behind ${fam} position swaps on Ethereum, each in US dollars at ${priceWords(t.family)}, added up. ${COW_TERMS.name}'s docs call it surplus, "The price improvement on a user's limit price".${shape ? "" : flashSentence(t)}`,
    formula: "Σ surplus ÷ 10^decimals × price at the trade's block",
    inputs: [tradesLeaf(t, n, "priced trades"), priceLeaf(t), ...unpricedLeaf(t), ...SURPLUS_DOCS],
    via: "settle() input · the order as signed; Trade log · the executed amounts; oracle price at the trade's block",
    source: asOfSource(t),
    verify: {
      kind: "rollup",
      text: `To check: add up the Surplus column of ${listingText ?? "the listing behind this figure"}; each swap's surplus and price carry a receipt.`,
    },
  };
}

/** The fees figure. */
export function cowFeesTotalProv(t: CowAaveTotals): Provenance {
  const fam = COW_AAVE_FAMILY_NAME[t.family];
  const none =
    t.counts.noFee > 0
      ? ` ${countText(t.counts.noFee)} trades executed above the clearing price, so state no fee and are left out.`
      : "";
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `The fees in the swaps' prices — what each of ${countText(t.fees.trades)} priced ${COW_TERMS.name} trades behind ${fam} position swaps on Ethereum gave up against its settlement's clearing price, in US dollars at ${priceWords(t.family)}, added up. ${COW_TERMS.name} charges fees in the price, in the surplus token. The gap holds the network cost as well as protocol and partner fees; Rails does not split them.${none}${flashSentence(t)}`,
    formula: "Σ fee gap ÷ 10^decimals × price at the trade's block",
    inputs: [tradesLeaf(t, t.fees.trades, "priced trades with a fee"), priceLeaf(t), ...unpricedLeaf(t), FEES_DOCS],
    via: "settle() input · clearingPrices; Trade log · the executed amounts; oracle price at the trade's block",
    source: asOfSource(t),
    verify: {
      kind: "rollup",
      text: "To check: add up the Fees column of the listing behind this figure; each swap's fee carries a receipt.",
    },
  };
}

/** The median fee in bp. */
export function cowMedianFeeProv(t: CowAaveTotals): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `The median fee — the middle of the ${countText(t.fees.trades)} priced trades' fees, each in basis points (0.01%) of the trade's amount at its settlement's clearing price. Half the trades paid less, half more.`,
    formula: "median of (fee gap ÷ amount at the clearing price × 10,000)",
    inputs: [tradesLeaf(t, t.fees.trades, "priced trades with a fee"), FEES_DOCS],
    via: "settle() input · clearingPrices; Trade log · the executed amounts",
    source: asOfSource(t),
    verify: {
      kind: "rollup",
      text: "To check: sort the listing behind the fees figure by fee; each swap's fee in basis points carries a receipt.",
    },
  };
}

/** The count of priced trades, with the price rule and its ages. */
export function cowPricedProv(t: CowAaveTotals): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `The trades priced — the ${COW_TERMS.name} trades whose surplus token has an Aave price at the trade's block, or within ${countText(t.freshnessBlocks)} blocks before it. An aToken takes its reserve's price and ETH takes WETH's. ${priceRuleSentence(t)}`,
    inputs: [
      { label: "trades", value: countText(t.counts.trades), kind: "chain", pclass: "input" },
      priceLeaf(t),
      ...unpricedLeaf(t),
    ],
    via: "oracle price at the trade's block",
    source: asOfSource(t),
    verify: { kind: "rollup", text: "To check: the listing of the trades with no price names each one and its token." },
  };
}

// ── The listing's rows ───────────────────────────────────────────────────────

const tokenName = (s: CowAaveSwap) => s.trade?.token.symbol ?? s.trade?.token.address ?? "";

const txVerify = (s: CowAaveSwap) => ({
  kind: "etherscan" as const,
  href: explorerUrl(COW_CHAIN_ID, "tx", s.txHash),
  text: "The settlement transaction, its input and its Trade logs on Etherscan",
});

/** A row's surplus or fee in US dollars: the token amount times the price at the block. */
export function cowSwapUsdProv(family: CowAaveFamily, s: CowAaveSwap, figure: "surplus" | "fees"): Provenance | null {
  const t = s.trade;
  if (!t || !t.price || t.token.decimals == null) return null;
  const sym = tokenName(s);
  const raw = figure === "surplus" ? t.surplus : t.feeGap;
  const amount = shiftRaw(raw, t.token.decimals);
  const earlier = t.price.block !== s.block;
  const label = figure === "surplus" ? COW_SHAPE_LABEL[t.shape] : "Fees in the trade's price";
  return {
    kind: "derived",
    pclass: "oracle",
    summary: `${label}, in US dollars — ${amount} ${sym} from this ${swapKindText(s.kind).toLowerCase()}'s ${COW_TERMS.name} trade, times ${priceWords(family)}${
      earlier
        ? `. No price was written at that block, so it is the newest before it, at block ${t.price.block.toLocaleString("en-US")}, ${(s.block - t.price.block).toLocaleString("en-US")} blocks earlier`
        : ""
    }.${figure === "surplus" ? ` ${COW_TERMS.name}'s docs call it surplus, "The price improvement on a user's limit price".` : ""}`,
    formula: `${sym} amount × price`,
    inputs: [
      {
        label: `${figure === "surplus" ? "surplus" : "fee gap"}, in ${sym}`,
        value: amount,
        kind: "chain",
        pclass: "input",
      },
      {
        label: `price of ${sym}`,
        value: t.price.usd,
        kind: "chain",
        pclass: "oracle",
        note: `At block ${t.price.block.toLocaleString("en-US")}.`,
        ...(family === "aave-v3" && ORACLE_BY_MARKET[s.market]
          ? { contract: { name: `Aave V3 ${s.market} oracle`, address: ORACLE_BY_MARKET[s.market] } }
          : {}),
      },
      ...(figure === "surplus" ? SURPLUS_DOCS : [FEES_DOCS]),
    ],
    via: "settle() input · the order as signed; Trade log · the executed amounts; oracle price",
    source: { block: s.block, txHash: s.txHash },
    verify: txVerify(s),
  };
}

/** A row's fee in bp. */
export function cowSwapBpProv(s: CowAaveSwap): Provenance | null {
  const t = s.trade;
  if (!t) return null;
  return {
    kind: "derived",
    pclass: "input",
    summary: `Fees in the trade's price — what this trade gave up against its settlement's clearing price, in basis points (0.01%) of its amount at that price. The gap holds the network cost as well as protocol and partner fees; Rails does not split them.`,
    inputs: [{ label: `the gap, in ${tokenName(s)}`, value: t.feeGap, kind: "chain", pclass: "input" }, FEES_DOCS],
    via: "settle() input · clearingPrices; Trade log · the executed amounts",
    source: { block: s.block, txHash: s.txHash },
    verify: txVerify(s),
  };
}
