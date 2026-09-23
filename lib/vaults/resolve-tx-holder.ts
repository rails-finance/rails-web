// The transaction-hash CLASSIFIER for the vault holder lookups. SERVER-ONLY.
// ----------------------------------------------------------------------------
// All this file still does is recognise a transaction hash — bare, or inside
// THIS CHAIN'S block-explorer URL — so the two holder classifiers
// (lib/{morpho-base,aave-vaults}/vault-holder.ts) can say "that is a
// transaction, not an address" rather than calling it invalid.
//
// THE LANE THAT RESOLVED ONE TO A HOLDER IS GONE. It read the receipt, scanned
// its logs for a catalogued vault's `Transfer`, and offered the non-vault party
// as the reader's address — the one question a protocol door cannot answer, and
// the reason `/<chain>/vaults/find` existed. rails-ops decision 0028 point 6
// rehomes no cross-family holder lookup, so the lane went with the door and is
// in git history rather than parked here.

import { chainMeta, type ChainId } from "@/lib/shared/chains";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** The transaction hash a typed input names — a bare hash, or one inside THIS
 *  CHAIN'S block-explorer transaction URL — lowercased; null when the input is
 *  neither.
 *
 *  The host comes from `chainMeta(chainId).explorerBase`, so a Basescan link
 *  typed into the Ethereum lookup is not a transaction at all: it names a
 *  transaction on another chain, and this chain's node has no receipt for it. A
 *  bare 32-byte hash is accepted everywhere, because a hash carries no venue. */
export function txHashFromInput(raw: string, chainId: ChainId): string | null {
  const value = raw.trim();
  if (TX_HASH.test(value)) return value.toLowerCase();
  const host = chainMeta(chainId)
    .explorerBase.replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(?:https?://)?(?:www\\.)?${host}/tx/(0x[0-9a-fA-F]{64})(?:[/?#].*)?$`, "i");
  const m = value.match(re);
  return m ? m[1].toLowerCase() : null;
}
