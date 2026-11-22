"use client";

// The Aave V3 listing's read stamp (ui-jobs 806): the refresh its rows come
// from, in the rosters' form (components/vaults/roster-read-stamp.tsx, ui-jobs
// 771). The rows are mv_aave_v3_wallet_markets and mv_aave_v3_positions,
// refreshed about hourly, so the stamp states the newest event they hold:
// its age, block or time, as the rosters' stamp does. Its place holds a bar until the read answers,
// and a failed read draws nothing, as the head stamp does.

import { useEffect, useState } from "react";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { ReadStamp } from "@/components/wallet/read-stamp";

interface Refresh {
  block: number;
  at: number;
}

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
      <ReadStamp block={refresh.block} at={refresh.at} label="Newest event on this listing" />
    </span>
  );
}
