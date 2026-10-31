// ============================================================================
// FETCH MORPHO WALLET (chain sweep, Base)
// ============================================================================
//
// Every Morpho Blue position one wallet holds, found by asking the singleton
// about every market in the censused roster. There is no Ethereum twin of this
// call: there, the question is answered by the index. See
// lib/sources/chain/morpho-wallet.ts for why brute force over a known roster is
// the right shape here rather than a fallback.
//
// Every figure inside a position is in that market's OWN loan token — Morpho
// states no USD anywhere, so neither does this.

import type { MorphoChainPositionResponse } from "./fetch-morpho-position";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";

export interface MorphoWalletChainResponse {
  wallet: string;
  blockNumber: number;
  /** The block the roster was censused at. The sweep covers every market that
   *  existed then and none created since — surfaces state this rather than
   *  implying the roster is live. */
  censusBlock: number;
  /** How many markets were asked — the sweep's own denominator. */
  marketsScanned: number;
  /** How many the wallet holds anything in. May exceed `positions.length` when
   *  a wallet holds more than the detail cap; the number is stated either way
   *  rather than the list quietly ending. */
  positionsFound: number;
  positions: MorphoChainPositionResponse[];
  chainStale: boolean;
  /** Where rails-server read it at the head (/api/at-block/…): the block's
   *  time, when it read it, the leg that answered. Absent on a web chain read. */
  head?: PositionHeadStamp;
  /** Dollars per whole loan token, keyed on the lowercase loan token, for the
   *  held markets whose loan token a USD oracle prices at `blockNumber`.
   *  Arbitrum only (the Aave V3 Arbitrum oracle, lib/morpho-arbitrum/usd.ts);
   *  absent on Base and Ethereum, which state no dollars. */
  loanUsd?: Record<string, number>;
}

export async function fetchMorphoBaseWallet(p: {
  wallet: string;
  baseUrl?: string;
  /** Another deployment's slot route (Arbitrum's); Base's by default. */
  route?: string;
}): Promise<MorphoWalletChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  const route = p.route ?? "/api/chain/morpho-base/wallet";
  const res = await fetch(`${p.baseUrl ?? ""}${route}?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchMorphoBaseWallet failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MorphoWalletChainResponse;
}
