// SERVER-ONLY — the opening balance as rails-server states it, and the one
// translation between its vocabulary and the page's.
// ----------------------------------------------------------------------------
// rails-server keys every histogram in the INDEX's own vocabulary: the raw
// action verb, the raw lowercase token address, the index's own market and pool
// keys, base-unit integer amounts. It resolves nothing — no symbols, no
// decimals, no renamed verbs — because it has no resolver and growing one would
// put a second source of truth for a symbol behind the same figures the rows
// already resolve through the transforms.
//
// So each `/timeline/summary` proxy route does the resolution, using the SAME
// resolver its `/timeline` twin puts the rows through, and this module holds the
// part of that which is identical everywhere: rename the asset keys, leave every
// count and every base-unit amount exactly as it arrived.
//
// Amounts are NEVER scaled here. Summing base units on both sides of the cut and
// scaling once at the end is strictly more precise than scaling each side and
// adding the results, and the merge that adds them lives on the page.

import type {
  OpeningBucket,
  OpeningFlowBucket,
  OpeningOmission,
  TimelineOpeningBalance,
} from "@/lib/shared/timeline-opening-balance";

/** The shape rails-server returns. Identical to TimelineOpeningBalance except
 *  that `byAsset[].key` and `flows[].key` are still in the index's vocabulary,
 *  and each flow bucket declares which vocabulary that is. */
export interface UpstreamOpeningBalance {
  cutoffBlock: number;
  totalEvents: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  firstBlock: number | null;
  lastBlock: number | null;
  byAction: OpeningBucket[];
  byDay: OpeningBucket[];
  byAsset: OpeningBucket[] | null;
  actors: { external: number; actors: { address: string; count: number }[] } | null;
  flows: (OpeningFlowBucket & { keyKind: "tokenAddress" | "marketKey" | "poolKey" | "position" })[] | null;
  omitted: OpeningOmission[];
}

/**
 * Rename the asset keys into the page's vocabulary.
 *
 * `resolve` returns the display symbol for a key, or undefined when it cannot
 * name one. An UNRESOLVED key is kept VERBATIM rather than dropped or renamed to
 * a placeholder: the count it carries is a true fact about the position, and the
 * page shows the reader the same string the rows' own unresolved fallback shows.
 * Dropping it would understate the position; substituting one shared placeholder
 * would merge two different assets into one bucket.
 *
 * Buckets that resolve to the SAME symbol are added together — two addresses can
 * share a display symbol, and the page's own axis has always merged them, since
 * `getEventAssetKeys` returns symbols and dedupes on them.
 */
export function resolveOpeningAssetKeys(
  upstream: UpstreamOpeningBalance,
  resolve: (key: string) => string | undefined,
  /** Decimals for a flow bucket whose own `decimals` is null — the index knows
   *  them only where it stores them per vault. Returning undefined leaves the
   *  bucket null, which the page must read as unknown rather than as zero. */
  resolveDecimals?: (key: string) => number | undefined,
): TimelineOpeningBalance {
  const rename = (buckets: OpeningBucket[] | null): OpeningBucket[] | null => {
    if (!buckets) return null;
    const merged = new Map<string, number>();
    for (const b of buckets) {
      const key = resolve(b.key) ?? b.key;
      merged.set(key, (merged.get(key) ?? 0) + b.count);
    }
    return [...merged.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };

  // Flows keyed by anything OTHER than a token address are already in the
  // page's vocabulary — a market key, a pool key, or the name of one leg of a
  // single-pair position — so only the tokenAddress kind is renamed. Legs are
  // added when two addresses share a symbol, in base units, as strings.
  const flows: OpeningFlowBucket[] | null = upstream.flows
    ? [
        ...upstream.flows
          .reduce((acc, f) => {
            const isAddress = f.keyKind === "tokenAddress";
            const key = isAddress ? (resolve(f.key) ?? f.key) : f.key;
            const decimals = f.decimals ?? resolveDecimals?.(f.key) ?? null;
            const id = `${key} ${f.epoch ?? ""}`;
            const cur = acc.get(id);
            if (!cur) {
              acc.set(id, {
                key,
                ...(isAddress ? { sourceKey: f.key.toLowerCase() } : {}),
                decimals,
                epoch: f.epoch,
                legs: { ...f.legs },
              });
              return acc;
            }
            for (const [leg, amount] of Object.entries(f.legs)) {
              cur.legs[leg] = (BigInt(cur.legs[leg] ?? "0") + BigInt(amount)).toString();
            }
            return acc;
          }, new Map<string, OpeningFlowBucket>())
          .values(),
      ]
    : null;

  return {
    cutoffBlock: upstream.cutoffBlock,
    totalEvents: upstream.totalEvents,
    firstTimestamp: upstream.firstTimestamp,
    lastTimestamp: upstream.lastTimestamp,
    firstBlock: upstream.firstBlock,
    lastBlock: upstream.lastBlock,
    byAction: upstream.byAction,
    byDay: upstream.byDay,
    byAsset: rename(upstream.byAsset),
    actors: upstream.actors,
    flows,
    omitted: upstream.omitted,
  };
}
