import type { ReactNode } from "react";
import { Icon } from "@/components/icons/icon";
import { listingTagId, spacePair } from "@/lib/shared/position-name";

/** The right end of a listing card's heading row (`PositionCardListingSlots.tag`):
 *  only what names the position, its market and/or its ID. The ID is the
 *  bare number after the ID icon, and no asset icon (the headlines carry
 *  those). Every family draws it through here. A text market and id take the
 *  position name's forms (lib/shared/position-name.ts, ui-jobs 703): a pair
 *  spaced "A / B", the id through the shared shortener without the "#" the
 *  icon stands for. */
export function ListingTag({ market, id }: { market?: ReactNode; id?: ReactNode }) {
  if (market == null && id == null) return null;
  const marketText = typeof market === "string" ? spacePair(market) : market;
  const idText = typeof id === "string" || typeof id === "number" ? listingTagId(id) : id;
  // Muted, one weight, centred on the row: the icon sits on the number's
  // middle, not its baseline.
  return (
    <span className="inline-flex items-center gap-1.5 text-xs leading-none text-rb-500 tabular-nums">
      {marketText != null && <span>{marketText}</span>}
      {id != null && (
        <span className="inline-flex items-center gap-0.5">
          <Icon name="trove-id" size={12} className="block shrink-0" />
          <span className="sr-only">ID </span>
          {idText}
        </span>
      )}
    </span>
  );
}
