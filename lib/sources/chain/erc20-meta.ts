// Generic ERC-20 metadata resolver — server-only.
// ----------------------------------------------------------------------------
// A protocol-agnostic twin of lib/sources/chain/aave-v3-tokens.ts `resolveV3Tokens`:
// a cached multicall over `symbol()` + `decimals()` for any set of token
// addresses, with a truncated-address fallback so a row still renders when a
// token reverts. Token metadata is immutable, so reading at the chain HEAD is
// correct — this is reference data, NOT position state (which is pinned to T).
//
// Used by the Morpho loaders to name + scale the long tail of market tokens
// (~1,800 distinct), which no hand-curated catalog could cover.
//
// SERVER-ONLY — imported only from /api/* route handlers and the server-side
// builders/loaders under lib/sources/ (it calls Alchemy via lib/sources/chain/rpc).

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const NAME_ABI = parseAbi(["function name() view returns (string)"]);

export interface Erc20Meta {
  /** Lowercased token address. */
  address: string;
  symbol: string;
  decimals: number;
  /** True when `symbol` (or `name`) resolved on chain; absent/false when it is
   *  the truncated-address fallback, so a card can render an identifier rather
   *  than styling hex like a token symbol. */
  named?: boolean;
  /** Set when `decimals()` was not read — the RPC failed or the token has no
   *  such accessor — so `decimals` is the 18 stand-in. A transport failure is
   *  never cached; the next call asks again. */
  unresolved?: true;
}

// Process-lifetime cache: symbol/decimals never change, so resolve each at most
// once. Keyed `chainId:address` — the same address is a DIFFERENT token on a
// different chain, and a chain-blind cache would serve Base a mainnet symbol.
const cache = new Map<string, Erc20Meta>();
const cacheKey = (chainId: ChainId, addr: string) => `${chainId}:${addr}`;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Resolve symbol + decimals for every address, batched into one multicall over
 *  the uncached ones. When `symbol()` reverts (ERC-1155 has neither accessor in
 *  the standard; some ERC-721s implement only `name()`), a second multicall over
 *  just the failures tries `name()`. Only then does a token fall back to a
 *  truncated address + 18 dp, flagged `named: false`. */
