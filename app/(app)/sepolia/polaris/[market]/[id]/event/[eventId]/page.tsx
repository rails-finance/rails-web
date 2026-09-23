import type { Metadata } from "next";
import { eventMetadata, decodeEventId, positionMetadata } from "@/lib/shared/page-metadata";
import { normalizeCdpId, normalizeMarket, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { loadPolarisPositionTail } from "@/lib/polaris/position-page-data";
import { polarisPositionHref } from "@/lib/polaris/routes";
import PolarisPositionPage from "../../page";

interface Props {
  params: Promise<{ market: string; id: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the parent
// route renders per request over a `no-store` backend read, so this segment
// does too.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadPolarisPositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
//
// The parent's own gate applies first: a segment that names neither market,
// or an id that is not a number, names no CDP, and the parent page below
// answers `notFound()` for it. Metadata for that case is the parent's own
// position shape for the raw segments — never a throw from here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, id: rawId, eventId } = await params;
  const market = normalizeMarket(rawMarket);
  const id = normalizeCdpId(rawId);
  if (!market || !id) {
    return positionMetadata({
      session: "polaris",
      subject: `#${rawId}`,
      canonicalPath: `/sepolia/polaris/${rawMarket}/${rawId}`,
      image: "dynamic",
    });
  }
  const decoded = decodeEventId(eventId);
  const tail = await loadPolarisPositionTail(market, id);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "polaris",
    subject: `#${id}`,
    market: POLARIS_MARKET_CONFIG[market].stable.symbol,
    canonicalPath: `${polarisPositionHref(market, id)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent CDP page, same params — the nested
// `event/[eventId]` segment sits inside the same `[market]/[id]` layout, so
// `SettleShellMark` and the Sepolia `ChainProvider` (mounted by the
// `/sepolia` segment above both) still wrap it, and `PolarisPositionView`
// (this page's client half) never learns a new prop. It finds out it is on
// an event route from `useParams().eventId` itself, inside
// `ChainTruthTimeline` — see that component's pinned-mode branch. The parent
// takes no `searchParams`, so none are passed. `params` here carries an extra
// `eventId` key the parent's own `Props` type doesn't declare; passing the
// same promise through is still structurally valid (the parent only reads
// `market` and `id` off it).
//
// The Polaris tail is read WHOLE (lib/api/fetch-polaris-timeline.ts: no
// window), so every event of every CDP is among `tl.sortedEvents` and the
// pinned card never misses on a served-window cut the way a windowed family's
// can. A miss here is a fabricated or stale id, and the timeline's own
// not-found notice states that.
export default async function PolarisEventPage({ params }: Props) {
  return PolarisPositionPage({ params });
}
