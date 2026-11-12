"use client";

// A Trove page's branch shutdown (rails-ops TO-DO-ui-jobs 612): the catalog's
// record draws at once, and the live read (/api/chain/liquity-family/shutdown)
// confirms it, or draws the state for a deployment with no record. `enabled`
// false (a closed Trove) skips the read and the state.

import { useEffect, useMemo, useState } from "react";
import { branchShutdownState, type BranchShutdownLive, type BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { recordedShutdown } from "@/lib/shared/liquity-family-shutdown";

export function useBranchShutdown(
  protocol: string,
  branch: string | null | undefined,
  enabled: boolean,
): BranchShutdownState | null {
  const [live, setLive] = useState<BranchShutdownLive | null>(null);
  useEffect(() => {
    if (!enabled || !branch) return;
    let cancelled = false;
    const qs = new URLSearchParams({ protocol, branch });
    fetch(`/api/chain/liquity-family/shutdown?${qs.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ live?: BranchShutdownLive | null }>) : null))
      .then((d) => {
        if (!cancelled) setLive(d?.live ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [protocol, branch, enabled]);
  return useMemo(
    () => (enabled ? branchShutdownState(recordedShutdown(protocol, branch), live) : null),
    [protocol, branch, enabled, live],
  );
}
