import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl, ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import type { FluidThresholdHistory } from "@/lib/fluid/threshold-history";

// Proxy to rails-server's `/api/fluid/threshold-history?vault=` — every admin
// log that set a T1 vault's collateral factor, liquidation threshold or
// liquidation max limit, oldest first, each setting before and after per
// mille (fluid_vault_config_change, server mig 410). The position chart steps
// its threshold line on these (rails-ops ui-jobs 328 step 8).
//
// A pure forward: the backend answers in the shape the client reads. The
// settings move only when governance moves them, so the roster TTL.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const vault = (request.nextUrl.searchParams.get("vault") ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(vault)) return NextResponse.json({ error: "vault must be an address" }, { status: 400 });
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/fluid/threshold-history?vault=${vault}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      // A 404 is a vault the backend does not know; the chart holds today's
      // threshold on any failure.
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = (await response.json()) as FluidThresholdHistory;
    return NextResponse.json(body, { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching fluid threshold history from backend:", error);
    return NextResponse.json({ error: "Failed to fetch threshold history" }, { status: 500 });
  }
}
