// Chunked chronological interior for a collapsed timeline run.
// ----------------------------------------------------------------------------
// A long run of third-party events expands into folders of ~CHUNK_TARGET
// consecutive events in TRUE order, instead of re-bucketing them by kind or
// counterparty — chronology is the one promise a timeline makes, and it wins
// inside the run too. Each folder's header then carries aggregates and counts
// scoped to its own slice, with a tight date range that paints the churn's
// rhythm over time on the spine. Design note (the wrong versions this
// replaced, and why): rails-ops reference/timeline-attention-budget.md,
// revision 2026-09-01. Reached through lib/shared/run-folders.tsx's
// renderRunFolders, which every protocol's run spec now renders with.

/** How many events one folder aims to hold. Flexes by a few rows so a
 *  transaction's rows never split (see below). */
export const CHUNK_TARGET = 100;

/**
 * Slice `items` (already in display order) into chronological chunks of
 * ~`target`, never splitting a transaction: the boundary always lands between
 * txHashes — a liquidation with its repay leg and seize transfers is one act,
 * and one act never straddles two folders. A chunk therefore closes at the
 * first transaction boundary AT or past the target, a few rows over.
 *
 * A trailing remnant smaller than `minTail` joins the previous chunk rather
 * than standing as a folder of two.
 */
export function chunkByTransaction<T>(
  items: T[],
  txHashOf: (item: T) => string,
  target: number = CHUNK_TARGET,
  minTail = 2,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let i = 0;
  while (i < items.length) {
    // One act = consecutive rows of the same transaction. Same-tx rows are
    // adjacent in any block/logIndex ordering, so a plain forward scan holds.
    const tx = txHashOf(items[i]);
    let j = i + 1;
    while (j < items.length && txHashOf(items[j]) === tx) j++;
    for (let k = i; k < j; k++) current.push(items[k]);
    if (current.length >= target) {
      chunks.push(current);
      current = [];
    }
    i = j;
  }
  if (current.length > 0) {
    if (chunks.length > 0 && current.length < minTail) {
      for (const item of current) chunks[chunks.length - 1].push(item);
    } else {
      chunks.push(current);
    }
  }
  return chunks;
}
