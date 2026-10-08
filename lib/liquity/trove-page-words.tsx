import type { Provenance } from "@/components/shared/provenance";
import { troveWords } from "@/lib/liquity/event-templates";

/** The sub-nav price dropdown's receipt for the collateral's price now. */
export function collateralPriceInfo(collType: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: troveWords("price_now_summary", { coll_type: collType }),
    via: troveWords("price_now_via"),
  };
}

/** The receipt for the price a closed Trove's closing row carries. */
export function closingPriceInfo(collType: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: troveWords("price_closing_summary", { coll_type: collType }),
    via: troveWords("price_closing_via"),
  };
}

/** The event card's price chip's tip. */
export function eventPriceTitle(collType: string): string {
  return troveWords("event_price_title", { coll_type: collType });
}

/** The word before a closed Trove's last owner in the sub-nav. */
export function LastOwnerPrefix() {
  return (
    <span className="shrink-0 whitespace-nowrap text-rb-400" title={troveWords("last_owner_hint")}>
      {troveWords("last_owner")}
    </span>
  );
}
