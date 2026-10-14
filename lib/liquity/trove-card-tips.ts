// The Trove card's heading read-mores (rails-ops decision 0038), from the
// strings file's trove_words, in a branch's symbols. Liquity V2 and its forks
// share the card and the mechanics.

import { troveWords } from "@/lib/liquity/event-templates";

export function troveCardTips(collSymbol: string, debtSymbol: string, ltv: boolean) {
  return {
    heads: {
      collateral: troveWords("card_tip_collateral", { coll_symbol: collSymbol }),
      debt: troveWords("card_tip_debt", { debt_symbol: debtSymbol }),
      "collateral-ratio": ltv
        ? troveWords("card_tip_ltv", { coll_symbol: collSymbol })
        : troveWords("card_tip_cr", { coll_symbol: collSymbol }),
      "interest-rate": troveWords("card_tip_rate"),
    } as Record<string, string>,
    rows: {
      "debt-in-front": troveWords("card_tip_debt_in_front", { coll_symbol: collSymbol, debt_symbol: debtSymbol }),
      "troves-in-front": troveWords("card_tip_troves_in_front", { coll_symbol: collSymbol }),
      costs: troveWords("card_tip_costs"),
      "liquidates-at": troveWords("card_tip_liquidates_at", { coll_symbol: collSymbol }),
    } as Record<string, string>,
  };
}
