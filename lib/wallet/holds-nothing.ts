// The head block at which a stored open position a holder read leaves out
// holds nothing (lib/wallet/families/alchemix.ts, fx.ts). The block is the
// highest the read states for the owner's other rows on the same line or pool,
// so it counts only at or past the stored read's block. Pure: no reads.

/** `head` where it is at or past `storedBlock`; undefined otherwise, and where
 *  either block is unknown. */
export function holdsNothingSince(head: number | undefined, storedBlock: number | undefined): number | undefined {
  return head != null && storedBlock != null && head >= storedBlock ? head : undefined;
}
