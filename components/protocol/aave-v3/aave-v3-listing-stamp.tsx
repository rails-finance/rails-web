"use client";

// The Aave V3 listing's read stamp (ui-jobs 806): the refresh its rows come
// from, in the rosters' form (components/vaults/roster-read-stamp.tsx, ui-jobs
// 771). The rows are mv_aave_v3_wallet_markets and mv_aave_v3_positions,
// refreshed about hourly, so the stamp states the newest event they hold
// rather than the chain head. Its place holds a bar until the read answers,
// and a failed read draws nothing, as the head stamp does.

import { useEffect, useState } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { ReadStamp } from "@/components/wallet/read-stamp";

interface Refresh {
  block: number;
  at: number;
}

const n = (v: number) => v.toLocaleString("en-US");
const utc = (at: number) =>
  new Date(at * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/:\d\d\.\d+Z$/, " UTC");

export const aaveV3RefreshProv = (r: Refresh): Provenance => ({
  kind: "derived",
  pclass: "state",
  source: { block: r.block },
  summary: `The rows on this listing hold the Aave V3 Pools' events through block ${n(r.block)} (${utc(r.at)}). The index refreshes them about hourly; a position's page reads its Pool at the head.`,
  via: "rails-server · mv_aave_v3_wallet_markets, the newest row's last event",
});

export function AaveV3ListingStamp() {
  const [refresh, setRefresh] = useState<Refresh | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/aave-v3/refresh", { signal: ctl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<Partial<Refresh>>) : null))
      .then((d) => {
        if (typeof d?.block === "number" && typeof d.at === "number") setRefresh({ block: d.block, at: d.at });
        else setFailed(true);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setFailed(true);
      });
    return () => ctl.abort();
  }, []);
  if (!refresh)
    return failed ? null : (
      <span className="inline-flex h-7 w-16 items-center justify-end px-1.5" data-listing-refresh-pending="">
        <SkeletonBar width={44} />
      </span>
    );
  return (
    <span className="inline-flex items-center" data-listing-refresh-block={refresh.block}>
      <Prov info={aaveV3RefreshProv(refresh)}>
        <ReadStamp block={refresh.block} at={refresh.at} label="Refreshed" />
      </Prov>
    </span>
  );
}
