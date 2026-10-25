// Aave V3 reserve-token metadata resolver — server-only.
// ----------------------------------------------------------------------------
// V3 reserves are keyed by their underlying TOKEN ADDRESS (no V4 reserve ids), so
// resolving a reserve's symbol + decimals is a plain ERC20 read. This is V3's
// analog of the V4 adapter's `resolveReserves` (getReserve), read through
// ./erc20-meta.ts `resolveErc20Meta` (the api's token_meta first, the chain for
// what it lacks), so the timeline / listing loaders can name and scale any
// reserve the dump references — including the ~42 long-tail reserves absent
// from the curated asset catalog.
//
// The catalog (lib/aave-v3/asset-catalog.ts) overrides the display symbol for the
// assets we name explicitly and supplies their LT; everything else gets the
// token's own symbol and a null LT. Decimals always come from the token's
// decimals() answer (stored or read), so they're never wrong for a delisted
// long-tail token.
//
// SERVER-ONLY — imported only from /api/* route handlers and the server-side
// builders/loaders under lib/sources/ (through ./erc20-meta).

import { resolveErc20Meta } from "./erc20-meta";
import { ARBITRUM_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { V3_SYMBOL_BY_ADDR, V3_LT_BY_ADDR } from "@/lib/aave-v3/asset-catalog";
import { AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR } from "@/lib/aave-v3-arbitrum/asset-catalog";
import type { AssetFlow } from "@/lib/shared/types/event-shape";

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

/** Resolve symbol + decimals + catalog LT for every reserve address, the
 *  uncached ones through `resolveErc20Meta`. Tolerates a failed ERC20 read by
 *  falling back to a truncated-address symbol + 18 decimals (the row still
 *  renders).
 *
 *  `chainId` selects both the chain and whether the curated Ethereum catalog
 *  applies. On Base it does not: those addresses are Ethereum's, and every
 *  Base reserve resolves its symbol from the token and its LT from the reserve
 *  configuration the caller reads — which is the better source anyway. */
export async function resolveV3Tokens(
  addresses: string[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<Map<string, V3TokenMeta>> {
  const curated = chainId === MAINNET_CHAIN_ID;
  // Arbitrum's two USDC reserves both answer `symbol()` with "USDC"; its
  // catalog names the bridged one USDC.e. No other chain overrides a symbol.
  const named = chainId === ARBITRUM_CHAIN_ID ? AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR : undefined;
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

  const metas = await resolveErc20Meta(todo, chainId);
  for (const addr of todo) {
    const m = metas.get(addr);
    const symbol =
      (curated ? V3_SYMBOL_BY_ADDR[addr] : named?.[addr]) ??
      (m?.named ? m.symbol : undefined) ??
      `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    const meta: V3TokenMeta = {
      address: addr,
      symbol,
      decimals: m && !m.unresolved ? m.decimals : 18,
      lt: (curated ? V3_LT_BY_ADDR[addr] : undefined) ?? null,
      ...(m && !m.unresolved ? {} : { unresolved: true as const }),
    };
    // Only a read decimals is kept here; resolveErc20Meta's own cache holds
    // what the chain answered without one, so asking again costs no RPC.
    if (!meta.unresolved) cache.set(cacheKey(chainId, addr), meta);
    out.set(addr, meta);
  }

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