export async function resolveErc20Meta(
  addresses: string[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<Map<string, Erc20Meta>> {
  const out = new Map<string, Erc20Meta>();
  const want = new Set<string>();
  for (const a of addresses) {
    if (!a) continue;
    const addr = a.toLowerCase();
    const hit = cache.get(cacheKey(chainId, addr));
    if (hit) out.set(addr, hit);
    else want.add(addr);
  }
  const todo = [...want];
  if (todo.length === 0) return out;

  let results: unknown[] = [];
  try {
    const client = chainClient(chainId);
    results = (await client.multicall({
      allowFailure: true,
      contracts: todo.flatMap((addr) => [
        { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" } as const,
        { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" } as const,
      ]),
    })) as unknown[];
  } catch {
    results = []; // RPC down — every uncached token falls back below.
  }

  const symbols = new Map<string, string>();
  const decimalsOf = new Map<string, number>();
  const noSymbol: string[] = [];
  todo.forEach((addr, i) => {
    const symRes = results[i * 2] as { status: string; result?: unknown } | undefined;
    const decRes = results[i * 2 + 1] as { status: string; result?: unknown } | undefined;
    const onChainSym =
      symRes?.status === "success" && typeof symRes.result === "string" ? (symRes.result as string) : undefined;
    if (onChainSym) symbols.set(addr, onChainSym);
    else noSymbol.push(addr);
    if (decRes?.status === "success" && decRes.result != null)
      decimalsOf.set(addr, Number(decRes.result as number | bigint));
  });

  // Second, smaller multicall: name() over only the symbol-less contracts.
  if (noSymbol.length > 0 && results.length > 0) {
    try {
      const client = chainClient(chainId);
      const nameResults = (await client.multicall({
        allowFailure: true,
        contracts: noSymbol.map(
          (addr) => ({ address: addr as `0x${string}`, abi: NAME_ABI, functionName: "name" }) as const,
        ),
      })) as unknown[];
      noSymbol.forEach((addr, i) => {
        const res = nameResults[i] as { status: string; result?: unknown } | undefined;
        if (res?.status === "success" && typeof res.result === "string" && res.result) symbols.set(addr, res.result);
      });
    } catch {
      // name() sweep failed — the affected tokens fall back below.
    }
  }

  for (const addr of todo) {
    const sym = symbols.get(addr);
    const meta: Erc20Meta = {
      address: addr,
      symbol: sym || short(addr),
      decimals: decimalsOf.get(addr) ?? 18,
      named: Boolean(sym),
      ...(decimalsOf.has(addr) ? {} : { unresolved: true as const }),
    };
    // An RPC that did not answer says nothing about the token: only an answer
    // is kept.
    if (results.length > 0) cache.set(cacheKey(chainId, addr), meta);
    out.set(addr, meta);
  }

  return out;
}

const VAULT_ABI = parseAbi([
  "function asset() view returns (address)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

// Process-lifetime cache, keyed like `cache` above: whether a token's decimals() survives the
// check below. Immutable in the same way decimals() is, so resolve each at most once.
/** Keyed `chainId:address`, for the same reason the meta cache is: the same address is a
 *  different token on a different chain, and a verdict about one must never answer for the
 *  other. */
const trustCache = new Map<string, boolean>();

/** Which of these tokens report `decimals()` that can be TRUSTED to scale their own balances.
 *
 *  Not a magnitude heuristic — those flag honest tokens. It models the one specific lie a token
 *  can tell: only an ERC-4626-ish token can under-report its own decimals, because it can
 *  return its UNDERLYING's. wUSDL is the live example — it says 6 while minting 18-decimal
 *  shares, so scaling its balances by 6 overstates them by 1e12, enough to make it the largest
 *  book on the protocol by orders of magnitude. (The vault register hit the same token from the
 *  other side; scripts/census-vault-register.mjs carries the same test for its own roster.)
 *
 *  The test: ask the token what it wraps. If it wraps nothing it cannot tell this lie, and is
 *  trusted. If it does, ask what ONE claimed whole unit converts to — a truthful decimals()
 *  means 10^decimals is one whole token and converts to roughly one underlying. wUSDL's 10^6 is
 *  a dust fraction of a real 18-decimal share and converts to zero.
 *
 *  A token that cannot be checked (asset() reverts, convertToAssets() reverts) is trusted: the
 *  lie needs a wrapper to tell it, and absence of evidence here IS evidence of absence.
 *
 *  Opt-in rather than merged into `resolveErc20Meta` on purpose: it costs up to three extra
 *  multicalls, and every existing caller scales balances of plain tokens that cannot lie.
 *
 *  Chain-parameterised as of the Morpho Base explorer, which is its first non-mainnet
 *  caller — Base's Blue roster carries ~100 loan tokens and the wrapper trap is not a
 *  mainnet peculiarity. Defaults to Ethereum so every existing call site is unchanged. */
export async function resolveDecimalsTrust(
  addresses: string[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const want = new Set<string>();
  for (const a of addresses) {
    if (!a) continue;
    const addr = a.toLowerCase();
    const hit = trustCache.get(cacheKey(chainId, addr));
    if (hit !== undefined) out.set(addr, hit);
    else want.add(addr);
  }
  const todo = [...want];
  if (todo.length === 0) return out;

  const meta = await resolveErc20Meta(todo, chainId);
  try {
    const client = chainClient(chainId);

    // Which of them are wrappers at all — the only ones that CAN tell this lie.
    const assets = (await client.multicall({
      allowFailure: true,
      contracts: todo.map((a) => ({ address: a as `0x${string}`, abi: VAULT_ABI, functionName: "asset" }) as const),
    })) as { status: string; result?: unknown }[];

    const wrappers: { token: string; underlying: string; claimed: number }[] = [];
    todo.forEach((addr, i) => {
      const r = assets[i];
      if (r?.status === "success" && typeof r.result === "string")
        wrappers.push({
          token: addr,
          underlying: (r.result as string).toLowerCase(),
          claimed: meta.get(addr)?.decimals ?? 18,
        });
    });

    if (wrappers.length > 0) {
      const underlyingMeta = await resolveErc20Meta(
        wrappers.map((w) => w.underlying),
        chainId,
      );
      const converted = (await client.multicall({
        allowFailure: true,
        contracts: wrappers.map(
          (w) =>
            ({
              address: w.token as `0x${string}`,
              abi: VAULT_ABI,
              functionName: "convertToAssets",
              args: [BigInt("1" + "0".repeat(w.claimed))],
            }) as const,
        ),
      })) as { status: string; result?: unknown }[];

      wrappers.forEach((w, i) => {
        const r = converted[i];
        if (r?.status !== "success" || r.result == null) return; // unreadable → cannot convict
        const one = r.result as bigint;
        const whole = scaleRaw(one, underlyingMeta.get(w.underlying)?.decimals ?? 18);
        // One claimed unit should be worth about one underlying — a share price near 1, not 1e±2.
        if (one === BigInt(0) || whole > 100 || whole < 0.01) trustCache.set(cacheKey(chainId, w.token), false);
      });
    }
  } catch {
    // RPC down — nothing is convicted, and every token below defaults to trusted.
  }

  for (const addr of todo) {
    const verdict = trustCache.get(cacheKey(chainId, addr)) ?? true;
    trustCache.set(cacheKey(chainId, addr), verdict);
    out.set(addr, verdict);
  }
  return out;
}

/** BigInt-safe scale of a raw token amount to a display Number (ES2017 — no
 *  `10n ** n` literal). Mirrors lib/sources/chain/aave-v3-tokens.ts `scaleV3`. */
export function scaleRaw(raw: bigint, decimals: number): number {
  if (raw === BigInt(0)) return 0;
  const neg = raw < BigInt(0);
  const a = neg ? -raw : raw;
  if (decimals <= 0) return neg ? -Number(a) : Number(a);
  const divisor = BigInt("1" + "0".repeat(decimals));
  const whole = a / divisor;
  const frac = a % divisor;
  const v = Number(whole) + Number(frac) / Number(divisor);
  return neg ? -v : v;
}
