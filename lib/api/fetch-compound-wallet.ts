// ============================================================================
// FETCH COMPOUND V3 WALLET (chain sweep, Base)
// ============================================================================
//
// Every Compound V3 position one wallet holds across a deployment, found by
// asking each Comet in the roster about the account directly. There is no
// Ethereum twin of this call: there, the index knows which markets a wallet has
// touched because it replayed every event, and the explorer links to one
// (market, wallet) pair at a time.
//
// On Base there is no index, so the question is answered from the roster
// instead — and because Comet's roster is small and written down
// (lib/compound-base/asset-catalog.ts), asking all of it is not a compromise:
// the sweep covers every market, so the answer is exhaustive rather than a
// sample, and it costs three batched calls whatever the roster's size.
//
// Every figure inside a position is in THAT MARKET's quote unit (see
// fetch-compound-position.ts). Nothing here sums across markets: two markets
// that disagree about their numeraire have no common total.

import type { CompoundMarketChainResponse } from "./fetch-compound-position";

export interface CompoundWalletChainResponse {
  wallet: string;
  blockNumber: number;
  /** How many markets were asked — the sweep's own denominator. */
  marketsScanned: number;
  /** How many the wallet holds anything in (lent base, borrowed base, or
   *  collateral parked against a market). */
  positionsFound: number;
  /** Those markets only, in roster order. */
  positions: CompoundMarketChainResponse[];
  /** True when the sweep failed. It is never partially true: a short list and
   *  an empty wallet look identical on the page, so a failed read empties the
   *  whole answer rather than quietly dropping a market. */
  chainStale: boolean;
}

export async function fetchCompoundBaseWallet(p: {
  wallet: string;
  baseUrl?: string;
}): Promise<CompoundWalletChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  const res = await fetch(`${p.baseUrl ?? ""}/api/chain/compound-base/wallet?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchCompoundBaseWallet failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as CompoundWalletChainResponse;
}
