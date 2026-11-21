// The stake timeline's size control: "Staked (LQTY)", each touch's stake or
// unstake, as the deposit's states its top-ups (sp-timeline-size.ts).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineSizeDim } from "@/lib/shared/timeline-size";

const STAKE_TOP = 10_000_000;

/** A raw 1e18 integer as a number of tokens. */
function tokenUnits(raw: string | undefined): number | null {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(19, "0");
  return Number(`${digits.slice(0, -18)}.${digits.slice(-18)}`);
}

export function liquityV1StakeSizeDims(changeOf: (e: BaseActivityEvent) => string | undefined): TimelineSizeDim[] {
  return [
    {
      side: "deposit",
      word: "Staked",
      unit: "LQTY",
      top: STAKE_TOP,
      figure: (e) => {
        const v = tokenUnits(changeOf(e));
        return v == null ? null : Math.abs(v);
      },
    },
  ];
}
