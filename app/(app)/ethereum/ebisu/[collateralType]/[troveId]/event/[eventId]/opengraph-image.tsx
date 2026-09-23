// This event's immutable share card — reads the SAME server tail the trove
// page's own `opengraph-image.tsx` reads (`loadEbisuTroveTail`, cached per
// request), finds this id in it, and maps it with the family-agnostic
// `eventCardModel`. No new read path, no per-family card model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (branch, id, event
// coordinate) rather than by "the served window" is a later phase.

import { resolveBranch } from "@/lib/ebisu/asset-catalog";
import { loadEbisuTroveTail } from "@/lib/ebisu/trove-page-data";
import { shortId } from "@/lib/ebisu/asset-catalog";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Ebisu share card";

// The page's own gate, applied here BEFORE the tail is read: the loader
// rejects an unknown branch, but a trove id that is not a number would still
// reach the backend. A malformed parameter must cost zero outbound requests
// (scripts/verify/verify-share-abuse.mjs holds the census).
const TROVE_ID = /^\d+$/;

interface Props {
  params: Promise<{ collateralType: string; troveId: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { collateralType, troveId, eventId } = await params;
  return eventImage({
    session: "ebisu",
    load: async () => {
      if (resolveBranch(collateralType) == null || !TROVE_ID.test(troveId)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadEbisuTroveTail(collateralType, troveId);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, {
        session: "ebisu",
        subject: shortId(troveId),
        market: collateralType,
      });
    },
  });
}
