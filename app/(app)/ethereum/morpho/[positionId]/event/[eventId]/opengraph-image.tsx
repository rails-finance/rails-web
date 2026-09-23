// This event's immutable share card — reads the SAME server tail the
// position page's own `opengraph-image.tsx` reads (`loadMorphoPositionTail`,
// cached per request), finds this id in it, and maps it with the
// family-agnostic `eventCardModel`. No new read path, no per-family card model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (positionId, event
// coordinate) rather than by "the served window" is a later phase.

import { loadMorphoPositionTail } from "@/lib/morpho/position-page-data";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Morpho Blue share card";

// Mirrors the page's own gate: a Morpho position is keyed (market, user), and
// the market half's `0x` is optional — the backend's own `positionId` writes
// it bare.
const POSITION_ID = /^(0x)?[a-fA-F0-9]{64}-0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ positionId: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { positionId, eventId } = await params;
  return eventImage({
    session: "morpho",
    load: async () => {
      if (!POSITION_ID.test(positionId)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadMorphoPositionTail(positionId);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      const user = positionId.slice(positionId.indexOf("-") + 1);
      return eventCardModel(event, { session: "morpho", subject: shortSubject(user) });
    },
  });
}
