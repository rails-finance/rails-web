import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";

// Every NewCollateralFactor a Compound V2 or Moonwell Comptroller emitted, for
// the protocol-change markers and the factor reads at each change on the
// Lifetime flows panel (lib/shared/collateral-factor-changes.ts; ui-jobs 328
// step 8). Proxy to rails-server's `/api/at-block/ctoken/factor-log`, which
// keeps the logs by the block range read and asks the chain only for the
// blocks after the last stored one (server mig 412; rails-ops decisions/0056).
// `toBlock` is the last stored block, within about an hour of the finalized
// head. The backend's Cache-Control (an hour) is forwarded.
//
// `?protocol=compound-v2|moonwell|moonwell-base`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const PROTOCOLS: CTokenProtocol[] = ["compound-v2", "moonwell", "moonwell-base"];

export async function GET(request: NextRequest) {
  const protocol = request.nextUrl.searchParams.get("protocol") as CTokenProtocol | null;
  if (!protocol || !PROTOCOLS.includes(protocol))
    return NextResponse.json({ error: "protocol is required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/ctoken/factor-log?protocol=${protocol}&index=tx`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the collateral factor logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Comptroller's collateral factor logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the collateral factor logs" }, { status: 502 });
  }
}
