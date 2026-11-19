// The lines of a side's sum in cents (ui-jobs 743), for the flows verifiers:
// every priced line carries its cents; a line holding an unpriced leg draws
// "—", names its assets and is left out of the sum. Returns the sum in whole
// cents.
import assert from "node:assert/strict";

export function centsOfLines(
  lines: readonly { cents?: number; unpriced?: string[]; amount: string; kind: string; none?: string }[],
  label: string,
): number {
  let sum = 0;
  for (const l of lines) {
    if (l.amount === "—") {
      assert.ok(l.unpriced?.length || l.none, `${label}: a line with no figure says why`);
      continue;
    }
    assert.ok(l.cents != null, `${label}: a priced ${l.kind} line carries its cents`);
    sum += l.cents;
  }
  return Math.round(sum * 100) || 0;
}
