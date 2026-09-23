// The shape a swept Moonwell history arrives in — shared by the server reader
// that builds it (lib/sources/chain/moonwell-events.ts) and the page that
// renders it, so the two cannot drift. Types only; safe on either side.

import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import type { MarketFlows } from "@/lib/moonwell/economics";

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
}
