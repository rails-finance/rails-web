// One wallet's positions as the wallet view (/wallet/<address>) draws them,
// and the shape /api/chain/wallet/<address> answers: rails-ops
// decisions/0050-one-wallet-across-protocols-and-chains.md, step 3.
//
// Every position is one row of rails-server's wallet_positions (mig 395,
// GET /api/wallet/:address/positions): the figures the family's store states,
// and the family's listing row, which the family's listing builder turns into
// `card` here exactly as the family's listing proxy does. For an open
// position the route then reads the family's head state, one batched read per
// family: the risk figure, the buffer, dollars at the family's oracle now and
// the block. A field a family cannot fill stays undefined.

import type { ChainId } from "@/lib/shared/chains";
import type { AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import type { MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import type { SparkPositionSummary } from "@/lib/sources/api/spark-positions";
import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import type { ArbitrumReadRow } from "@/components/shared/arbitrum-positions-listing";
import type { CometCard } from "@/lib/compound-arbitrum/comet-cards";

/** "redeemed" is in the type for the families that end a position by
 *  redemption; no store states it as an ending yet (a fully redeemed Liquity
 *  V2 Trove reads as closed or as a zombie). */
export type WalletPositionStatus = "open" | "closed" | "liquidated" | "redeemed";

/** The family's listing row, which its listing component turns into slots. */
export type WalletCard =
  | { kind: "aave-v3"; lane: "ethereum" | "base"; row: AaveV3PositionRow }
  | { kind: "aave-v3-arbitrum"; row: ArbitrumReadRow }
  | { kind: "compound-v3"; lane: "ethereum" | "base"; row: CompoundPositionSummary }
  /** One Comet of the wallet's stored read; no `comet` on a read that found
   *  nothing held. */
  | { kind: "compound-v3-arbitrum"; row: ArbitrumReadRow; comet?: CometCard }
  | { kind: "morpho"; row: MorphoPositionSummary }
  | { kind: "morpho-arbitrum"; row: ArbitrumReadRow }
  | { kind: "spark"; row: SparkPositionSummary }
  | { kind: "fluid"; row: FluidPositionSummary }
  | { kind: "makerdao"; row: MakerVaultSummary }
  | { kind: "liquity-v2"; row: TroveSummary; prices: OraclePricesData | null };

/** A closed position's row in the History table: what the store states, each
 *  field absent where it states nothing. */
export interface WalletHistoryRow {
  /** Unix seconds: the last event, or the liquidation where the store dates it. */
  closedAt?: number;
  openedAt?: number;
  /** The position's size as the store gives it for a closed position. No
   *  family states the size at the close; this is the highest recorded. */
  size?: string;
  sizeNote?: string;
  /** The ending's result in the family's terms, where the store states one. */
  result?: string;
  resultNote?: string;
  txCount?: number;
}

/** How the route came by an open position's head figures. */
export type HeadRead =
  /** Read at head for this visit. */
  | "read"
  /** The family's read did not answer inside the budget: store figures only. */
  | "failed"
  /** The family's figures are its last stored read (the Arbitrum visit lane). */
  | "stored"
  /** Nothing to read: a closed position, or an open one with no debt where
   *  the family states no risk. */
  | "none";

export interface WalletPosition {
  chain: ChainId;
  /** The explorer slug (`aave-v3`, `liquity-v2`). */
  family: string;
  familyName: string;
  /** The market or branch the position sits in, for the risk tile and the
   *  History table ("Core", "WETH"). */
  market?: string;
  positionId: string;
  href: string;
  status: WalletPositionStatus;
  card: WalletCard;
  collateralUsd?: number;
  debtUsd?: number;
  /** Whose oracle the dollars are at (decision 0046). */
  usdSource?: string;
  /** The dollars are the family's own oracle's, so the tiles sum them
   *  (open point 7). Morpho Arbitrum's, at Aave's oracle, are shown on the
   *  card and kept out of the tiles. */
  usdOwnOracle?: boolean;
  /** The collateral price move, as a fraction, that starts liquidation;
   *  negative past it; undefined where the family cannot state it. A sort
   *  key: it ranks the cards and is never displayed (decision 0041). */
  buffer?: number;
  /** The family's own risk figure, for the tile. */
  riskFigure?: { value: string; label: string };
  /** The family's own verdict that the position can be liquidated now
   *  (Compound's isLiquidatable, a health factor under 1). */
  liquidatable?: boolean;
  /** The debt's annual rate as a fraction, where the read states it: the
   *  Debt tile weights it by `debtUsd`. */
  debtRate?: number;
  /** Collateral in dollars for the dust floor of the risk sort (open point
   *  5), where only a rank can be had: Morpho's collateral valued in a dollar
   *  stablecoin loan token. Ranks, never displayed. */
  dustUsd?: number;
  /** An Aave V3 Base account the chain has not been read for yet (open
   *  point 8): shown with a "not read" mark, outside the tiles and the sort. */
  notRead?: boolean;
  headRead: HeadRead;
  readAtBlock?: number;
  /** Unix seconds. */
  readAt?: number;
  history?: WalletHistoryRow;
}

/** One family's part of the answer. */
export interface WalletFamilyRead {
  id: string;
  name: string;
  chain: ChainId;
  positions: number;
  open: number;
  /** The head read over its open positions; "none" when it had none to read. */
  headRead: HeadRead;
  /** How long the family's shaping and head read took. */
  ms: number;
  /** Chain reads made for its open positions (multicalls or reader calls). */
  reads: number;
  error?: string;
}

/** The answer of /api/chain/wallet/<address>. */
export interface WalletRead {
  address: string;
  positions: WalletPosition[];
  families: WalletFamilyRead[];
  /** Rows the summary table holds for the address. */
  total: number;
  /** Unix seconds the answer was assembled. */
  readAt: number;
  /** The server route's time and the whole route's, for the report. */
  serverMs: number;
  ms: number;
  /** Set when the summary route did not answer: the page says so. */
  error?: string;
}
