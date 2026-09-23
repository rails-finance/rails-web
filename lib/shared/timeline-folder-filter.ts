// A served folder under the page's filters — which folders stand, which open,
// and how many of a standing folder's members the filters admit.
// ----------------------------------------------------------------------------
// A folder carries its members' aggregate and never its members (decision
// 0019, rule 2), so the filters meet it twice. Its HEADER can settle three
// questions without a read: whether any member could pass (else the row goes),
// whether every member passes (the header then describes exactly what the
// filter admits, and the row stays shut), and — on one axis at a time — how
// many pass. A folder the header cannot settle is SPLIT by the filter: it opens
// the way a date filter opens the folders covering a day, its members answer
// the filter row by row, and the count line takes their number once they land.
//
// THE CROSS-TAB ANSWERS FIRST. A folder that carries `cells` (members per
// action key, UTC day, asset set and counterparty set — Aave V3, SparkLend and
// Moonwell Base all serve them) is counted exactly on every axis and every
// combination of axes, by the same rules `memberPasses` applies to one event.
// The one filter it cannot count is a date range that does not run whole UTC
// days, because `day` is its finest grain. Before the cells, an asset filter on
// the 85-folder Aave V3 fixture read every folder's members, one request at a
// time, for 23 s before the line settled (2026-09-21).
//
// Without `cells`, each axis falls back to the rest of the header, and every
// figure there is read off what the index served, never estimated:
//   • action — `counts` is exact per kind. With `other` > 0 the other members'
//     kinds are unnamed, so a split on this axis cannot be counted.
//   • asset — `legs` are (verb, asset) pairs and a member can sit in two of
//     them (a liquidation's debt and its seized collateral), so a split on
//     this axis is never counted from the header; only "all" and "none" are.
//   • date — `byDay` is exact per UTC day, so a day-aligned range is counted.
//   • counterparty — the folder contract carries none, so any counterparty
//     filter leaves the folder standing and unsettled.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";

const DAY = 86_400;

export interface FolderFilterAxes {
  hiddenActions: Set<string>;
  hiddenAssets: Set<string>;
  hiddenCounterparties: Set<string>;
  dateRange: [number, number] | null;
}

/**
 * Can any member of this folder pass? A folder PASSES WHOLE OR NOT AT ALL as a
 * row: it goes only when the header proves no member can pass — every kind in
 * `counts` hidden, every leg's symbol hidden, or a span that misses the range.
 * An axis the header cannot answer admits.
 */
export function folderAdmits(folder: ServedFolder, axes: FolderFilterAxes): boolean {
  const { hiddenActions, hiddenAssets, dateRange } = axes;
  if (
    hiddenActions.size > 0 &&
    folder.other === 0 &&
    folder.counts.length > 0 &&
    folder.counts.every((c) => hiddenActions.has(c.key))
  ) {
    return false;
  }
  if (hiddenAssets.size > 0 && folder.legs.length > 0) {
    const symbols = folder.legs.map((leg) => leg.symbol).filter((s): s is string => !!s);
    if (symbols.length === folder.legs.length && symbols.every((s) => hiddenAssets.has(s))) return false;
  }
  if (dateRange && (folder.lastAt < dateRange[0] || folder.firstAt > dateRange[1])) return false;
  return true;
}

/** One axis's verdict on a folder: every member passes, or this many do, or
 *  the header cannot say. */
type AxisVerdict = { all: true } | { all: false; count: number | null };
const ALL: AxisVerdict = { all: true };

function actionVerdict(folder: ServedFolder, hidden: Set<string>): AxisVerdict {
  if (hidden.size === 0) return ALL;
  const passing = folder.counts.reduce((n, c) => (hidden.has(c.key) ? n : n + c.count), 0);
  if (folder.other > 0) return { all: false, count: null };
  return passing === folder.count ? ALL : { all: false, count: passing };
}

