// Aave V4 HUB-SURFACE provenance vocabulary — the receipts for /aave-v4/hubs,
// the cross-hub comparison band + credit-line table.
// ----------------------------------------------------------------------------
// This surface differs from the market-surface pilots (compound-markets,
// aave-market) in TWO ways that decide the whole grammar here:
//
//   1. SOURCE. The pilots read a live chain overlay (/api/chain/…) — their
//      figures are `state`/`oracle` reads a skeptic can re-run against a node.
//      This surface reads /api/aave-v4/hubs, which serves a table the backend
//      refreshes on a ~15-minute cycle from the HUB contracts themselves
//      (getSpokeConfig / getSpokeAddedAssets / getSpokeTotalOwed per (hub,
//      asset, spoke) — rails-server workers/aave-v4-chain-refresher/src/
//      services/hub-credit.ts). A figure is therefore the hub's state at the
//      snapshot block, held by our backend with no third-party proof beside it:
//      class `indexed`, never `state`. USD values price a token amount through
//      DefiLlama (/api/prices), an off-chain market feed — so a value
//      multiplied through a price is `offchain`, the weakest leg (the same
//      posture as lib/aave-v4/position-provenance.ts's usdProv).
//
//      Two figures do NOT come from that table and say so in their receipts:
//      the borrow rate is the newest hub `UpdateAsset.drawnRate` (ray) for the
//      (hub, asset) at any block, so it carries no snapshot block; and the
//      liquidity fee is `hub.getAssetConfig(assetId).liquidityFee` in basis
//      points, read on chain 2026-06-14 and held as a constant in the api
//      (LIQUIDITY_FEE_BPS in aave-v4-hubs.ts), 0 where a reserve cannot be
//      borrowed.
//
//   2. AGGREGATION. A hub figure is an aggregate over N spokes, each a separate
//      contract — so a one-value-to-one-read receipt cannot describe it. The LT
//      cell is `0.75–0.83`: the lowest and highest per-spoke threshold in the
//      hub. Each of those is the EFFECTIVE threshold the spoke applies to the
//      asset — getUserAccountData.avgCollateralFactor on a position holding it
//      alone, harvested by the chain-refresher into
//      aave_v4_reserves.liquidation_threshold. It is a different quantity from
//      the reserve's static getDynamicReserveConfig.collateralFactor, which an
//      e-mode or correlated venue lifts above (Core WETH: 0.83 config, 0.92
//      effective — scripts/verify-aave-v4-chain.mjs, "Deliberately NOT
//      checked"), so the copy says what the spoke applies, never the config.
//      It renders as a COMPUTED receipt whose leaves are the per-spoke figures
//      (hubLtRangeProv). The summary BRANCHES: when the spread collapsed to one
//      figure (ltDisplay < 0.0001), it states uniform-across-N-spokes and never
//      says "range"; when the spokes disagree it states the span and the spoke
//      count. See the receipt-shape decision.
//
// One caveat runs through the whole file: the /api/aave-v4/hubs payload names a
// spoke only by its API key + display name — no contract address of its own —
// and this surface adds no chain call to resolve one. Every per-spoke leaf
// NAMES its spoke (the disambiguation the range receipt needs) and, where the
// spoke's deployed address is on record, links it: hub-view.ts looks up
// SPOKE_ADDRESS_BY_KEY (lib/aave-v4/spoke-meta.ts) — the spokes' stable
// on-chain contract addresses, not indexer output — and carries it through as
// `address` on HubSpokeLeaf / rateSourceSpoke. Treasury has no deployed address
// on record, so its leaves render without a contract link, same as before.

import type { Provenance, ProvInput } from "@/components/shared/provenance";

// Every via line leads with the lane — the custody segment the embedded
// receipt drops (provenance.tsx) — and carries the origin in the segments
// after it, so nothing but custody is ever lost.
const LANE = "GET /api/aave-v4/hubs";

/** The coordinates a hub-surface receipt needs: the snapshot block the index
 *  read at (the shared-strip anchor every receipt rides), and the hub's display
 *  label for the prose. */
