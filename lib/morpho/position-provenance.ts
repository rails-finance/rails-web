// Morpho position-detail provenance — the LIVE chain-lane vocabulary.
// ----------------------------------------------------------------------------
// Builders for the values /api/chain/morpho/position reads at head: the
// singleton's own slots (position / market / idToMarketParams — kind "chain"),
// the market's own oracle price and its feeds' latest rounds (kind "chain",
// class oracle), and the derived risk figures
// (capacity, LTV, health factor — kind "chain-derived": products/ratios of
// chain quantities, admissible under the on-chain-only gate).
//
// One deliberate contrast with the Compound vocabulary: Comet ships the
// CONTRACT's own isLiquidatable verdict; Morpho Blue exposes no public health
// getter (_isHealthy is internal). Every health figure here is therefore a
// REPLICA of the contract's arithmetic — the same toAssetsUp / mulDivDown /
// wMulDown steps, BigInt-exact — verified against live borrowers by
// scripts/verify-morpho-chain.mjs. The summaries say so.

import type { Provenance } from "@/components/shared/provenance";
import { MORPHO_ADDRESSES } from "./asset-catalog";
import { publishedText } from "./oracle-age";
import { formatUnitsExact } from "@/lib/utils/format";
import type { MorphoOracleFeed } from "@/lib/api/fetch-morpho-position";

const MORPHO = { name: "Morpho Blue", address: MORPHO_ADDRESSES.MORPHO_BLUE };
const LANE = "GET /api/chain/morpho/position";

export interface MorphoChainCoords {
  marketId?: string;
  marketLabel?: string;
}

const marketNote = (c?: MorphoChainCoords): string => (c?.marketLabel ? ` in the ${c.marketLabel} market` : "");

const marketInputs = (c?: MorphoChainCoords) =>
  c?.marketId ? [{ label: "market", value: c.marketId, kind: "chain" as const, note: "Morpho market id" }] : [];

/** The market's liquidation LTV — a governance-enabled params constant. */
export const lltvProv = (c?: MorphoChainCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The market's liquidation loan-to-value${marketNote(c)} — the lltv field of the immutable market params tuple (its keccak IS the market id), governance-enabled at market creation. Debt above lltv × collateral value is liquidatable; there is no separate borrow threshold.`,
  contract: MORPHO,
  via: `${LANE} · Morpho.idToMarketParams(id).lltv @ head`,
  inputs: marketInputs(c),
});

/** A capacity / LTV aggregate — products and ratios of same-head chain reads. */
export const capacityProv = (label: string, formula: string, c?: MorphoChainCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${label}${marketNote(c)} — arithmetic over the position's own slots, the market's own oracle price and the lltv, all read at the same head. In loan-token units (the oracle's numeraire); no USD anywhere.`,
  contract: MORPHO,
  via: `${LANE} · ${formula}`,
  formula,
  inputs: marketInputs(c),
});

/** The live read's endpoint on each chain — Base reads every position a
 *  wallet holds through one sweep, Ethereum one position at a time. */
export const morphoLiveLane = (chainId: number): string =>
  chainId === 8453 ? "GET /api/chain/morpho-base/wallet" : LANE;

const ORACLE = (address: string) => ({ name: "Market oracle", address });

/** The market's own oracle price at the read block. */
export const oraclePriceProv = (
  p: {
    collSym: string;
    loanSym: string;
    oracle: string;
    block: number;
    lane: string;
    /** Where the price is stated: a position's card (default), whose figures
     *  rest on it, or the market's own page. */
    surface?: "card" | "market";
  },
  c?: MorphoChainCoords,
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  summary: `The market's oracle price${marketNote(c)} — 1 whole ${p.collSym} in ${p.loanSym}, from price() on the market's own oracle (fixed in its immutable params) at block ${p.block.toLocaleString("en-US")}, scaled by 1e(36 + loan decimals − collateral decimals). ${
    p.surface === "market"
      ? "It is the price Morpho's own health test applies to every position in this market."
      : "It is the price Morpho's own health test uses, and every value, capacity and health figure on this card rests on it."
  }`,
  contract: ORACLE(p.oracle),
  via: `${p.lane} · IOracle.price() @ block ${p.block}`,
  inputs: marketInputs(c),
  source: { block: p.block },
});

const feedName = (f: MorphoOracleFeed) => (f.description ? `"${f.description}"` : "a feed with no description");

const feedAnswer = (f: MorphoOracleFeed): string =>
  f.decimals != null ? formatUnitsExact(f.answer, f.decimals) : `${f.answer} (raw)`;

/** When the oracle's price was published — the oldest updatedAt among the
 *  feeds the oracle names, each read at the same block as the price. */
export const oracleFeedAgeProv = (
  p: {
    feeds: MorphoOracleFeed[];
    publishedAt: number;
    readTimestamp: number;
    oracle: string;
    block: number;
    lane: string;
  },
  c?: MorphoChainCoords,
): Provenance => {
  const one = p.feeds.length === 1;
  return {
    kind: "chain",
    pclass: "oracle",
    summary: `When the oracle's price was published${marketNote(c)} — ${
      one
        ? `the updatedAt of the one feed the oracle names, ${feedName(p.feeds[0])}`
        : `the oldest updatedAt among the ${p.feeds.length} feeds the oracle names (${p.feeds.map(feedName).join(", ")})`
    }, read with latestRoundData() at block ${p.block.toLocaleString("en-US")}, the block the price was read at. The age is that block's time (${publishedText(p.readTimestamp, p.readTimestamp)}) minus updatedAt. A MorphoChainlinkOracleV2 does not check its feeds' age: price() returns their last published answers however old they are.`,
    contract: ORACLE(p.oracle),
    via: `${p.lane} · <feed>.latestRoundData().updatedAt @ block ${p.block}`,
    formula: one ? "block time − updatedAt" : "block time − min(updatedAt)",
    inputs: [
      ...marketInputs(c),
      ...p.feeds.map((f) => ({
        label: f.slot,
        value: f.address,
        kind: "chain" as const,
        pclass: "oracle" as const,
        contract: { name: f.description ?? "Price feed", address: f.address },
        note: `round ${f.roundId} · answer ${feedAnswer(f)} · updatedAt ${f.updatedAt} (${publishedText(f.updatedAt, p.readTimestamp)})`,
      })),
    ],
    source: { block: p.block },
  };
};
