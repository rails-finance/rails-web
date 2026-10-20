// Which legs of an allocation band draw on their own (rails-ops ui-jobs 407,
// V3; decision 0043 point 4, the one `band`). The rule Morpho's timeline band
// (components/protocol/morpho-base/vault-allocation-band.tsx) set: a leg of 2%
// or more of the band draws alone, the rest collect in one trailing segment,
// the largest always draws, a single leftover draws alone, and the drawn legs
// keep the source's own order. Pure, with no imports.

/** The smallest share of the band a leg may hold and still draw on its own. A
 *  width rule: at a panel of about 640px it is 13px, the narrowest thing an eye
 *  separates from its neighbour. */
const MIN_SEGMENT_SHARE = 0.02;

export interface AllocationLeg {
  key: string;
  /** Raw units of the vault's asset; null where the read did not answer. */
  amount: bigint | null;
  /** The order the source publishes (the queue position). */
  order: number;
}

export interface AllocationPlan<L extends AllocationLeg> {
  /** Drawn alone, in the source's order. */
  shown: L[];
  /** Drawn as one trailing segment, in the source's order. */
  collected: L[];
  /** Σ over every leg that answered. */
  total: bigint;
  unread: L[];
}

const ZERO = BigInt(0);

export function planAllocation<L extends AllocationLeg>(legs: readonly L[]): AllocationPlan<L> {
  const unread = legs.filter((l) => l.amount == null);
  const read = legs.filter((l) => l.amount != null);
  const total = read.reduce((s, l) => s + (l.amount ?? ZERO), ZERO);
  if (total === ZERO) return { shown: [], collected: [], total, unread };
  const bySize = read
    .filter((l) => (l.amount ?? ZERO) > ZERO)
    .sort((a, b) => {
      const d = (b.amount ?? ZERO) - (a.amount ?? ZERO);
      return d > ZERO ? 1 : d < ZERO ? -1 : 0;
    });
  const clears = bySize.filter((l) => Number(l.amount ?? ZERO) / Number(total) >= MIN_SEGMENT_SHARE);
  let shown = clears.length ? clears : bySize.slice(0, 1);
  let collected = bySize.filter((l) => !shown.includes(l));
  if (collected.length === 1) {
    shown = [...shown, collected[0]];
    collected = [];
  }
  const byOrder = (a: L, b: L) => a.order - b.order;
  return { shown: [...shown].sort(byOrder), collected: [...collected].sort(byOrder), total, unread };
}
