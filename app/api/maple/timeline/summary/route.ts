import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMapleOpeningBalance } from "@/lib/maple/proxy-reads";

// The opening balance for a Maple position — everything BELOW the block that
// `/api/maple/timeline?recent=N` opened its window at. The model, the exclusive
// cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly for the
// usual reason (the bearer token is server-only) and for one more: rails-server
// keys its histograms in the INDEX's vocabulary and resolves nothing. On Maple
// that vocabulary is the POOL — `e.pool`, i.e. 'syrupusdc' / 'syrupusdt' — on
// both axes, so the two axes need OPPOSITE treatment and neither is a no-op:
//
//   • byAsset must reach the page as the FUNDS asset symbol (USDC / USDT),
//     because that is what `getEventAssetKeys` returns for a Maple event and
//     what the asset filter menu lists. Left as pool keys, the summarised half
//     of the axis would name buckets the loaded rows never name, and the two
//     halves of one asset would sit in the menu as two entries.
//   • flows stay VERBATIM. rails-server declares them `poolKey`, which
//     `resolveOpeningAssetKeys` renames not at all — correctly, because the
//     lifetime reducer in lib/maple/economics.ts keys its own per-pool Σ by
//     `ctx.pool`. Renaming them to the asset symbol would merge the two syrup
//     pools' flows on the summarised side while the window's stayed split.
//
// What the flows DO need is decimals: the index stores none per pool, so every
// bucket arrives with `decimals: null`, and a null there means the page must
// read the leg as unknown rather than as zero.
//
// Both resolutions run through `maplePoolOf` — literally the function
// `buildMapleTimeline` puts every row through, degraded stand-in included. The
// roster is fixed (Maple's factories spawn per-LOAN contracts, not pools), so
// there is no per-request ERC20 resolution on either side of the cut; sharing
// the function is what keeps an unrostered key from naming one thing in the
// window and another in the opening balance.
//
// Node runtime, no edge caching — same as its /timeline twin.
//
// The read and the shaping live in lib/maple/proxy-reads.ts, which the position
// page's loader calls too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    return respondWith(
      await readMapleOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching maple timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
