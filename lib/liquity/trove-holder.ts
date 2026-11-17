// A Trove's holder, and whether to call it the "last holder" (ui-jobs 702).
// Imports nothing, so scripts/test/trove-holder.test.mjs reads it directly.
//
// RULE: a closed Trove's holder is "last" only when its history holds a
// TroveNFT transfer between two wallets. The mint and the burn ride the open
// and the close, so a Trove held by one wallet throughout has none.
// The test reads the loaded rows. A timeline cut by the row window
// (`hasMore`) with no transfer among its rows reads false: the label stays off
// until the server answers a change of hands (ui-jobs 705).

const BURN = "0x0000000000000000000000000000000000000000";

interface TransferLike {
  transferType?: string;
  fromAddress?: string;
  toAddress?: string;
}

/** True when the rows hold a TroveNFT transfer between two different wallets. */
export function troveChangedHands(events: readonly { context?: { protocol?: string; data?: unknown } }[]): boolean {
  return events.some((e) => {
    if (e.context?.protocol !== "liquity-v2-troves") return false;
    const t = (e.context.data as { transfer?: TransferLike } | undefined)?.transfer;
    if (t?.transferType !== "transfer" || !t.fromAddress || !t.toAddress) return false;
    return t.fromAddress.toLowerCase() !== t.toAddress.toLowerCase();
  });
}

/** The Trove's holder: the owner, or `lastOwner` once the Trove is closed (a
 *  closed Trove's owner is null or the burn address). `last` is set only on a
 *  closed Trove that changed hands. */
export function troveHolder(
  trove: { owner?: string | null; lastOwner?: string | null } | null,
  changedHands = false,
): { address: string | null; last: boolean } {
  if (trove?.owner && trove.owner.toLowerCase() !== BURN) return { address: trove.owner, last: false };
  return { address: trove?.lastOwner ?? null, last: changedHands };
}

/** The Liquity forks' holder. Their timelines carry no TroveNFT transfer rows;
 *  the fork's one-Trove read says whether the NFT changed hands (rails-server
 *  mig 485, `changedHands`), and `last` follows it on a closed Trove. */
export function liquityForkHolder(
  trove: { owner?: string | null; lastOwner?: string | null; changedHands?: boolean } | null,
): {
  address: string | null;
  last: boolean;
} {
  if (trove?.owner && trove.owner.toLowerCase() !== BURN) return { address: trove.owner, last: false };
  return { address: trove?.lastOwner ?? null, last: trove?.changedHands === true };
}
