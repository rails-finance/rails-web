// A roster's Yield figures, read from the daily store on the server
// (rails-ops decision 0047; reference/daily-prices.md, "The read").
// ----------------------------------------------------------------------------
// One series per vault, keyed `vault:<chain id>:<vault address lowercased>`.
// The store answers at most 40 series a request, so a roster's keys go in
// chunks of 40, all at once, each answer cached for an hour (the store gains
// one row a day). The page hands the figures to the rows, so a reader's
// browser makes no request for them. The window asked is the last 90 days:
// enough for a 30-day figure across a gap in the series.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { vaultYield, type VaultSeries, type VaultYield } from "@/lib/vaults/yield";

const MAX_SERIES = 40;
const WINDOW_DAYS = 90;
const REVALIDATE_SECONDS = 3600;

export const vaultSeriesKey = (chainId: number, address: string) => `vault:${chainId}:${address.toLowerCase()}`;

/** Each vault's Yield by lowercased address. A chunk whose read failed leaves
 *  its vaults out, and their rows say the series was not read. */
export async function loadVaultYields(
  chainId: number,
  addresses: readonly string[],
): Promise<Record<string, VaultYield>> {
  const base = process.env.RAILS_API_URL;
  if (!base || addresses.length === 0) return {};
  const keys = [...new Set(addresses.map((a) => vaultSeriesKey(chainId, a)))];
  const from = Math.floor(Date.now() / 86_400_000) - WINDOW_DAYS;
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += MAX_SERIES) chunks.push(keys.slice(i, i + MAX_SERIES));
  const answers = await Promise.all(
    chunks.map(async (chunk) => {
      const qs = new URLSearchParams({ chain: String(chainId), series: chunk.join(","), from: String(from) });
      try {
        const res = await fetch(
          `${base}/api/prices/daily?${qs.toString()}`,
          createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
        );
        if (!res.ok) {
          console.error(`vault yields: the daily store answered ${res.status} for ${chunk.length} series`);
          return null;
        }
        return ((await res.json()) as { series?: Record<string, VaultSeries> }).series ?? {};
      } catch (error) {
        console.error("vault yields: the daily store did not answer", error);
        return null;
      }
    }),
  );
  const out: Record<string, VaultYield> = {};
  chunks.forEach((chunk, i) => {
    const series = answers[i];
    if (series == null) return;
    for (const key of chunk) out[key.slice(key.lastIndexOf(":") + 1)] = vaultYield(series[key]);
  });
  return out;
}
