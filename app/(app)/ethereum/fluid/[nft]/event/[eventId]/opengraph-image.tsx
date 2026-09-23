// This event's immutable share card — reads the SAME server tail the
// position page's own `opengraph-image.tsx` reads (`loadFluidPositionTail`,
// cached per request), finds this id in it, and maps it with the
// family-agnostic `eventCardModel`. No new read path, no per-family card
// model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (nft, event coordinate)
// rather than by "the served window" is a later phase.

import { loadFluidPositionTail } from "@/lib/fluid/position-page-data";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Fluid share card";

// A Fluid position is an ERC-721: its id is a decimal integer, same gate the
// page itself applies.
const NFT_ID = /^\d{1,20}$/;

interface Props {
  params: Promise<{ nft: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { nft, eventId } = await params;
  return eventImage({
    session: "fluid",
    load: async () => {
      if (!NFT_ID.test(nft)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadFluidPositionTail(nft);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "fluid", subject: `#${nft}` });
    },
  });
}
