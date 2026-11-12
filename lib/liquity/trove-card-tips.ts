// The Trove card's heading read-mores (rails-ops decision 0038), from the
// strings file's trove_words, in a branch's symbols. Liquity V2 and its forks
// share the card and the mechanics; the ratio's and the liquidation price's
// tips take each deployment's terms (decision 0065). A shut-down branch's
// Trove takes the `_shutdown` set.

import { troveWords } from "@/lib/liquity/event-templates";
import type { LiquityFamilyTerms } from "@/lib/liquity/ltv";

export function troveCardTips(collSymbol: string, debtSymbol: string, terms: LiquityFamilyTerms, shutDown = false) {
  // A collateral-ratio deployment (Ebisu) names its docs' terms.
  const { ltv } = terms;
  // An open Trove on a shut-down branch keeps these four heads (ui-jobs 612);
  // each tip says what holds in that state.
  if (shutDown)
    return {
      heads: {
        collateral: troveWords("card_tip_collateral_shutdown", { coll_symbol: collSymbol }),
        debt: troveWords("card_tip_debt_shutdown", { debt_symbol: debtSymbol }),
        "collateral-ratio": ltv
          ? troveWords("card_tip_ltv_shutdown")
          : troveWords("card_tip_cr_shutdown", { ratio_text: terms.ratioText }),
        "interest-rate": troveWords("card_tip_rate_shutdown"),
      } as Record<string, string>,
      rows: {} as Record<string, string>,
    };
  return {
    heads: {
      collateral: troveWords("card_tip_collateral", { coll_symbol: collSymbol }),
      debt: troveWords("card_tip_debt", { debt_symbol: debtSymbol }),
      "collateral-ratio": ltv
        ? troveWords("card_tip_ltv", { coll_symbol: collSymbol })
        : troveWords("card_tip_cr", {
            coll_symbol: collSymbol,
            ratio_text: terms.ratioText,
            limit_text: terms.limitText,
          }),
      "interest-rate": troveWords("card_tip_rate"),
    } as Record<string, string>,
    rows: {
      "debt-in-front": troveWords("card_tip_debt_in_front", { coll_symbol: collSymbol, debt_symbol: debtSymbol }),
      "troves-in-front": troveWords("card_tip_troves_in_front", { coll_symbol: collSymbol }),
      costs: troveWords("card_tip_costs"),
      "liquidates-at": ltv
        ? troveWords("card_tip_liquidates_at_ltv", { coll_symbol: collSymbol })
        : troveWords("card_tip_liquidates_at", {
            coll_symbol: collSymbol,
            ratio_text: terms.ratioText,
            limit_text: terms.limitText,
            limit_short: terms.limitShort,
          }),
    } as Record<string, string>,
  };
}
