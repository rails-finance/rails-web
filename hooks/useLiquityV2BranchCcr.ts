"use client";

// A Liquity V2 page's branch figures against the critical ratio (rails-ops
// TO-DO-ui-jobs 747), read through /api/chain/liquity-v2/branch-ccr and settled
// per branch. `enabled` false skips the read.

import { useEffect, useMemo, useState } from "react";
import {
  settleAllBranchCcr,
  type LiquityV2BranchCcr,
  type LiquityV2BranchCcrResponse,
  type LiquityV2CcrBranch,
} from "@/lib/liquity-v2/branch-ccr";

export function useLiquityV2BranchCcr(enabled = true): Partial<Record<LiquityV2CcrBranch, LiquityV2BranchCcr>> {
  const [res, setRes] = useState<LiquityV2BranchCcrResponse | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/chain/liquity-v2/branch-ccr", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<LiquityV2BranchCcrResponse>) : null))
      .then((d) => {
        if (!cancelled) setRes(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return useMemo(() => settleAllBranchCcr(res), [res]);
}
