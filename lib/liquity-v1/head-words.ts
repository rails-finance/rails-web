// Liquity V1's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367): the past-participle kind, then at most one present-tense clause for
// what the spine cannot show, after a middle dot. The words are the `t1_*`
// entries under `words` in content/liquity-v1/event-prose.yaml.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import { V1_WORDS } from "@/lib/liquity-v1/event-templates";
import { redemptionSplit, sidesOf } from "@/lib/liquity-v1/event-figures";

/** A figure below this reads as zero (event-figures' own floor). */
const EPS = 1e-9;

export interface LiquityV1T1Words {
  kind: string;
  clauses: string[];
}

/** An adjust's legs in the order they run: what goes into the Trove before
 *  what comes out, the collateral first where both go one way (rails-ops
 *  reference/shared-event-card-spec.md, "Spine order"). */
function adjustLegs(ctx: LiquityV1Context): string | null {
  const s = sidesOf(ctx);
  const hasColl = Math.abs(s.collDelta) > EPS;
  const hasDebt = Math.abs(s.debtDelta) > EPS;
  if (!hasColl && !hasDebt) return null;
  const c = s.collDelta > 0 ? V1_WORDS.t1_added_coll : V1_WORDS.t1_withdrew_coll;
  const d = s.debtDelta > 0 ? V1_WORDS.t1_borrowed : V1_WORDS.t1_repaid;
  if (!hasDebt) return c;
  if (!hasColl) return d;
  // A repayment goes in and a withdrawal comes out: the repayment first.
  return s.debtDelta < 0 && s.collDelta < 0 ? `${d} ${V1_WORDS.t1_sep} ${c}` : `${c} ${V1_WORDS.t1_sep} ${d}`;
}

/** The timeline head's words. */
export function liquityV1T1Words(ctx: LiquityV1Context): LiquityV1T1Words {
  switch (ctx.eventType) {
    case "openTrove":
      return { kind: V1_WORDS.t1_opened, clauses: [] };
    case "closeTrove":
      return { kind: V1_WORDS.t1_closed, clauses: [] };
    case "adjustTrove":
      return { kind: adjustLegs(ctx) ?? V1_WORDS.t1_adjusted, clauses: [] };
    case "redemption":
      // A full redemption closes the Trove; its surplus is the spine's locked
      // node, the sheet's Surplus row and the Explanation's.
      return {
        kind: V1_WORDS.t1_redeemed,
        clauses: [redemptionSplit(ctx)?.full ? V1_WORDS.t1_trove_closed : V1_WORDS.t1_coll_debt_reduced],
      };
    case "liquidation":
      return { kind: V1_WORDS.t1_liquidated, clauses: [] };
  }
}

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Redeemed · Trove closed". */
export function liquityV1T1Caption(words: LiquityV1T1Words): string {
  return [words.kind, ...words.clauses].filter(Boolean).join(` ${V1_WORDS.t1_sep} `);
}
