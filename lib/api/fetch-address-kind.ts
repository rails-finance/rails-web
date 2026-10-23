// Client for /api/chain/address-kind — what an address is, read from its
// code at head (lib/sources/chain/address-kind.ts).

import type { ChainId } from "@/lib/shared/chains";

import type { BarSubject } from "@/lib/shared/known-infrastructure";
import type { ManagerProduct } from "@/lib/shared/account-managers";

/** One call of the chain read that names an account's manager. */
export interface ManagerCall {
  /** The contract called, lowercase. */
  contract: string;
  /** Its name in the product's deployments, or the account's own kind. */
  contractName: string;
  /** The call as a reader types it: "getModulesPaginated(0x1, 50)". */
  call: string;
  /** What it answered, as text. */
  answer: string;
}

/** Who runs a contract account, where the chain states it (rails-ops ui-jobs
 *  440; lib/shared/account-managers.ts): the product, its mark, its closure
 *  from the bar subject, and the read behind it at the kind's block. */
export interface AccountManager {
  product: ManagerProduct;
  name: string;
  icon: string;
  closed?: BarSubject["closed"];
  read: { calls: ManagerCall[]; block: number };
  /** The product contract the read names, and its name in the product's
   *  deployments. */
  contract: string;
  contractName: string;
}

// `owners` is who may act for a contract account, read at the same block: a
// Safe's `getOwners()`, the `owner()` a DSProxy or a DPM answers, a DSA's
// authorities. The timeline's "not yours" mark tests a row's sender against
// it (anatomy P3.1.1). `account` names a product account kind the chain
// states: a DSProxy (`owner()`, `authority()` and `cache()` answer), an
// Instadapp DSA (InstaList's `accountID`), a Summer.fi DPM (`guard()` is
// Summer's AccountGuard).
export type AddressKind =
  /** No code: an account a key controls. */
  | { kind: "account"; block: number }
  /** EIP-7702: the code is `0xef0100` and the delegate's address. */
  | { kind: "delegated"; delegate: string; block: number }
  /** A Safe: its singleton is a released Safe deployment. */
  | { kind: "safe"; version: string; owners?: string[]; manager?: AccountManager; block: number }
  /** Any other code, with the name and symbol it answers. */
  | {
      kind: "contract";
      name: string | null;
      symbol: string | null;
      account?: "dsproxy" | "dsa" | "dpm";
      owners?: string[];
      manager?: AccountManager;
      block: number;
    };

const cache = new Map<string, Promise<AddressKind | null>>();

export function fetchAddressKind(address: string, chainId: ChainId): Promise<AddressKind | null> {
  // The route reads Ethereum, Base and Arbitrum; a testnet address states nothing.
  if (chainId !== 1 && chainId !== 8453 && chainId !== 42161) return Promise.resolve(null);
  const key = `${chainId}:${address.toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/chain/address-kind?address=${address.toLowerCase()}&chain=${chainId}`)
      .then((r) => (r.ok ? (r.json() as Promise<AddressKind | null>) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}
