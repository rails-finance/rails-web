// The readout's daily series (rails-ops ui-jobs 553; the lines are
// lib/vaults/health.ts): a vault's share price and total assets over the last
// 130 days, room for a 90-day figure across a gap. The same store, keys and
// 40-series chunks as lib/vaults/yield-read.ts, over a longer window; each
// answer cached for an hour (the store gains one row a day), so a static page
// that reads it stays static.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { HEALTH_READ_DAYS } from "@/lib/vaults/health";
import { seriesReads, type VaultSeries, type VaultYieldRead } from "@/lib/vaults/yield";
import { vaultAssetsSeriesKey, vaultSeriesKey } from "@/lib/vaults/yield-read";

const MAX_SERIES = 40;
const REVALIDATE_SECONDS = 3600;

/** One vault's two series, oldest first, and the keys the receipts name. */
export interface VaultHealthSeries {
  priceKey: string;
  assetsKey: string;
  price: VaultYieldRead[];
  assets: VaultYieldRead[];
}

async function readChunk(chainId: number, keys: string[]): Promise<Record<string, VaultSeries> | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const from = Math.floor(Date.now() / 86_400_000) - HEALTH_READ_DAYS;
  const qs = new URLSearchParams({ chain: String(chainId), series: keys.join(","), from: String(from) });
  try {
    const res = await fetch(
      `${base}/api/prices/daily?${qs.toString()}`,
      createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
    );
    if (!res.ok) {
      console.error(`vault health series: the daily store answered ${res.status} for ${keys.length} series`);
      return null;
    }
    return ((await res.json()) as { series?: Record<string, VaultSeries> }).series ?? {};
  } catch (error) {
    console.error("vault health series: the daily store did not answer", error);
    return null;
  }
}

/** The readout's series for many vaults, by `<chain id>:<lowercased address>`.
 *  Two keys a vault, 40 keys a request, all at once; a vault whose request
 *  failed is left out, and its lines say the store did not answer. */
export async function loadVaultHealthSeries(
  vaults: readonly { chainId: number; address: string }[],
): Promise<Map<string, VaultHealthSeries>> {
  const out = new Map<string, VaultHealthSeries>();
  const byChain = new Map<number, Set<string>>();
  for (const v of vaults) byChain.set(v.chainId, (byChain.get(v.chainId) ?? new Set()).add(v.address.toLowerCase()));
  const jobs: Promise<void>[] = [];
  for (const [chainId, set] of byChain) {
    const addresses = [...set];
    const per = MAX_SERIES / 2;
    for (let i = 0; i < addresses.length; i += per) {
      const chunk = addresses.slice(i, i + per);
      jobs.push(
        readChunk(
          chainId,
          chunk.flatMap((a) => [vaultSeriesKey(chainId, a), vaultAssetsSeriesKey(chainId, a)]),
        ).then((series) => {
          if (series == null) return;
          for (const a of chunk) {
            const priceKey = vaultSeriesKey(chainId, a);
            const assetsKey = vaultAssetsSeriesKey(chainId, a);
            out.set(`${chainId}:${a}`, {
              priceKey,
              assetsKey,
              price: seriesReads(series[priceKey], { zeroIsRead: false }),
              assets: seriesReads(series[assetsKey]),
            });
          }
        }),
      );
    }
  }
  await Promise.all(jobs);
  return out;
}
