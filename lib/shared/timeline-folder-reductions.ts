// The third contributor to a windowed page's partition — a folder's own
// arithmetic, merged into the reductions the page already makes.
// ----------------------------------------------------------------------------
// A served folder stands for members the page never sees (decision 0019's
// evening amendment, rule 2: a folder carries its members' aggregate and never
// its members), so a whole-history reduction that walks only the served EVENTS
// is short by everything inside a folder. The wire closes that by carrying, per
// folder, exactly what those reductions read — `flows`, `actors` and `byDay`,
// in the OPENING BALANCE's own types — and this module is the merge.
//
//   rails-ops/decisions/0019-timeline-boundary-card.md
//     — the amendment, and the sealing amendment these fields are chosen to be
//       storable under as-is.
//
// ── THE PARTITION IS THREE-WAY AND STILL EXCLUSIVE
//
// `summary < cutoffBlock <= served events + folder members`, and the folders
// and the ungrouped events are disjoint by construction: the index emits each
// event either as its own row or as a member of exactly one folder. So every
// merge here is an ADDITION — externals add, per-actor counts add, day buckets
// add, flow legs add — and none of it double-counts. Nothing in this module
// relaxes that cut or re-derives either of the other two halves.
//
// ── BASE UNITS, SUMMED BEFORE ANYTHING IS SCALED
//
// Flow legs are exact base-unit sums as decimal strings on both sides of the
// cut. They are added with BigInt and handed to the protocol's own reducer
// unscaled, because summing base units and scaling once is strictly more
// precise than scaling each addend and adding the results.

import type { OpeningBucket, OpeningFlowBucket } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";

/**
 * Every contributor's flow buckets as ONE list, summed on (key, epoch) in base
 * units.
 *
 * ⚠️ ONE BUCKET PER ASSET, AND THAT IS LOAD-BEARING. The protocols' tower
 * reducers REFUSE a whole asset whose legs cannot be scaled — a reserve short
 * by an unknown amount is worse than one that states nothing — and a refusal
 * can only be complete if each asset reaches the reducer as a single bucket.
 * Two buckets for one key, with the refusal falling on the second, would leave
 * the first one's figures standing inside a total presented as a lifetime. So
 * the summary's buckets and the folders' are merged HERE, before any of them
 * meets a reducer, rather than concatenated.
 *
 * `decimals` is the first non-null any contributor names; a key every one left
 * null stays null, which every caller must read as unknown rather than as zero.
 * `sourceKey` likewise — it is the raw address the tower prices by, and every
 * contributor that has one has the same one.
 */
export function mergeFlowBuckets(...lists: (readonly OpeningFlowBucket[] | null | undefined)[]): OpeningFlowBucket[] {
  const merged = new Map<string, OpeningFlowBucket>();
  for (const list of lists) {
    for (const bucket of list ?? []) {
      const id = `${bucket.key} ${bucket.epoch ?? ""}`;
      const cur = merged.get(id);
      if (!cur) {
        merged.set(id, { ...bucket, legs: { ...bucket.legs } });
        continue;
      }
      if (cur.decimals == null && bucket.decimals != null) cur.decimals = bucket.decimals;
      if (!cur.sourceKey && bucket.sourceKey) cur.sourceKey = bucket.sourceKey;
      for (const [leg, amount] of Object.entries(bucket.legs)) {
        cur.legs[leg] = (BigInt(cur.legs[leg] ?? "0") + BigInt(amount)).toString();
      }
    }
  }
  return [...merged.values()];
}

/**
 * The folders' lifetime-flow buckets, summed across folders.
 *
 * A folder whose `flows` is NULL — the family declares no flow reduction —
 * contributes nothing, which is the same thing the summary's `omitted` says.
 * A folder whose `flows` is `[]` contributes nothing either, but means
 * something else: its members were reduced and produced no flow, which is what
 * every transfer folder on the Aave family answers (an aToken move is a custody
 * change, so `AAVE_FAMILY_FLOWS` excludes it).
 */
