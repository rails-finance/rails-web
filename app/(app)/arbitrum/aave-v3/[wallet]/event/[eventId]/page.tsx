import type { Metadata } from "next";
import { eventMetadata, decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadAaveV3ArbitrumTail } from "@/lib/aave-v3-arbitrum/position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import { aaveV3EventHeading, aaveV3EventPageDescription } from "@/lib/aave-v3/explorer";
import AaveV3ArbitrumPositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

// The event's own title, from the same cached read the parent page makes; a
// history the server did not read leaves the event-less title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = /^0x[a-fA-F0-9]{40}$/.test(raw) ? await loadAaveV3ArbitrumTail(wallet) : null;
  const rehydrated = tail?.timeline ? (rehydrateChainTimelineWire(tail.timeline) as ChainTimelineResponse) : null;
  const event = rehydrated?.events.filter(isAaveV3Event).find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "aave-v3-arbitrum",
    subject: shortSubject(wallet),
    canonicalPath: `/arbitrum/aave-v3/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: aaveV3EventHeading(event, "arbitrum"), timestamp: event.timestamp } : null,
    description: event ? aaveV3EventPageDescription("Arbitrum", wallet, event.timestamp) : undefined,
  });
}

// The parent position page, same params; the view finds the event from
// `useParams().eventId` and draws the list flat.
export default async function AaveV3ArbitrumEventPage({ params }: Props) {
  return AaveV3ArbitrumPositionPage({ params });
}
