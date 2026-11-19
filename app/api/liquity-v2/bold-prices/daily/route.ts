import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";

// BOLD's market price per completed UTC day: a proxy to rails-server's GET
// /api/liquity-v2/bold-prices/daily?from=&to= (days as unix seconds / 86400),
// answered unchanged: `{ source, pool, quoteSymbol, from, to, filledFrom,
// obs: [[day, usd, block], …] }`, the Curve BOLD/USDC pool's last_price(0) at
// the end of each day's newest stored block (mig 497). The redeemer page's
// chart draws it (lib/liquity-v2/redeemer-flows.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_RE = /^\d{1,7}$/;

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to))
    return NextResponse.json({ error: "from and to must be UTC day numbers" }, { status: 400 });
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const res = await fetch(`${base}/api/liquity-v2/bold-prices/daily?from=${from}&to=${to}`, {
      ...createAuthFetchOptions(undefined, readerIpFromRequest(request)),
      signal: request.signal,
    });
    if (!res.ok) {
      console.error(`Backend API error: ${res.status} ${res.statusText} (liquity-v2 bold daily prices)`);
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(await res.json(), { headers: proxyCacheControl(res) });
  } catch (error) {
    console.error("Error fetching the BOLD daily prices from backend:", error);
    return NextResponse.json({ error: publicErrorMessage(error, "Failed to fetch") }, { status: 500 });
  }
}
