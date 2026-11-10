// Morpho Blue MARKET-SURFACE provenance vocabulary — the receipts for
// /morpho/markets, one head block's reading of the Blue singleton's markets.
// ----------------------------------------------------------------------------
// The market-level counterpart of lib/morpho/{event,position}-provenance (which
// trace a WALLET's position and events). Nothing here concerns an account: every
// figure is either an immutable market PARAMETER (the lltv) or a slot read on the
// Morpho Blue singleton at one head block, or an arithmetic over such reads.
//
// Distance classes, graded as the ladder does:
//   • state   — a field of market(id) at the block (totalSupply/BorrowAssets), or
//     the lltv the singleton returns via idToMarketParams. Third-party verifiable:
//     re-run the eth_call at the block against any node.
//   • derived — a ratio (utilisation = borrow ÷ supply) or a Σ over such reads (a
//     loan-token group total), chain-derived and no further than its weakest leg.
// There is NO oracle class here, on purpose: Morpho states no USD anywhere, and
// sizes and utilisation need no price — so this whole surface never asks one.
//
// TWO Morpho-specific truths every builder must respect:
//   1. NO ACCRUAL IN VIEW. Blue accrues interest only when a market is TOUCHED,
//      so market() totals are the balance each market last SETTLED (its
//      lastUpdate), not projected forward. A roster-wide accrue turned a dead
//      market's 1.04B into 2.48B here once (see lib/sources/chain/morpho-markets
//      §"WHY THIS LANE DOES NOT ACCRUE"). These summaries therefore say the read
//      they trace — stored state — and never imply freshness the figure lacks.
//   2. THE lltv IS IMMUTABLE. It is fixed at creation and can never change, because
//      the market id IS keccak256(abi.encode(params)); its receipt cites that
//      self-verification rather than a live slot the loader never reads.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.
//
// The Morpho Blue singleton is the `contract` on every state receipt; the live
// borrow rate is the exception — it comes from the market's OWN IRM, so its
// receipt carries that IRM's address, threaded from the market row.

import type { Provenance } from "@/components/shared/provenance";
import { morphoBlueContract } from "@/lib/morpho/asset-catalog";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

const LANE = "live Morpho Blue reads (/morpho/markets)";

/** The lane one market's page names on the receipts it borrows from the
 *  position vocabulary (the oracle price and its feeds' age). */
export const MORPHO_MARKETS_LANE = LANE;

/** The coordinates a market-surface receipt needs: the head block it was read at,
 *  the market it belongs to, the loan token it measures in, and — for the rate —
 *  the market's own IRM address. Group-level builders use only the block + loan
 *  symbol; the lltv needs neither the block nor the market to be citable. */
export interface MorphoMarketCoords {
  /** The head block the state was read at — every receipt's `source` block. */
  blockNumber?: number;
  /** 0x market id (keccak of the params) — a mapping key in the singleton. */
  marketId?: string;
  /** The market's loan-token symbol — the unit every size here speaks in. */
  loanSymbol?: string;
  /** The market's collateral symbol, where one exists (null on an idle market). */
  collateralSymbol?: string | null;
  /** The market's own interest-rate model — the contract the borrow rate reads
   *  from. Null where the market names no IRM. */
  irm?: string | null;
  /** The loan token's own address — the contract the supply figure comes from. */
  loanToken?: string | null;
  /** market(id)'s fields are rails-server's replay of the chain's Sieve at the
   *  block (equal to the eth_call there), not a read of the singleton. */
  fromLogs?: boolean;
  /** The chain the replay's Sieve follows; Base where unset. */
  chainId?: ChainId;
}

/** Where a market(id) field was read: at the head, or replayed from Sieve at the block. */
const stateAt = (coords: MorphoMarketCoords): string =>
  coords.fromLogs
    ? `@ block, replayed from the ${coords.chainId === MAINNET_CHAIN_ID ? "Ethereum" : "Base"} Sieve`
    : "@ head";
