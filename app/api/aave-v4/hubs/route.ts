import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import type { AaveV4HubsResponse } from "@/lib/api/fetch-aave-v4-hubs";
import { loadAaveV4ReserveFactors, reserveFactorKey } from "@/lib/sources/chain/aave-v4-reserve-factors";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's `/api/aave-v4/hubs`. Powers the cross-hub
 * comparison surface at /aave-v4/hubs — the three V4 hubs' credit lines, caps,
 * utilisation and active-position counts, side by side.
 *
 * No query params; one cacheable payload for everyone. The Express handler
 * short-TTL-caches (60s) since the credit-line / cap data is governance-rare
 * and utilisation only needs hour-scale freshness on a reference surface.
 *
 * Each line's `lt` is replaced by the spoke's collateral factor read from the
 * chain (lib/sources/chain/aave-v4-reserve-factors.ts), null where the spoke
 * sets 0, and the line carries `ltBlock`. A line the read does not cover, or
 * every line when the read fails, keeps the indexed figure and no `ltBlock`.
 */
export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const url = `${RAILS_API_URL}/api/aave-v4/hubs`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const indexed: AaveV4HubsResponse = await response.json();
    const data = await withChainFactors(indexed);
    return NextResponse.json(data, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching aave-v4 hubs from backend:", error);
    return NextResponse.json({ error: "Failed to fetch hubs" }, { status: 500 });
  }
}

async function withChainFactors(data: AaveV4HubsResponse): Promise<AaveV4HubsResponse> {
  try {
    const { blockNumber, bySpokeHubAsset } = await loadAaveV4ReserveFactors();
    return {
      ...data,
      lines: data.lines.map((l) => {
        const cf = bySpokeHubAsset.get(reserveFactorKey(l.spoke, l.hub, l.assetId));
        return cf == null ? l : { ...l, lt: cf > 0 ? cf : null, ltBlock: blockNumber };
      }),
    };
  } catch (error) {
    console.error("Aave V4 hubs: chain collateral-factor read failed; serving the indexed figures:", error);
    return data;
  }
}
