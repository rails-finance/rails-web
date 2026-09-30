// The shape a swept Moonwell history arrives in — shared by the server reader
// that builds it (lib/sources/chain/moonwell-events.ts) and the page that
// renders it, so the two cannot drift. Types only; safe on either side.

import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import type { MarketFlows } from "@/lib/moonwell/economics";
import type { LedgerMarket } from "@/lib/shared/ctoken-ledger";
import type { LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";

/** Per-market lifetime flows over every replayed row — the Moonwell tower's
 *  own shape, keyed by market because two Base markets share an mToken symbol. */
export type MoonwellLifetimeFlows = MarketFlows;

/** The same five legs RAW — decimal strings of underlying wei, the exact
 *  totals `lifetime` is scaled from once at the edge. `repaid` is net of the
 *  liquidated debt here as it is there: the carve-out is applied in the
 *  integer domain over the whole life, before scaling. Keyed by market like
 *  `MoonwellLifetimeFlows`. */
export interface MoonwellLifetimeFlowsRaw {
  market: string;
  supplied: string;
  withdrawn: string;
  borrowed: string;
  repaid: string;
  liquidatedDebt: string;
}

/** Where each lane ended after the replay — what a reader reconciles against
 *  the contracts' own `balanceOf` / `borrowBalanceStored`, and what feeds the
 *  position view's principal reading. */
export interface MoonwellReplayedPosition {
  market: string;
  symbol: string;
  /** Σ(mint − redeem) in underlying wei, clamped at zero. */
  supplyPrincipalRaw: string;
  /** The exact mToken lane, 8 dp wei. */
  mTokensRaw: string;
  /** The last emitted `accountBorrows` (underlying wei); "0" when the wallet
   *  never borrowed on this market. */
  debtRaw: string;
  /** The underlying's decimals and address — what a peak line needs to show
   *  and price itself. */
  decimals: number;
  underlying: string;
  /** The highest running supply principal and the highest emitted
   *  `accountBorrows` over the whole replay — a closed card's "highest
   *  recorded" figures. "0" when the lane never rose above zero. */
  peakSupplyPrincipalRaw: string;
  peakDebtRaw: string;
}

export interface MoonwellChainTimelineResponse extends ChainTimelineResponse<MoonwellLifetimeFlows> {
  /** Rows that were liquidations of this wallet, over the whole replay — not
   *  just the rendered slice. */
  liquidationCount: number;
  /** Distinct transactions over every row that were the wallet's own — a
   *  liquidation is the liquidator's transaction, so it is not counted. */
  txCount: number;
  /** Unix seconds of the newest row, when its block could be dated. */
  lastActivityAt: number | null;
  positions: MoonwellReplayedPosition[];
  /** `lifetime`'s exact twin, one entry per market in the same order. */
  lifetimeRaw: MoonwellLifetimeFlowsRaw[];
  /** Every flow of the life at its own block's price, with the sent,
   *  received and seized collateral and the interest on both sides
   *  (lib/shared/ctoken-ledger.ts). Absent on a seeded replay, whose rows
   *  before the cut travelled as sums. */
  ledger?: LedgerMarket[];
  /** Per market, the highest balance before or after any row: the supply
   *  (mTokens × the exchange rate at the row's block, interest included) and
   *  the debt (the emitted accountBorrows, and the debt just before a
   *  repayment). Absent on a seeded replay and on a router wallet. */
  balancePeaks?: { market: string; supplyRaw: string; debtRaw: string }[];
  /** What each liquidation did, from the rows (absent on a seeded replay). */
  liquidations?: LiquidationStory[];
}
