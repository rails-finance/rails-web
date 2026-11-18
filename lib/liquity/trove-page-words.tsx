import type { Provenance } from "@/components/shared/provenance";
import { troveWords } from "@/lib/liquity/event-templates";
import { liquityV2PriceNote } from "@/lib/liquity-v2/price-notes";

/** The sub-nav price dropdown's receipt for the collateral's price now, in
 *  the words the card and the wallet band use (lib/liquity-v2/price-notes.ts,
 *  ui-jobs 740). */
export function collateralPriceInfo(collType: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: troveWords("price_now_summary", { coll_type: collType, price_note: liquityV2PriceNote(collType) }),
    via: "GET /api/oracle/liquity-v2",
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

/** The dormant (contract: Zombie) flag's tip on the event card's head: fully redeemed, or below the
 *  branch's minimum debt. */
export function zombieTitle(cleared: boolean, minDebt: number, debtSymbol: string): string {
  return cleared
    ? troveWords("zombie_cleared_title")
    : troveWords("zombie_title", { min_debt: minDebt.toLocaleString("en-US"), debt_symbol: debtSymbol });
}

/** The event card's price chip's tip. */
export function eventPriceTitle(collType: string): string {
  return troveWords("event_price_title", { coll_type: collType });
}

/** The word before the last holder of a closed Trove that changed hands, in
 *  the sub-nav (ui-jobs 702). */
export function LastHolderPrefix() {
  return (
    <span className="shrink-0 whitespace-nowrap text-rb-400" title={troveWords("last_holder_hint")}>
      {troveWords("last_holder_prefix")}
    </span>
  );
}

/** A listing row's words for a Trove the wallet searched for held and moved
 *  on: the word before the receiving wallet, and its tip (ui-jobs 705). */
export function movedToWords(day: string): { prefix: string; hint: string } {
  return { prefix: troveWords("moved_to_prefix"), hint: troveWords("moved_to_hint", { day }) };
}
