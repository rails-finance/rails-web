// This event's immutable share card — reads the SAME server tail the trove
// page's own `opengraph-image.tsx` reads (`loadTroveTail`, cached per
// request), finds this id in it, and maps it with the family-agnostic
// `eventCardModel`. No new read path, no per-family card model.

import { LIQUITY_V2_BRANCHES } from "@/lib/shared/preferences";
import { loadTroveTail } from "@/lib/liquity/trove-page-data";
import { truncateTroveId } from "@/lib/liquity/share-card";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Liquity V2 share card";

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
    session: "liquity-v2",
    load: async () => {
      if (!(LIQUITY_V2_BRANCHES as readonly string[]).includes(collateralType) || !TROVE_ID.test(troveId)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadTroveTail(collateralType, troveId);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      const collateralDisplay = collateralType === "WETH" ? "ETH" : collateralType;
      return eventCardModel(event, {
        session: "liquity-v2",
        subject: truncateTroveId(troveId),
        market: `${collateralDisplay}/BOLD`,
      });
    },
  });
}