/** Where a chain read beside them was made: the replay pins every read to its block. */
const readAt = (coords: MorphoMarketCoords): string => (coords.fromLogs ? "@ block" : "@ head");

/** The chain's singleton: Ethereum and Base share one address, Arbitrum's is its own. */
const blueContract = (coords: MorphoMarketCoords): Provenance["contract"] => morphoBlueContract(coords.chainId);

const irmContract = (coords: MorphoMarketCoords): Provenance["contract"] => ({
  name: coords.loanSymbol ? `${coords.loanSymbol}-market IRM` : "Adaptive IRM",
  address: coords.irm ?? undefined,
});

const atBlock = (coords: MorphoMarketCoords): string =>
  coords.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

const recompute = (call: string, coords: MorphoMarketCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    coords.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${coords.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

// ── the one number: lltv ─────────────────────────────────────────────────────

/** The market's loan-to-value — its ENTIRE risk surface in one immutable number.
 *  Not read from a live slot: it is enumerated from the CreateMarket log the
 *  roster was censused from, and self-verifies (id == keccak(params)). */
export const morphoLltvProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: {
    kind: "recompute",
    text: "The market id is keccak256(abi.encode(params)); recompute the hash from these params — or call idToMarketParams(id) on the singleton — to confirm this lltv defines the market.",
  },
  summary: `Loan-to-value — the market's ONE risk number${atBlock(coords)}: the borrow limit and the liquidation line at once, with the liquidation incentive derived from it rather than set. Fixed at creation and immutable, because the market id IS keccak256(abi.encode(params)) — enumerated from the CreateMarket log the roster was censused from, and re-checkable via idToMarketParams(id) at any block.`,
  contract: blueContract(coords),
  via: `${LANE} · market params (id == keccak(params)) · idToMarketParams(id)`,
});

// ── sizes: stored, never projected ───────────────────────────────────────────

/** One market's supplied or borrowed total — a field of market(id), scaled by the
 *  loan token's decimals. STORED state at the market's last settlement, never
 *  accrued forward (the Morpho caveat). */
export const morphoMarketSizeProv = (side: "supplied" | "borrowed", coords: MorphoMarketCoords): Provenance => {
  const field = side === "supplied" ? "totalSupplyAssets" : "totalBorrowAssets";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute("Morpho.market(id)", coords),
    summary: `${coords.loanSymbol ?? "Loan-token"} ${side} — the market's \`${field}\` from \`market(id)\`${atBlock(coords)}, scaled by the loan token's decimals. STORED state, not projected: Blue accrues interest only when a market is touched, so this is the balance the contract last settled at its \`lastUpdate\`, read straight — never smoothed forward to now.`,
    contract: blueContract(coords),
    via: `${LANE} · Morpho.market(id).${field} ${stateAt(coords)}`,
  };
};

/** The loan token's OWN total supply — one ERC20 read, and the only figure on
 *  this surface that comes from outside the singleton.
 *
 *  It is here to make one comparison possible: Blue adds accrued interest to a
 *  market's `totalSupplyAssets` without any token moving, so a market's stored
 *  book can exceed the amount of the asset that exists. Stating that needs no
 *  judgment about how a market got there — it is this number against the group
 *  total beside it, both read at the same block. */
export const morphoLoanTokenSupplyProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("ERC20.totalSupply()", coords),
  summary: `${coords.loanSymbol ?? "The loan token"}'s own total supply — \`totalSupply()\` on the token contract${atBlock(coords)}, scaled by its decimals. Not a Morpho figure at all: it is how much of the asset exists, shown so the group's stored book can be compared against it. Blue credits accrued interest to \`totalSupplyAssets\` with no transfer behind it, so a book standing above this line is bookkeeping the asset never backed.`,
  contract: {
    name: coords.loanSymbol ? `${coords.loanSymbol} token` : "Loan token",
    address: coords.loanToken ?? undefined,
  },
  via: `${LANE} · ERC20.totalSupply() ${readAt(coords)}`,
});

