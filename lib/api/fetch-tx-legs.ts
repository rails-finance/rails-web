// Client for /api/chain/tx-legs — what a transaction moved to and from a
// wallet, read from its receipt (rails-ops TO-DO-ui-jobs 438). One request per
// (chain, hash, wallet) for the life of the tab; a failure is kept too and
// reads as no answer, so the row stays "Transferred".

import type { ChainId } from "@/lib/shared/chains";
import type { TxLegs } from "@/lib/shared/tx-legs";

const cache = new Map<string, Promise<TxLegs | null>>();

export function fetchTxLegs(chainId: ChainId, hash: string, wallet: string, via: string): Promise<TxLegs | null> {
  const key = `${chainId}:${hash.toLowerCase()}:${wallet.toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    const q = new URLSearchParams({
      chain: String(chainId),
      hash: hash.toLowerCase(),
      wallet: wallet.toLowerCase(),
      via: via.toLowerCase(),
    });
    p = fetch(`/api/chain/tx-legs?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<TxLegs>) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}
