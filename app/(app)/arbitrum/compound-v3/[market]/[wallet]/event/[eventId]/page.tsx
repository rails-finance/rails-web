// One event of one Compound V3 position on Arbitrum, under its market page
// (rails-ops reference/arbitrum-position-first-lane.md). An event the history
// places in another Comet is sent to that Comet's event page.

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { eventMetadata, decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { compoundArbitrumMarketOf } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumMarketHref } from "@/lib/compound-arbitrum/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";
import { compoundEventPageDescription, compoundEventTabWords } from "@/lib/compound/explorer";
import CompoundArbitrumMarketPage from "../../page";

interface Props {
  params: Promise<{ market: string; wallet: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** The event from the same cached read the market page makes; null where the
 *  history was not read or does not hold it. */
async function findEvent(raw: string, eventId: string) {
  const decoded = decodeEventId(eventId);
  const tail = ADDRESS.test(raw) ? await loadCompoundArbitrumTail(raw.toLowerCase()) : null;
  const rehydrated = tail?.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;
  const event = rehydrated?.events.filter(isCompoundEvent).find((e) => e.id === decoded) ?? null;
  return { decoded, event, all: rehydrated?.events ?? [] };
}

// The event's own title; a history the server did not read leaves the
// event-less title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const market = compoundArbitrumMarketOf(rawMarket);
  const { decoded, event, all } = await findEvent(raw, eventId);
  return eventMetadata({
    session: "compound-v3-arbitrum",
    subject: shortSubject(wallet),
    market: market?.label,
    canonicalPath: `${compoundArbitrumMarketHref(market?.key ?? rawMarket, wallet)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: compoundEventTabWords(event, "arbitrum", all), timestamp: event.timestamp } : null,
    description: event ? compoundEventPageDescription(event, wallet, "arbitrum") : undefined,
  });
}

// The market page, same params; the view finds the event from
// `useParams().eventId` and draws the list flat.
export default async function CompoundArbitrumEventPage({ params }: Props) {
  const { market: rawMarket, wallet: raw, eventId } = await params;
  const market = compoundArbitrumMarketOf(rawMarket);
  if (!market || !ADDRESS.test(raw)) notFound();
  const { decoded, event } = await findEvent(raw, eventId);
  const home = event ? compoundArbitrumMarketOf(event.context.data.market) : null;
  if (home && home.key !== market.key)
    permanentRedirect(`${compoundArbitrumMarketHref(home.key, raw)}/event/${encodeURIComponent(decoded)}`);
  return CompoundArbitrumMarketPage({ params });
}
