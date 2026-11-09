import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";

// GET pass-through to rails-server's three reserve-page reads (anatomy M3.4,
// M3.6 to M3.8, ui-jobs 541): `reserve-history`, `reserve-config-log` and
// `reserve-holders` under `/api/aave-family/`, each taking `market` and
// `reserve` (history also `from`). The upstream validates both and owns the
// market vocabulary; this route passes those three parameters on, and the
// answer and its Cache-Control back, unchanged. The client is
// lib/api/fetch-aave-reserve-reads.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const READS = new Set(["reserve-history", "reserve-config-log", "reserve-holders"]);
const PARAMS = ["market", "reserve", "from"] as const;
/** The longest the box gets before this route answers 504. */
const UPSTREAM_MS = 45_000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ read: string }> }) {
  const { read } = await params;
  if (!READS.has(read)) return NextResponse.json({ error: "Unknown read" }, { status: 404 });
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
      `${RAILS_API_URL}/api/aave-family/${read}?${q}`,
      createAuthFetchOptions({ signal: AbortSignal.timeout(UPSTREAM_MS) }, readerIpFromRequest(request)),
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": "application/json", ...(response.ok ? proxyCacheControl(response) : {}) },
    });
  } catch (error) {
    console.error(`Error fetching aave-family ${read} from backend:`, error);
    const timedOut = (error as { name?: string })?.name === "TimeoutError";
    const message = publicErrorMessage(error, `Failed to fetch ${read}`);
    return NextResponse.json({ error: message }, { status: timedOut ? 504 : 500 });
  }
}
