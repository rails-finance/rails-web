// The oracle prices rails-server stores for every Compound event block
// (mig 372; rails-ops reference/compound-prices-at-block.md), read through
// this deployment's proxies. Null where the read failed (the route not
// deployed yet, a backend error): the page then reads every price from the
// archive as before. What the answer lists as missing is read from the
// archive too.

import type { StoredCometBlock } from "@/lib/compound/at-block-prices";
import type { StoredV2Answer } from "@/lib/compound-v2/at-block-prices";

export interface StoredCometAnswer {
  blocks: Record<string, StoredCometBlock>;
  missing: number[];
}

/** At most this many blocks a read (the server's cap). */
const MAX_BLOCKS = 250;
/** At most this many pairs a read (the server's cap). */
const MAX_PAIRS = 400;

export async function fetchStoredCometPrices(
  chainId: number,
  comet: string,
  blocks: readonly number[],
  signal?: AbortSignal,
): Promise<StoredCometAnswer | null> {
  const out: StoredCometAnswer = { blocks: {}, missing: [] };
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS) {
    const qs = new URLSearchParams({
      chain: String(chainId),
      comet,
      blocks: blocks.slice(i, i + MAX_BLOCKS).join(","),
    });
    const res = await fetch(`/api/compound/prices-at?${qs.toString()}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<StoredCometAnswer>;
    if (!body.blocks || !Array.isArray(body.missing)) return null;
    Object.assign(out.blocks, body.blocks);
    out.missing.push(...body.missing);
  }
  return out;
}

export async function fetchStoredV2Prices(
  pairs: readonly string[],
  signal?: AbortSignal,
): Promise<StoredV2Answer | null> {
  const out: StoredV2Answer = { prices: {}, usdc: {}, missing: [] };
  for (let i = 0; i < pairs.length; i += MAX_PAIRS) {
    const qs = new URLSearchParams({ pairs: pairs.slice(i, i + MAX_PAIRS).join(",") });
    const res = await fetch(`/api/compound-v2/prices-at?${qs.toString()}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<StoredV2Answer>;
    if (!body.prices || !body.usdc || !Array.isArray(body.missing)) return null;
    Object.assign(out.prices, body.prices);
    Object.assign(out.usdc, body.usdc);
    out.missing.push(...body.missing);
  }
  return out;
}
