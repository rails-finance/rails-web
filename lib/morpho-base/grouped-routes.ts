// SERVER-ONLY — the grouped halves of `/api/chain/morpho-base/timeline`:
// `?group=1&market=` (one position's preload), `&from=&to=` (a month of it),
// and `…/timeline/folder`, which opens one folder of either answer.

import { NextResponse } from "next/server";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { resolveFolder } from "@/lib/shared/timeline-grouping";
import { toGroupedTimelineWire, toTimelineWire } from "@/lib/shared/timeline-wire";
import { spanParam } from "@/lib/shared/replay-grouped-answer";
import { isMorphoBaseMarketSegment } from "@/lib/morpho-base/routes";
import { MORPHO_BASE_DEPLOY_BLOCK } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { morphoBaseGroupedBody, readGroupedMorphoBase } from "@/lib/morpho-base/timeline-folders";

const INDEX = { deployment: MORPHO_BASE_DEPLOYMENT, deployBlock: MORPHO_BASE_DEPLOY_BLOCK };

/** `market` is a Morpho market id; a position is one market, so it is
 *  required. */
function marketParam(params: URLSearchParams): { ok: true; market: string } | { ok: false; message: string } {
  const market = params.get("market")?.toLowerCase();
  return isMorphoBaseMarketSegment(market)
    ? { ok: true, market }
    : { ok: false, message: "market is required: a position is one market, named by its 32-byte id" };
}

/**
 * The grouped answer, or null when the index cannot vouch for this history
 * and the caller serves the flat one (which sweeps). A malformed span or a
 * missing market is a 400.
 */
export async function groupedMorphoBaseTimeline(
  wallet: string,
  params: URLSearchParams,
  readerIp: string | undefined,
  cacheControl: string,
): Promise<NextResponse | null> {
  const sp = spanParam(params);
  if (!sp.ok) return NextResponse.json({ error: sp.message }, { status: 400 });
  const mp = marketParam(params);
  if (!mp.ok) return NextResponse.json({ error: mp.message }, { status: 400 });
  const read = await readGroupedMorphoBase({ wallet, ...INDEX }, mp.market, readerIp, { span: sp.span }).catch(
    (e: unknown) => {
      console.error("Morpho Blue Base grouped read failed, answering flat instead:", e);
      return null;
    },
  );
  if (read?.kind !== "grouped") return null;
  const body = morphoBaseGroupedBody(read.answer);
  // The preload travels as the per-position shape the page's rehydrator
  // reads; a month is the flat rows the segment hook reads.
  const wire = "positions" in body ? toGroupedTimelineWire(body, BASE_CHAIN_ID) : toTimelineWire(body, BASE_CHAIN_ID);
  return NextResponse.json(wire, { headers: { "Cache-Control": cacheControl } });
}

/** `/timeline/folder`: `?event=` is an event key, the durable form a permalink
 *  carries; `?folder=` is the response-scoped id of a folder the reader
 *  clicked; `&from=&to=` names the month answer the folder came in. A refusal
 *  is a stated code and sentence, never an empty list. */
export async function morphoBaseFolder(params: URLSearchParams, readerIp: string | undefined): Promise<NextResponse> {
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

  try {
    const read = await readGroupedMorphoBase({ wallet, ...INDEX }, mp.market, readerIp, {
      span: sp.span,
      preferRemembered: true,
    });
    if (read.kind !== "grouped") {
      return NextResponse.json(
        {
          error: "Not grouped",
          code: "UNKNOWN_FOLDER",
          message:
            "Rails' index cannot vouch for this wallet's whole Morpho Blue Base history right now, so its timeline is not served in folders and there is no folder to open.",
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
          message: "This position has no Morpho Blue Base activity in this answer.",
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
    console.error("Error opening a Morpho Blue Base timeline folder:", error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
