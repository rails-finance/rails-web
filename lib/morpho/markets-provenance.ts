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
import { MORPHO_ADDRESSES } from "@/lib/morpho/asset-catalog";

const LANE = "live Morpho Blue reads (/morpho/markets)";

/** The lane one market's page names on the receipts it borrows from the
 *  position vocabulary (the oracle price and its feeds' age). */
export const MORPHO_MARKETS_LANE = LANE;
const SINGLETON = MORPHO_ADDRESSES.MORPHO_BLUE;

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
}

const blueContract = (): Provenance["contract"] => ({ name: "Morpho Blue", address: SINGLETON });

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
  contract: blueContract(),
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
    contract: blueContract(),
    via: `${LANE} · Morpho.market(id).${field} @ head`,
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
  via: `${LANE} · ERC20.totalSupply() @ head`,
});

/** A loan-token group's total supplied/borrowed — Σ over that token's markets of
 *  each market's stored size. Legitimate only within one token (same unit); groups
 *  are never summed across each other. */
export const morphoGroupTotalProv = (side: "supplied" | "borrowed", coords: MorphoMarketCoords): Provenance => {
  const field = side === "supplied" ? "totalSupplyAssets" : "totalBorrowAssets";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${coords.loanSymbol ?? "Loan-token"} ${side}, group total — Σ over this loan token's markets of each market's stored \`${field}\`${atBlock(coords)}. A sum is legitimate ONLY inside one token: every market here measures in ${coords.loanSymbol ?? "the same loan token"}, so the total is a real quantity — groups are never summed across each other, whose units don't compare.`,
    contract: blueContract(),
    via: `${LANE} · Σ Morpho.market(id).${field} over the ${coords.loanSymbol ?? "loan-token"} markets @ head`,
    formula: `Σ ${field}`,
    inputs: [{ label: field, kind: "chain", pclass: "state", note: `Morpho.market(id).${field} per market @ head` }],
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
  contract: blueContract(),
  via: `${LANE} · Morpho.market(id): totalSupplyAssets − totalBorrowAssets @ head`,
  formula: "totalSupplyAssets − totalBorrowAssets",
  inputs: [
    { label: "totalSupplyAssets", kind: "chain", pclass: "state", note: "Morpho.market(id) @ head" },
    { label: "totalBorrowAssets", kind: "chain", pclass: "state", note: "Morpho.market(id) @ head" },
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
  contract: blueContract(),
  via: `${LANE} · Morpho.market(id).lastUpdate @ head`,
});

// ── the aggregate ratio Blue keeps ───────────────────────────────────────────

/** Utilisation — the one market-wide ratio Blue holds: borrow ÷ supply of the loan
 *  token, raw amounts so decimals cancel. Needs no oracle; NOT a loan-to-value. */
export const morphoUtilizationProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `Utilisation — the one aggregate ratio Blue keeps${atBlock(coords)}: \`totalBorrowAssets\` ÷ \`totalSupplyAssets\` from \`market(id)\`, raw loan-token amounts so their decimals cancel. It needs no oracle — which is why this whole surface never asks one — and it is NOT a loan-to-value, because Blue records collateral per position and never totals it.`,
  contract: blueContract(),
  via: `${LANE} · Morpho.market(id): totalBorrowAssets ÷ totalSupplyAssets @ head`,
  formula: "totalBorrowAssets ÷ totalSupplyAssets",
  inputs: [
    { label: "totalBorrowAssets", kind: "chain", pclass: "state", note: "Morpho.market(id) @ head" },
    { label: "totalSupplyAssets", kind: "chain", pclass: "state", note: "Morpho.market(id) @ head" },
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
  via: `${LANE} · IRM.borrowRateView(params, market) × seconds/year @ head`,
  formula: "borrowRateView × seconds per year",
  inputs: [
    {
      label: "borrowRateView",
      kind: "chain",
      pclass: "state",
      note: "IRM per-second borrow rate, market as stored @ head",
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
  via: `${LANE} · borrow APR × utilisation × (1 − fee) @ head`,
  formula: "borrow APR × utilisation × (1 − fee)",
  inputs: [
    { label: "borrow APR", kind: "chain-derived", pclass: "state", note: "IRM.borrowRateView annualised @ head" },
    {
      label: "utilisation",
      kind: "chain-derived",
      pclass: "state",
      note: "totalBorrowAssets ÷ totalSupplyAssets @ head",
    },
    { label: "fee", kind: "chain", pclass: "state", note: "market(id).fee @ head" },
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
  contract: blueContract(),
  via: `${LANE} · Morpho.market(id).fee @ head`,
});

// ── the overview's group-level ratio and the family's book ───────────────────

/** A loan-token group's utilisation — Σ borrowed ÷ Σ supplied over that token's
 *  markets, raw amounts so decimals cancel. The per-market ratio, taken over
 *  the whole group; still no oracle, still not a loan-to-value. */
export const morphoGroupUtilizationProv = (coords: MorphoMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `${coords.loanSymbol ?? "Loan-token"} utilisation, group — Σ \`totalBorrowAssets\` ÷ Σ \`totalSupplyAssets\` over this loan token's markets${atBlock(coords)}, raw amounts in one token so their decimals cancel. The same ratio each market states, taken over the whole group; it needs no oracle and is NOT a loan-to-value, because Blue never totals collateral.`,
  contract: blueContract(),
  via: `${LANE} · Σ Morpho.market(id).totalBorrowAssets ÷ Σ totalSupplyAssets over the ${coords.loanSymbol ?? "loan-token"} markets @ head`,
  formula: "Σ totalBorrowAssets ÷ Σ totalSupplyAssets",
  inputs: [
    { label: "totalBorrowAssets", kind: "chain", pclass: "state", note: "Morpho.market(id) per market @ head" },
    { label: "totalSupplyAssets", kind: "chain", pclass: "state", note: "Morpho.market(id) per market @ head" },
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
    contract: blueContract(),
    via: `${LANE} · Σ Morpho.market(id).${field} over the ${count}-market ${coords.collateralSymbol ?? ""}/${coords.loanSymbol ?? ""} family @ head`,
    formula: `Σ ${field}`,
    inputs: [{ label: field, kind: "chain", pclass: "state", note: `Morpho.market(id).${field} per market @ head` }],
  };
};
