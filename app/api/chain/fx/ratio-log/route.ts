import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";

// Every UpdateLiquidateRatios and UpdateRebalanceRatios an f(x) pool emitted,
// for the Lifetime flows chart's two lines and its protocol-change markers
// (lib/fx/ratio-log.ts; ui-jobs 328 step 8). Proxy to rails-server's
// `/api/at-block/fx/ratio-log`, which keeps the logs by the block range read
// and asks the chain only for the blocks after the last stored one (server
// mig 412; rails-ops decisions/0056). `toBlock` is the last stored block,
// within about an hour of the finalized head. The backend's Cache-Control
// (an hour) is forwarded.
//
// `?pool=wsteth|wbtc`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const pool = request.nextUrl.searchParams.get("pool") ?? "";
  if (!isFxPoolKey(pool)) return NextResponse.json({ error: "pool is required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/fx/ratio-log?pool=${pool}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the pool's ratio logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the f(x) pool's ratio logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the pool's ratio logs" }, { status: 502 });
  }
}
