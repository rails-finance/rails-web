import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readPwnOpeningBalance } from "@/lib/pwn/proxy-reads";

// The opening balance for a PWN wallet's timeline — everything BELOW the block
// that `/api/pwn/timeline?wallet=…&recent=N` opened its window at. The model,
// the exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// rails-server keys its byAsset histogram in the index's own vocabulary — a raw
// lowercase collateral/credit token address, ERC20 or ERC721 alike — because it
// has no symbol resolver. This route resolves it through the SAME path
// `buildPwnTimeline` puts the rows' collateral/credit assets through: the
// generic on-chain ERC20/721 reader, then the protocol's own override for the
// Token Bundler (an ERC-1155 with no symbol()/name() to read). Resolving it any
// other way would let one asset resolve on one side of the cut and degrade to a
// truncated address on the other, splitting one bucket into two.
//
// `flows` and `actors` arrive omitted (rails-server declares why in `omitted`):
// the PWN tower states a loan's struck terms rather than reducing its events,
// and the position poses no third-party-actor question, so there is nothing for
// either resolver to translate — this route's only job is `byAsset`.
//
// Node runtime, no edge caching — same as its /timeline twin.
//
// The read and the shaping live in lib/pwn/proxy-reads.ts, which the position
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
    return respondWith(await readPwnOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching pwn timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
