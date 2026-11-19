"use client";

// The holder label: what Rails knows a holder address to be, beyond its ENS
// name (rails-ops TO-DO-ipor-scoping.md §6.2). Today one kind, an IPOR Fusion
// vault from the census. Every pill on a page asks within one tick, and the
// asks for a chain go out as one `/api/ipor-fusion/vaults` call; answers are
// cached for the session. A failed call leaves no label, and a later mount
// may ask again.

import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/shared/chains";
import type { IporFusionVaultHit } from "@/lib/ipor-fusion/vault-lookup";

export type HolderLabel = { kind: "ipor-fusion-vault" } & IporFusionVaultHit;

const ADDR_RE = /^0x[0-9a-f]{40}$/;
const MAX_PER_CALL = 100;

/** `${chainId}:${address}` → the label, or null for a miss. */
const cache = new Map<string, HolderLabel | null>();
const queue = new Map<ChainId, Set<string>>();
const subscribers = new Map<string, Set<(label: HolderLabel | null) => void>>();
let flushScheduled = false;

function settle(key: string, label: HolderLabel | null) {
  cache.set(key, label);
  subscribers.get(key)?.forEach((cb) => cb(label));
  subscribers.delete(key);
}

async function flush() {
  flushScheduled = false;
  const batches = Array.from(queue.entries());
  queue.clear();
  for (const [chainId, set] of batches) {
    const all = Array.from(set);
    for (let i = 0; i < all.length; i += MAX_PER_CALL) {
      const chunk = all.slice(i, i + MAX_PER_CALL);
      try {
        const res = await fetch(`/api/ipor-fusion/vaults?chain=${chainId}&addresses=${chunk.join(",")}`);
        if (!res.ok) throw new Error(String(res.status));
        const vaults: Record<string, IporFusionVaultHit> = (await res.json()).vaults ?? {};
        for (const a of chunk) {
          const hit = vaults[a];
          settle(`${chainId}:${a}`, hit ? { kind: "ipor-fusion-vault", ...hit } : null);
        }
      } catch {
        for (const a of chunk) subscribers.delete(`${chainId}:${a}`);
      }
    }
  }
}

/** The holder label for `address` on `chainId`, or null (a miss, a read not
 *  yet back, or no chain to match on). */
export function useHolderLabel(address: string | null | undefined, chainId: ChainId | null | undefined) {
  const addr = address?.toLowerCase() ?? "";
  const valid = chainId != null && ADDR_RE.test(addr);
  const key = valid ? `${chainId}:${addr}` : "";
  const [label, setLabel] = useState<HolderLabel | null>(() => (valid ? (cache.get(key) ?? null) : null));

  useEffect(() => {
    if (!valid || chainId == null) {
      setLabel(null);
      return;
    }
    if (cache.has(key)) {
      setLabel(cache.get(key) ?? null);
      return;
    }
    let live = true;
    const cb = (l: HolderLabel | null) => {
      if (live) setLabel(l);
    };
    let set = subscribers.get(key);
    if (!set) subscribers.set(key, (set = new Set()));
    set.add(cb);
    let q = queue.get(chainId);
    if (!q) queue.set(chainId, (q = new Set()));
    q.add(addr);
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flush, 16);
    }
    return () => {
      live = false;
      subscribers.get(key)?.delete(cb);
    };
  }, [key, valid, addr, chainId]);

  return label;
}
