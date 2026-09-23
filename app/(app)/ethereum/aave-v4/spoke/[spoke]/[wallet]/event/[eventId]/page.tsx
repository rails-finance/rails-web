import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
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
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent spoke page, same params — the nested
// `event/[eventId]` segment sits inside the same `[wallet]` layout, so every
// provider still wraps it, and `AaveV4SpokeView` (this page's client half)
// never learns a new prop. It finds out it is on an event route from
// `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same promise
// through is still structurally valid (the parent only reads
// `spoke`/`wallet` off it).
export default async function AaveV4EventPage({ params }: Props) {
  return AaveV4SpokePage({ params });
}
