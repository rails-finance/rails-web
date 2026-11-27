// When a Polaris pETH account's stored places are "as of" (ui-jobs 865): with
// the head unread (`ledger.complete` null), the CDPs, deposits and loans the
// stored index states hold as of its last read. They come from the
// twelve-contract lane's tables, whose read the route does not state (its
// `ledger` block is the pETH lane's watermark), so the note names no date and
// the receipt names no block.

import type { PolarisPethResponse } from "@/lib/sources/api/polaris-peth";

/** Whether the stored places are as of the last read: the head was not read,
 *  so they are not stated as current. */
export function pethStoredAsOf(d: Pick<PolarisPethResponse, "ledger">): boolean {
  return d.ledger != null && d.ledger.complete === null;
}

/** The words a stored place's note ends with. */
export function pethAsOfWords(asOf: boolean): string {
  return asOf ? ", as of the last read" : "";
}
