// Aave V3 reserve-token metadata resolver — server-only.
// ----------------------------------------------------------------------------
// V3 reserves are keyed by their underlying TOKEN ADDRESS (no V4 reserve ids), so
// resolving a reserve's symbol + decimals is a plain ERC20 read. This is V3's
// analog of the V4 adapter's `resolveReserves` (getReserve): a cached multicall
// over `symbol()` + `decimals()`, so the timeline / listing loaders can name and
// scale any reserve the dump references — including the ~42 long-tail reserves
// absent from the curated asset catalog.
//
// The catalog (lib/aave-v3/asset-catalog.ts) overrides the display symbol for the
// assets we name explicitly and supplies their LT; everything else gets the
// on-chain symbol and a null LT. Decimals are always chain-read so they're never
// wrong for a delisted long-tail token.
//
// SERVER-ONLY — imported only from /api/* route handlers and the server-side
// builders/loaders under lib/sources/ (it calls Alchemy via lib/sources/chain/rpc).

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { V3_SYMBOL_BY_ADDR, V3_LT_BY_ADDR } from "@/lib/aave-v3/asset-catalog";
import type { AssetFlow } from "@/lib/shared/types/event-shape";

const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

export interface V3TokenMeta {
  /** Lowercased token address. */
  address: string;
  symbol: string;
  decimals: number;
  /** Liquidation threshold (0..1) from the catalog; null when unknown / borrow-only. */
  lt: number | null;
  /** Set when `decimals()` was not read — the RPC failed or the token has no
   *  such accessor — so `decimals` is the 18 stand-in. A transport failure is
   *  never cached; the next call asks again. */
  unresolved?: true;
}

// Process-lifetime cache: a reserve's symbol/decimals never change, so resolve
// each address at most once per server process. Keyed `chainId:address` — the
// same address is a different token on a different chain, and the curated
// catalog applied below is Ethereum's.
const cache = new Map<string, V3TokenMeta>();
const cacheKey = (chainId: ChainId, addr: string) => `${chainId}:${addr}`;

/** Resolve symbol + decimals + catalog LT for every reserve address, batched via
 *  one multicall over the uncached addresses. Tolerates a failed ERC20 read by
 *  falling back to a truncated-address symbol + 18 decimals (the row still
 *  renders).
 *
 *  `chainId` selects both the RPC and whether the curated Ethereum catalog
 *  applies. On Base it does not: those addresses are Ethereum's, and every
 *  Base reserve resolves its symbol from chain and its LT from the reserve
 *  configuration the caller reads — which is the better source anyway. */
export async function resolveV3Tokens(
  addresses: string[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<Map<string, V3TokenMeta>> {
  const curated = chainId === MAINNET_CHAIN_ID;
  const out = new Map<string, V3TokenMeta>();
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
    // RPC down — every uncached reserve falls back below.
    results = [];
  }

  todo.forEach((addr, i) => {
    const symRes = results[i * 2] as { status: string; result?: unknown } | undefined;
    const decRes = results[i * 2 + 1] as { status: string; result?: unknown } | undefined;
    const onChainSym =
      symRes?.status === "success" && typeof symRes.result === "string" ? (symRes.result as string) : undefined;
    const decimalsRead = decRes?.status === "success" && decRes.result != null;
    const decimals = decimalsRead ? Number(decRes.result as number | bigint) : 18;
    const symbol =
      (curated ? V3_SYMBOL_BY_ADDR[addr] : undefined) ?? onChainSym ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    const meta: V3TokenMeta = {
      address: addr,
      symbol,
      decimals,
      lt: (curated ? V3_LT_BY_ADDR[addr] : undefined) ?? null,
      ...(decimalsRead ? {} : { unresolved: true as const }),
    };
    // An RPC that did not answer says nothing about the token: only an answer
    // is kept.
    if (results.length > 0) cache.set(cacheKey(chainId, addr), meta);
    out.set(addr, meta);
  });

  return out;
}

/** BigInt-safe scale of a raw token amount to a display Number (ES2017 — no
 *  `10n ** n` literal). Mirrors lib/sources/chain/aave-v4-events.ts `scale`. */
export function scaleV3(raw: bigint, decimals: number): number {
  if (raw === BigInt(0)) return 0;
  if (decimals <= 0) return Number(raw);
  const divisor = BigInt("1" + "0".repeat(decimals));
  const whole = raw / divisor;
  const frac = raw % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}

/** Build an AssetFlow for a V3 token movement. direction: "in" = toward wallet,
 *  "out" = toward protocol (matches the V4 loader's convention). */
export function flowV3(meta: V3TokenMeta, raw: bigint, direction: "in" | "out"): AssetFlow {
  return {
    token: meta.address,
    tokenSymbol: meta.symbol,
    tokenDecimals: meta.decimals,
    amount: raw.toString(),
    amountFormatted: scaleV3(raw, meta.decimals),
    direction,
  };
}
