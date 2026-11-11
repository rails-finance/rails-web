import { NextRequest, NextResponse } from "next/server";
import { fetchIndexCoverage } from "@/lib/api/fetch-index";
import { blockTimestamps } from "@/lib/sources/chain/block-timestamps";
import { PROTOCOLS } from "@/lib/shared/protocols";

// The start date of a "from-date" explorer's index (rails-ops decision 0063),
// for its history tag (components/shared/history-tag.tsx): the index's start
// block from rails-server's coverage route, then that block's time from the
// server's stored block times or the chain (lib/sources/chain/block-timestamps.ts).
// The coverage answer names no time. `time` is null where either read fails,
// and the tag then names no date. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const p = PROTOCOLS.find((x) => x.id === id);
  if (!p || p.history !== "from-date")
    return NextResponse.json(
      { error: "the roster id of an explorer indexed from a start date is required" },
      { status: 400 },
    );
  const coverage = await fetchIndexCoverage(p.protocolKey ?? p.id, p.chainId);
  const startBlock = coverage.kind === "ok" ? coverage.data.startBlock : null;
  const time = startBlock != null ? ((await blockTimestamps(p.chainId, [startBlock])).get(startBlock) ?? null) : null;
  return NextResponse.json(
    { id: p.id, startBlock, time },
    { headers: { "cache-control": time != null ? "public, max-age=600, s-maxage=600" : "no-store" } },
  );
}