export interface HubProvCoords {
  blockNumber?: number;
  /** The hub's display label — "Core" / "Plus" / "Prime" / "Global Dollar". */
  hubLabel?: string;
}

/** One spoke's contribution to an aggregated figure — its slug (the stable key),
 *  its display name, the per-spoke value that entered the reduction, and its
 *  deployed contract address when one is on record (SPOKE_ADDRESS_BY_KEY;
 *  absent for a spoke with no address on record, e.g. Treasury). */
export interface HubSpokeLeaf {
  slug: string;
  name: string;
  lt: number | null;
  address?: string;
}

const hub = (coords: HubProvCoords): string => coords.hubLabel ?? "the hub";

const atBlock = (coords: HubProvCoords): string =>
  coords.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

// ── sizes (USD, off-chain priced) ────────────────────────────────────────────

/** One asset's supplied / borrowed VALUE in a single hub — the hub's own token
 *  figure for the asset, added up over the spokes that list it, valued through
 *  an off-chain market price. Off-chain price is the weakest leg, so the
 *  product is `offchain` (matches position-provenance's usdProv). */
export const hubAssetValueProv = (side: "supplied" | "borrowed", symbol: string, coords: HubProvCoords): Provenance => {
  const getter = side === "supplied" ? "getSpokeAddedAssets" : "getSpokeTotalOwed";
  const meaning =
    side === "supplied"
      ? "what the hub's spokes have supplied it"
      : "what they have drawn from it, carrying the interest accrued since";
  return {
    kind: "derived",
    pclass: "offchain",
    source: { block: coords.blockNumber },
    summary: `${symbol} ${side} in ${hub(coords)} — ${meaning}${atBlock(
      coords,
    )}, one figure per spoke added together and valued at an off-chain market price. The hub states the token amount; the price comes from a market feed, so the dollar figure is as firm as that feed.`,
    via: `${LANE} · hub ${getter}(assetId, spoke) per spoke, summed · × market price`,
    formula: "amount × price",
    inputs: [
      { label: "amount", kind: "chain", pclass: "indexed", note: `the hub's ${getter} for each spoke listing it` },
      { label: "price", kind: "offchain", pclass: "offchain", note: "an off-chain market feed (DefiLlama)" },
    ],
  };
};

/** A hub's total supplied / borrowed VALUE — Σ over the hub's listed assets of
 *  each asset's USD value. Off-chain priced, so `offchain`. */
export const hubTotalValueProv = (side: "supplied" | "borrowed", coords: HubProvCoords): Provenance => ({
  kind: "derived",
  pclass: "offchain",
  source: { block: coords.blockNumber },
  summary: `${hub(coords)} ${side} — every asset the hub lists, each one's token figure at its market price, added together${atBlock(
    coords,
  )}. The hub states the token amounts; the prices come from an off-chain market feed, so the total is as firm as that feed.`,
  via: `${LANE} · hub ${side} token figure per asset · × market price · summed`,
  formula: "Σ (amount × price)",
  inputs: [
    { label: "amount", kind: "chain", pclass: "indexed", note: `the hub's ${side} token figure per asset` },
    { label: "price", kind: "offchain", pclass: "offchain", note: "an off-chain market feed (DefiLlama)" },
  ],
});

// ── the LT range (computed over the spokes that list the asset) ───────────────

/** An asset's liquidation-threshold range in one hub — the lowest and highest
 *  per-spoke threshold among the spokes that list it. Each of those is the
 *  collateral factor the spoke reports for a position holding this asset alone
 *  (see the file header). Renders as a computed receipt whose leaves are the
 *  per-spoke figures. The summary BRANCHES on `uniform`: the collapsed-uniform
 *  case (every spoke agrees) states uniform-across-N and never says "range";
 *  the true-range case states the span and the spoke count. Each leaf NAMES its
 *  spoke and, where SPOKE_ADDRESS_BY_KEY knows its deployed address, links it —
 *  a stable on-chain constant threaded in by hub-view.ts, not indexer output. */
