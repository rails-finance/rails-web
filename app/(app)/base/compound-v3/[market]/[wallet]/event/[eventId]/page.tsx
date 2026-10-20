// One event of one Compound V3 position on Base, under its market page. An
// event the history places in another Comet is sent to that Comet's event page.

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { eventMetadata, decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadCompoundBaseTail } from "@/lib/compound-base/position-page-data";
import { compoundBaseMarketOf } from "@/lib/compound-base/asset-catalog";
import { compoundBaseMarketHref } from "@/lib/compound-base/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";
import { compoundEventPageDescription, compoundEventTabWords } from "@/lib/compound/explorer";
import CompoundBaseMarketPage from "../../page";

interface Props {
  params: Promise<{ market: string; wallet: string; eventId: string }>;
}

// Restated (not re-exported; see twitter-image.tsx's header on why Next needs
// the literal declaration in every file that carries it).
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** The event from the same cached read the market page and the share cards
 *  make. `tail.timeline` is present only when the index vouched for the whole
 *  life (lib/shared/swept-position-page-data.ts); a wallet whose history has
 *  to be swept has no server-side event, and this finds none rather than
 *  sweeping the Comets' logs inside a metadata read. */
async function findEvent(raw: string, eventId: string) {
  const decoded = decodeEventId(eventId);
  const tail = ADDRESS.test(raw) ? await loadCompoundBaseTail(raw.toLowerCase()) : null;
  const rehydrated = tail?.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;
  const event = rehydrated?.events.filter(isCompoundEvent).find((e) => e.id === decoded) ?? null;
  return { decoded, event, all: rehydrated?.events ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const market = compoundBaseMarketOf(rawMarket);
  const { decoded, event, all } = await findEvent(raw, eventId);
  return eventMetadata({
    session: "compound-base",
    subject: shortSubject(wallet),
    market: market?.label,
    canonicalPath: `${compoundBaseMarketHref(market?.key ?? rawMarket, wallet)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: compoundEventTabWords(event, "base", all), timestamp: event.timestamp } : null,
    description: event ? compoundEventPageDescription(event, wallet, "base") : undefined,
  });
}

// The market page's server half, same params; its client half reads `eventId`
// from the route and draws the event's card in page mode. A pinned event page
// stays flat (rails-ops decision 0019, leg C note): a grouped answer serves a
// folder's members only when it is opened, and the pinned card must be among
// the served events.
export default async function CompoundBaseEventPage({ params }: Props) {
  const { market: rawMarket, wallet: raw, eventId } = await params;
  const market = compoundBaseMarketOf(rawMarket);
  if (!market || !ADDRESS.test(raw)) notFound();
  const { decoded, event } = await findEvent(raw, eventId);
  const home = event ? compoundBaseMarketOf(event.context.data.market) : null;
  if (home && home.key !== market.key)
    permanentRedirect(`${compoundBaseMarketHref(home.key, raw)}/event/${encodeURIComponent(decoded)}`);
  return CompoundBaseMarketPage({ params, searchParams: Promise.resolve({ folders: "0" }) });
}
