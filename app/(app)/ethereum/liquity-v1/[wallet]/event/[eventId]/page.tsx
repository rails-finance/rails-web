import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadLiquityV1PositionTail } from "@/lib/liquity-v1/position-page-data";
import { liquityV1EventPageDescription } from "@/lib/liquity-v1/explorer";
import LiquityV1TrovePage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the parent
// route renders per request (it also reads `?epoch=`, passed through below),
// so this segment does too.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadLiquityV1PositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request. `?epoch=` is read
// the same way the parent's own `generateMetadata` does — not at all: the
// subject is the wallet, no life is named in either title, and every event
// across this wallet's whole borrowing history is found by id alone below.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const tail = ADDRESS.test(raw) ? await loadLiquityV1PositionTail(raw.toLowerCase()) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "liquity-v1",
    subject: raw,
    canonicalPath: `/ethereum/liquity-v1/${raw}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
    description: event ? liquityV1EventPageDescription(raw, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent Trove page's
// server half, same params and `?epoch=`; its client half
// (`LiquityV1TroveView`) reads `eventId` from the route and draws the sub-nav
// and the event's card in page mode with the shared column
// (`ChainTruthTimeline`'s `eventPage`).
export default async function LiquityV1EventPage({ params, searchParams }: Props) {
  return LiquityV1TrovePage({ params, searchParams });
}
