// The shape every family's part of the wallet route takes (decision 0050,
// step 3). `shape` turns the family's summary rows into positions, building
// each card with the family's listing builder; `head` reads the family's
// head state for the open ones, one batched read where the reader allows it.

import type { ChainId } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import type { WalletSummaryRow } from "@/lib/wallet/summary-row";

export interface HeadResult {
  positions: WalletPosition[];
  /** Chain reads made: Multicalls, or calls of an existing reader. */
  reads: number;
}

export interface FamilyModule {
  /** The family's id on this page (`aave-v3-base`). */
  id: string;
  name: string;
  chain: ChainId;
  /** The summary rows this module takes: wallet_positions' (chain, family). */
  summaryChain: WalletSummaryRow["chain"];
  summaryFamily: string;
  shape(rows: WalletSummaryRow[]): Promise<WalletPosition[]>;
  /** Absent where the family's figures are the stored ones (Arbitrum). */
  head?(open: WalletPosition[], address: string, signal: AbortSignal): Promise<HeadResult>;
}
