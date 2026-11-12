// The Trove card's heading read-mores (rails-ops decision 0038), from the
// strings file's trove_words, in a branch's symbols. Liquity V2 and its forks
// share the card and the mechanics; the ratio's and the liquidation price's
// tips take each deployment's terms (decision 0065).

import { troveWords } from "@/lib/liquity/event-templates";
import type { LiquityFamilyTerms } from "@/lib/liquity/ltv";

export function troveCardTips(collSymbol: string, debtSymbol: string, terms: LiquityFamilyTerms) {
  const { ltv } = terms;
  // A deployment whose docs name the collateral ratio otherwise than Rails's
  // strings file does: the tip names the docs' terms.
  const ownCr = !ltv && terms.ratio !== "Collateral ratio";
  return {
    heads: {
      collateral: troveWords("card_tip_collateral", { coll_symbol: collSymbol }),
      debt: troveWords("card_tip_debt", { debt_symbol: debtSymbol }),
      "collateral-ratio": ltv
        ? troveWords("card_tip_ltv", { coll_symbol: collSymbol })
        : ownCr
          ? `The ${terms.ratioText}: the collateral's dollar value divided by the debt. Below the ${collSymbol} branch's ${terms.limitText} the Trove can be liquidated.`
          : troveWords("card_tip_cr", { coll_symbol: collSymbol }),
      "interest-rate": troveWords("card_tip_rate"),
    } as Record<string, string>,
    rows: {
      "debt-in-front": troveWords("card_tip_debt_in_front", { coll_symbol: collSymbol, debt_symbol: debtSymbol }),
      "troves-in-front": troveWords("card_tip_troves_in_front", { coll_symbol: collSymbol }),
      costs: troveWords("card_tip_costs"),
      "liquidates-at": ownCr
        ? `The ${collSymbol} price at which the Trove's ${terms.ratioText} meets the branch's ${terms.limitText}: the debt times the ${terms.limitText}, divided by the collateral.`
        : troveWords(ltv ? "card_tip_liquidates_at_ltv" : "card_tip_liquidates_at", { coll_symbol: collSymbol }),
    } as Record<string, string>,
  };
}
