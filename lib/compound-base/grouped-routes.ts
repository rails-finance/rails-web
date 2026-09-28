// SERVER-ONLY — the grouped halves of `/api/chain/compound-base/timeline`:
// `?group=1` (the preload), `&market=&from=&to=` (a month of one market), and
// `…/timeline/folder`, which opens one folder of either answer.

import { NextResponse } from "next/server";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { resolveFolder } from "@/lib/shared/timeline-grouping";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { spanParam } from "@/lib/shared/replay-grouped-answer";
import { COMPOUND_BASE_DEPLOYMENT, COMPOUND_BASE_DEPLOY_BLOCK } from "@/lib/compound-base/asset-catalog";
import { compoundBaseGroupedBody, readGroupedCompoundBase } from "@/lib/compound-base/timeline-folders";

const INDEX = {
  deployment: COMPOUND_BASE_DEPLOYMENT,
  apiPrefix: "/api/compound-base",
  deployBlock: COMPOUND_BASE_DEPLOY_BLOCK,
};

/** `market` names a Comet of the roster, or is absent; anything else is a
 *  400 the route states. */
function marketParam(params: URLSearchParams): { ok: true; market: string | null } | { ok: false; message: string } {
  const market = params.get("market");
  if (market == null) return { ok: true, market: null };
  return COMPOUND_BASE_DEPLOYMENT.markets.some((m) => m.key === market)
    ? { ok: true, market }
    : { ok: false, message: "market must name a Comet on Base" };
}

/**
 * The grouped answer, or null when the index cannot vouch for this history
 * and the caller serves the flat one (which sweeps). A malformed span or
 * market is a 400, and so is a span without its market.
 */
export async function groupedCompoundBaseTimeline(
  wallet: string,
  params: URLSearchParams,
  readerIp: string | undefined,
  cacheControl: string,
): Promise<NextResponse | null> {
  const sp = spanParam(params);
  if (!sp.ok) return NextResponse.json({ error: sp.message }, { status: 400 });
  const mp = marketParam(params);
  if (!mp.ok) return NextResponse.json({ error: mp.message }, { status: 400 });
  if (sp.span && !mp.market)
    return NextResponse.json({ error: "a month is read one market at a time: market is required" }, { status: 400 });
  const read = await readGroupedCompoundBase({ wallet, ...INDEX }, readerIp, {
    span: sp.span,
    market: mp.market,
  }).catch((e: unknown) => {
    console.error("Compound V3 Base grouped read failed, answering flat instead:", e);
    return null;
  });
  if (read?.kind !== "grouped") return null;
  return NextResponse.json(toTimelineWire(compoundBaseGroupedBody(read.answer), BASE_CHAIN_ID), {
    headers: { "Cache-Control": cacheControl },
  });
}

/** `/timeline/folder`: `?event=` is an event key, the durable form a permalink
 *  carries; `?folder=` is the response-scoped id of a folder the reader
 *  clicked; `&market=&from=&to=` names the month answer the folder came in. A
 *  refusal is a stated code and sentence, never an empty list. */
export async function compoundBaseFolder(params: URLSearchParams, readerIp: string | undefined): Promise<NextResponse> {
  const wallet = params.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet))
    return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  const event = params.get("event");
  const folder = params.get("folder");
  if (!event && !folder) return NextResponse.json({ error: "event or folder is required" }, { status: 400 });
  const sp = spanParam(params);
  if (!sp.ok) return NextResponse.json({ error: sp.message }, { status: 400 });
  const mp = marketParam(params);
  if (!mp.ok) return NextResponse.json({ error: mp.message }, { status: 400 });
  if (sp.span && !mp.market)
    return NextResponse.json({ error: "a month is read one market at a time: market is required" }, { status: 400 });

  try {
    const read = await readGroupedCompoundBase({ wallet, ...INDEX }, readerIp, {
      span: sp.span,
      market: mp.market,
      preferRemembered: true,
    });
    if (read.kind !== "grouped") {
      return NextResponse.json(
        {
          error: "Not grouped",
          code: "UNKNOWN_FOLDER",
          message:
            "Rails' index cannot vouch for this wallet's whole Compound V3 Base history right now, so its timeline is not served in folders and there is no folder to open.",
        },
        { status: 404 },
      );
    }
    const { answer } = read;
    if (answer.grouped.rows.length === 0) {
      return NextResponse.json(
        {
          error: "Not found",
          code: "NO_EVENTS",
          message: "This wallet has no Compound V3 Base activity in this answer.",
        },
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
    console.error("Error opening a Compound V3 Base timeline folder:", error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
