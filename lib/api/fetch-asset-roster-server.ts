// The asset roster for an asset page's server render: GET /api/prices/assets
// on the box, the same answer app/api/prices/assets/route.ts proxies
// (rails-ops reference/asset-key-map.md).
//
// SERVER-ONLY. Reads `RAILS_API_URL` + `API_BEARER_TOKEN`; imported only from
// the asset page's Server Component.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import type { AssetRosterAnswer } from "@/lib/shared/asset-roster";

const SSR_FETCH_TIMEOUT_MS = 8000;

/** One token's roster entries on every chain and the entries they link to;
 *  null where the roster does not hold the token. */
export async function fetchAssetRosterServer(token: string): Promise<AssetRosterAnswer | null> {
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) throw new Error("RAILS_API_URL environment variable is not set");
  const readerIp = await readerIpFromHeaders();
  const res = await fetch(
    `${RAILS_API_URL}/api/prices/assets?token=${encodeURIComponent(token)}`,
    createAuthFetchOptions({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) }, readerIp),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchAssetRosterServer failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as AssetRosterAnswer;
}
