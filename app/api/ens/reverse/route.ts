import { NextRequest, NextResponse } from "next/server";
import { resolveEnsNames } from "@/lib/ens/resolve-ens";

/**
 * Batch reverse ENS resolution: `GET /api/ens/reverse?addresses=0xabc…,0xdef…`.
 * Returns `{ names: { <lower-addr>: <name|null> } }` — the primary `.eth` name
 * per address, or null where there is none. Used by the owner pills (the fork
 * cards batch a page of owners into one call via the client `useEnsNames` hook).
 *
 * Capped so a crafted request can't fan out into unbounded RPC; the caller only
 * ever sends the addresses on one rendered page (well under the cap).
 */
export const runtime = "nodejs";

const MAX_ADDRESSES = 100;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("addresses");
  if (!raw) {
    return NextResponse.json({ error: "Missing addresses parameter" }, { status: 400 });
  }

  const addresses = raw
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, MAX_ADDRESSES);

  if (addresses.length === 0) {
    return NextResponse.json({ names: {} });
  }

  const names = await resolveEnsNames(addresses);
  return NextResponse.json(
    { names },
    // Names change rarely; a short shared-cache TTL absorbs repeat pages while
    // the in-process cache absorbs the rest.
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
