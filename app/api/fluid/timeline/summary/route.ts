import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFluidOpeningBalance } from "@/lib/fluid/proxy-reads";

// The opening balance for a Fluid position — everything BELOW the block that
// `/api/fluid/timeline?nft=…&recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly because
// the bearer token is server-only, and it carries the one protocol-specific job
// every /timeline/summary proxy carries: putting the summary's asset keys
// through the SAME resolver its /timeline twin puts the rows through. A symbol
// that resolved on one side of the cut and degraded on the other would split a
// bucket in two, and nothing downstream could tell that from a real second
// asset.
//
// For Fluid that resolver is the IDENTITY, and that is a finding rather than an
// omission. A Fluid position lives in ONE vault for its whole life, so it has no
// asset axis (`byAsset` arrives null, declared in `omitted`) and its flow
// buckets are keyed `collateral` / `debt` — the names of the position's two
// legs, which is already the vocabulary `replayFluidLifetime` reduces into.
// There is no address to name: `buildFluidTimeline` reads each row's symbol and
// decimals straight off the fluid_vault roster rather than resolving an ERC20,
// so the two sides of the cut cannot disagree about a symbol. The decimals
// agree by the same construction — rails-server scales its buckets with
// `coalesce(supply_decimals, 18)` and the transform scales its rows with
// `r.supply_decimals ?? SHARES_DECIMALS`, the same 18-dp DEX-share fallback for
// a smart-vault leg the roster leaves unnamed.
//
// Node runtime, no edge caching — same as its /timeline twin.
//
// The read and the shaping live in lib/fluid/proxy-reads.ts, which the position
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
      await readFluidOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching fluid timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
