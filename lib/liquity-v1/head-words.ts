// Liquity V1's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367): the past-participle kind, then at most one present-tense clause for
// what the spine cannot show, after a middle dot. The words are the `t1_*`
// entries under `words` in content/liquity-v1/event-prose.yaml.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import { V1_WORDS } from "@/lib/liquity-v1/event-templates";
import { redemptionSplit, sidesOf } from "@/lib/liquity-v1/event-figures";
import { COLLATERAL_SYMBOL } from "@/lib/liquity-v1/asset-catalog";

/** A figure below this reads as zero (event-figures' own floor). */
const EPS = 1e-9;

/** One clause after the kind: words, or the one figure the head states, a
 *  full redemption's surplus the owner can claim (decision 0045's
 *  exception, ruled for V1 on 19 Oct 2026). `claimedAt` undefined: still
 *  claimable; null or a timestamp: claimed, dated where the claim is. */
export type LiquityV1T1Clause =
  | { text: string }
  | { surplus: number; symbol: string; word: string; claimedAt?: number | null };

export interface LiquityV1T1Words {
  kind: string;
  clauses: LiquityV1T1Clause[];
}

export interface LiquityV1T1Options {
  /** The surplus a full redemption left has since been claimed (the page's
   *  CollSurplusPool read, `useSurplusClaimFor`). */
  surplusClaimed?: { timestamp?: number | null } | null;
}

/** The clause's words, for the caption and the accessible name. */
export function liquityV1ClauseText(c: LiquityV1T1Clause): string {
  return "text" in c ? c.text : `${c.surplus.toFixed(4)} ${c.symbol} ${c.word}`;
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
export function liquityV1T1Words(ctx: LiquityV1Context, opts: LiquityV1T1Options = {}): LiquityV1T1Words {
  switch (ctx.eventType) {
    case "openTrove":
      return { kind: V1_WORDS.t1_opened, clauses: [] };
    case "closeTrove":
      return { kind: V1_WORDS.t1_closed, clauses: [] };
    case "adjustTrove":
      return { kind: adjustLegs(ctx) ?? V1_WORDS.t1_adjusted, clauses: [] };
    case "redemption": {
      // A full redemption closes the Trove. The surplus it leaves is the
      // sheet's Surplus row, the Explanation's, and the head's one figure: the
      // owner has to claim it. The spine draws none of it: its nodes are what
      // the redeemer ordered, not what the order left behind.
      const split = redemptionSplit(ctx);
      if (!split?.full) return { kind: V1_WORDS.t1_redeemed, clauses: [{ text: V1_WORDS.t1_coll_debt_reduced }] };
      if (!(split.ethSurplus > 0)) return { kind: V1_WORDS.t1_redeemed, clauses: [{ text: V1_WORDS.t1_trove_closed }] };
      const claimed = opts.surplusClaimed;
      return {
        kind: V1_WORDS.t1_redeemed,
        clauses: [
          {
            surplus: split.ethSurplus,
            symbol: COLLATERAL_SYMBOL,
            word: claimed ? V1_WORDS.t1_surplus_claimed : V1_WORDS.t1_claimable,
            claimedAt: claimed ? (claimed.timestamp ?? null) : undefined,
          },
        ],
      };
    }
    case "liquidation":
      return { kind: V1_WORDS.t1_liquidated, clauses: [] };
  }
}

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Redeemed · 2.9200 ETH claimable". */
export function liquityV1T1Caption(words: LiquityV1T1Words): string {
  return [words.kind, ...words.clauses.map(liquityV1ClauseText)].filter(Boolean).join(` ${V1_WORDS.t1_sep} `);
}
