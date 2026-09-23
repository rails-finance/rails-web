// A folder the INDEX served — the wire shape, and the one rule about its id.
// ----------------------------------------------------------------------------
// Decision 0019's evening amendment moved the timeline's cut from EVENTS to
// ROWS: a repetitive stretch arrives as one folder row carrying its members'
// aggregate, ungrouped events arrive as themselves, and opening a folder
// fetches its members. Two families read folders off the wire today — SparkLend
// and Aave V3, the arms whose index already carries each event's running state
// (`supply_before/after`, `debt_before/after`), so a folder standing in for a
// hundred rows leaves nothing downstream to reconstruct. The other fifteen
// still group client-side through `lib/shared/run-folders.tsx`, and both paths
// run side by side until the last family is across.
//
//   rails-ops/decisions/0019-timeline-boundary-card.md
//     — "Amendment 2026-09-10 (evening)" and both "Implementation note
//        2026-09-10 (night)" sections: the six rules, the wire contract as
//        built, and why Moonwell Base cannot go first.
//   rails-ops/reference/timeline-attention-budget.md
//     — the three budget layers and the rejected list.
//
// ── THE FOLDER id IS RESPONSE-SCOPED, AND THAT IS WHY IT IS RENAMED HERE
//
// The index gap-fills BACKWARDS (an August census filled 1,223 dropped events),
// and a chunk closes at the first transaction boundary at or past the target —
// so one event inserted inside a stretch moves that chunk's boundary and every
// boundary after it. An id derived from a boundary therefore rots on backfill,
// which is precisely what a permalink must not do. The wire calls the field
// `id`; this module calls it `responseId` and brands it, because a field named
// `id` invites exactly the persistence that breaks. A `FolderResponseId` cannot
// be handed to anything that takes an event key or an href without a cast, and
// nothing writes one into a URL, into `localStorage`, or into a share href.
//
// The DURABLE coordinate is the EVENT KEY — a chain coordinate the index cannot
// renumber — and that is what the members route answers by and what a permalink
// carries. See `lib/shared/folder-members.ts` for the two entry points.
//
// ── AMOUNTS ARE BASE UNITS; THE PROXY NAMES THE ASSET, THE PAGE SCALES IT
//
// A leg carries the index's own key (a lowercase token address on this family)
// plus an `assetKeyKind` saying what that key IS — the same discriminator the
// opening balance already uses. rails-server resolves no symbols and scales no
// decimals, for the same reason it does not on the other side of the cut: two
// resolvers behind the same figures would drift. So each `/timeline` proxy
// route resolves symbol and decimals through the SAME resolver its rows go
// through and attaches them here, and the page scales once, from base units,
// through `scaleBaseUnits`. Σ-then-scale is strictly more precise than the
// client's present scale-then-sum, so a served folder's header can differ from
// a client-grouped one in the last places. That difference is the served one
// being right.

import type { ReactNode } from "react";
import type { RunAggregate } from "@/components/shared/timeline-run-card";
import type { SpineIcon } from "@/components/shared/spine-column";
import { scaleBaseUnits, type OpeningBucket, type OpeningFlowBucket } from "@/lib/shared/timeline-opening-balance";

/** A folder handle valid ONLY within the response that carried it. Branded so
 *  it cannot be passed where an event key or an href belongs — see the header.
 *  Never persisted, never shared, never in a URL. */
export type FolderResponseId = string & { readonly __responseScoped: unique symbol };

/** What the index's key for a leg's denomination IS — the same vocabulary
 *  `OpeningFlowBucket`'s `keyKind` uses on the other side of the cut. */
export type FolderAssetKeyKind = "tokenAddress" | "marketKey" | "poolKey" | "position";

/** One summed pair on a folder's header. `amount` is Σ of the members'
 *  MAGNITUDES in base units (the sign lives in the verb); `symbol` and
 *  `decimals` are the proxy's resolution of `asset`, and either can be null on
 *  a denomination the resolver could not name — in which case the pair is not
 *  drawn at all, because an unscaled figure is not a figure (chain-truth
 *  charter: a figure the page cannot state is absent, never a zero). */
