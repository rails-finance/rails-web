import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { cometDeploymentOf, compoundDeploymentParam } from "@/lib/compound/deployments";

// Each listed asset's collateral factors in a Comet's settings at the end of
// one block (getAssetInfoByAddress), for the Lifetime flows chart's health
// view (lib/compound/flows-health.ts). Governance changes them at the proxy's
// upgrades, so the chart reads them at each day's last event. Proxy to
// rails-server's `/api/at-block/compound/factors`, which answers from its
// at-block store and reads the chain once for a block it does not hold
// (server mig 412; rails-ops decisions/0056). The backend's Cache-Control is
// forwarded: a year at a finalized block, seconds above it.
//
// `?deployment=ethereum|base|arbitrum&market=<key>&block=<n>&assets=a,b,…`
// Answers `{ block, factors: { [asset]: { borrow, liquidate } } }` as
// fractions; an asset the Comet did not list at that block is absent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ASSETS = 24;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const deployment = cometDeploymentOf(compoundDeploymentParam(q.get("deployment")));
  const market = deployment.markets.find((m) => m.key === (q.get("market") ?? "").toLowerCase());
  const block = Number(q.get("block"));
  const assets = [
    ...new Set(
      (q.get("assets") ?? "")
        .toLowerCase()
        .split(",")
        .map((a) => a.trim())
        .filter((a) => ADDRESS.test(a)),
    ),
  ].slice(0, MAX_ASSETS);
  if (!market || !Number.isInteger(block) || block < 1 || assets.length === 0)
    return NextResponse.json({ error: "deployment, market, block and assets are required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const params = new URLSearchParams({
      chain: String(deployment.chainId),
      comet: market.comet.toLowerCase(),
      block: String(block),
      assets: assets.join(","),
    });
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/compound/factors?${params}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "No factor was read at that block" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Comet factors at block from backend:", error);
    return NextResponse.json({ error: "Failed to read the factors at that block" }, { status: 502 });
  }
}
