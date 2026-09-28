// SERVER-ONLY — the grouped halves of the Aave-family Base timeline routes,
// shared by Aave V3 Base and Seamless (one Pool each, the same reader, the same
// replay, the same spec). `app/api/chain/{aave-v3-base,seamless}/timeline`
// answers `?group=1` (and a month, `&from=&to=`) here, and
// `…/timeline/folder` opens one folder of that answer.

import { NextResponse } from "next/server";
import type { ChainId } from "@/lib/shared/chains";
import { resolveFolder } from "@/lib/shared/timeline-grouping";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { replayGroupedBody, spanParam } from "@/lib/shared/replay-grouped-answer";
import { readGroupedAaveV3Base } from "@/lib/aave-v3-base/timeline-folders";

export interface AaveV3BaseLane {
  /** For log lines and refusals: "Aave V3 Base", "Seamless". */
  label: string;
  chainId: ChainId;
  /** rails-server mount, e.g. "/api/seamless". */
  apiPrefix: string;
  deployBlock: number;
}

/**
 * The grouped answer, or null when the index cannot vouch for this history
 * and the caller serves the flat one (which sweeps). A malformed span is a 400.
 */
export async function groupedAaveV3BaseTimeline(
  lane: AaveV3BaseLane,
  wallet: string,
  params: URLSearchParams,
  readerIp: string | undefined,
  cacheControl: string,
): Promise<NextResponse | null> {
  const sp = spanParam(params);
  if (!sp.ok) return NextResponse.json({ error: sp.message }, { status: 400 });
  const read = await readGroupedAaveV3Base(
    { wallet, chainId: lane.chainId, apiPrefix: lane.apiPrefix, deployBlock: lane.deployBlock },
    readerIp,
    { span: sp.span },
  ).catch((e: unknown) => {
    console.error(`${lane.label} grouped read failed, answering flat instead:`, e);
    return null;
  });
  if (read?.kind !== "grouped") return null;
  return NextResponse.json(toTimelineWire(replayGroupedBody(read.answer), lane.chainId), {
    headers: { "Cache-Control": cacheControl },
  });
}

/** `/timeline/folder`: `?event=` is an event key, the durable form a permalink
 *  carries; `?folder=` is the response-scoped id of a folder the reader
 *  clicked; `&from=&to=` names the month answer the folder came in. A refusal
 *  is a stated code and sentence, never an empty list. */
export async function aaveV3BaseFolder(
  lane: AaveV3BaseLane,
  params: URLSearchParams,
  readerIp: string | undefined,
): Promise<NextResponse> {
  const wallet = params.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet))
    return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  const event = params.get("event");
  const folder = params.get("folder");
  if (!event && !folder) return NextResponse.json({ error: "event or folder is required" }, { status: 400 });
  const sp = spanParam(params);
  if (!sp.ok) return NextResponse.json({ error: sp.message }, { status: 400 });

  try {
    const read = await readGroupedAaveV3Base(
      { wallet, chainId: lane.chainId, apiPrefix: lane.apiPrefix, deployBlock: lane.deployBlock },
      readerIp,
      { span: sp.span, preferRemembered: true },
    );
    if (read.kind !== "grouped") {
      return NextResponse.json(
        {
          error: "Not grouped",
          code: "UNKNOWN_FOLDER",
          message: `Rails' index cannot vouch for this wallet's whole ${lane.label} history right now, so its timeline is not served in folders and there is no folder to open.`,
        },
        { status: 404 },
      );
    }
    const { answer } = read;
    if (answer.result.events.length === 0 && answer.grouped.rows.length === 0) {
      return NextResponse.json(
        { error: "Not found", code: "NO_EVENTS", message: `This wallet has no ${lane.label} activity in this answer.` },
        { status: 404 },
      );
    }
    const resolved = resolveFolder(answer.grouped, answer.kept, { event, folder });
    if (!resolved.ok) {
      return NextResponse.json({ error: "Not found", code: resolved.code, message: resolved.message }, { status: 404 });
    }
    return NextResponse.json(
      toTimelineWire({ wallet: wallet.toLowerCase(), folder: resolved.folder, events: resolved.members }, lane.chainId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(`Error opening a ${lane.label} timeline folder:`, error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