/** A loan-token group's total supplied/borrowed — Σ over that token's markets of
 *  each market's stored size. Legitimate only within one token (same unit); groups
 *  are never summed across each other. */
export const morphoGroupTotalProv = (
  side: "supplied" | "borrowed",
  coords: MorphoMarketCoords,
  /** The roster's default view: the count of markets a vault lends into, which the total is over. */
  lentOnly?: number,
): Provenance => {
  const field = side === "supplied" ? "totalSupplyAssets" : "totalBorrowAssets";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${coords.loanSymbol ?? "Loan-token"} ${side}, group total — Σ over ${lentOnly != null ? `the ${lentOnly} ${coords.loanSymbol ?? "loan-token"} markets a vault on Rails's roster lends into (a market in the vault's withdraw queue, read from the vault)` : "this loan token's markets"} of each market's stored \`${field}\`${atBlock(coords)}. A sum is legitimate ONLY inside one token: every market here measures in ${coords.loanSymbol ?? "the same loan token"}, so the total is a real quantity — groups are never summed across each other, whose units don't compare.`,
    contract: blueContract(coords),
    via: `${LANE} · Σ Morpho.market(id).${field} over the ${coords.loanSymbol ?? "loan-token"} markets ${stateAt(coords)}`,
    formula: `Σ ${field}`,
    inputs: [
      {
        label: field,
        kind: "chain",
        pclass: "state",
        note: `Morpho.market(id).${field} per market ${stateAt(coords)}`,
      },
    ],
  };
};

/** What can still be borrowed from one market — its stored supply less its
 *  stored borrow, both fields of market(id), in the loan token. Stored state
 *  like the two it is taken from: interest accrued since `lastUpdate` is on
 *  neither side yet. */
export const morphoMarketLiquidityProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `${coords.loanSymbol ?? "Loan-token"} still borrowable — \`totalSupplyAssets\` − \`totalBorrowAssets\` from \`market(id)\`${atBlock(coords)}, scaled by the loan token's decimals: what suppliers have put in and borrowers have not taken out. Both are the balance the contract last settled, so the difference is too; Blue lets a borrow draw it down to zero and no further.`,
  contract: blueContract(coords),
  via: `${LANE} · Morpho.market(id): totalSupplyAssets − totalBorrowAssets ${stateAt(coords)}`,
  formula: "totalSupplyAssets − totalBorrowAssets",
  inputs: [
    { label: "totalSupplyAssets", kind: "chain", pclass: "state", note: `Morpho.market(id) ${stateAt(coords)}` },
    { label: "totalBorrowAssets", kind: "chain", pclass: "state", note: `Morpho.market(id) ${stateAt(coords)}` },
  ],
});

/** When the market last settled — its \`lastUpdate\` slot, the time Blue last
 *  accrued its interest. Every stored size on the page is as of this time. */
export const morphoLastUpdateProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Morpho.market(id)", coords),
  summary: `Last settled — the market's \`lastUpdate\` from \`market(id)\`${atBlock(coords)}: the block time at which Blue last accrued this market's interest, on the last supply, borrow, repay, withdrawal or liquidation that touched it. The supplied and borrowed totals are the balances as of that moment.`,
  contract: blueContract(coords),
  via: `${LANE} · Morpho.market(id).lastUpdate ${stateAt(coords)}`,
});

// ── the aggregate ratio Blue keeps ───────────────────────────────────────────

/** Utilisation — the one market-wide ratio Blue holds: borrow ÷ supply of the loan
 *  token, raw amounts so decimals cancel. Needs no oracle; NOT a loan-to-value. */