export interface ServedFolderLeg {
  verb: string;
  /** The index's own key — a lowercase token address on the Aave family. */
  asset: string;
  assetKeyKind: FolderAssetKeyKind;
  /** Base units, a decimal string. Never a float, never scaled on the wire. */
  amount: string;
  /** How many members contributed to THIS leg. */
  count: number;
  provWhat: string;
  /** Resolved by the `/timeline` proxy through the rows' own resolver. This is
   *  the key the asset filter counts and hides by, so it is the name the ROWS
   *  file the same asset under. */
  symbol: string | null;
  decimals: number | null;
  /** The name the header draws, where it is not `symbol` — a receipt token
   *  counted under its underlying (Moonwell's mTokens: filed as "cbBTC",
   *  drawn as "mcbBTC" wearing cbBTC's mark). Absent: `symbol` is drawn. */
  displaySymbol?: string;
}

/** Members per event KIND, in the index's own vocabulary. A bucket LIST, not a
 *  map — the summary's own histogram grammar. Distinct from `legs` (verb+asset
 *  pairs) and from `kind` (the run's kind): the header needs all three. */
export interface ServedFolderCount {
  key: string;
  count: number;
}

/** Rule 6's answer: the one member the header names because the aggregate
 *  would otherwise hide it. `eventKey` is the durable coordinate. */
export interface ServedFolderOutlier {
  eventKey: string;
  reason: "kind" | "magnitude";
  label: string;
}

export interface ServedFolder {
  /** See the header — response-scoped, branded, never persisted. */
  responseId: FolderResponseId;
  /** The family's own run-spec key: "liquidation", "transfer", "mixed". Drives
   *  the badge, the tone and the corner mark; the server sends no words, no
   *  tone and no icon. */
  kind: string;
  count: number;
  txCount: number;
  /** 1-based row numbers over the WHOLE history, oldest = 1 (decision 0019 §3:
   *  counts and numbering are literal, everywhere). */
  ordinalFirst: number;
  ordinalLast: number;
  firstAt: number;
  lastAt: number;
  firstBlock: number;
  lastBlock: number;
  legs: ServedFolderLeg[];
  counts: ServedFolderCount[];
  /** Members outside the kinds `counts` names, so the header's parts sum to
   *  `count`. */
  other: number;
  /** The arm's own before/after figures at the folder's boundaries, keyed per
   *  asset (`supply:<asset>` / `debt:<asset>`) in base units. NULL where the
   *  arm has none — never a zero, never a dash. Carried but not drawn: a
   *  per-asset state line on a folder header is grammar decision 0019 has not
   *  written yet, and inventing one here would be a second boundary card. */
  stateBefore: Record<string, string> | null;
  stateAfter: Record<string, string> | null;
  outlier: ServedFolderOutlier | null;

  /** The lifetime-tower reduction over the members, in the OPENING BALANCE's
   *  own shape — same leg names, same base units — so a folder merges through
   *  the code path the summary already merges through
   *  (`lib/shared/timeline-folder-reductions.ts`).
   *
   *  NOT derivable from `legs` and never a substitute for it: `legs` are the
   *  header's display pairs (verb + asset, transfers included, "Sent" /
   *  "Received"), `flows` are the tower's legs (leg name + asset, transfers
   *  EXCLUDED because an aToken move is a custody change, not a flow). A
   *  transfer folder carries legs and an empty flow list, which is the measured
   *  case on this arm.
   *
   *  NULL = the family declares no flow reduction at all (the mirror of the
   *  summary's `omitted`). `[]` = the members contributed nothing. A zero and
   *  an absence are different claims. */
  flows: OpeningFlowBucket[] | null;

  /** Who executed the members, in the summary's own shape minus its `total` —
   *  `count` above IS the total. NULL where the family judges no actor. */
  actors: { external: number; actors: { address: string; count: number }[] } | null;

  /** Members per UTC calendar day. The key is the day's start in unix seconds
   *  as a decimal string — `Math.floor(ts / 86400) * 86400`, byte-for-byte the
   *  heatmap's own `startOfUtcDay` and the summary's own `byDay`. Never null: a
   *  folder always has members and a member always has a timestamp. */
  byDay: OpeningBucket[];

