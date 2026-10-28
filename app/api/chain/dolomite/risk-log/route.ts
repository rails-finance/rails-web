import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

// The Dolomite core's risk setter logs over its life: every LogSetMarginRatio
// and LogSetMarginPremium from its deployment, for the protocol-change markers
// on the Lifetime flows events row (lib/dolomite/flows-health.ts). Proxy to
// rails-server's `/api/at-block/dolomite/risk-log`, which keeps the logs by
// the block range read and asks the chain only for the blocks after the last
// stored one (server mig 412; rails-ops decisions/0056). `toBlock` is the last
// stored block, within about an hour of the finalized head. The backend's
// Cache-Control (an hour) is forwarded.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/dolomite/risk-log`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the risk setter logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Dolomite risk setter logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the risk setter logs" }, { status: 502 });
  }
}
