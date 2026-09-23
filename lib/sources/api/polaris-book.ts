// The Polaris market book — the index's replayed per-market aggregates, read
// straight from rails-server's /api/polaris/markets. SERVER-ONLY: called by
// the markets page (one less hop than the proxy) and by the proxy route that
// is its JSON face.
//
// `bookStale` is a stated absence: the index not answering (not yet deployed,
// down, or answering a shape this reader does not recognise) is reported as
// such, never as an empty book — "no CDPs" and "nobody looked" must not
// render the same.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import {
  buildPolarisMarketBooks,
  type PolarisMarketBook,
  type RawPolarisMarketRow,
} from "@/lib/sources/api/polaris-positions";

export interface PolarisDeployment {
  id: string;
  chainId: number;
  deployBlock: number;
  addresses: Record<string, string>;
}

export interface PolarisBook {
  markets: PolarisMarketBook[];
  deployment: PolarisDeployment | null;
  bookStale: boolean;
}

interface RawMarketsResponse {
  markets?: RawPolarisMarketRow[];
  deployment?: { id: string; chain_id: number; deploy_block: string | number; addresses: Record<string, string> };
}

export async function loadPolarisBook(readerIp?: string): Promise<PolarisBook> {
  const base = process.env.RAILS_API_URL;
  if (!base) return { markets: [], deployment: null, bookStale: true };
  try {
    const res = await fetch(`${base}/api/polaris/markets`, {
      ...createAuthFetchOptions(undefined, readerIp),
      cache: "no-store",
    });
    if (!res.ok) return { markets: [], deployment: null, bookStale: true };
    const json = (await res.json()) as RawMarketsResponse;
    const markets = buildPolarisMarketBooks(json.markets);
    if (markets.length === 0) return { markets: [], deployment: null, bookStale: true };
    const d = json.deployment;
    return {
      markets,
      deployment: d
        ? { id: d.id, chainId: Number(d.chain_id), deployBlock: Number(d.deploy_block), addresses: d.addresses ?? {} }
        : null,
      bookStale: false,
    };
  } catch {
    return { markets: [], deployment: null, bookStale: true };
  }
}
