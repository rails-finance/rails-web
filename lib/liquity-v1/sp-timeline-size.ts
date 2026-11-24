// The deposit timeline's size control for a Liquity V1 stability-pool
// deposit: "Deposited (LUSD)", each touch's top-up or withdrawal, as Liquity
// V2's deposit states it (lib/liquity-v2/timeline-size.ts).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineSizeDim } from "@/lib/shared/timeline-size";

const DEPOSIT_TOP = 10_000_000;

/** A raw 1e18 LUSD integer as a number of LUSD. */
function lusdUnits(raw: string | undefined): number | null {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(19, "0");
  return Number(`${digits.slice(0, -18)}.${digits.slice(-18)}`);
}

export function liquityV1SpSizeDims(topUpOf: (e: BaseActivityEvent) => string | undefined): TimelineSizeDim[] {
  return [
    {
      side: "deposit",
      word: "Deposited",
      unit: "LUSD",
      top: DEPOSIT_TOP,
      figure: (e) => {
        const v = lusdUnits(topUpOf(e));
        return v == null ? null : Math.abs(v);
      },
    },
  ];
}
