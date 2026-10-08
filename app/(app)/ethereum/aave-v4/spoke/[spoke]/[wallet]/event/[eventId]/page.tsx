import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { aaveV4EventHeading, aaveV4EventPageDescription } from "@/lib/aave-v4/explorer";
import AaveV4SpokePage from "../../page";

interface Props {
  params: Promise<{ spoke: string; wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadAaveV4SpokeTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spoke: rawSpoke, wallet: rawWallet, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const spokeName = spokeFromSlug(rawSpoke) ?? decodeURIComponent(rawSpoke);
  const tail = ADDRESS.test(rawWallet) ? await loadAaveV4SpokeTail(rawWallet.toLowerCase(), spokeName) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "aave-v4",
    subject: rawWallet,
    market: spokeName,
    canonicalPath: `/ethereum/aave-v4/spoke/${rawSpoke}/${rawWallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: aaveV4EventHeading(event), timestamp: event.timestamp } : null,
    description: event ? aaveV4EventPageDescription(spokeName, rawWallet, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent spoke page's
// server half, same params; its client half (`AaveV4SpokeView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`). The card
// reads the position's history, so the read is the parent's.
export default async function AaveV4EventPage({ params }: Props) {
  return AaveV4SpokePage({ params });
}
