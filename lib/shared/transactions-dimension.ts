// The Transactions facet every listing shares (ui-jobs 352): a range over the
// number of distinct transactions a position's timeline shows, liquidations
// included. One range value in the URL (`?tx=10-500`), the chip "Transactions:
// 10–500" / "≥ 10" / "≤ 500", and the bounds sent to the backend as
// minTx / maxTx (`transactionBounds`). A registry passes how to read and write
// its filters' `tx` field, and the slider's top: the round number above the
// busiest position on that explorer, so the slider's length means something
// there. A typed bound past the top is still honoured.

import { decodeRange, normalizeRange } from "@/components/shared/filter-bar/types";
import type { SerializableDimension } from "@/lib/shared/list-filter";

export function transactionsDimension<F>(opts: {
  get: (f: F) => string[];
  set: (f: F, tx: string[]) => F;
  /** The slider's top, in transactions. */
  top: number;
}): SerializableDimension<F> {
  return {
    id: "tx",
    label: "Transactions",
    group: "Transactions",
    cardinality: "range",
    range: { min: 1, max: opts.top },
    param: "tx",
    options: [],
    get: opts.get,
    set: (f, v) => opts.set(f, normalizeRange(v)),
  };
}

/** The selection as the backend's inclusive minTx / maxTx; undefined when a
 *  side is open. */
export function transactionBounds(tx: string[]): { minTx: number | undefined; maxTx: number | undefined } {
  const { min, max } = decodeRange(tx);
  return { minTx: min ?? undefined, maxTx: max ?? undefined };
}
