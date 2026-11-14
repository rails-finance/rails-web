// Nominal block times by era, for an estimate that turns a span of blocks into
// a span of time (or back) where no block's timestamp is at hand. A figure
// that can wait on a read uses the blocks' own times
// (lib/sources/chain/block-timestamps.ts). Pure and client-safe.
//
// Base ran two-second blocks until the Denim upgrade at block 53,556,127
// (5 Nov 2026) and five a second since (rails-ops ui-jobs 615).

/** The first Base block at 0.2 s. */
export const BASE_DENIM_BLOCK = 53_556_127;

/** Each chain's eras, ascending: from `from` on, `s` seconds a block. A chain
 *  with no fixed cadence (Arbitrum) has none. */
const ERAS: Record<number, readonly { from: number; s: number }[]> = {
  1: [{ from: 0, s: 12 }],
  11155111: [{ from: 0, s: 12 }],
  8453: [
    { from: 0, s: 2 },
    { from: BASE_DENIM_BLOCK, s: 0.2 },
  ],
};

/** The nominal seconds per block at `block`, or null on a chain with no fixed
 *  cadence. */
export function secondsPerBlock(chainId: number, block: number): number | null {
  const eras = ERAS[chainId];
  if (!eras) return null;
  let s = eras[0].s;
  for (const e of eras) if (block >= e.from) s = e.s;
  return s;
}

/** The nominal seconds between blocks `a` and `b`, either order, each era at
 *  its rate. Null on a chain with no fixed cadence. */
export function blockSpanSeconds(chainId: number, a: number, b: number): number | null {
  const eras = ERAS[chainId];
  if (!eras) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let total = 0;
  eras.forEach((e, i) => {
    const start = Math.max(lo, e.from);
    const end = Math.min(hi, eras[i + 1]?.from ?? Infinity);
    if (end > start) total += (end - start) * e.s;
  });
  return total;
}
