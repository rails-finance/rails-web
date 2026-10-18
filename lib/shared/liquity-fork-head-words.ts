// The Liquity V2 forks' timeline head as words (Ebisu, Asymmetry, Basedollar;
// rails-ops decision 0045, TO-DO-ui-jobs 367): the past-participle kind, then
// at most one present-tense clause for what the spine cannot show, each after
// a middle dot. The forks run Liquity V2's contracts and call the position a
// Trove, so the words are Liquity V2's t1 entries under `L1_words` in
// content/liquity-v2/event-prose.yaml.

import { L1_WORDS } from "@/lib/liquity/event-templates";
import { getForkBatchManagerName } from "@/lib/shared/fork-batch-managers";
import { FORK_DEBT_DUST_FLOAT, forkCollMove, forkDebtMove } from "@/lib/shared/liquity-fork-ops";
import type { AsymmetryContext, BasedollarContext, EbisuContext } from "@/lib/shared/types/event-shape";

type ForkContext = EbisuContext | AsymmetryContext | BasedollarContext;

/** A clause after the kind: words (`zombie` carries the zombie tip, `cleared`
 *  where the debt reached zero), the delegate named after `lead`, or a
 *  liquidation's surplus. */
export type LiquityForkT1Clause =
  | { text: string; zombie?: boolean; cleared?: boolean }
  | { lead: string; delegate: string; address: string }
  | { surplus: number; symbol: string; word: string; claimedAt?: number | null };

export interface LiquityForkT1Words {
  /** Empty where the clause carries the act (a join reads "Rate to …"). */
  kind: string;
  clauses: LiquityForkT1Clause[];
}

/** An adjust's legs as participles, in the order they run: what goes into the
 *  Trove before what comes out, the collateral first where both go one way
 *  (rails-ops reference/shared-event-card-spec.md, "Spine order"). */
function adjustLegs(ctx: ForkContext): string | null {
  const coll = forkCollMove(ctx);
  const debt = forkDebtMove(ctx).value;
  const hasColl = coll !== 0;
  const hasDebt = Math.abs(debt) >= FORK_DEBT_DUST_FLOAT;
  if (!hasColl && !hasDebt) return null;
  const c = coll > 0 ? L1_WORDS.t1_added_coll : L1_WORDS.t1_withdrew_coll;
  const d = debt > 0 ? L1_WORDS.t1_borrowed : L1_WORDS.t1_repaid;
  if (!hasDebt) return c;
  if (!hasColl) return d;
  // A repayment goes in and a withdrawal comes out: the repayment first.
  return debt < 0 && coll < 0 ? `${d} ${L1_WORDS.t1_sep} ${c}` : `${c} ${L1_WORDS.t1_sep} ${d}`;
}

/** The timeline head's words. `noChange`: the transform's zero-delta adjust.
 *  `minDebt`: the branch minimum, under which a redemption leaves a zombie.
 *  `surplusClaimed`: the liquidation's surplus has since been claimed. */
export function liquityForkT1Words(
  ctx: ForkContext,
  opts: {
    noChange?: boolean;
    minDebt?: number;
    surplusClaimed?: { timestamp?: number | null } | null;
  } = {},
): LiquityForkT1Words {
  const delegate = (): LiquityForkT1Clause[] =>
    ctx.batchManager
      ? [
          {
            lead: L1_WORDS.t1_rate_to,
            delegate:
              getForkBatchManagerName(ctx.batchManager) ??
              `${ctx.batchManager.slice(0, 6)}…${ctx.batchManager.slice(-4)}`,
            address: ctx.batchManager,
          },
        ]
      : [];
  switch (ctx.eventType) {
    case "openTrove":
      return { kind: L1_WORDS.t1_opened, clauses: [] };
    case "openTroveAndJoinBatch":
      return { kind: L1_WORDS.t1_opened, clauses: delegate() };
    case "closeTrove":
      return { kind: L1_WORDS.t1_closed, clauses: [] };
    case "adjustTrove":
      if (opts.noChange) return { kind: L1_WORDS.no_change, clauses: [] };
      return { kind: adjustLegs(ctx) ?? L1_WORDS.t1_adjusted, clauses: [] };
    case "adjustTroveInterestRate":
    case "setBatchManagerAnnualInterestRate":
      return { kind: L1_WORDS.t1_adjusted_rate, clauses: [] };
    case "lowerBatchManagerAnnualFee":
      return { kind: L1_WORDS.t1_lowered_fee, clauses: [] };
    case "setInterestBatchManager": {
      const c = delegate();
      return c.length ? { kind: "", clauses: c } : { kind: L1_WORDS.t1_adjusted_rate, clauses: [] };
    }
    case "removeFromBatch":
      return { kind: L1_WORDS.t1_ended_delegation, clauses: [] };
    case "applyPendingDebt":
      return { kind: L1_WORDS.t1_interest_applied, clauses: [] };
    case "liquidate": {
      const surplus = Number(ctx.liquidation?.collSurplus ?? 0);
      if (!(surplus > 0)) return { kind: L1_WORDS.liquidated, clauses: [] };
      const claimed = opts.surplusClaimed;
      return {
        kind: L1_WORDS.liquidated,
        clauses: [
          {
            surplus,
            symbol: ctx.collateralSymbol,
            word: claimed ? L1_WORDS.t1_surplus_claimed : L1_WORDS.claimable,
            claimedAt: claimed ? (claimed.timestamp ?? null) : undefined,
          },
        ],
      };
    }
    case "redeemCollateral": {
      const debtAfter = Number(ctx.debtAfter);
      const zombie = opts.minDebt != null && Number.isFinite(debtAfter) && debtAfter < opts.minDebt;
      return {
        kind: L1_WORDS.redeemed,
        clauses: zombie
          ? [
              { text: L1_WORDS.t1_coll_reduced },
              { text: L1_WORDS.t1_debt_below_min, zombie: true, cleared: debtAfter < FORK_DEBT_DUST_FLOAT },
            ]
          : [{ text: L1_WORDS.t1_coll_debt_reduced }],
      };
    }
    default:
      return { kind: L1_WORDS.t1_adjusted, clauses: [] };
  }
}
