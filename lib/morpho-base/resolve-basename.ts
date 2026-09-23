// Forward resolution for Basenames (`name.base.eth`) — SERVER-ONLY.
// ----------------------------------------------------------------------------
// Basenames are a namespace parallel to ENS, registered and resolved through
// their own Registry + Resolver contracts on BASE, not mainnet's Universal
// Resolver. `lib/ens/resolve-ens.ts` resolves plain `.eth` names on mainnet;
// this module resolves `.base.eth` names the same shape of way, one chain
// over: `registry.resolver(namehash(name))`, then `resolver.addr(node)`.
//
// A SEPARATE viem client, deliberately not `lib/sources/chain/rpc.ts`'s
// `chainClient` / `chainBatchClient`: that module's own header says it is
// imported only from `/api/*` route handlers, but `resolveHolder` — the
// caller of this module, in `vault-holder.ts` — is also called directly from
// the SSR page components under `/base/morpho/vaults*`, not only from an API
// route. A plain client here, reading `BASE_RPC_URL` directly (the same env
// var the vault loader's chain client reads), keeps that import boundary
// intact instead of pulling an API-only module into a page's render path.
//
// REGISTRY CONFIRMED ON CHAIN 2026-09-05: resolving `jesse.base.eth` against
// 0xB94704422c2a1E396835A571837Aa5AE53285a95 — `registry.resolver(node)` then
// `resolver.addr(node)` — returned 0x2211d1D0020DAEA8039E46Cf1367962070d77DA9
// (Jesse Pollak's publicly known address). Cross-checked in reverse against
// the SAME registry: the resolver for that address's reverse node
// (`namehash("<address, no 0x, lowercase>.80002105.reverse")` — ENSIP-11's
// Base coin-type reverse namespace; 0x80002105 = 0x80000000 | 8453, Base's
// chain id) answered `name(node)` with "jesse.base.eth" again. Forward and
// reverse agree, so the registry address is right. An unregistered name
// (`this-name-should-not-exist-zzz-9182736.base.eth`) returned the zero
// resolver, as expected. See `scripts/verify/verify-morpho-base-holder-basename.mjs`
// for the repeatable version of this check.

import { createPublicClient, http, namehash, getAddress, type Address, type Chain, type PublicClient } from "viem";
import { base } from "viem/chains";
import { normalize } from "viem/ens";

// Widened to the generic `Chain` type, matching lib/sources/chain/rpc.ts's own
// pattern: `base`'s OP-stack-specific transaction shape otherwise infers a
// `PublicClient` type param that this module's plain `PublicClient` (no chain
// type argument) can't be assigned from.
const BASE_CHAIN: Chain = base;

export const BASENAMES_REGISTRY: Address = "0xB94704422c2a1E396835A571837Aa5AE53285a95";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const REGISTRY_ABI = [
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
] as const;

const RESOLVER_ADDR_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
] as const;

let cachedClient: PublicClient | null = null;

function client(): PublicClient {
  if (cachedClient) return cachedClient;
  const url = process.env.BASE_RPC_URL;
  if (!url) throw new Error("BASE_RPC_URL not set — Basenames resolution needs it for eth_call");
  cachedClient = createPublicClient({ chain: BASE_CHAIN, transport: http(url) });
  return cachedClient;
}

// Best-effort in-process cache, same shape as resolve-ens.ts's: a hit outlives
// a miss so a typo'd or unregistered name doesn't pin a null for an hour.
const HIT_TTL_MS = 60 * 60 * 1000; // 1h
const MISS_TTL_MS = 5 * 60 * 1000; // 5m
const cache = new Map<string, { address: string | null; expires: number }>();

/** True for any `name.base.eth` (case-insensitive) — the shape this module
 *  resolves. Does not touch the network. */
export function isBasename(name: string): boolean {
  return /^[^\s/]+\.base\.eth$/i.test(name.trim());
}

/** Resolve a `.base.eth` name to a checksummed address on Base, or null when
 *  it isn't registered (a zero resolver, or a resolver with no address
 *  record). Never throws — RPC or ABI-decode failures resolve to null so the
 *  caller can state "unresolved" rather than surface a raw error. */
export async function resolveBasenameAddress(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!isBasename(key)) return null;

  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.address;

  let address: string | null = null;
  try {
    const node = namehash(normalize(key));
    const resolverAddr = await client().readContract({
      address: BASENAMES_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "resolver",
      args: [node],
    });
    if (resolverAddr.toLowerCase() !== ZERO_ADDRESS) {
      const resolved = await client().readContract({
        address: resolverAddr,
        abi: RESOLVER_ADDR_ABI,
        functionName: "addr",
        args: [node],
      });
      if (resolved.toLowerCase() !== ZERO_ADDRESS) address = getAddress(resolved);
    }
  } catch {
    address = null;
  }

  cache.set(key, { address, expires: Date.now() + (address ? HIT_TTL_MS : MISS_TTL_MS) });
  return address;
}
