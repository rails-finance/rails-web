import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { marketOf } from "@/lib/compound/asset-catalog";
import { loadCompoundPositionTail } from "@/lib/compound/position-page-data";
import CompoundPositionPage from "../../page";

interface Props {
  params: Promise<{ market: string; wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadCompoundPositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, wallet: rawWallet, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadCompoundPositionTail(wallet, market);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "compound",
    subject: wallet,
    market: marketOf(market).baseSymbol,
    canonicalPath: `/ethereum/compound-v3/${market}/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[market]/[wallet]`
// layout, so every provider still wraps it, and `CompoundPositionView` (this
// page's client half) never learns a new prop. It finds out it is on an
// event route from `useParams().eventId` itself, inside `ChainTruthTimeline`
// — see that component's pinned-mode branch. `params` here carries an extra
// `eventId` key the parent's own `Props` type doesn't declare; passing the
// same promise through is still structurally valid (the parent only reads
// `market`/`wallet` off it).
export default async function CompoundEventPage({ params }: Props) {
  return CompoundPositionPage({ params });
}