export const hubLtRangeProv = (
  symbol: string,
  spokeLeaves: HubSpokeLeaf[],
  uniform: boolean,
  coords: HubProvCoords,
): Provenance => {
  const withLt = spokeLeaves.filter((s) => s.lt != null);
  const n = withLt.length;
  const leaves: ProvInput[] = withLt.map((s) => ({
    label: s.name,
    value: s.lt!.toFixed(2),
    kind: "chain",
    pclass: "indexed",
    contract: s.address ? { name: "spoke contract", address: s.address } : undefined,
    note: "the collateral factor this spoke reports for the asset",
  }));

  if (uniform) {
    const value = n > 0 ? withLt[0].lt!.toFixed(2) : "—";
    return {
      kind: "chain",
      pclass: "indexed",
      source: { block: coords.blockNumber },
      summary: `${symbol} liquidation threshold — ${value} on ${
        n === 1 ? "the one spoke" : `all ${n} spokes`
      } that list this asset in ${hub(
        coords,
      )}. It is the collateral factor a spoke reports for a position holding this asset and nothing else, read on each of them. The per-spoke figures are listed below, each with the spoke's contract where one is on record, so the agreement is checkable.`,
      via: `${LANE} · spoke getUserAccountData · avgCollateralFactor, per spoke`,
      inputs: leaves,
    };
  }

  const lo = Math.min(...withLt.map((s) => s.lt!)).toFixed(2);
  const hi = Math.max(...withLt.map((s) => s.lt!)).toFixed(2);
  return {
    kind: "chain",
    pclass: "indexed",
    source: { block: coords.blockNumber },
    summary: `${symbol} liquidation threshold — ${lo} at the lowest and ${hi} at the highest across the ${n} spokes that list this asset in ${hub(
      coords,
    )}. Each figure is the collateral factor that spoke reports for a position holding this asset and nothing else. A position is liquidated at the threshold of the spoke it sits in, and the per-spoke figures are listed below, each with the spoke's contract where one is on record.`,
    via: `${LANE} · spoke getUserAccountData · avgCollateralFactor · lowest … highest`,
    formula: "min … max",
    inputs: leaves,
  };
};

/** A hub's supply-weighted liquidation threshold — each asset entering at the
 *  middle of its threshold span, weighted by supplied USD. The USD weights are
 *  off-chain priced, so the weighted mean is `offchain`. Saying "the middle of
 *  the span" keeps this second derivation from reading as the span the table
 *  already shows. */
export const hubWeightedLtProv = (coords: HubProvCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "offchain",
  source: { block: coords.blockNumber },
  summary: `Supply-weighted liquidation threshold for ${hub(
    coords,
  )} — one threshold for the hub's whole supply book: each asset enters at the middle of its spoke-to-spoke span, weighted by what the hub holds of it in dollars${atBlock(
    coords,
  )}. The dollar weights come from an off-chain market feed, so the mean is as firm as that feed.`,
  via: `${LANE} · Σ(supplied $ × mid-span threshold) ÷ Σ supplied $`,
  formula: "Σ (supply × LT midpoint) ÷ Σ supply",
  inputs: [
    {
      label: "supply weight",
      kind: "derived",
      pclass: "offchain",
      note: "each asset's supplied dollars, at an off-chain market price",
    },
    {
      label: "LT midpoint",
      kind: "chain",
      pclass: "indexed",
      note: "halfway between the lowest and highest spoke threshold",
    },
  ],
});

// ── rates (indexed) ───────────────────────────────────────────────────────────

/** An asset's variable borrow rate in one hub — the hub's `drawnRate`, which
 *  the hub writes for the (hub, asset) pair, so every spoke drawing the asset
 *  from it borrows at the same rate. The backend keys the rate that way and
 *  joins the same value onto every spoke line; `sourceSpoke` is only the line
 *  the web read it off first, and rides as a leaf when its address is known
 *  (SPOKE_ADDRESS_BY_KEY) so that spoke stays linkable. The figure is the
 *  newest rate the hub wrote, which can predate the credit-line snapshot
 *  block — so the summary states no block. */
