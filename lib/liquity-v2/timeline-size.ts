// Liquity V2's Size ranges on the position timeline (ui-jobs 752), over
// lib/shared/timeline-size.ts.
//
// A Trove event's figures are the operation's own changes, unsigned:
// `troveOperation.debtChangeFromOperation` in BOLD and
// `collChangeFromOperation` in the branch's collateral. A redemption moves
// debt that no BOLD flow on the row carries, so the flows would understate it.
// An event with no operation (a batch manager's rate change, a transfer)
// moved nothing: 0. The surplus claim row carries its collateral as a flow.
//
// A Stability Pool touch's one figure is its top-up or withdrawal in BOLD.

import { isLiquityEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { flowAmountIn, type TimelineSizeDim } from "@/lib/shared/timeline-size";

/** The sliders' tops: the round numbers above the largest single moves
 *  (2,000,000 BOLD opening the 3.5M rETH Trove; 2,500 rETH beside it). */
const DEBT_TOP = 10_000_000;
const COLL_TOP = 10_000;

/** The branch's collateral as the page names it: WETH reads ETH. */
export function liquityV2CollUnit(branch: string): string {
  return branch.toUpperCase() === "WETH" ? "ETH" : branch;
}

const unsigned = (v: number | undefined): number => (v == null || !Number.isFinite(v) ? 0 : Math.abs(v));

/** Debt and Collateral on a Trove's timeline. */
export function liquityV2TroveSizeDims(branch: string): TimelineSizeDim[] {
  const collSymbols = [branch, liquityV2CollUnit(branch)];
  return [
    {
      side: "debt",
      word: "Debt",
      unit: "BOLD",
      top: DEBT_TOP,
      figure: (e) =>
        isLiquityEvent(e)
          ? unsigned(e.context.data.troveOperation?.debtChangeFromOperation)
          : flowAmountIn(e, ["BOLD"]),
    },
    {
      side: "coll",
      word: "Collateral",
      unit: liquityV2CollUnit(branch),
      top: COLL_TOP,
      figure: (e) =>
        isLiquityEvent(e)
          ? unsigned(e.context.data.troveOperation?.collChangeFromOperation)
          : flowAmountIn(e, collSymbols),
    },
  ];
}

/** A raw 1e18 BOLD integer as a number of BOLD. */
function boldUnits(raw: string | undefined): number | null {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(19, "0");
  return Number(`${digits.slice(0, -18)}.${digits.slice(-18)}`);
}

/** "Deposited (BOLD)" on a Stability Pool deposit's timeline: the touch's
 *  top-up or withdrawal, unsigned. `topUpOf` reads it off the row by event. */
export function liquityV2SpSizeDims(topUpOf: (e: BaseActivityEvent) => string | undefined): TimelineSizeDim[] {
  return [
    {
      side: "coll",
      word: "Deposited",
      unit: "BOLD",
      top: DEBT_TOP,
      figure: (e) => {
        const v = boldUnits(topUpOf(e));
        return v == null ? null : Math.abs(v);
      },
    },
  ];
}
