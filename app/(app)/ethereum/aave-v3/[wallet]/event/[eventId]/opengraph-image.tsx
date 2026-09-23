// This event's immutable share card — reads the SAME server tail the position
// page's own `opengraph-image.tsx` reads (`loadAaveV3PositionTail`, cached
// per request), finds this id in it, and maps it with the family-agnostic
// `eventCardModel`. No new read path, no per-family card model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (wallet, market, event
// coordinate) rather than by "the served window" is a later phase.

import { asV3Market } from "@/lib/aave-v3/asset-catalog";
import { loadAaveV3PositionTail } from "@/lib/aave-v3/position-page-data";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Aave V3 share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  return eventImage({
    session: "aave-v3",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const decoded = decodeEventId(eventId);
      // A plain `/…/event/<id>` unfurl carries no `?market=` — Core is what
      // that link means, the same rule the position card's own image takes.
      const tail = await loadAaveV3PositionTail(wallet, asV3Market(null));
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "aave-v3", subject: shortSubject(wallet) });
    },
  });
}