export const hubBorrowRateProv = (
  symbol: string,
  sourceSpoke: { slug: string; name: string; address?: string } | null,
  coords: HubProvCoords,
): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  source: { block: coords.blockNumber },
  summary: `${symbol} borrow rate in ${hub(
    coords,
  )} — the variable rate the hub set for this asset when it last accrued interest on it. The hub sets one rate per asset, so every spoke that draws this asset from it borrows at this rate. The hub writes the rate as a ray, and dividing by 10^27 gives the rate a year, where 10^27 is 100%.`,
  contract: { name: `Aave V4 ${hub(coords)} hub` },
  via: `${LANE} · hub UpdateAsset log · drawnRate · ÷10^27`,
  inputs: sourceSpoke
    ? [
        {
          label: "source spoke",
          value: sourceSpoke.name,
          kind: "chain",
          pclass: "indexed",
          contract: sourceSpoke.address ? { name: "spoke contract", address: sourceSpoke.address } : undefined,
          note: "a spoke drawing this asset from the hub at this rate",
        },
      ]
    : undefined,
});

/** An asset's supplier yield in one hub — the standard pool identity. Two of
 *  its operands (the liquidity fee, and the drawn ÷ supplied share) have no
 *  cell of their own on this table, so this is a receipt rather than an
 *  exemption: both ride as leaves. The fee is a governance constant the backend
 *  holds per (hub, asset), so the summary names it as the hub's cut and does
 *  not claim a snapshot read. */
export const hubSupplyApyProv = (symbol: string, coords: HubProvCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  source: { block: coords.blockNumber },
  summary: `${symbol} supply APY in ${hub(
    coords,
  )} — what a supplier earns on this asset: the borrow rate, times the share of the supply that is drawn, less the hub's cut of the interest${atBlock(
    coords,
  )}. The drawn share and the cut have no column on this table, so both are listed below. The hub's cut is a governance figure in hundredths of a percent, and 1,500 of them is 15% of the interest.`,
  via: `${LANE} · drawnRate × (drawn ÷ supplied) × (1 − liquidity fee)`,
  formula: "borrow rate × utilisation × (1 − liquidity fee)",
  inputs: [
    { label: "borrow rate", kind: "chain", pclass: "indexed", note: "the hub's drawnRate for this asset" },
    {
      label: "utilisation",
      kind: "chain-derived",
      pclass: "indexed",
      note: "drawn ÷ supplied across the hub's spokes for this asset",
    },
    {
      label: "liquidity fee",
      kind: "chain",
      pclass: "indexed",
      note: "the hub's getAssetConfig cut of borrow interest, in hundredths of a percent",
    },
  ],
});

/** An asset's draw utilisation in one hub — drawn against the governance credit
 *  line (draw cap). The cap has no cell of its own on this table, so this is a
 *  receipt with the cap as a leaf rather than an exemption. A spoke line
 *  governance left uncapped contributes nothing to the cap sum (hub-view's
 *  `capValue` drops the sentinel), which the summary says. */
export const hubDrawUtilProv = (symbol: string, coords: HubProvCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  source: { block: coords.blockNumber },
  summary: `${symbol} utilisation in ${hub(
    coords,
  )} — how much of the credit line governance opened for this asset the hub's spokes have drawn${atBlock(
    coords,
  )}. The line is each spoke's draw cap added together, and a spoke left uncapped adds nothing to it, so the figure reads against the capped spokes.`,
  via: `${LANE} · hub getSpokeTotalOwed ÷ Σ getSpokeConfig drawCap`,
  formula: "drawn ÷ draw cap",
  inputs: [
    { label: "drawn", kind: "chain", pclass: "indexed", note: "the hub's getSpokeTotalOwed, summed over its spokes" },
    { label: "draw cap", kind: "chain", pclass: "indexed", note: "each spoke's drawCap in whole tokens, summed" },
  ],
});
