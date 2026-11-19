"use client";

// The holder label: what Rails knows a holder address to be, beyond its ENS
// name (rails-ops TO-DO-ipor-scoping.md §6.2). Today one kind, an IPOR Fusion
// vault from the census, asked only on the census chains. The asks batch per
// tick into one `/api/ipor-fusion/vaults` call per chain
// (lib/shared/holder-label-batch.ts); a failed call leaves no label.

import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/shared/chains";
import type { IporFusionVaultHit } from "@/lib/ipor-fusion/vault-lookup";
import { IPOR_FUSION_CHAIN_IDS } from "@/lib/ipor-fusion/census-chains";
import { createHolderLabelBatcher } from "@/lib/shared/holder-label-batch";

export type HolderLabel = { kind: "ipor-fusion-vault" } & IporFusionVaultHit;

const ADDR_RE = /^0x[0-9a-f]{40}$/;

const batcher = createHolderLabelBatcher<HolderLabel>(async (chainId, addresses) => {
  const res = await fetch(`/api/ipor-fusion/vaults?chain=${chainId}&addresses=${addresses.join(",")}`);
  if (!res.ok) throw new Error(String(res.status));
  const vaults: Record<string, IporFusionVaultHit> = (await res.json()).vaults ?? {};
  const out: Record<string, HolderLabel> = {};
  for (const [a, hit] of Object.entries(vaults)) out[a] = { kind: "ipor-fusion-vault", ...hit };
  return out;
});

/** The holder label for `address` on `chainId`, or null (a miss, a read not
 *  yet back, a chain outside the census, or no chain to match on). */
export function useHolderLabel(address: string | null | undefined, chainId: ChainId | null | undefined) {
  const addr = address?.toLowerCase() ?? "";
  const valid = chainId != null && IPOR_FUSION_CHAIN_IDS.has(chainId) && ADDR_RE.test(addr);
  const [label, setLabel] = useState<HolderLabel | null>(() => (valid ? (batcher.get(chainId, addr) ?? null) : null));

  useEffect(() => {
    if (!valid || chainId == null) {
      setLabel(null);
      return;
    }
    const cached = batcher.get(chainId, addr);
    if (cached !== undefined) {
      setLabel(cached);
      return;
    }
    let live = true;
    const unsubscribe = batcher.subscribe(chainId, addr, (l) => {
      if (live) setLabel(l);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [valid, addr, chainId]);

  return label;
}
