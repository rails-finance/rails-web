import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

// A MakerDAO ilk's price feed over its life, for the Lifetime flows chart's
// protocol-change markers (lib/makerdao/feed-log.ts; rails-ops
// reference/lifetime-price-chart.md, the MakerDAO rows): each Spotter
// file(ilk, "pip"), each change(src) on the OSM behind the feed, each cap set
// on a capped feed and each file("par"). Proxy to rails-server's
// `/api/at-block/makerdao/feed-log`, which keeps the logs by the block range
// read and asks the chain only for the blocks after the last stored one
// (server mig 412; rails-ops decisions/0056). `toBlock` is the last stored
// block, within about an hour of the finalized head. The backend's
// Cache-Control (an hour) is forwarded.
//
// `?ilk=ETH-A`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const ilk = request.nextUrl.searchParams.get("ilk") ?? "";
  if (!/^[A-Z0-9-]{1,32}$/.test(ilk)) return NextResponse.json({ error: "ilk is required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/makerdao/feed-log?ilk=${encodeURIComponent(ilk)}&index=tx`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the ilk's price feed logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the MakerDAO ilk's price feed logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the ilk's price feed logs" }, { status: 502 });
  }
}
