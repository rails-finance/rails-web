import type { ReactNode } from "react";
import { Icon } from "@/components/icons/icon";

/** The right end of a listing card's heading row (`PositionCardListingSlots.tag`):
 *  only what names the position, its market and/or its ID. The ID is the
 *  bare number after the ID icon, and no asset icon (the headlines carry
 *  those). Every family draws it through here. */
export function ListingTag({ market, id }: { market?: ReactNode; id?: ReactNode }) {
  if (market == null && id == null) return null;
  // Muted, one weight, centred on the row: the icon sits on the number's
  // middle, not its baseline.
  return (
    <span className="inline-flex items-center gap-1.5 text-xs leading-none text-rb-500 tabular-nums">
      {market != null && <span>{market}</span>}
      {id != null && (
        <span className="inline-flex items-center gap-0.5">
          <Icon name="trove-id" size={12} className="block shrink-0" />
          <span className="sr-only">ID </span>
          {id}
        </span>
      )}
    </span>
  );
}
