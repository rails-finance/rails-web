import { createPublicClient, fallback, http, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

/**
 * Forward ENS resolution (name → address) for the listing pages' wallet
 * search. Server-only — keeps any RPC URL off the client and lets us cache
 * across requests within a server instance.
 *
 * Why forward resolution: the rails-server-onboarding backend only matches ENS via a
 * reverse-resolution cache (address → primary name, populated at index time
 * with a 7-day TTL). That misses any wallet it hasn't indexed, or whose
 * primary name differs from what was typed. Resolving the name to an address
 * here and filtering by address is reliable for any wallet on chain.
 *
 * RPC: prefers `ENS_RPC_URL`, then falls back across public endpoints. ENS
 * lookups go through mainnet's Universal Resolver, which all of these support.
 */
const transports = [
  process.env.ENS_RPC_URL,
  "https://eth.llamarpc.com",
  "https://ethereum-rpc.publicnode.com",
  "https://cloudflare-eth.com",
]
  .filter((u): u is string => !!u)
  .map((u) => http(u));

const client = createPublicClient({
  chain: mainnet,
  transport: fallback(transports),
  // Coalesce concurrent reads: a page of owner pills reverse-resolving at once
  // collapses into Universal-Resolver multicalls rather than N round trips.
  batch: { multicall: true },
});

// Best-effort in-process cache. Hits live longer than misses so a typo'd or
// unregistered name doesn't pin a null for an hour, but a real name doesn't
// re-hit RPC on every keystroke-driven navigation.
const HIT_TTL_MS = 60 * 60 * 1000; // 1h
const MISS_TTL_MS = 5 * 60 * 1000; // 5m
const cache = new Map<string, { address: string | null; expires: number }>();

function isEnsName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return lower.endsWith(".eth") && lower.length >= 7; // ≥3 chars + ".eth"
}

/**
 * Resolve an ENS name to a checksummed address, or null if it doesn't
 * resolve (or isn't a `.eth` name). Never throws — RPC/parse failures
 * resolve to null so callers can fall back gracefully.
 */
export async function resolveEnsAddress(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!isEnsName(key)) return null;

  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.address;

  let address: string | null = null;
  try {
    const resolved = await client.getEnsAddress({ name: normalize(key) });
    address = resolved ? getAddress(resolved) : null;
  } catch {
    address = null;
  }

  cache.set(key, {
    address,
    expires: Date.now() + (address ? HIT_TTL_MS : MISS_TTL_MS),
  });
  return address;
}

// ---------------------------------------------------------------------------
// Reverse resolution (address → primary name), for the owner pills.
// ---------------------------------------------------------------------------
// The rails-server backend leaves `ownerEns` null (it only reverse-resolves the
// wallets it has indexed); the owner pills fill it web-side. viem's getEnsName
// goes through the mainnet Universal Resolver, which round-trips the name back to
// the address, so a name only renders when it forward-resolves to the same owner.
// Same TTL cache + fallback client as forward resolution; the `batch.multicall`
// on the client coalesces a page of concurrent lookups into few RPC calls.

const nameCache = new Map<string, { name: string | null; expires: number }>();
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

async function resolveOne(addr: string): Promise<string | null> {
  const key = addr.toLowerCase();
  const cached = nameCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.name;

  let name: string | null = null;
  try {
    name = await client.getEnsName({ address: getAddress(addr) });
  } catch {
    name = null;
  }

  nameCache.set(key, {
    name,
    expires: Date.now() + (name ? HIT_TTL_MS : MISS_TTL_MS),
  });
  return name;
}

/**
 * Reverse-resolve a batch of addresses to their primary ENS names. Returns a
 * map keyed by the lower-cased input address; a value is the `.eth` name or
 * null (no primary name, malformed input, or RPC failure). Never throws.
 * Deduplicates and skips malformed inputs before hitting RPC; resolved names
 * are cached in-process so repeat pages don't re-resolve.
 */
export async function resolveEnsNames(addresses: string[]): Promise<Record<string, string | null>> {
  const unique = Array.from(
    new Set(addresses.filter((a) => ADDR_RE.test(a.trim())).map((a) => a.trim().toLowerCase())),
  );
  const entries = await Promise.all(unique.map(async (addr) => [addr, await resolveOne(addr)] as const));
  return Object.fromEntries(entries);
}