export const morphoUtilizationProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `Utilisation — the one aggregate ratio Blue keeps${atBlock(coords)}: \`totalBorrowAssets\` ÷ \`totalSupplyAssets\` from \`market(id)\`, raw loan-token amounts so their decimals cancel. It needs no oracle — which is why this whole surface never asks one — and it is NOT a loan-to-value, because Blue records collateral per position and never totals it.`,
  contract: blueContract(coords),
  via: `${LANE} · Morpho.market(id): totalBorrowAssets ÷ totalSupplyAssets ${stateAt(coords)}`,
  formula: "totalBorrowAssets ÷ totalSupplyAssets",
  inputs: [
    { label: "totalBorrowAssets", kind: "chain", pclass: "state", note: `Morpho.market(id) ${stateAt(coords)}` },
    { label: "totalSupplyAssets", kind: "chain", pclass: "state", note: `Morpho.market(id) ${stateAt(coords)}` },
  ],
});

// ── the live rate: from the market's own IRM ─────────────────────────────────

/** The market's live borrow APR — its OWN IRM asked with the market as stored
 *  (borrowRateView, exactly as _accrueInterest calls it), annualised from the
 *  per-second rate. The one FRESH figure on this surface. */
export const morphoBorrowRateProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("IRM.borrowRateView", coords),
  summary: `Borrow APR — the market's OWN interest-rate model asked with the market as stored${atBlock(coords)}: \`borrowRateView(params, market)\`, exactly as \`_accrueInterest\` calls it, annualised from the contract's per-second rate (× 31,536,000). A market naming no IRM is not asked, and states no rate rather than a zero it never reported.`,
  contract: irmContract(coords),
  via: `${LANE} · IRM.borrowRateView(params, market) × seconds/year ${readAt(coords)}`,
  formula: "borrowRateView × seconds per year",
  inputs: [
    {
      label: "borrowRateView",
      kind: "chain",
      pclass: "state",
      note: `IRM per-second borrow rate, market as stored ${readAt(coords)}`,
    },
    {
      label: "seconds per year",
      kind: "derived",
      pclass: "state",
      value: "31,536,000",
      note: "annualisation constant",
    },
  ],
});

/** The market's supply APR — what lenders earn, derived (never a separate slot):
 *  the same live borrow APR the IRM reports, times utilisation, net of the
 *  protocol fee. The one arithmetic step over two chain reads and a governance
 *  parameter, matching exactly what the position lane's marketRateProv states. */
export const morphoSupplyRateProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `Supply APR — what lenders in this market earn${atBlock(coords)}: the market's own borrow APR (\`IRM.borrowRateView\`), times utilisation, net of the protocol fee. Blue keeps no separate supply-rate slot — this is the same arithmetic \`_accrueInterest\` performs to split interest between the protocol fee and suppliers.`,
  contract: irmContract(coords),
  via: `${LANE} · borrow APR × utilisation × (1 − fee) ${readAt(coords)}`,
  formula: "borrow APR × utilisation × (1 − fee)",
  inputs: [
    {
      label: "borrow APR",
      kind: "chain-derived",
      pclass: "state",
      note: `IRM.borrowRateView annualised ${readAt(coords)}`,
    },
    {
      label: "utilisation",
      kind: "chain-derived",
      pclass: "state",
      note: `totalBorrowAssets ÷ totalSupplyAssets ${stateAt(coords)}`,
    },
    { label: "fee", kind: "chain", pclass: "state", note: `market(id).fee ${stateAt(coords)}` },
  ],
});

/** The market's protocol fee — the singleton's own `market(id).fee` slot, a 0..1
 *  fraction of borrow interest the protocol keeps rather than passing to
 *  suppliers. A governance-set parameter, read straight (never derived). */
export const morphoFeeProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Morpho.market(id)", coords),
  summary: `Market fee — the protocol's cut of borrow interest${atBlock(coords)}: \`market(id).fee\`, a governance-set 0..1 fraction read straight from the singleton's own storage (scaled by 1e18). The remainder accrues to suppliers.`,
  contract: blueContract(coords),
  via: `${LANE} · Morpho.market(id).fee ${stateAt(coords)}`,
});

// ── the overview's group-level ratio and the family's book ───────────────────

