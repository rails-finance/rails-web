import { NextRequest, NextResponse } from "next/server";
import { COMET_CHAIN, hourBlock, readCometFactorLog } from "@/lib/sources/chain/collateral-factor-log";
import { cometDeploymentOf, compoundDeploymentParam } from "@/lib/compound/deployments";

// One Comet's factor history (lib/sources/chain/collateral-factor-log.ts):
// the Configurator's liquidation collateral factor setters, listings and
// CometDeployed logs for it, and the proxy's Upgraded logs, for the
// protocol-change markers and the factor reads at each upgrade on the
// Lifetime flows panel (lib/shared/collateral-factor-changes.ts; ui-jobs 328
// step 8). Two topic-filtered eth_getLogs; cached for an hour.
//
// `?deployment=ethereum|base|arbitrum&market=<key>`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const key = compoundDeploymentParam(q.get("deployment"));
  const market = cometDeploymentOf(key).markets.find((m) => m.key === (q.get("market") ?? "").toLowerCase());
  if (!market) return NextResponse.json({ error: "deployment and market are required" }, { status: 400 });
  try {
    const data = await readCometFactorLog(key, market.comet.toLowerCase(), await hourBlock(COMET_CHAIN[key]));
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
  } catch (error) {
    console.error("Error reading the Comet's factor logs:", error);
    return NextResponse.json({ error: "Failed to read the factor logs" }, { status: 502 });
  }
}
