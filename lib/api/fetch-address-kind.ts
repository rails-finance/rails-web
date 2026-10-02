// Client for /api/chain/address-kind — what an address is, read from its
// code at head (lib/sources/chain/address-kind.ts).

import type { ChainId } from "@/lib/shared/chains";

export type AddressKind =
  /** No code: an account a key controls. */
  | { kind: "account"; block: number }
  /** EIP-7702: the code is `0xef0100` and the delegate's address. */
  | { kind: "delegated"; delegate: string; block: number }
  /** A Safe: its singleton is a released Safe deployment. */
  | { kind: "safe"; version: string; block: number }
  /** Any other code, with the name and symbol it answers. */
  | { kind: "contract"; name: string | null; symbol: string | null; block: number };

const cache = new Map<string, Promise<AddressKind | null>>();

export function fetchAddressKind(address: string, chainId: ChainId): Promise<AddressKind | null> {
  // The route reads Ethereum and Base; a testnet address states nothing.
  if (chainId !== 1 && chainId !== 8453) return Promise.resolve(null);
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