/** A loan-token group's utilisation — Σ borrowed ÷ Σ supplied over that token's
 *  markets, raw amounts so decimals cancel. The per-market ratio, taken over
 *  the whole group; still no oracle, still not a loan-to-value. */
export const morphoGroupUtilizationProv = (coords: MorphoMarketCoords, lentOnly?: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `${coords.loanSymbol ?? "Loan-token"} utilisation, group — Σ \`totalBorrowAssets\` ÷ Σ \`totalSupplyAssets\` over ${lentOnly != null ? `the ${lentOnly} markets a vault on Rails's roster lends into` : "this loan token's markets"}${atBlock(coords)}, raw amounts in one token so their decimals cancel. The same ratio each market states, taken over the whole group; it needs no oracle and is NOT a loan-to-value, because Blue never totals collateral.`,
  contract: blueContract(coords),
  via: `${LANE} · Σ Morpho.market(id).totalBorrowAssets ÷ Σ totalSupplyAssets over the ${coords.loanSymbol ?? "loan-token"} markets ${stateAt(coords)}`,
  formula: "Σ totalBorrowAssets ÷ Σ totalSupplyAssets",
  inputs: [
    {
      label: "totalBorrowAssets",
      kind: "chain",
      pclass: "state",
      note: `Morpho.market(id) per market ${stateAt(coords)}`,
    },
    {
      label: "totalSupplyAssets",
      kind: "chain",
      pclass: "state",
      note: `Morpho.market(id) per market ${stateAt(coords)}`,
    },
  ],
});

/** A family's stored book — Σ over N markets that share one collateral and one
 *  lltv and differ only by oracle. One token, so a real quantity; stated
 *  because the family's compounded book is usually the group's whole story. */
export const morphoFamilyTotalProv = (
  side: "supplied" | "borrowed",
  coords: MorphoMarketCoords,
  count: number,
): Provenance => {
  const field = side === "supplied" ? "totalSupplyAssets" : "totalBorrowAssets";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${coords.loanSymbol ?? "Loan-token"} ${side}, family total — Σ over the ${count} ${coords.collateralSymbol ?? "same-collateral"} markets of each market's stored \`${field}\`${atBlock(coords)}. These markets share one collateral and one loan-to-value and differ only by oracle, so the sum is one token and a real quantity — STORED state, never projected: Blue credits interest to a market's book only when it is touched.`,
    contract: blueContract(coords),
    via: `${LANE} · Σ Morpho.market(id).${field} over the ${count}-market ${coords.collateralSymbol ?? ""}/${coords.loanSymbol ?? ""} family ${stateAt(coords)}`,
    formula: `Σ ${field}`,
    inputs: [
      {
        label: field,
        kind: "chain",
        pclass: "state",
        note: `Morpho.market(id).${field} per market ${stateAt(coords)}`,
      },
    ],
  };
};

/** A repeated pair's stored book on the roster (R1.1.1) — Σ over the N
 *  markets in one loan token with one collateral and one LLTV, which differ
 *  only in their oracle or rate model. */
export const morphoPairTotalProv = (
  side: "supplied" | "borrowed",
  coords: MorphoMarketCoords,
  count: number,
): Provenance => {
  const field = side === "supplied" ? "totalSupplyAssets" : "totalBorrowAssets";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${coords.loanSymbol ?? "Loan-token"} ${side}, over the ${count} ${coords.collateralSymbol ?? ""} / ${coords.loanSymbol ?? ""} markets at one LLTV — Σ of each market's stored \`${field}\`${atBlock(coords)}. They differ only in their oracle or rate model, and all measure in ${coords.loanSymbol ?? "one loan token"}. The rates and utilisation on this row are the largest market's.`,
    contract: blueContract(coords),
    via: `${LANE} · Σ Morpho.market(id).${field} over the ${count} markets ${stateAt(coords)}`,
    formula: `Σ ${field}`,
    inputs: [
      {
        label: field,
        kind: "chain",
        pclass: "state",
        note: `Morpho.market(id).${field} per market ${stateAt(coords)}`,
      },
    ],
  };
};

