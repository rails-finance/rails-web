// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half reads `eventId` from the route and
// draws the sub-nav and the event's card in page mode with the shared column
// (`ChainTruthTimeline`'s `eventPage`). The card reads the position's history,
// so the read is the parent's.
import type { Metadata } from "next";
import { decodeEventId, eventMetadata } from "@/lib/shared/page-metadata";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { skyPositionHref } from "@/lib/sky-savings/constants";
import { skySavingsEventPageDescription, skySavingsEventPageTitle } from "@/lib/sky-savings/explorer";
import { loadSkyPosition } from "@/lib/sky-savings/position-page-data";
import SkySavingsPositionPage from "../../page";

interface Props {
  params: Promise<{ holder: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { holder, eventId } = await params;
  const h = decodeURIComponent(holder).toLowerCase();
  const address = /^0x[0-9a-f]{40}$/.test(h);
  const decoded = decodeEventId(eventId);
  // The position page below reads the same `cache()` entry, so the request
  // makes one set of reads.
  const data = address ? await loadSkyPosition(h).catch(() => null) : null;
  const event = data?.timeline.events.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "sky-savings",
    subject: address ? shortAddress(h) : h,
    canonicalPath: `${skyPositionHref(h)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: skySavingsEventPageTitle(event), timestamp: event.timestamp } : null,
    description: event ? skySavingsEventPageDescription(h, event.timestamp) : undefined,
    image: "explorer",
  });
}

export default async function SkySavingsEventPage({ params }: Props) {
  const { holder } = await params;
  return SkySavingsPositionPage({ params: Promise.resolve({ holder }) });
}
