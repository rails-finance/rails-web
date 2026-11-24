// The shape every family's part of the wallet route takes (decision 0050,
// step 3). `shape` turns the family's summary rows into positions, building
// each card with the family's listing builder; `head` reads the family's
// head state for the open ones, one batched read where the reader allows it.

import type { ChainId } from "@/lib/shared/chains";
import type { WalletFamilyRead, WalletPosition } from "@/lib/wallet/types";
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
  /** Reads made: Multicalls, calls of an existing reader, or calls to rails-server. */
  reads: number;
}

/** What a head read may need beyond its open positions. */
export interface HeadContext {
  /** The family's summary rows, for a head read that rebuilds an open card
   *  with its listing builder (Compound V2, Moonwell, Morpho Base). */
  rows: WalletSummaryRow[];
  /** The reader's address, forwarded on a call to rails-server. */
  readerIp?: string;
}

export interface FamilyModule {
  /** The family's id on this page (`aave-v3-base`). */
  id: string;
  name: string;
  chain: ChainId;
  /** The summary rows this module takes: wallet_positions' (chain, family). */
  summaryChain: WalletSummaryRow["chain"];
  summaryFamily: string;
  /** "deposits" or "stakes" for a module taking a protocol's deposit or
   *  stake rows beside its Trove module (the rows' `kind`). */
  summaryKind?: "deposits" | "stakes";
  /** The head read also reads the open positions the store has not read
   *  (`notRead`), and fills them where it can (f(x)). */
  readsNotRead?: true;
  /** The module's rows are written when Rails reads the wallet on its
   *  explorer there (the Arbitrum lane, Aave V4 on Arc): the empty state's
   *  sentence says so. */
  storedOnVisit?: true;
  /** The names the empty state's sentence gives the module where `name`
   *  covers several (the vault families). */
  lineNames?: string[];
  /** The most positions the page draws for the module: past it, the open ones
   *  with the most dollars first, then the closed ones, the rest counted in
   *  the family's `undrawn`. */
  drawLimit?: number;
  shape(rows: WalletSummaryRow[]): Promise<WalletPosition[]>;
  /** Absent where the family's figures are the stored ones (Arbitrum). */
  /** `apiMs`: how long to wait for rails-server's route before the chain (walletApiWait). */
  head?(
    open: WalletPosition[],
    address: string,
    signal: AbortSignal,
    apiMs: number,
    ctx: HeadContext,
  ): Promise<HeadResult>;
}

/** Whether a summary row is the module's: its chain, family and kind. */
export const takesRow = (f: FamilyModule, r: WalletSummaryRow): boolean =>
  r.chain === f.summaryChain &&
  r.family === f.summaryFamily &&
  (r.kind === "deposits" || r.kind === "stakes" ? r.kind : undefined) === f.summaryKind;

/** A module's positions past its `drawLimit` are counted and not drawn: the
 *  open ones with the most dollars stay first, then the closed ones. */
export function drawn(
  f: Pick<FamilyModule, "drawLimit" | "summaryFamily">,
  positions: WalletPosition[],
): { drawn: WalletPosition[]; undrawn?: WalletFamilyRead["undrawn"] } {
  if (f.drawLimit == null || positions.length <= f.drawLimit) return { drawn: positions };
  const open = positions
    .filter((p) => p.status === "open")
    .sort((a, b) => (b.collateralUsd ?? -1) - (a.collateralUsd ?? -1));
  const ranked = [...open, ...positions.filter((p) => p.status !== "open")];
  const kept = ranked.slice(0, f.drawLimit);
  const left = ranked.slice(f.drawLimit);
  const leftOpen = left.filter((p) => p.status === "open").length;
  return {
    drawn: kept,
    undrawn: { family: f.summaryFamily, open: leftOpen, closed: left.length - leftOpen },
  };
}
