// This event's immutable share card — reads the SAME server tail the
// position page's own `opengraph-image.tsx` reads
// (`loadFrankencoinPositionTail`, cached per request), finds this id in it,
// and maps it with the family-agnostic `eventCardModel`. No new read path,
// no per-family card model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (position, event
// coordinate) rather than by "the served window" is a later phase.

import { normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import { loadFrankencoinPositionTail } from "@/lib/frankencoin/position-page-data";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Frankencoin share card";

interface Props {
  params: Promise<{ position: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { position: raw, eventId } = await params;
  return eventImage({
    session: "frankencoin",
    load: async () => {
      const position = normalizePositionAddress(raw ?? "");
      if (!position) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadFrankencoinPositionTail(position);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "frankencoin", subject: shortSubject(position) });
    },
  });
}
