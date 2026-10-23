// Client for /api/chain/address-kind — what an address is, read from its
// code at head (lib/sources/chain/address-kind.ts).

import type { ChainId } from "@/lib/shared/chains";

// `owners` is who may act for a contract account, read at the same block: a
// Safe's `getOwners()`, or the `owner()` a DSProxy answers. The timeline's
// "not yours" mark tests a row's sender against it (anatomy P3.1.1). The
// variants stay open for what the account's manager is (rails-ops ui-jobs 440).
export type AddressKind =
  /** No code: an account a key controls. */
  | { kind: "account"; block: number }
  /** EIP-7702: the code is `0xef0100` and the delegate's address. */
  | { kind: "delegated"; delegate: string; block: number }
  /** A Safe: its singleton is a released Safe deployment. */
  | { kind: "safe"; version: string; owners?: string[]; block: number }
  /** Any other code, with the name and symbol it answers. */
  | { kind: "contract"; name: string | null; symbol: string | null; owners?: string[]; block: number };

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
