import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { routeBoxHop } from "@/lib/shared/proxy-answer";

// The hop for the Aave V3 Base and Seamless Lifetime flows summary
// (rails-server GET /api/{aave-v3-base,seamless}/flows/daily; rails-ops
// reference/lifetime-flows-scrubber.md, "Aave V3 on Base and Seamless"). The
// panel reads it for a history the page holds elided; the answer is the
// summary lib/aave-v3-base/flows.ts draws, passed on as it came.

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function aaveBaseFlowsRoute(lane: "aave-v3-base" | "seamless") {
  return async function GET(request: NextRequest) {
    const base = process.env.RAILS_API_URL;
    if (!base) {
      console.error("RAILS_API_URL environment variable is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const wallet = request.nextUrl.searchParams.get("wallet");
    if (!wallet || !ADDRESS.test(wallet)) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
    try {
      const hop = routeBoxHop(base, readerIpFromRequest(request));
      const response = await fetch(`${hop.baseUrl}/api/${lane}/flows/daily?wallet=${wallet.toLowerCase()}`, {
        headers: hop.headers,
        cache: "no-store",
      });
      // A server without the route answers 404: the panel states a failed
      // read, as it did before the route, with no error on the wire.
      if (response.status === 404) return NextResponse.json({ wallet: wallet.toLowerCase(), refused: "unavailable" });
      if (!response.ok)
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
    } catch (error) {
      console.error(`Error fetching the ${lane} flow summary from backend:`, error);
      return NextResponse.json({ error: "Failed to fetch the flow summary" }, { status: 500 });
    }
  };
}

const EVENT_ID = /^0x[0-9a-fA-F]{64}-\d+$/;

/** The hop for a page of the timeline cards' flows older than the summary's
 *  newest events (rails-server GET /api/{aave-v3-base,seamless}/flows/events
 *  ?wallet=&before=&limit=), passed on as it came. */
export function aaveBaseFlowEventsRoute(lane: "aave-v3-base" | "seamless") {
  return async function GET(request: NextRequest) {
    const base = process.env.RAILS_API_URL;
    if (!base) {
      console.error("RAILS_API_URL environment variable is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const sp = request.nextUrl.searchParams;
    const wallet = sp.get("wallet");
    if (!wallet || !ADDRESS.test(wallet)) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
    const before = sp.get("before");
    if (before != null && !EVENT_ID.test(before))
      return NextResponse.json({ error: "before is an event id" }, { status: 400 });
    const limit = sp.get("limit");
    if (limit != null && !/^\d{1,4}$/.test(limit))
      return NextResponse.json({ error: "limit is a count" }, { status: 400 });
    const q = new URLSearchParams({ wallet: wallet.toLowerCase() });
    if (before != null) q.set("before", before.toLowerCase());
    if (limit != null) q.set("limit", limit);
    try {
      const hop = routeBoxHop(base, readerIpFromRequest(request));
      const response = await fetch(`${hop.baseUrl}/api/${lane}/flows/events?${q}`, {
        headers: hop.headers,
        cache: "no-store",
      });
      // A cursor no event has (the history changed under it) is the server's
      // 404 with `unknownBefore`; any other 404 is a server without the route.
      if (response.status === 404) {
        const body = (await response.json().catch(() => null)) as { unknownBefore?: boolean } | null;
        if (body?.unknownBefore) return NextResponse.json(body, { status: 404 });
        return NextResponse.json({ wallet: wallet.toLowerCase(), refused: "unavailable" });
      }
      if (!response.ok)
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
    } catch (error) {
      console.error(`Error fetching the ${lane} flow events from backend:`, error);
      return NextResponse.json({ error: "Failed to fetch the flow events" }, { status: 500 });
    }
  };
}
