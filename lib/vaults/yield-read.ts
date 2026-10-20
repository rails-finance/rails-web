// A roster's Yield figures, and a vault page's three daily series, read from
// the daily store on the server (rails-ops decision 0047, ui-jobs 413;
// reference/daily-prices.md, "The read").
// ----------------------------------------------------------------------------
// One series per vault, keyed `vault:<chain id>:<vault address lowercased>`.
// The store answers at most 40 series a request, so a roster's keys go in
// chunks of 40, all at once, each answer cached for an hour (the store gains
// one row a day). The page hands the figures to the rows, so a reader's
// browser makes no request for them. The window asked is the last 90 days:
// enough for a 30-day figure across a gap in the series. A vault page reads
// its share price, total assets and holders in one request
// (`loadVaultPageSeries`), each through the one window of lib/vaults/yield.ts.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { vaultWindow, vaultYield, type SeriesWindow, type VaultSeries, type VaultYield } from "@/lib/vaults/yield";

const MAX_SERIES = 40;
const WINDOW_DAYS = 90;
const REVALIDATE_SECONDS = 3600;

export const vaultSeriesKey = (chainId: number, address: string) => `vault:${chainId}:${address.toLowerCase()}`;

export const vaultAssetsSeriesKey = (chainId: number, address: string) =>
  `vault-assets:${chainId}:${address.toLowerCase()}`;
export const vaultHoldersSeriesKey = (chainId: number, address: string) =>
  `vault-holders:${chainId}:${address.toLowerCase()}`;

/** The store's answer for `keys`, 40 a request, all at once: one map per
 *  chunk, null where that chunk's read failed. */
async function readDailySeries(
  chainId: number,
  keys: readonly string[],
): Promise<{ chunk: string[]; series: Record<string, VaultSeries> | null }[]> {
  const base = process.env.RAILS_API_URL;
  if (!base || keys.length === 0) return [];
  const from = Math.floor(Date.now() / 86_400_000) - WINDOW_DAYS;
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += MAX_SERIES) chunks.push(keys.slice(i, i + MAX_SERIES));
  return Promise.all(
    chunks.map(async (chunk) => {
      const qs = new URLSearchParams({ chain: String(chainId), series: chunk.join(","), from: String(from) });
      try {
        const res = await fetch(
          `${base}/api/prices/daily?${qs.toString()}`,
          createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
        );
        if (!res.ok) {
          console.error(`vault series: the daily store answered ${res.status} for ${chunk.length} series`);
          return { chunk, series: null };
        }
        return { chunk, series: ((await res.json()) as { series?: Record<string, VaultSeries> }).series ?? {} };
      } catch (error) {
        console.error("vault series: the daily store did not answer", error);
        return { chunk, series: null };
      }
    }),
  );
}

/** Each vault's Yield by lowercased address. A chunk whose read failed leaves
 *  its vaults out, and their rows say the series was not read. */
export async function loadVaultYields(
  chainId: number,
  addresses: readonly string[],
): Promise<Record<string, VaultYield>> {
  const keys = [...new Set(addresses.map((a) => vaultSeriesKey(chainId, a)))];
  const out: Record<string, VaultYield> = {};
  for (const { chunk, series } of await readDailySeries(chainId, keys)) {
    if (series == null) continue;
    for (const key of chunk) out[key.slice(key.lastIndexOf(":") + 1)] = vaultYield(series[key]);
  }
  return out;
}

/** A vault page's three series through the one window: the strip's tiles
 *  (ui-jobs 413). Keys travel with the windows for the receipts. */
export interface VaultStripSeries {
  sharePrice: { key: string; window: SeriesWindow };
  totalAssets: { key: string; window: SeriesWindow };
  holders: { key: string; window: SeriesWindow };
}

/** One request for the vault's share price, total assets and holders. The
 *  Yield figure is the share price's; `strip` is null where the store did
 *  not answer. */
export async function loadVaultPageSeries(
  chainId: number,
  address: string,
): Promise<{ yieldFigure?: VaultYield; strip: VaultStripSeries | null }> {
  const keys = {
    sharePrice: vaultSeriesKey(chainId, address),
    totalAssets: vaultAssetsSeriesKey(chainId, address),
    holders: vaultHoldersSeriesKey(chainId, address),
  };
  const [answer] = await readDailySeries(chainId, Object.values(keys));
  const series = answer?.series;
  if (series == null) return { strip: null };
  return {
    yieldFigure: vaultYield(series[keys.sharePrice]),
    strip: {
      sharePrice: { key: keys.sharePrice, window: vaultWindow(series, keys.sharePrice, { zeroIsRead: false }) },
      totalAssets: { key: keys.totalAssets, window: vaultWindow(series, keys.totalAssets) },
      holders: { key: keys.holders, window: vaultWindow(series, keys.holders) },
    },
  };
}
