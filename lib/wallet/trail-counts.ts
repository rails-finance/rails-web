// The trail's counts (H13.4; ui-jobs 856): how the wallet's summary rows
// become the positions the /summary route and the wallet view's trail count,
// and what a `?vault=` view says of the shares it does not draw.
//
// Client-safe and import-free (type imports aside), so
// scripts/test/trail-counts.test.mjs loads it directly.

import type { WalletCounts, WalletCountsPosition } from "./summary-counts";

/** A wallet family as the counts read it: its summary chain and family, and
 *  `head` where its figures are read at the head (its rows then count one
 *  each, unshaped). */
export interface CountedFamily<R> {
  head?: unknown;
  summaryChain: WalletCountsPosition["chain"];
  summaryFamily: string;
  /** The family's positions from its rows, as the wallet view shapes them. */
  shape(rows: R[]): Promise<Pick<WalletCountsPosition, "positionId" | "status" | "href" | "market">[]>;
}

/** The wallet's counted positions from its summary rows: a family whose
 *  figures are stored (no `head`) shaped as the wallet view shapes it, which
 *  makes no read (an Arbitrum Compound V3 row is one position per Comet);
 *  every other counted row one position (`rowPosition`, null for a row the
 *  counts leave out). A shape that throws leaves its rows to count one each.
 *  Sepolia's families are not shaped. */
export async function summaryPositions<R, F extends CountedFamily<R>>(
  families: F[],
  rows: R[],
  takes: (f: F, r: R) => boolean,
  rowPosition: (r: R) => WalletCountsPosition | null,
): Promise<WalletCountsPosition[]> {
  const positions: WalletCountsPosition[] = [];
  const taken = new Set<R>();
  for (const f of families) {
    if (f.head || f.summaryChain === "sepolia") continue;
    const mine = rows.filter((r) => takes(f, r));
    if (mine.length === 0) continue;
    try {
      for (const p of await f.shape(mine)) {
        positions.push({
          chain: f.summaryChain,
          family: f.summaryFamily,
          positionId: p.positionId,
          status: p.status,
          href: p.href,
          ...(p.market ? { market: p.market } : {}),
        });
      }
      mine.forEach((r) => taken.add(r));
    } catch {
      // The rows count one each below.
    }
  }
  for (const r of rows) {
    if (taken.has(r)) continue;
    const p = rowPosition(r);
    if (p) positions.push(p);
  }
  return positions;
}

/** The counts over the positions: by chain and family, and in all; closed
 *  takes closed, liquidated and redeemed, moved stands apart. */
export function countsOf(
  positions: WalletCountsPosition[],
): Pick<WalletCounts, "positions" | "families" | "total" | "open" | "closed" | "moved" | "chains"> {
  const families = new Map<string, WalletCounts["families"][number]>();
  for (const p of positions) {
    const k = `${p.chain}:${p.family}`;
    const fam = families.get(k) ?? { chain: p.chain, family: p.family, positions: 0, open: 0, closed: 0, moved: 0 };
    fam.positions += 1;
    if (p.status === "open") fam.open += 1;
    else if (p.status === "moved") fam.moved += 1;
    else fam.closed += 1;
    families.set(k, fam);
  }
  const open = positions.filter((p) => p.status === "open").length;
  const moved = positions.filter((p) => p.status === "moved").length;
  return {
    positions,
    families: [...families.values()],
    total: positions.length,
    open,
    closed: positions.length - open - moved,
    moved,
    chains: [...new Set(positions.map((p) => p.chain))],
  };
}

/** One vault protocol's shares the trail counts and the read did not draw
 *  (`drawn` holds `<chain slug>:<positionId>` of each drawn share), by chain
 *  and status, for a `?vault=` view's undrawn lines. A chain `chainIdOf`
 *  does not know is left out. */
export function vaultUndrawn<C>(
  shares: Pick<WalletCountsPosition, "chain" | "positionId" | "status">[],
  drawn: Set<string>,
  chainIdOf: (slug: WalletCountsPosition["chain"]) => C | undefined,
): { family: "vaults"; open: number; closed: number; chain: C }[] {
  const byChain = new Map<string, { family: "vaults"; open: number; closed: number; chain: C }>();
  for (const p of shares) {
    if (drawn.has(`${p.chain}:${p.positionId}`)) continue;
    const chain = chainIdOf(p.chain);
    if (chain == null) continue;
    const u = byChain.get(p.chain) ?? { family: "vaults" as const, open: 0, closed: 0, chain };
    if (p.status === "open") u.open += 1;
    else u.closed += 1;
    byChain.set(p.chain, u);
  }
  return [...byChain.values()];
}

/** The `?vault=` view's line where it draws none of the shares it counts:
 *  "Rails holds 3 holdings in MetaMorpho vaults for this wallet, and draws
 *  none of them here." `status` is the Status pill's. */
export function noneDrawnLine(n: number, protocol: string, status?: "open" | "closed"): string {
  const noun = `${status ? `${status} ` : ""}${n === 1 ? "holding" : "holdings"}`;
  return `Rails holds ${n.toLocaleString("en-US")} ${noun} in ${protocol} for this wallet, and draws none of ${n === 1 ? "it" : "them"} here.`;
}

/** The wallet view's trail (H13.2; ui-jobs 856): the stored positions the
 *  counts hold, then each position read at visit they do not, so the
 *  dashboard's count matches the cards it draws. `slugOf` gives a visit
 *  position's chain as the counts name it; a chain it does not know is left
 *  out. The position pages' /summary count stays stored-only. */
export function trailWithVisited<V extends Omit<WalletCountsPosition, "chain"> & { chain: unknown }>(
  stored: WalletCountsPosition[],
  visited: V[],
  slugOf: (chain: V["chain"]) => WalletCountsPosition["chain"] | undefined,
): WalletCountsPosition[] {
  const seen = new Set(stored.map((p) => `${p.chain}:${p.family}:${p.positionId.toLowerCase()}`));
  const out = [...stored];
  for (const v of visited) {
    const chain = slugOf(v.chain);
    if (!chain) continue;
    const k = `${chain}:${v.family}:${v.positionId.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      chain,
      family: v.family,
      positionId: v.positionId,
      status: v.status,
      href: v.href,
      ...(v.market ? { market: v.market } : {}),
    });
  }
  return out;
}
