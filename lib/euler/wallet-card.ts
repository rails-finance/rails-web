// One Euler V2 (sub-account, vault) pair as the wallet view draws it
// (rails-ops decision 0071): the stored pair of rails-server's
// wallet_positions (mig 517), and, where the wallet page's head read found
// it, the explorer's wallet read of it (GET /api/at-block/euler/positions,
// the read /<chain>/euler-v2/<wallet> draws). The store holds vault shares
// and no asset amount, so a stored pair states its flags alone.
//
// Pure: imports nothing through `@/`, so scripts/test can load it.

import { walletRows, type EulerWalletRow } from "./position";
import type { EulerWalletRead } from "./types";

export interface EulerWalletCardRow {
  status: "open" | "closed" | "liquidated";
  account: string;
  /** The account's number among the owner's 256; null where the store names none. */
  index: number | null;
  vault: string;
  /** The stored flags: the vault is enabled as the account's collateral, or
   *  is its controller (the account borrows from it). */
  collateral: boolean;
  controller: boolean;
  /** The head read's holding in the pair: its deposit and its loan rows
   *  (either null where the pair holds none), and the read without its
   *  accounts, for the receipts. Null on a stored pair. */
  read: { wallet: EulerWalletRead; deposit: EulerWalletRow | null; loan: EulerWalletRow | null } | null;
}

/** The pair's rows in a wallet read: its deposit and its loan, each null
 *  where the read lists none or it holds nothing; null where the read does
 *  not list the pair. */
export function eulerPairOf(
  w: EulerWalletRead,
  account: string,
  vault: string,
): { deposit: EulerWalletRow | null; loan: EulerWalletRow | null } | null {
  const a = account.toLowerCase();
  const v = vault.toLowerCase();
  const rows = walletRows(w).filter((r) => r.account.toLowerCase() === a && r.vault.toLowerCase() === v);
  if (rows.length === 0) return null;
  const held = (kind: "loan" | "deposit") => rows.find((r) => r.kind === kind && BigInt(r.raw) > BigInt(0)) ?? null;
  return { deposit: held("deposit"), loan: held("loan") };
}
