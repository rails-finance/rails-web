// One position of a wallet, as the wallet view (/wallet/<address>) draws it:
// rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md, step 2.
// Each family's adapter (lib/wallet/adapters/<family>.ts) maps its own wallet
// read to this shape; the fields an adapter cannot fill stay undefined, and
// those gaps are what the `wallet_positions` row of step 3 is built from.
//
// The card is carried as the family's own listing row (`card`), and the
// family's listing component builds the listing slots from it in the browser:
// every slot builder is a client hook, so a server adapter cannot call it.

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
 *  redemption; no family read in this cut states it as an ending (a fully
 *  redeemed Liquity V2 Trove reads as closed or as a zombie). */
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

/** A closed position's row in the History table: what the family's closed
 *  read states, each field absent where it states nothing. */
export interface WalletHistoryRow {
  /** Unix seconds: the last event, or the liquidation where the read dates it. */
  closedAt?: number;
  openedAt?: number;
  /** The position's size as the read gives it for a closed position. No family
   *  states the size at the close; this is the highest recorded. */
  size?: string;
  sizeNote?: string;
  /** The ending's result in the family's terms, where the read states one. */
  result?: string;
  resultNote?: string;
  txCount?: number;
}

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
  /** The collateral price move, as a fraction, that starts liquidation;
   *  negative past it; undefined where the family cannot state it. */
  buffer?: number;
  /** The family's own risk figure, for the tile. */
  riskFigure?: { value: string; label: string };
  /** The family's own verdict that the position can be liquidated now
   *  (Compound's isLiquidatable, a health factor under 1). */
  liquidatable?: boolean;
  /** The debt's annual rate as a fraction, where the read states it: the
   *  Debt tile weights it by `debtUsd`. */
  debtRate?: number;
  readAtBlock?: number;
  /** Unix seconds. */
  readAt?: number;
  history?: WalletHistoryRow;
}

/** One family's answer, or why it gave none. */
export interface WalletFamilyResult {
  id: string;
  name: string;
  chain: ChainId;
  ok: boolean;
  ms: number;
  positions: WalletPosition[];
  error?: string;
}
