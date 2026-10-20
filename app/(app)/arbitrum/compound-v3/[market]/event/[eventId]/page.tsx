// The event route from before Arbitrum's Compound pages went per market
// (rails-ops reference/arbitrum-position-first-lane.md). The `market` segment
// here holds the wallet. A 308 to the event's market page where the history
// places it, else to the wallet's overview.

import { notFound, permanentRedirect } from "next/navigation";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { compoundArbitrumMarketOf } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref, compoundArbitrumWalletHref } from "@/lib/compound-arbitrum/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";

interface Props {
  params: Promise<{ market: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export default async function CompoundArbitrumLegacyEventPage({ params }: Props) {
  const { market: raw, eventId } = await params;
  if (!ADDRESS.test(raw)) notFound();
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadCompoundArbitrumTail(wallet);
  const rehydrated = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;
  const event = rehydrated?.events.filter(isCompoundEvent).find((e) => e.id === decoded);
  const market = event ? compoundArbitrumMarketOf(event.context.data.market) : null;
  permanentRedirect(
    market
      ? `${compoundArbitrumMarketHref(market.key, wallet)}/event/${encodeURIComponent(decoded)}`
      : compoundArbitrumWalletHref(wallet),
  );
}
