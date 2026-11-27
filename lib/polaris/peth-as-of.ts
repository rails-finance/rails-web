// When a Polaris pETH account's stored places are "as of" (ui-jobs 865): with
// the head unread (`ledger.complete` null), the CDPs, deposits and loans the
// stored ledger states hold as of the last block the lane read. The note
// names that block's date in the house format; the receipt names the block.

import { formatDateLong } from "@/lib/date";
import type { PolarisPethResponse } from "@/lib/sources/api/polaris-peth";

export interface PethStoredAsOf {
  block: string | null;
  /** The last block read's time, ISO 8601 UTC, or null where the route
   *  does not state it. */
  timestamp: string | null;
}

/** The stored places' "as of", or null where the head was read (they are
 *  then current). */
export function pethStoredAsOf(d: Pick<PolarisPethResponse, "ledger" | "scanned_to_block">): PethStoredAsOf | null {
  if (d.ledger == null || d.ledger.complete !== null) return null;
  return {
    block: d.ledger.scanned_to_block ?? d.scanned_to_block ?? null,
    timestamp: d.ledger.scanned_to_timestamp ?? null,
  };
}

/** The words a stored place's note ends with: ", as of 27 November 2026", or
 *  ", as of the last block read" where the route states no time. */
export function pethAsOfWords(asOf: PethStoredAsOf | null): string {
  if (!asOf) return "";
  const t = asOf.timestamp ? new Date(asOf.timestamp) : null;
  return `, as of ${t && !Number.isNaN(t.getTime()) ? formatDateLong(t) : "the last block read"}`;
}
