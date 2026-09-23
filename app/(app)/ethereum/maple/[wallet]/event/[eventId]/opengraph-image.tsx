// This event's immutable share card — reads the SAME server tail the
// position page's own `opengraph-image.tsx` reads (`loadMaplePositionTail`,
// cached per request), finds this id in it, and maps it with the
// family-agnostic `eventCardModel`. No new read path, no per-family card
// model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (wallet, event coordinate)
// rather than by "the served window" is a later phase.

import { getCcipEscrow } from "@/lib/shared/known-infrastructure";
import { loadMaplePositionTail } from "@/lib/maple/position-page-data";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Maple share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  return eventImage({
    session: "maple",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      // The CCIP bridge escrows are not lenders — the backend holds no roster
      // row for them, and the page renders a custody view instead. Mirrors
      // the page's own gate exactly.
      if (getCcipEscrow(wallet)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadMaplePositionTail(wallet);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "maple", subject: shortSubject(wallet) });
    },
  });
}
