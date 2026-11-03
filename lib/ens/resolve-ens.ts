import { createPublicClient, fallback, http, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { serverEnsNames, serverNameAddress } from "@/lib/sources/api/names-at-block";

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
 * Source: rails-server's `/api/at-block/names` first; its answer is used only
 * where it found one (lib/sources/api/names-at-block.ts). Every other result,
 * and a route that cannot answer, reads the chain as below: `ENS_RPC_URL`, then
 * public endpoints, through mainnet's Universal Resolver. The caches sit in
 * front of both.
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
  return (await lookUpEnsAddress(name)).address;
}

/**
 * The same lookup, telling a name with no address (`failed: false`) from a
 * lookup that did not answer (`failed: true`: every RPC endpoint errored).
 * A failure is not cached, so the next ask tries again.
 */
export async function lookUpEnsAddress(name: string): Promise<{ address: string | null; failed: boolean }> {
  const key = name.trim().toLowerCase();
  if (!isEnsName(key)) return { address: null, failed: false };

  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return { address: cached.address, failed: false };

  let normalized: string;
  try {
    normalized = normalize(key);
  } catch {
    // Not a valid ENS name (a disallowed character): it names nothing.
    return { address: null, failed: false };
  }

  let address: string | null = await serverNameAddress(1, normalized);
  if (address) {
    cache.set(key, { address, expires: Date.now() + HIT_TTL_MS });
    return { address, failed: false };
  }
  try {
    const resolved = await client.getEnsAddress({ name: normalized });
    address = resolved ? getAddress(resolved) : null;
  } catch {
    return { address: null, failed: true };
  }

  cache.set(key, {
    address,
    expires: Date.now() + (address ? HIT_TTL_MS : MISS_TTL_MS),
  });
  return { address, failed: false };
}

// ---------------------------------------------------------------------------
// Reverse resolution (address → primary name), for the owner pills.
// ---------------------------------------------------------------------------
// The rails-server backend leaves `ownerEns` null (it only reverse-resolves the
// wallets it has indexed); the owner pills fill it web-side. viem's getEnsName
// goes through the mainnet Universal Resolver, which round-trips the name back to
// the address, so a name only renders when it forward-resolves to the same owner;
// rails-server's at-block names route checks the same round trip and is asked
// first. Same TTL cache + fallback client as forward resolution; the `batch.multicall`
// on the client coalesces a page of concurrent lookups into few RPC calls.

const nameCache = new Map<string, { name: string | null; expires: number }>();
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function cachedName(key: string): { name: string | null } | null {
  const cached = nameCache.get(key);
  return cached && cached.expires > Date.now() ? { name: cached.name } : null;
}

/** The chain read for one address the server did not find. */
async function resolveOne(addr: string): Promise<string | null> {
  const key = addr.toLowerCase();
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
 * Deduplicates and skips malformed inputs; the uncached addresses go to
 * rails-server in one request per 50; its found and none answers stand, and
 * the chain is read only for the rest (offchain, failed, a route that cannot
 * answer). Names are cached in-process so repeat pages don't re-resolve.
 */
export async function resolveEnsNames(addresses: string[]): Promise<Record<string, string | null>> {
  const unique = Array.from(
    new Set(addresses.filter((a) => ADDR_RE.test(a.trim())).map((a) => a.trim().toLowerCase())),
  );
  const out: Record<string, string | null> = {};
  const ask: string[] = [];
  for (const addr of unique) {
    const hit = cachedName(addr);
    if (hit) out[addr] = hit.name;
    else ask.push(addr);
  }
  const served = ask.length ? await serverEnsNames(ask) : new Map<string, string | null>();
  await Promise.all(
    ask.map(async (addr) => {
      if (served.has(addr)) {
        const name = served.get(addr) ?? null;
        nameCache.set(addr, { name, expires: Date.now() + (name ? HIT_TTL_MS : MISS_TTL_MS) });
        out[addr] = name;
      } else out[addr] = await resolveOne(addr);
    }),
  );
  return out;
}
