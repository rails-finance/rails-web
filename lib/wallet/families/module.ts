// The shape every family's part of the wallet route takes (decision 0050,
// step 3). `shape` turns the family's summary rows into positions, building
// each card with the family's listing builder; `head` reads the family's
// head state for the open ones, one batched read where the reader allows it.

import type { ChainId } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import type { WalletSummaryRow } from "@/lib/wallet/summary-row";

/**
 * How long a family's head read waits for rails-server's batch route before
 * reading the chain. The page's whole read has 8 s (WALLET_BUDGET_MS) with the
 * summary route and the cards' shaping inside it; the routes' own 8 s wait
 * plus a chain read would overrun it, so the wallet page waits at most 3.5 s
 * and always leaves WALLET_CHAIN_RESERVE_MS of the budget for the chain.
 */
export const WALLET_API_TIMEOUT_MS = 3_500;
export const WALLET_CHAIN_RESERVE_MS = 2_000;

/** The route's wait for a head read starting with `remainingMs` of the budget left. */
export const walletApiWait = (remainingMs: number) =>
  Math.max(500, Math.min(WALLET_API_TIMEOUT_MS, remainingMs - WALLET_CHAIN_RESERVE_MS));

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
  /** `apiMs`: how long to wait for rails-server's route before the chain (walletApiWait). */
  head?(open: WalletPosition[], address: string, signal: AbortSignal, apiMs: number): Promise<HeadResult>;
}
