import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";

// GET pass-through to rails-server's Aave V4 reserve-page reads (ui-jobs 548):
//   head    → /api/at-block/aave-v4/reserve?spoke=&asset=[&hub=]
//   holders → /api/aave-v4/reserve-holders?spoke=&asset=[&hub=]
//   history → /api/aave-v4/hub-asset-history?hub=&asset=[&from=]
//   config-log → /api/aave-v4/reserve-config-log?spoke=&asset=[&hub=]
// The upstream validates the parameters; this route passes them on, and the
// answer, its status (400 `hub_required` names the hubs) and its
// Cache-Control back unchanged. The client is lib/api/fetch-aave-v4-reserve.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const UPSTREAM: Record<string, string> = {
  head: "/api/at-block/aave-v4/reserve",
  holders: "/api/aave-v4/reserve-holders",
  history: "/api/aave-v4/hub-asset-history",
  "config-log": "/api/aave-v4/reserve-config-log",
};
const PARAMS = ["spoke", "asset", "hub", "from"] as const;
/** The longest the box gets before this route answers 504. */
const UPSTREAM_MS = 30_000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ read: string }> }) {
  const { read } = await params;
  const path = UPSTREAM[read];
  if (!path) return NextResponse.json({ error: "Unknown read" }, { status: 404 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const q = new URLSearchParams();
  for (const k of PARAMS) {
    const v = request.nextUrl.searchParams.get(k);
    if (v) q.set(k, v);
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}${path}?${q}`,
      createAuthFetchOptions({ signal: AbortSignal.timeout(UPSTREAM_MS) }, readerIpFromRequest(request)),
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": "application/json", ...(response.ok ? proxyCacheControl(response) : {}) },
    });
  } catch (error) {
    console.error(`Error fetching aave-v4 reserve ${read} from backend:`, error);
    const timedOut = (error as { name?: string })?.name === "TimeoutError";
    const message = publicErrorMessage(error, `Failed to fetch ${read}`);
    return NextResponse.json({ error: message }, { status: timedOut ? 504 : 500 });
  }
}