  /** Members per (action key, UTC day, asset symbols, counterparties) — the
   *  cross-tab a filtered page counts a folder's matching members from
   *  without reading them (`folderMatchCount`,
   *  lib/shared/timeline-folder-filter.ts). Keyed in the filters' own
   *  vocabulary: `getEventActionKey`, `getEventAssetKeys`,
   *  `getEventCounterpartyKeys`. NULL where the family serves none, or where
   *  a cell's asset did not resolve to the symbol its members would carry —
   *  the page then reads the members to count. */
  cells: ServedFolderCell[] | null;
}

/** One cell of a folder's cross-tab: `count` members of action `kind` on the
 *  UTC `day` (the `byDay` key), touching exactly `assets` and naming exactly
 *  `counterparties` (either possibly empty — an event with none is never hidden
 *  on that axis). */
export interface ServedFolderCell {
  kind: string;
  day: string;
  assets: string[];
  counterparties: string[];
  count: number;
}

/** One row of a grouped timeline: an event that stands for itself, or a folder
 *  standing for a stretch. Ascending chain order on the wire; the page reverses
 *  it with the rest of the list. */
export type ServedTimelineRow<E> = { kind: "event"; event: E } | { kind: "folder"; folder: ServedFolder };

/**
 * One entry of a grouped response's INTERLEAVING PLAN.
 *
 * The events travel flat and the rows travel as a plan, because
 * `toTimelineWire`'s diet — the thing that keeps a deep history affordable —
 * works over one flat array. So a `/timeline?group=1` proxy response carries
 * its transformed events in `events`, in order, and one plan entry per served
 * row: an `event` entry consumes the next event, a `folder` entry carries its
 * own header and consumes none. `interleaveRowPlan` puts them back together on
 * the page.
 */
export type TimelineRowPlanEntry = { kind: "event" } | { kind: "folder"; folder: ServedFolder };

/** The fields a grouped `/timeline` response adds to the flat one. Everything
 *  else on that response — `wallet`, `events`, `totalEvents`, `cutoffBlock` —
 *  means exactly what it always meant. */
export interface GroupedTimelineFields {
  grouped: true;
  rowPlan: TimelineRowPlanEntry[];
  /** How many EVENTS the served rows cover — not `rowPlan.length` once a
   *  folder stands for a hundred of them, and not `events.length` either,
   *  which counts only the ungrouped ones. `totalEvents − eventsServed` is
   *  what sits below the cut, and it is what seeds the numbering. */
  eventsServed: number;
  /** Which of the two bounds produced the cut — the row cap, the event scan
   *  bound, or neither — so the boundary card can state the truth. */
  boundBy: "rows" | "scan" | null;
}

/**
 * Put a grouped response's flat events back into its rows, in the order the
 * index served them (ascending chain order).
 *
 * A plan with more `event` entries than there are events is a response that
 * lost rows in transit; the extra entries are dropped rather than filled with
 * a placeholder, because a placeholder row would be a card claiming an event
 * nobody read.
 */
export function interleaveRowPlan<E>(plan: TimelineRowPlanEntry[], events: E[]): ServedTimelineRow<E>[] {
  const rows: ServedTimelineRow<E>[] = [];
  let at = 0;
  for (const entry of plan) {
    if (entry.kind === "folder") {
      rows.push({ kind: "folder", folder: entry.folder });
      continue;
    }
    const event = events[at];
    at += 1;
    if (event !== undefined) rows.push({ kind: "event", event });
  }
  return rows;
}

/** The query param that chooses how a page reads its history — as ROWS or as
 *  a flat window. `0` is the only value that turns grouping OFF. */
export const SERVED_FOLDERS_PARAM = "folders";

