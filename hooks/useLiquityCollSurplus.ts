"use client";

// A liquidated Liquity-family Trove's collateral surplus at the head, fetched
// once the page knows the owner and the liquidation transaction
// (app/api/chain/liquity-family/coll-surplus). Null until it lands, and when
// the read fails or the liquidation credited no surplus.

import { useEffect, useState } from "react";
import type { CollSurplusRead } from "@/lib/sources/chain/liquity-coll-surplus";
import type { LiquityFamilyId, LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";
import { shiftDecimal } from "@/components/shared/provenance";

export function useLiquityCollSurplus(args: {
  protocol: LiquityFamilyId;
  branch: string;
  owner: string | null | undefined;
  /** The liquidation's transaction hash; absent on a Trove never liquidated. */
  liquidationTx: string | null | undefined;
}): LiquityTroveSurplus | null {
  const { protocol, branch, owner, liquidationTx } = args;
  const [surplus, setSurplus] = useState<LiquityTroveSurplus | null>(null);
  useEffect(() => {
    setSurplus(null);
    if (!owner || !liquidationTx) return;
    const ac = new AbortController();
    const qs = new URLSearchParams({ protocol, branch, owner, tx: liquidationTx });
    fetch(`/api/chain/liquity-family/coll-surplus?${qs.toString()}`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CollSurplusRead>) : null))
      .then((d) => {
        if (!d || !d.pool || d.surplusRaw === "0") return;
        setSurplus({
          surplus: Number(shiftDecimal(d.surplusRaw, d.decimals)),
          surplusRaw: d.surplusRaw,
          claimable: Number(shiftDecimal(d.claimableRaw, d.decimals)),
          claimableRaw: d.claimableRaw,
          decimals: d.decimals,
          pool: d.pool,
          blockNumber: d.blockNumber,
          claimed: d.claimed,
        });
      })
      .catch(() => {});
    return () => ac.abort();
  }, [protocol, branch, owner, liquidationTx]);
  return surplus;
}
