import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";

// Every SetBorrowingDiscounts and SetMonetaryPolicy a LlamaLend market's
// Controller emitted, and the discounts and policy before the first of each,
// for the Lifetime flows chart's protocol-change markers
// (lib/llamalend/config-log.ts; ui-jobs 328 step 8). Proxy to rails-server's
// `/api/at-block/llamalend/config-log`, which keeps the logs by the block
// range read and asks the chain only for the blocks after the last stored one
// (server mig 412; rails-ops decisions/0056). `toBlock` is the last stored
// block, within about an hour of the finalized head. The backend's
// Cache-Control (an hour) is forwarded.
//
// `?controller=0x…`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const controller = normalizeAddressParam(request.nextUrl.searchParams.get("controller") ?? "");
  if (!controller) return NextResponse.json({ error: "controller is required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/llamalend/config-log?controller=${controller}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (response.status === 404)
      return NextResponse.json({ error: "No LlamaLend market has that controller" }, { status: 404 });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the market's config logs" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the LlamaLend market's config logs from backend:", error);
    return NextResponse.json({ error: "Failed to read the market's config logs" }, { status: 502 });
  }
}
