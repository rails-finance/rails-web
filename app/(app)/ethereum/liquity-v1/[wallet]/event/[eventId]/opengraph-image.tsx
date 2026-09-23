// This event's immutable share card — reads the SAME server tail the Trove
// page's own `opengraph-image.tsx` reads (`loadLiquityV1PositionTail`,
// cached per request), finds this id in it, and maps it with the
// family-agnostic `eventCardModel`. No new read path, no per-family card model.
//
// The route's `?epoch=` search param is not available here — Next's image
// file convention hands its handler only `{ params }` — but that's moot for
// an event lookup: `tail.events` covers every life this wallet has borrowed
// through, and the event is found by its own id, not by which life is
// "current".
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (wallet, event coordinate)
// rather than by "the served window" is a later phase.

import { loadLiquityV1PositionTail } from "@/lib/liquity-v1/position-page-data";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Liquity V1 share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  return eventImage({
    session: "liquity-v1",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadLiquityV1PositionTail(wallet);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "liquity-v1", subject: shortSubject(wallet) });
    },
  });
}
