import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { paceBranch } from "@/lib/liquity-v2/redemption-pace";

// Proxy to rails-server's `/api/liquity-v2/redemption-pace?branch=&from=&to=`:
// BOLD redeemed on a branch per UTC day, `{ collateralType, from, to, days:
// [{ day, bold, count }] }`, days with no redemption left out. The Trove
// chart's pace lane reads it (lib/liquity-v2/redemption-pace.ts).
//
// A pure forward; the backend's Cache-Control (a day for a past range, a
// minute for one reaching today) passes through.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const branch = paceBranch(q.get("branch"));
  if (!branch) return NextResponse.json({ error: "branch must be one of WETH, rETH, wstETH" }, { status: 400 });
  const range = new URLSearchParams({ branch });
  for (const k of ["from", "to"] as const) {
    const v = q.get(k);
    if (v == null) continue;
    if (!DAY_RE.test(v)) return NextResponse.json({ error: `${k} must be a date as YYYY-MM-DD` }, { status: 400 });
    range.set(k, v);
  }
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/liquity-v2/redemption-pace?${range}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = await response.json();
    return NextResponse.json(body, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Liquity V2 redemption pace from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the redemption pace" }, { status: 500 });
  }
}
