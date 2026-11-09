// The holder card's worth line (lib/vaults/holding-worth.ts) on the server:
// the vault's stored share price from the holder's first day, one request,
// cached for an hour like the other daily reads (lib/vaults/health-read.ts),
// worked against the replay the page already holds.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";
import { seriesReads, type VaultSeries } from "@/lib/vaults/yield";
import { vaultSeriesKey } from "@/lib/vaults/yield-read";
import { holdingWorthPoints, type HoldingWorthLine } from "@/lib/vaults/holding-worth";

const REVALIDATE_SECONDS = 3600;
const DAY = 86_400;

/** The worth line, or null where the replay failed, the holding has no rows
 *  or the store did not answer. */
export async function loadHoldingWorth(
  events: readonly VaultHolderEvent[],
  o: {
    chainId: number;
    vault: string;
    shareDecimals: number;
    replayed: boolean;
    block: number;
    /** The page block's timestamp, seconds. */
    blockTimestamp: number | null;
    claimRaw: string | null;
  },
): Promise<HoldingWorthLine | null> {
  const base = process.env.RAILS_API_URL;
  if (!base || !o.replayed || events.length === 0) return null;
  const firstAt = Math.min(...events.map((e) => (e.timestamp > 0 ? e.timestamp : Infinity)));
  const key = vaultSeriesKey(o.chainId, o.vault);
  // A day before the first row, so the first stored day after it is in the answer.
  const from = Number.isFinite(firstAt) ? Math.floor(firstAt / DAY) - 1 : 0;
  const qs = new URLSearchParams({ chain: String(o.chainId), series: key, from: String(Math.max(0, from)) });
  let series: VaultSeries | undefined;
  try {
    const res = await fetch(
      `${base}/api/prices/daily?${qs.toString()}`,
      createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
    );
    if (!res.ok) {
      console.error(`holding worth: the daily store answered ${res.status} for ${key}`);
      return null;
    }
    series = ((await res.json()) as { series?: Record<string, VaultSeries> }).series?.[key];
  } catch (error) {
    console.error("holding worth: the daily store did not answer", error);
    return null;
  }
  const points = holdingWorthPoints(events, seriesReads(series, { zeroIsRead: false }), {
    shareDecimals: o.shareDecimals,
    now:
      o.claimRaw != null && o.blockTimestamp
        ? { day: Math.floor(o.blockTimestamp / DAY), block: o.block, claimRaw: o.claimRaw }
        : null,
  });
  return { key, points, storeDay: series?.firstDay ?? null };
}
