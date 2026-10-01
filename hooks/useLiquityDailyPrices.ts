"use client";

// A Liquity V2 branch's collateral price per UTC day (/api/liquity-v2/prices/daily,
// rails-server-onboarding `0d5aba1`): the last price any Trove's operation
// recorded on the branch each day, `[day, usd]` ascending. The Lifetime flows
// panel values a Trove's collateral between its events at it
// (lib/shared/liquity-flows.ts); Liquity V1 reads the WETH branch's for ETH.
// `obs` is null while the read is on its way or where it failed (`settled`
// tells the two apart); the panel then keeps each event's price
// (`seriesCarry`). One read per branch and page load.

import { useEffect, useState } from "react";

export type LiquityDailyBranch = "WETH" | "wstETH" | "rETH";

const cache = new Map<LiquityDailyBranch, Promise<[number, number][] | null>>();

const isObs = (d: unknown): d is { obs: [number, number][] } =>
  d != null &&
  typeof d === "object" &&
  Array.isArray((d as { obs?: unknown }).obs) &&
  (d as { obs: unknown[] }).obs.every(
    (o) => Array.isArray(o) && o.length === 2 && typeof o[0] === "number" && typeof o[1] === "number",
  );

function load(branch: LiquityDailyBranch): Promise<[number, number][] | null> {
  let p = cache.get(branch);
  if (!p) {
    p = fetch(`/api/liquity-v2/prices/daily?collateralType=${branch}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (isObs(d) && d.obs.length > 0 ? d.obs : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(branch);
    });
    cache.set(branch, p);
  }
  return p;
}

export function useLiquityDailyPrices(branch: LiquityDailyBranch | null): {
  obs: [number, number][] | null;
  settled: boolean;
} {
  const [state, setState] = useState<{ branch: LiquityDailyBranch; obs: [number, number][] | null } | null>(null);
  useEffect(() => {
    if (!branch) return;
    let live = true;
    load(branch).then((obs) => {
      if (live) setState({ branch, obs });
    });
    return () => {
      live = false;
    };
  }, [branch]);
  if (!branch) return { obs: null, settled: true };
  const settled = state?.branch === branch;
  return { obs: settled ? (state?.obs ?? null) : null, settled };
}

/** The daily branch for a Liquity V2 collateral symbol, or null. */
export function liquityDailyBranch(symbol: string | null | undefined): LiquityDailyBranch | null {
  const s = (symbol ?? "").toLowerCase();
  return s === "weth" ? "WETH" : s === "wsteth" ? "wstETH" : s === "reth" ? "rETH" : null;
}