/** What sets one market of a repeated pair apart (R1.1.1): its oracle's feeds,
 *  each named by its `description()`. */
export const morphoPriceSourceProv = (
  coords: MorphoMarketCoords,
  p: {
    oracle: string | null;
    irm: string | null;
    feeds: { slot: string; address: string; description: string | null }[];
  },
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("BASE_FEED_1() … QUOTE_FEED_2() on the oracle, then description() on each feed", coords),
  summary:
    p.feeds.length > 0
      ? `Price source — the feeds this market's oracle names, each by its own \`description()\`${atBlock(coords)}. The market shares its loan token, collateral and LLTV with the others in its row; its oracle is its own. Where two markets' feeds read alike, the page numbers them by size.`
      : `Price source — this market's oracle names no feed Rails can read${atBlock(coords)}, so the page calls it a separate price source, numbered by size where the pair has several. Its oracle is its own.`,
  contract: { name: "Market oracle", address: p.oracle ?? undefined },
  via: `${LANE} · oracle.BASE_FEED_1/2(), QUOTE_FEED_1/2() · feed.description() ${readAt(coords)}`,
  inputs: [
    { label: "market id", value: coords.marketId ?? "", kind: "chain" },
    { label: "oracle", value: p.oracle ?? "none", kind: "chain" },
    { label: "rate model", value: p.irm ?? "none", kind: "chain" },
    ...p.feeds.map((f) => ({
      label: f.slot,
      value: f.description ? `${f.description} (${f.address})` : f.address,
      kind: "chain" as const,
    })),
  ],
});

/** The "rate ceiling" tag (R1.1.2): the vault pages' illiquid test on the
 *  market alone (lib/vaults/illiquid.ts `atRateCeiling`). */
export const morphoRateCeilingProv = (
  coords: MorphoMarketCoords,
  t: { stored: string; elapsed: number; utilisation: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("AdaptiveCurveIrm.rateAtTarget(id)", coords),
  summary: `Rate ceiling — the market is ${(t.utilisation * 100).toFixed(2)}% borrowed on the AdaptiveCurveIRM, and its rate at target, the stored \`rateAtTarget(id)\` moved over the ${t.elapsed.toLocaleString("en-US")} seconds since the market last settled, is at the IRM's maximum of 200% a year${atBlock(coords)}. At full utilisation the borrow rate is then four times that, 800% a year. The vault pages' "Markets at the rate ceiling" uses the same test.`,
  contract: irmContract(coords),
  via: `${LANE} · AdaptiveCurveIrm.rateAtTarget(id) ${readAt(coords)} · adapted to the block`,
  formula: "utilisation ≥ 99.9% and rateAtTarget × e^(speed × err × elapsed) ≥ 200% a year",
  inputs: [
    { label: "rateAtTarget", kind: "chain", pclass: "state", value: t.stored, note: "per second, WAD, as stored" },
    {
      label: "elapsed",
      kind: "chain-derived",
      pclass: "state",
      value: `${t.elapsed.toLocaleString("en-US")} s`,
      note: "block time − market(id).lastUpdate",
    },
  ],
});

// ── the AdaptiveCurveIRM's curve (one market's page) ─────────────────────────

/** The rate at target the curve is drawn from: the IRM's `rateAtTarget(id)` as
 *  stored at the market's last update, adapted to the read's block the way the
 *  IRM adapts it (`_newRateAtTarget`), annualised. */
