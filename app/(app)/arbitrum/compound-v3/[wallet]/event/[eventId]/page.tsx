import type { Metadata } from "next";
import { eventMetadata, decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";
import { compoundEventPageDescription, compoundEventTabWords } from "@/lib/compound/explorer";
import CompoundArbitrumWalletPage from "../../page";

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
  const tail = /^0x[a-fA-F0-9]{40}$/.test(raw) ? await loadCompoundArbitrumTail(wallet) : null;
  const rehydrated = tail?.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;
  const event = rehydrated?.events.filter(isCompoundEvent).find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "compound-v3-arbitrum",
    subject: shortSubject(wallet),
    canonicalPath: `/arbitrum/compound-v3/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event
      ? { actionLabel: compoundEventTabWords(event, "arbitrum", rehydrated?.events ?? []), timestamp: event.timestamp }
      : null,
    description: event ? compoundEventPageDescription(event, wallet, "arbitrum") : undefined,
  });
}

// The parent wallet page, same params; the view finds the event from
// `useParams().eventId` and draws the list flat.
export default async function CompoundArbitrumEventPage({ params }: Props) {
  return CompoundArbitrumWalletPage({ params });
}