/**
 * Whether this load reads its history as ROWS. DEFAULT ON since 2026-09-12;
 * `?folders=0` is the way back to a flat window.
 *
 * ── THE THREE-WAY PARTITION, AND WHY IT IS NOW COMPLETE
 *
 * A grouped answer's `events` holds only the UNGROUPED events, and the folder
 * members sit ABOVE the cut — so the checkpoint model's two halves do not cover
 * the whole history between them. The summary states everything below
 * `cutoffBlock`, the served events state the ungrouped part from it, and the
 * FOLDERS state the rest. Three contributors to one exclusive partition, never
 * two copies of one, so nothing is counted twice and nothing is missed.
 *
 * That third contributor answers with its own arithmetic — `flows`, `actors`
 * and `byDay` above — which is what a whole-history reduction over
 * `opening + rows` needs to be complete: the lifetime tower, the external-actor
 * split, the heatmap's density and the export menu's scope each add the
 * folders' own reduction through `lib/shared/timeline-folder-reductions.ts`.
 * The two FILTER MENUS were already exact, from `counts` and `legs` (see
 * `useTimelineEvents`).
 *
 * ── WHY THE FLAG SURVIVES ITS OWN DEFAULT
 *
 * It was opt-in while legs B and D of `0019` were open. Both are closed, so the
 * default flipped — but the param stays, and stays read on BOTH hops, because
 * the flat answer is the EXPECTATION the grouped one is checked against:
 * `scripts/verify/verify-folder-reductions.mjs` opens the same position twice
 * and compares the two histories to the day, to the actor and to the base unit.
 * Delete the opt-out and that comparison has nothing to compare with.
 */
export function servedFoldersEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return servedFoldersFromParam(new URLSearchParams(window.location.search).get(SERVED_FOLDERS_PARAM));
  } catch {
    return true;
  }
}

/** The same test, for the server half — a Next `searchParams` value, which is
 *  a string, an array of them, or absent. One function so the two hops cannot
 *  disagree about a load: the server picks the timeline read the tail makes and
 *  the client picks the one it fetches after hydration, and a page whose halves
 *  disagreed would fetch one history and render the other. */
export function servedFoldersFromParam(value: string | string[] | null | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) !== "0";
}

/**
 * What a family says about a folder that is NOT on the wire: the words, the
 * tone, the glyphs.
 *
 * The index sends `kind`, `legs`, `counts` and `other` and nothing else — no
 * words, no tone, no icon — because those are display, and display never left
 * the web. This is the same register each `lib/<family>/timeline-runs.tsx`
 * already declares for its client-grouped runs, keyed off the served `kind`
 * instead of off a spec's predicate, so both paths draw the identical card.
 */
export interface FolderRegisterEntry {
  /** Singular noun for one member — "liquidation". Pluralised in the Σ receipt
   *  and the aria label, which is where a folder row names its members: the
   *  row draws the Σ glyph and the verbs beside each pair, never a word for
   *  the action. */
  memberNoun: string;
  tone?: "caution" | "danger" | "neutral";
  spineIcon?: SpineIcon;
  warningLabel?: string;
  muted?: boolean;
  /** The corner mark on the folder's glyph — the kind's severity at a glance,
   *  before anything is expanded. */
  folderBadge?: ReactNode;
}

/** One family's whole folder register: served kind → how it draws. */
export type ServedFolderRegister = (folder: ServedFolder) => FolderRegisterEntry;

/**
 * A wire leg as the run card's header draws it, or NULL where it cannot be
 * drawn at all.
 *
 * The pair is dropped — not zeroed — when the proxy could not name the
 * denomination or its decimals: a magnitude with no unit is not a figure, and
 * the chain-truth charter's rule is that such a figure is absent rather than
 * stated as nothing. The count rides the pair (`RunAggregate.count`), which is
 * the same mini-pill a client-grouped folder already wears.
 */
export function legAsAggregate(leg: ServedFolderLeg): RunAggregate | null {
  if (!leg.symbol) return null;
  const value = scaleBaseUnits(leg.amount, leg.decimals);
  if (value == null) return null;
  return {
    verb: leg.verb,
    value,
    symbol: leg.displaySymbol ?? leg.symbol,
    ...(leg.displaySymbol ? { iconSymbol: leg.symbol } : {}),
    provWhat: leg.provWhat,
    count: leg.count,
  };
}

/** Every drawable pair on a folder's header, in the order the index sent
 *  them — first-seen (verb, asset) order, which is the order `sumBySymbol`
 *  produces client-side, so a served header and a client-grouped one read the
 *  same way. */
export function folderAggregates(folder: ServedFolder): RunAggregate[] {
  const out: RunAggregate[] = [];
  for (const leg of folder.legs) {
    const agg = legAsAggregate(leg);
    if (agg) out.push(agg);
  }
  return out;
}
