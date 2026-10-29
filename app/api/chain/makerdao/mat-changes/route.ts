import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

// Changes to one MakerDAO ilk's minimum collateral ratio between two mined
// blocks, both included: the Spotter's file(ilk, "mat", value) logs. Proxy to
// rails-server's `/api/at-block/makerdao/mat-changes`, which reads them from
// the Spotter logs its feed log keeps (server mig 412; rails-ops
// decisions/0056) and asks the chain only for blocks past the last stored one.
// The backend's Cache-Control (a year at a finalized `to`, 15 s above it) is
// forwarded.
//
// `?ilk=ETH-A&from=&to=`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ilk = sp.get("ilk") ?? "";
  const from = Number(sp.get("from"));
  const to = Number(sp.get("to"));
  if (!/^[A-Z0-9-]{1,32}$/.test(ilk) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return NextResponse.json({ error: "ilk, from and to are required" }, { status: 400 });
  }
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const qs = new URLSearchParams({ ilk, from: String(from), to: String(to) });
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/makerdao/mat-changes?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the minimum-ratio changes" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the MakerDAO minimum-ratio changes from backend:", error);
    return NextResponse.json({ error: "Failed to read the minimum-ratio changes" }, { status: 502 });
  }
}
