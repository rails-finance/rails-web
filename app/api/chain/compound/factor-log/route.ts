import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { cometDeploymentOf, compoundDeploymentParam } from "@/lib/compound/deployments";

// One Comet's factor history: the Configurator's liquidation collateral factor
// setters, listings and CometDeployed logs for it, and the proxy's Upgraded
// logs, for the protocol-change markers and the factor reads at each upgrade
// on the Lifetime flows panel (lib/shared/collateral-factor-changes.ts;
// ui-jobs 328 step 8). Proxy to rails-server's
// `/api/at-block/compound/factor-log`, which keeps the logs by the block range
// read and asks the chain only for the blocks after the last stored one
// (server mig 412; rails-ops decisions/0056). `toBlock` is the last stored
// block, within about an hour of the finalized head. The backend's
// Cache-Control (an hour) is forwarded.
//
// `?deployment=ethereum|base|arbitrum&market=<key>`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const deployment = cometDeploymentOf(compoundDeploymentParam(q.get("deployment")));
  const market = deployment.markets.find((m) => m.key === (q.get("market") ?? "").toLowerCase());
  if (!market) return NextResponse.json({ error: "deployment and market are required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/compound/factor-log?chain=${deployment.chainId}&comet=${market.comet.toLowerCase()}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the factor logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Comet's factor logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the factor logs" }, { status: 502 });
  }
}
