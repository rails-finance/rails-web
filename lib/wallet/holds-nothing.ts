// The block at which a stored open position an owner read leaves out holds
// nothing: the index head the route states (a served-through block), and only
// at or past the stored read's block. A route that states no index head gives
// no such block, and the position keeps its stored card with none (Alchemix
// and f(x) state none). A block from the owner's other rows bounds what the
// index has replayed for them, never this position. Pure: no reads.

/** `statedHead` where it is at or past `storedBlock`; undefined otherwise, and
 *  where either block is unknown. */
export function holdsNothingSince(statedHead: number | undefined, storedBlock: number | undefined): number | undefined {
  return statedHead != null && storedBlock != null && statedHead >= storedBlock ? statedHead : undefined;
}