export function folderFlows(folders: readonly ServedFolder[] | null | undefined): OpeningFlowBucket[] {
  return mergeFlowBuckets(...(folders ?? []).map((folder) => folder.flows));
}

/**
 * Add the folders' actor split to a summary reduced from the events on the
 * page.
 *
 * The twin of `withOpeningActors` for the third half of the partition, and the
 * same arithmetic: `external` sums, per-actor counts sum, and `total` grows by
 * the members the folders stand for — a folder's `count` IS its total, which is
 * why the wire's actor shape carries no total of its own.
 *
 * A folder whose `actors` is NULL — the family judges no actor on these rows —
 * still contributes its members to `total`. They happened; what is unknown is
 * who executed them, and inflating `external` or dropping the members would
 * each state something the page does not hold.
 */
export function withFolderActors(
  summary: ExternalActorSummary,
  folders: readonly ServedFolder[] | null | undefined,
): ExternalActorSummary {
  if (!folders || folders.length === 0) return summary;
  const counts = new Map<string, number>();
  for (const a of summary.actors) counts.set(a.address, (counts.get(a.address) ?? 0) + a.count);
  let total = summary.total;
  let external = summary.external;
  for (const folder of folders) {
    total += folder.count;
    if (!folder.actors) continue;
    external += folder.actors.external;
    for (const a of folder.actors.actors) counts.set(a.address, (counts.get(a.address) ?? 0) + a.count);
  }
  return {
    total,
    external,
    actors: [...counts]
      .map(([address, count]) => ({ address, count }))
      .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address)),
  };
}

/**
 * The events the folders stand for — the members the page holds as aggregates
 * and never as rows.
 *
 * A folder's `count` IS its member total (rule 6: a folder header is complete
 * about its members), so this is the fourth thing the partition's third half
 * contributes: any whole-history COUNT the page states is short by it.
 */
export function folderMembers(folders: readonly ServedFolder[] | null | undefined): number {
  return (folders ?? []).reduce((n, folder) => n + folder.count, 0);
}

/**
 * The earliest event the page holds, folders included — a folder's own
 * `firstAt` is its oldest member's timestamp.
 *
 * The fifth thing the third contributor owns, and the one that bites a page
 * with NO CUT. Where the whole history fits the window there is no opening
 * balance to read a tenure off, so a page reads it off `events[0]` — and on a
 * grouped answer the oldest row may be inside a folder and absent from
 * `events` entirely. Measured 2026-09-12 on SparkLend `0xb137…ece5`: all 2,776
 * events in 28 folders, `events` empty, so `events[0]` is undefined and the
 * position states no tenure at all.
 *
 * Null only where there is nothing to date — no events and no folders.
 */
export function earliestHeldTimestamp(
  events: readonly { timestamp: number }[],
  folders: readonly ServedFolder[] | null | undefined,
): number | null {
  const candidates = [
    ...(events.length > 0 ? [Math.min(...events.map((e) => e.timestamp))] : []),
    ...(folders ?? []).map((f) => f.firstAt),
  ];
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/**
 * The folders' day histogram, summed across folders on the UTC day key.
 *
 * The key is already the day's start in unix seconds as a decimal string —
 * byte-for-byte the heatmap's own `startOfUtcDay` and the summary's own
 * `byDay` — so this is an addition on the same keys the grid already merges
 * the opening balance on, with no re-bucketing.
 *
 * These days are ABOVE the cut and their events are one tap away, so they are
 * ORDINARY days: ordinary shading, ordinary click, no "summarised" treatment
 * (settled 2026-09-12). That is why they reach the grid as their own input
 * rather than joining `priorDays`, which is the below-cut half and is NOT
 * selectable.
 */
export function folderDays(folders: readonly ServedFolder[] | null | undefined): OpeningBucket[] {
  const counts = new Map<string, number>();
  for (const folder of folders ?? []) {
    for (const bucket of folder.byDay) counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + bucket.count);
  }
  return [...counts].map(([key, count]) => ({ key, count }));
}