function assetVerdict(folder: ServedFolder, hidden: Set<string>): AxisVerdict {
  if (hidden.size === 0) return ALL;
  const named = folder.legs.every((leg) => !!leg.symbol);
  if (named && folder.legs.every((leg) => !hidden.has(leg.symbol as string))) return ALL;
  return { all: false, count: null };
}

function dateVerdict(folder: ServedFolder, range: [number, number] | null): AxisVerdict {
  if (!range) return ALL;
  if (folder.firstAt >= range[0] && folder.lastAt <= range[1]) return ALL;
  if (!dayAligned(range)) return { all: false, count: null };
  const passing = folder.byDay.reduce((n, b) => {
    const day = Number(b.key);
    return day >= range[0] && day <= range[1] ? n + b.count : n;
  }, 0);
  return { all: false, count: passing };
}

/** Is the range whole UTC days — the grain `byDay` and `cells` count at? */
function dayAligned(range: [number, number]): boolean {
  return range[0] % DAY === 0 && (range[1] + 1) % DAY === 0;
}

/** Does every member on this axis pass? An event with no key on an axis is
 *  never hidden by it, and one with several passes while any is shown — the
 *  rule `memberPasses` applies (useTimelineEvents). */
function axisPasses(keys: string[], hidden: Set<string>): boolean {
  return hidden.size === 0 || keys.length === 0 || keys.some((k) => !hidden.has(k));
}

/** The cross-tab's answer, or NULL where the folder carries none or the date
 *  range is finer than a day. */
function cellsMatchCount(folder: ServedFolder, axes: FolderFilterAxes): number | null {
  if (!folder.cells) return null;
  const range = axes.dateRange;
  if (range && !dayAligned(range)) return null;
  let passing = 0;
  for (const cell of folder.cells) {
    if (axes.hiddenActions.has(cell.kind)) continue;
    if (!axisPasses(cell.assets, axes.hiddenAssets)) continue;
    if (!axisPasses(cell.counterparties, axes.hiddenCounterparties)) continue;
    if (range) {
      const day = Number(cell.day);
      if (day < range[0] || day > range[1]) continue;
    }
    passing += cell.count;
  }
  return passing;
}

/**
 * How many of a standing folder's members the filters admit, read off its
 * header — or NULL when the header cannot say, and the members have to be read.
 *
 * The cross-tab answers where the folder carries one (`cellsMatchCount`).
 * Without it: exact when every axis admits the whole folder (its `count`), or
 * when exactly one axis splits it and that axis is countable. Two splitting
 * axes need the cross-tab (`counts` and `byDay` are separate histograms), so
 * that is NULL too.
 */
export function folderMatchCount(folder: ServedFolder, axes: FolderFilterAxes): number | null {
  const fromCells = cellsMatchCount(folder, axes);
  if (fromCells !== null) return fromCells;
  if (axes.hiddenCounterparties.size > 0) return null;
  const split = [
    actionVerdict(folder, axes.hiddenActions),
    assetVerdict(folder, axes.hiddenAssets),
    dateVerdict(folder, axes.dateRange),
  ].filter((v): v is { all: false; count: number | null } => !v.all);
  if (split.length === 0) return folder.count;
  if (split.length === 1) return split[0].count;
  return null;
}

/** The count line's numerator: the loose events that pass, plus each standing
 *  folder's passing members — off the header where it can say, off the
 *  members once they are read, and a FLOOR while any folder can say neither. */
export function filteredEventCount(
  looseCount: number,
  folders: Array<{ folder: ServedFolder; matched: number | null }>,
  membersOf: (folder: ServedFolder) => BaseActivityEvent[] | undefined,
  passes: (e: BaseActivityEvent) => boolean,
): { count: number; floor: boolean } {
  let count = looseCount;
  let floor = false;
  for (const { folder, matched } of folders) {
    if (matched !== null) {
      count += matched;
      continue;
    }
    const members = membersOf(folder);
    if (!members) {
      floor = true;
      continue;
    }
    for (const e of members) if (passes(e)) count++;
  }
  return { count, floor };
}
