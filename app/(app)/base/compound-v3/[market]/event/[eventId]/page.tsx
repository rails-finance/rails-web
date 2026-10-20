// The event route from before Base's Compound pages went per market. The
// `market` segment here holds the wallet. A 308 to the event's market page:
// the history places the event where the server holds it; otherwise the
// event's own log names its Comet (an event id is `<tx>-<logIndex>-<kind>`,
// and the log's address is the Comet). An event neither places goes to the
// wallet's holder view.

import { notFound, permanentRedirect } from "next/navigation";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { loadCompoundBaseTail } from "@/lib/compound-base/position-page-data";
import {
  COMPOUND_BASE_CHAIN_ID,
  COMPOUND_BASE_DEPLOYMENT,
  compoundBaseMarketOf,
} from "@/lib/compound-base/asset-catalog";
import { compoundBaseMarketHref, compoundBaseWalletHref } from "@/lib/compound-base/routes";
import { chainClient } from "@/lib/sources/chain/rpc";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";

interface Props {
  params: Promise<{ market: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const EVENT_ID = /^(0x[0-9a-fA-F]{64})-(\d+)-/;

/** The Comet whose log the event id names, read from the transaction's
 *  receipt; null where the id has another shape, the read fails, or the log
 *  is no Comet of the roster. */
async function cometOfLog(decoded: string): Promise<string | null> {
  const m = EVENT_ID.exec(decoded);
  if (!m) return null;
  try {
    const receipt = await chainClient(COMPOUND_BASE_CHAIN_ID).getTransactionReceipt({ hash: m[1] as `0x${string}` });
    const log = receipt.logs.find((l) => l.logIndex === Number(m[2]));
    const comet = log?.address.toLowerCase();
    return COMPOUND_BASE_DEPLOYMENT.markets.find((c) => c.comet === comet)?.key ?? null;
  } catch (err) {
    console.error("compound-v3-base legacy event route: receipt read failed", err);
    return null;
  }
}

export default async function CompoundBaseLegacyEventPage({ params }: Props) {
  const { market: raw, eventId } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadCompoundBaseTail(wallet);
  const rehydrated = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;
  const event = rehydrated?.events.filter(isCompoundEvent).find((e) => e.id === decoded);
  const key = event ? event.context.data.market : await cometOfLog(decoded);
  const market = key ? compoundBaseMarketOf(key) : null;
  permanentRedirect(
    market
      ? `${compoundBaseMarketHref(market.key, wallet)}/event/${encodeURIComponent(decoded)}`
      : compoundBaseWalletHref(wallet),
  );
}
