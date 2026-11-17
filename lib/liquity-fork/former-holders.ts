// A Liquity fork Trove's former holders (ui-jobs 715): the wallets its NFT
// moved away from, each with its latest transfer out (rails-server mig 485,
// the forks' /troves with ?former=1). The fork listings search in memory, so
// every row carries them. Imports nothing, so scripts/test/fork-former-
// holders.test.mjs reads it directly.

export interface ForkFormerHolder {
  holder: string;
  movedTo: string;
  /** Unix seconds. */
  movedAt: number;
  movedBlock: number;
  movedTx: string;
}

/** One TroveNFT transfer between two wallets (a fork's one-Trove read). */
export interface ForkNftTransfer {
  block: number;
  /** Unix seconds; null where the index holds no time. */
  at: number | null;
  logIndex: number;
  from: string;
  to: string;
  tx: string;
}

interface Holdable {
  owner: string | null;
  lastOwner: string | null;
  formerHolders?: ForkFormerHolder[];
}

const ADDRESS = /^0x[0-9a-f]{40}$/;

/** The search matches one of the row's former holders. */
export function matchesFormerHolder(row: Holdable, q: string): boolean {
  return row.formerHolders?.some((f) => f.holder.includes(q)) ?? false;
}

/** The row's "moved to" for a search by a wallet that held the Trove and moved
 *  it on: null when the search is no address, names no former holder, or names
 *  the Trove's holder now or its last one. */
export function formerHoldFor(
  row: Holdable,
  q: string | null | undefined,
): { movedTo: string; movedAt: number } | null {
  const w = q?.trim().toLowerCase() ?? "";
  if (!ADDRESS.test(w)) return null;
  if (row.owner?.toLowerCase() === w || row.lastOwner?.toLowerCase() === w) return null;
  const f = row.formerHolders?.find((x) => x.holder === w);
  return f ? { movedTo: f.movedTo, movedAt: f.movedAt } : null;
}
