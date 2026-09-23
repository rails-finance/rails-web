import { NextRequest, NextResponse } from "next/server";
import {
  MOONWELL_BASE_DEPLOYMENT,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import { readGroupedMoonwellBase } from "@/lib/moonwell-base/timeline-folders";
import { resolveFolder } from "@/lib/shared/timeline-grouping";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// Opening one Moonwell Base folder — the members behind a header on
// `/api/chain/moonwell-base/timeline?group=1`. The same contract the index arms
// answer on (`app/api/spark/timeline/folder`): `?event=` is an event key, the
// durable form a permalink carries; `?folder=` is the response-scoped id of a
// folder the reader clicked. A refusal is a stated code and sentence, never an
// empty list. The members come from the grouping the timeline route made a
// moment ago where it is still held (lib/moonwell-base/timeline-folders.ts),
// and from a fresh read and replay otherwise.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet))
    return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  const event = request.nextUrl.searchParams.get("event");
  const folder = request.nextUrl.searchParams.get("folder");
  if (!event && !folder) return NextResponse.json({ error: "event or folder is required" }, { status: 400 });

  try {
    const read = await readGroupedMoonwellBase(
      {
        wallet,
        deployment: MOONWELL_BASE_DEPLOYMENT,
        deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
        router: MOONWELL_BASE_WETH_ROUTER,
        apiPrefix: "/api/moonwell-base",
      },
      readerIp,
      { preferRemembered: true },
    );
    if (read.kind !== "grouped") {
      return NextResponse.json(
        {
          error: "Not grouped",
          code: "UNKNOWN_FOLDER",
          message:
            "Rails' index cannot vouch for this wallet's whole Moonwell history right now, so its timeline is not served in folders and there is no folder to open.",
        },
        { status: 404 },
      );
    }
    const { answer } = read;
    if (answer.result.totalEvents === 0) {
      return NextResponse.json(
        { error: "Not found", code: "NO_EVENTS", message: "This wallet has no Moonwell activity on Base." },
        { status: 404 },
      );
    }
    const resolved = resolveFolder(answer.grouped, answer.kept, { event, folder });
    if (!resolved.ok) {
      return NextResponse.json({ error: "Not found", code: resolved.code, message: resolved.message }, { status: 404 });
    }
    return NextResponse.json(
      toTimelineWire(
        { wallet: wallet.toLowerCase(), folder: resolved.folder, events: resolved.members },
        BASE_CHAIN_ID,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Error opening a Moonwell Base timeline folder:", error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
