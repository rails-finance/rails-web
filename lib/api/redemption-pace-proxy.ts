// The redemption pace proxies (app/api/{liquity-v2,ebisu,asymmetry,basedollar}/
// redemption-pace): a pure forward of `branch`, `from` and `to` to the same path
// on rails-server, `{ collateralType, from, to, days: [{ day, bold, count }] }`,
// days with no redemption left out. The backend's Cache-Control (a day for a
// past range, a minute for one reaching today) passes through. Server-only.

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Forward to `${RAILS_API_URL}${path}`. `branch` is the request's branch
 * resolved to the symbol the backend takes, or null where it names none of
 * the protocol's; `branches` names them in the 400.
 */
export async function proxyRedemptionPace(
  request: NextRequest,
  path: string,
  branch: string | null,
  branches: string,
): Promise<NextResponse> {
  const q = request.nextUrl.searchParams;
  if (!branch) return NextResponse.json({ error: `branch must be one of ${branches}` }, { status: 400 });
  const range = new URLSearchParams({ branch });
  for (const k of ["from", "to"] as const) {
    const v = q.get(k);
    if (v == null) continue;
    if (!DAY_RE.test(v)) return NextResponse.json({ error: `${k} must be a date as YYYY-MM-DD` }, { status: 400 });
    range.set(k, v);
  }
  const readerIp = readerIpFromRequest(request);
  const api = process.env.RAILS_API_URL;
  if (!api) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(`${api}${path}?${range}`, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = await response.json();
    return NextResponse.json(body, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error(`Error fetching ${path} from backend:`, error);
    return NextResponse.json({ error: "Failed to fetch the redemption pace" }, { status: 500 });
  }
}
