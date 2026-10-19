// Morpho Blue's timeline head as words (rails-ops decision 0045,
// TO-DO-ui-jobs 367), Ethereum and Base: the past-participle kind, the `t1_*`
// entries of content/morpho/event-prose.yaml. Server-safe.

import type { MorphoEventType } from "@/lib/shared/types/event-shape";
import { MORPHO_WORDS } from "@/lib/morpho/event-templates";

const KIND: Record<MorphoEventType, string> = {
  supply: MORPHO_WORDS.t1_supplied,
  withdraw: MORPHO_WORDS.t1_withdrew,
  borrow: MORPHO_WORDS.t1_borrowed,
  repay: MORPHO_WORDS.t1_repaid,
  supply_collateral: MORPHO_WORDS.t1_added_coll,
  withdraw_collateral: MORPHO_WORDS.t1_withdrew_coll,
  liquidation: MORPHO_WORDS.t1_liquidated,
};

/** The row's past-participle kind: the phone caption and the accessible name
 *  read it too. */
export function morphoT1Kind(eventType: MorphoEventType): string {
  return KIND[eventType];
}

/** The warning spine's leg words: collateral seized, debt cleared. */
export const MORPHO_LEG_WORDS = { seized: MORPHO_WORDS.t1_leg_seized, cleared: MORPHO_WORDS.t1_leg_cleared };