export const morphoRateAtTargetProv = (
  coords: MorphoMarketCoords,
  t: { stored: string; settledUtilisation: number; elapsed: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("AdaptiveCurveIrm.rateAtTarget(id)", coords),
  summary: `Rate at target — the borrow rate the market's AdaptiveCurveIRM sets at 90% utilisation${atBlock(coords)}. \`rateAtTarget(id)\` stores it as of the market's last update; the IRM moves it continuously, up while utilisation is above 90% and down below it, at a speed of 50 a year times the distance from the target. This is the stored value moved over the ${t.elapsed.toLocaleString("en-US")} seconds since that update at the settled utilisation of ${(t.settledUtilisation * 100).toFixed(2)}%, kept between 0.1% and 200% a year, then annualised (× 31,536,000).`,
  contract: irmContract(coords),
  via: `${LANE} · AdaptiveCurveIrm.rateAtTarget(id) ${readAt(coords)} · adapted to the block`,
  formula: "rateAtTarget × e^(speed × err × elapsed) × seconds per year",
  inputs: [
    { label: "rateAtTarget", kind: "chain", pclass: "state", value: t.stored, note: "per second, WAD, as stored" },
    {
      label: "elapsed",
      kind: "chain-derived",
      pclass: "state",
      value: `${t.elapsed.toLocaleString("en-US")} s`,
      note: "block time − market(id).lastUpdate",
    },
    { label: "speed", kind: "derived", pclass: "state", value: "50 a year", note: "ConstantsLib.ADJUSTMENT_SPEED" },
  ],
});

/** The curve: the IRM's shape over the rate at target, and the market's point on it. */
export const morphoCurveProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `The AdaptiveCurveIRM's curve${atBlock(coords)}. The borrow rate is the rate at target times a factor that runs from ¼ at 0% utilisation to 1 at the 90% target and 4 at 100% (curve steepness 4), straight between those points. The supply rate is the borrow rate times utilisation, less the market's fee. The point marked is the market's settled utilisation on the curve at this block; the borrow rate on the page head is \`borrowRateView\`, the IRM's average over the time since the last update, so the two agree on a market touched recently.`,
  contract: irmContract(coords),
  via: `${LANE} · AdaptiveCurveIrm curve over rateAtTarget(id) ${readAt(coords)}`,
  formula: "borrow(u) = rateAtTarget × (u ≤ 90% ? ¼ + ¾·u/90% : 1 + 3·(u − 90%)/10%)",
});

/** The liquidation incentive: derived from the lltv, never set. */
export const morphoLiquidationIncentiveProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `Liquidation incentive — what a liquidator receives in collateral per unit of debt repaid, as a multiple of the debt. Morpho Blue does not store it: it follows from the market's lltv, min(1.15, 1 ÷ (1 − 0.3 × (1 − lltv))), so it is as fixed as the lltv.`,
  contract: blueContract(coords),
  via: `${LANE} · min(1.15, 1 / (1 − 0.3 × (1 − lltv)))`,
  formula: "min(1.15, 1 / (1 − 0.3 × (1 − lltv)))",
});

/** A market row's identity, on its collateral's name: the market id and the
 *  five parameters it hashes, which the table leaves off its surface. */
export const morphoMarketIdentityProv = (
  coords: MorphoMarketCoords,
  p: { collateralToken: string; oracle: string | null; irm: string | null; lltv: number },
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: {
    kind: "recompute",
    text: "The market id is keccak256(abi.encode(params)); recompute it from these five, or call idToMarketParams(id) on Morpho Blue.",
  },
  summary: `The ${coords.collateralSymbol ?? "idle"} / ${coords.loanSymbol ?? "loan-token"} market. Its id is the hash of its loan token, collateral token, oracle, rate model and LLTV, fixed at creation. Enumerated from the CreateMarket log the roster was censused from.`,
  contract: blueContract(coords),
  via: `${LANE} · CreateMarket(id, params) · idToMarketParams(id)`,
  inputs: [
    { label: "market id", value: coords.marketId ?? "", kind: "chain", note: "keccak256 of the five parameters" },
    { label: "loan token", value: coords.loanToken ?? "", kind: "chain" },
    { label: "collateral token", value: p.collateralToken, kind: "chain" },
    { label: "oracle", value: p.oracle ?? "none", kind: "chain" },
    { label: "rate model", value: p.irm ?? "none", kind: "chain" },
    { label: "lltv", value: `${(p.lltv * 100).toFixed(1)}%`, kind: "chain" },
  ],
});
