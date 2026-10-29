import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

// An Aave V3-family PoolConfigurator's threshold and e-mode logs over its life
// (?market=core|prime|etherfi|spark|base|seamless), for the governance change
// markers on the Lifetime flows events row (lib/aave-v3/config-changes.ts).
// Proxy to rails-server's `/api/at-block/aave-v3/config-log?index=tx`: Base
// and Seamless from the Base Sieve's capture of each configurator, the
// Ethereum markets and SparkLend from the mainnet Sieve's (rails-ops
// decisions/0056); each log with its transaction's index and its place in the
// transaction (lib/shared/log-order.ts). The backend's Cache-Control (an
// hour) is forwarded.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const MARKETS = new Set(["core", "prime", "etherfi", "spark", "base", "seamless"]);

export async function GET(request: NextRequest) {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const market = request.nextUrl.searchParams.get("market") ?? "";
  if (!MARKETS.has(market)) return NextResponse.json({ error: "market is required" }, { status: 400 });
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/aave-v3/config-log?market=${market}&index=tx`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the configurator logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Aave configurator logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the configurator logs" }, { status: 502 });
  }
}
