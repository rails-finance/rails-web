"use client";

// Shared timeline body for the chain-state-tier detail pages (Morpho, MakerDAO,
// Spark, Aave V3, Compound, …). Every one of those pages wired the SAME scaffold
// by hand: the SingleWalletProvider + TimelineDisplayProvider wrappers, the
// TimelineToolbar, the displayedEvents map with the per-day date-prefix
// (EventDateContext), and the filtered / empty states. That block is identical
// modulo the per-protocol card renderer — so it lives here, once, and each page
// passes only `tl` (its useTimelineEvents result) and a `renderCard` closure.
//
// renderCard receives the event plus its spine meta (1-based number, first/last
// flags). The page's closure narrows the event to its protocol type and returns
// the protocol's own event card; returning null for a non-matching event is fine.
//
// WINDOWING. Whale wallets reach tens of thousands of events (a SparkLend wallet
// hit 23.7k), and painting that many cards locks the page. The full set still
// feeds the aggregates (heatmap density, filter type-counts, chronological
// numbering) and the chain-state math (position card + economics tower come from
// the server summary, not these events), so windowing is a pure *render* cap: we
// paint a prefix of the displayed rows and grow it a CHUNK at a time as a
// bottom sentinel scrolls into view (with an explicit "Show more" fallback). The
// slice is a prefix, so each card keeps its true full-list index — `isLast`
// (spine terminus) only fires once the window covers everything, so the spine
// connector continues correctly while more remain below. Any filter/sort/date
// change swaps the `displayedEvents` reference and resets the window to the top.
//
// RUN-COLLAPSE. Consecutive passive events (redemption touches — a heavily
// redeemed Liquity V1 Trove collects them back to back) collapse into one
// expandable run row, the same client-side de-noising the V2 trove page
// hand-wires (its RedemptionRunCard / delegate-adjust runs). A page opts in via
// `runs`: a predicate + minimum length + a renderer for the collapsed row. The
// member cards are pre-rendered (renderCard, date-prefixed) and handed to the
// renderer as `children` so the row can expand in place. Runs are computed on
// the DISPLAYED list, so type/date filters and sort direction reshape them
// naturally; a run counts as ONE windowed row.
//
// A run's own `render` can nest further groupings INSIDE itself (by kind, by
// counterparty — see Moonwell's timeline-runs.tsx) using the same
// TimelineRunCard shell at each level; that stays entirely inside one spec's
// render function, so the row this file computes is always exactly what its
// `min` consecutive members were — never events pulled in from elsewhere in
// the list. An earlier version of this file had a second `clusters` pass that
// grouped matching events by key regardless of position (a wallet spraying
// the same mToken to dozens of addresses, interleaved with everything else it
// did); that traded away chronological honesty — a "Sent ×1,000" row could
// span the same stretch of time as a "Repaid ×500" row sitting elsewhere on
// the page, with no way for the reader to see the overlap. Retired in favor
// of nesting inside the run instead: the outer row's date range is then
// always the true span of everything nested under it.
//
// SERVED FOLDERS. Decision 0019's evening amendment moved grouping into the
// index for the families whose rows carry their own running state — SparkLend
// and Aave V3 today. Those pages hand `tl.displayedRows` (folders and
// ungrouped events already interleaved) and a `folderRegister`, and the run
// memo below is skipped entirely: there is nothing to detect, the answer
// arrived grouped. Every other family is unchanged and still passes `runs`.
// The two paths draw the SAME card, and both stay until the last family is
// across.
//
// Opening a served folder is a fetch (`FolderMembersProvider`), because a
// folder carries its members' aggregate and never its members. That read may
// be genuinely slow and is designed for rather than against: the header has
// already answered the question, so an open is an audit.
//
// ON A SERVED PAGE THE FOLDERS ARE NOT A READER'S CHOICE (rails-ops decision
// 0021). "Collapse like events" is not offered there, and a stored
// `collapseRuns: false` opens no folder. A folder opens when the reader opens
// it, when a date filter leaves it standing, or when a permalink lands in it.
// On a client-grouped page the flag still bypasses the run specs, as before.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { SingleWalletProvider } from "@/components/shared/activity-timeline";
import { TimelineDisplayProvider, useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { TimelineBoundaryCard, TimelineBoundaryRow } from "@/components/shared/timeline-boundary-card";
import { SpineTipContext, type SpineTip } from "@/components/shared/spine-column";
import { wholeHistoryExportable } from "@/lib/shared/timeline-row-ceiling";
import { lifetimeFiguresKnown } from "@/lib/shared/timeline-opening-balance";
import { boundaryFromWindow, type TimelineBoundary } from "@/lib/shared/timeline-boundary";
import { boundaryStateFromOldestRow } from "@/lib/shared/timeline-boundary-state";
import {
  TimelineToolbar,
  CHAIN_TRUTH_DISPLAY_ITEMS,
  COLLAPSE_RUNS_ITEM,
  type TimelineDisplayItem,
} from "@/components/shared/timeline-toolbar";
import { MarketNoteRow } from "@/components/shared/market-note-row";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { anchorMarketNotes, type MarketNote } from "@/lib/shared/market-note";
import { TIMELINE_PAGE_ROWS } from "@/lib/shared/timeline-opening-balance";
import { folderTerminus } from "@/lib/shared/run-folders";
import type { DisplayedTimelineRow, TimelineEventsState } from "@/hooks/useTimelineEvents";
import { FolderMembersProvider, useFolderMembers, type FolderMembersReader } from "@/lib/shared/folder-members";
import { filteredEventCount } from "@/lib/shared/timeline-folder-filter";
import {
  folderAggregates,
  type FolderResponseId,
  type ServedFolder,
  type ServedFolderRegister,
} from "@/lib/shared/timeline-folder";
import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { EventDateContext } from "@/components/shared/event-time";
import { dayKey, shortDate, shortDateYear } from "@/lib/shared/format-event";
import { EventShareProvider } from "@/components/shared/event-share-context";
import { setCardOpen } from "@/lib/shared/card-open-store";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { decodeEventId } from "@/lib/shared/page-metadata";

// The small-print register a pinned/not-found notice draws in — the same
// `text-[11px]` scale `TimelineCoverageFooter`'s NOTE uses, so a reader who has
// already seen that register elsewhere on a windowed page recognises this as
// the same kind of disclosure rather than a new one.
const NOTICE_TEXT = "text-[11px] leading-relaxed text-rb-500";

/** A hex-64 transaction hash inside an event id — Maple's bare-hash ids and a
 *  malformed/fabricated id won't match, and the not-found notice's explorer
 *  link is omitted then rather than pointed at nothing. */
const TX_HASH_IN_ID = /0x[0-9a-f]{64}/i;

/** Query params that name the SUBJECT rather than the view — see
 *  `subjectQuery` in the body. View-state params (`order`, `hide`, `from`…)
 *  are deliberately not here: an event link points at one fact, not at a
 *  filtered list. */
const SUBJECT_PARAMS = ["market", "epoch", "loan"] as const;

/** Click the card's own header toggle if its detail panel isn't already
 *  open — the DOM fallback for opening a card whose `persistKey` prefix this
 *  page didn't hand `ChainTruthTimeline` (see `persistKeyPrefix` below), and
 *  the only mechanism available for a `?at=` landing at all: that card is
 *  already mounted by the time the landing runs, so writing `card-open-store`
 *  after the fact can't retroactively flip a mount effect that already ran.
 *  `.rounded-b-xl.bg-raised` is the detail panel's own wrapper class
 *  (`EventCard`) — present exactly while the panel is open. */
function clickToOpenIfClosed(id: string): void {
  if (typeof document === "undefined") return;
  const wrapper = document.getElementById(`event-${id}`);
  if (!wrapper || wrapper.querySelector(".rounded-b-xl.bg-raised")) return;
  const toggle = wrapper.querySelector('[role="button"]');
  if (toggle instanceof HTMLElement) toggle.click();
}

/** After a `?at=` landing's first scroll, re-centre the target each time the
 *  document's height changes for the next `KEEP_CENTRED_MS` — the content
 *  above the timeline (chain-state reads, market tables) keeps landing after
 *  the scroll on a live page and would otherwise push the card back under
 *  the fold. Ends early on the reader's own wheel/touch/key scroll, so it
 *  never fights them. */
const KEEP_CENTRED_MS = 2500;
function keepCentred(el: HTMLElement, reduced: boolean): void {
  if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return;
  let lastHeight = document.documentElement.scrollHeight;
  const stop = () => {
    observer.disconnect();
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
    clearTimeout(timer);
  };
  const observer = new ResizeObserver(() => {
    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  });
  observer.observe(document.documentElement);
  for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
  const timer = setTimeout(stop, KEEP_CENTRED_MS);
}
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const;

/** The one message for "an event id this page can't find among what it has
 *  fetched" — pinned mode's id-not-served case and a `?at=` landing's
 *  not-found case draw it identically (see §2 of the Phase 3 share brief).
 *  Not a 404: the window a windowed family served, an id from another
 *  position, or a typo are all the same reader-facing fact — "not among
 *  what's here" — so the wording never guesses which. */
function EventNotFoundNotice({ id, chainId }: { id: string; chainId: ChainId }) {
  const hashMatch = TX_HASH_IN_ID.exec(id);
  return (
    <div className={`${NOTICE_TEXT} border-b border-rb-200 pb-3 dark:border-rb-800`}>
      <p>
        <span className="text-foreground">
          This event isn&rsquo;t among the events Rails has served for this position.
        </span>
        {hashMatch && (
          <>
            {" "}
            <a
              href={explorerUrl(chainId, "tx-logs", hashMatch[0])}
              target="_blank"
              rel="noopener noreferrer"
              className="link-external"
            >
              View the transaction on the chain&rsquo;s explorer
            </a>
            .
          </>
        )}
      </p>
    </div>
  );
}

/** What a pinned page reserves while the folder route is asked for its card:
 *  about one closed event card. */
const PINNED_SKELETON_HEIGHT = 96;

/** Cards painted before the first sentinel hit, and added per subsequent hit. */
const WINDOW_CHUNK = TIMELINE_PAGE_ROWS;

/** A live note's header-panel height, closed — the note row's `SkeletonBlock`
 *  reserves this while its live read is still in flight, so the list does not
 *  shift under a reader once it lands (see `liveNotesPending`). Measured off
 *  MarketNoteRow's header panel (`px-5 pt-4 pb-3` around one row of chips). */
const LIVE_NOTE_SKELETON_HEIGHT = 64;

/** Stable empties for the notes path, so a page that passes none re-renders
 *  no more than it did before notes existed. */
const NO_ANCHORS: ReadonlyMap<string, MarketNote[]> = new Map();
const NO_NOTES: MarketNote[] = [];

/** One collapsible run kind — only passive/automated events should collapse;
 *  owner actions always stand as their own rows (the V2 rule). */
export interface TimelineRunSpec {
  /** Events matching this predicate are candidates for one run. */
  match: (e: BaseActivityEvent) => boolean;
  /** Consecutive matches shorter than this stay as individual cards —
   *  collapsing two or three rows would hide meaningful events behind a
   *  click for no density win. */
  min: number;
  /** Optional neighbor test for keyed runs: two consecutive matches only join
   *  the same run when this returns true (e.g. auction slices grouped by
   *  challenge number). Omit for a plain streak of any matching events. */
  sameRun?: (prev: BaseActivityEvent, next: BaseActivityEvent) => boolean;
  /** Render the collapsed row. `children` holds the run's member cards
   *  (already rendered via renderCard, date-prefixed) for in-place expansion,
   *  one per member in run order; isFirst/isLast are the run's spine-terminus
   *  flags. */
  render: (run: BaseActivityEvent[], meta: { isFirst: boolean; isLast: boolean; children: ReactNode[] }) => ReactNode;
}

/** One displayed row: a lone event (with its index in the flat displayed
 *  list, for date-prefix + spine flags), a collapsed run starting there, or a
 *  folder the INDEX served (which stands for members that are not on the page
 *  until the reader opens it). */
type TimelineRow =
  | { kind: "event"; event: BaseActivityEvent; flatIdx: number }
  | { kind: "run"; spec: TimelineRunSpec; events: BaseActivityEvent[]; flatIdx: number }
  | { kind: "folder"; folder: ServedFolder; flatIdx: number; matched: number | null };

export interface ChainTruthTimelineProps {
  /** The page's useTimelineEvents result. */
  tl: TimelineEventsState;
  /** Render one event's card, given its spine position. */
  renderCard: (event: BaseActivityEvent, meta: { eventNumber: number; isFirst: boolean; isLast: boolean }) => ReactNode;
  /** Toolbar leading text (default "replayed from chain"). */
  toolbarLeading?: ReactNode;
  /** Display-menu items (default CHAIN_TRUTH_DISPLAY_ITEMS). */
  displayItems?: TimelineDisplayItem[];
  /** Message when the wallet has no events at all (vs filtered out). */
  emptyLabel?: string;
  /** Run-collapse specs, in match order (see RUN-COLLAPSE above). Hoist the
   *  array to module scope — a fresh identity per render recomputes the rows. */
  runs?: TimelineRunSpec[];
  /** How this family draws a folder the INDEX served — label, tone, spine
   *  glyph, corner mark (`lib/<family>/timeline-runs.tsx`'s
   *  `*_FOLDER_REGISTER`). Passed together with a `tl` that carries
   *  `displayedRows`; without both, the page takes the client-side run
   *  detection path and nothing here changes. */
  folderRegister?: ServedFolderRegister;
  /** This family's members read — what opening a folder fetches. Passed from
   *  the same module its timeline read lives in, so this component stays
   *  family-agnostic. Omitted leaves every folder closed, which is the right
   *  answer for a page that has no folders. */
  readFolderMembers?: FolderMembersReader;
  /** Market notes: receipted facts about the MARKET the account was in,
   *  observed between two of the account's own events (lib/shared/market-note.ts).
   *
   *  A note is NOT an event and is never counted as one. It reaches the list
   *  through this prop alone, is attached to a row at render time by the id of
   *  the event it sits beside, and touches nothing the page counts —
   *  `tl.displayedEvents`, `rows`, `windowSize`, `hasMore`, `isFirst`/`isLast`,
   *  `eventNumberOf`, the toolbar's count line, the filter option counts, the
   *  heatmap, run counts and the export tables all read exactly what they read
   *  with the array empty. Passing at least one anchored note also shows the
   *  toolbar's own "Market notes · N" pill (beside the eye menu, not inside
   *  it); passing none leaves the toolbar as it was.
   *
   *  Memoise it on the page: a fresh array identity per render recomputes the
   *  anchoring. */
  notes?: MarketNote[];
  /** Live market notes: this position's own quantity read at the chain head
   *  against its own newest event that carries it (`market-note.ts`'s
   *  `live*Note` builders) — "what has the market done to this position
   *  since it last touched it". Never anchored (there is no second event to
   *  sit between) and never in `rows`/`tl.displayedEvents` — the same
   *  never-counted guarantee `notes` carries, just via a dedicated slot
   *  instead of an anchor: above the newest row, which is the top. Hidden
   *  by the same `showMarketNotes` flag as `notes`, and counted into the
   *  toolbar's "Market notes · N" pill alongside them. Pass `[]` once the
   *  position's live reads have settled and found none (closed/liquidated,
   *  or no live quantity exists); see `liveNotesPending` for the in-flight
   *  state. */
  liveNotes?: MarketNote[];
  /** True while this OPEN position's live reads are still in flight —
   *  reserves the live-note slot's height (`LIVE_NOTE_SKELETON_HEIGHT`) so
   *  the list does not shift under a reader once they land. Never pass this
   *  for a closed/liquidated position: it gets no live note at all, ever, so
   *  there is nothing to reserve room for. */
  liveNotesPending?: boolean;
  /** THE LIVE WINDOW — the stretch between this ONE position's last touch and
   *  now, drawn as a pinned row in the head slot above the newest event
   *  (rails-ops TO-DO-ui-jobs §44). Every window between two touches is told on
   *  the spine; this is the window that has no second touch yet.
   *
   *  A CLASS OF ITS OWN, not a market note, and the difference decides its
   *  rules. A note happened to every holder at once, so it can be put away as
   *  a category; this window is this position's own, so:
   *
   *    - it is NOT counted in `marketNoteCount` — the toolbar's notes pill
   *      states the note rows and this is not one;
   *    - the notes toggle does NOT reach it — `showMarketNotes` off leaves it
   *      standing;
   *    - it keeps every note EXCLUSION all the same: out of `eventOptions`,
   *      out of the type/asset/address filters, out of the boundary card's
   *      by-type histogram, out of `rows` and `tl.displayedEvents`. Nothing the
   *      page counts moves because this row rendered.
   *
   *  It is never ANCHORED to a place in the sequence: it ends at now, and now
   *  is the top of a newest-first list — so it sits in the head slot always,
   *  above the live notes, and takes the spine's lead-in dot from the newest
   *  row. The callback receives the spine-terminus flag the slot decides
   *  (`isFirst` is false where the tip's own glyph already stands above it).
   *
   *  Omit it wherever the window is not a fact — a closed position, a read that
   *  has not landed — and the slot draws nothing. */
  liveWindow?: (meta: { isFirst: boolean }) => ReactNode;
  /** Rendered beneath the last event, once the whole list is on screen.
   *
   *  For the statement a SWEPT timeline owes its reader: where the history
   *  starts and whether any of it is missing (see <TimelineCoverageFooter>).
   *  Held back while rows are still paging in, because a note that says "this
   *  is the end of the history" under a list that has more to load would be
   *  claiming something the screen contradicts.
   *
   *  It also renders under an EMPTY timeline, and that case is the one that
   *  matters most: a sweep that could not read the chain shows no events, and
   *  without the footer beneath it an empty list reads as "there is nothing
   *  here" when the truth is "nobody looked". */
  footer?: ReactNode;
  /** A statement about what this list IS, rendered between the toolbar and the
   *  first card and never held back.
   *
   *  Distinct from `footer`, which is a closing note about where the history
   *  ENDS and so waits for the list to finish paging. A windowed page's opening
   *  balance is not a closing note — it is the frame the reader needs before
   *  reading the first card, and on a position with 900 loaded rows the footer
   *  slot would hide it behind seventeen presses of "Show N more". */
  notice?: ReactNode;
  /** The boundary — the events before the oldest drawn row, stated as ONE
   *  card on the spine after that row (rails-ops decision 0019; see
   *  <TimelineBoundaryCard>). The WINDOW arm needs no prop: the card is
   *  derived here from `tl.historyWindow` (the opening balance's counts and
   *  the oldest served row's own before-figures). The arms that trim the list
   *  server-side — the Base replays, the vault loaders, a `limit` fetch —
   *  pass theirs, built from the coverage the route returned
   *  (`boundaryFromChainCoverage` / `boundaryFromVaultDrawn` /
   *  `boundaryFromLimit`), and pass the same count to `useTimelineEvents` as
   *  `olderCount` so the numbering runs over the whole history. Null or
   *  undefined draws no card; a whole life gets none.
   *
   *  Placed where the omitted events actually sit: after the last row, once
   *  the local paging has drawn every loaded row. It takes the spine terminus
   *  there — the neighbouring row's own `isLast` is handed to it, so the spine
   *  runs through into the glyph and ends there. */
  boundary?: TimelineBoundary | null;
  /** The boundary card names the CSV download when the page's export menu
   *  can fetch the whole history in one answer. Pass the arm's whole-answer
   *  ceiling (`INDEX_ROW_CEILING`, `DRAINED_ROW_CEILING`) or null where the
   *  source has none; the card then offers the download only when the
   *  position's total is within it. Omit on a page with no export menu (the
   *  Base lanes, the vault holders, Liquity V2). */
  csvExportCeiling?: number | null;
  /** This family's `EventCard` `persistKey` prefix (`` `${prefix}:${event.id}` ``
   *  — confirmed against the three families in the Phase 3 batch: aave-v3,
   *  spark, liquity-v2). Lets pinned mode force a landed card's detail panel
   *  open on its FIRST mount by writing `card-open-store` before the card's
   *  own restore-from-storage effect runs (see the pinned branch below) —
   *  without it, pinned mode still renders, just not force-opened, and a
   *  `?at=` landing still opens the card (that path always uses the DOM
   *  fallback, since the card is already mounted by the time a landing
   *  applies — see `clickToOpenIfClosed`). Omit for a family this batch
   *  doesn't touch. */
  persistKeyPrefix?: string;
  /** True once this position is closed/liquidated. Suppresses the pulsing
   *  "live" tip dot — the newest row is no longer a claim about an ongoing
   *  position. Does NOT touch which row IS the tip (numbering, the stale-tip
   *  boundary logic) — only whether that row's dot renders. Omit for a page
   *  with no open/closed concept (a vault share-transfer timeline). */
  closed?: boolean;
}

// Thin shell: mount the wallet + display providers, then delegate to the body.
// The body reads the display context (for the collapse-runs flag), so it must
// live INSIDE TimelineDisplayProvider — hence the split.
export function ChainTruthTimeline(props: ChainTruthTimelineProps) {
  // The members map is dropped whenever the page's own answer changes: a
  // folder id is scoped to the response it came in, and after a backfill or a
  // new event at the head the boundaries those ids name are no longer the
  // boundaries the server would compute. The position's served event count
  // and its row count move on both, so the pair is the answer's identity.
  const tip = `${props.tl.totalCount}:${props.tl.servedRowCount ?? props.tl.sortedEvents.length}`;
  return (
    <SingleWalletProvider value={true}>
      <TimelineDisplayProvider>
        <FolderMembersProvider readMembers={props.readFolderMembers} tip={tip}>
          <ChainTruthTimelineBody {...props} />
        </FolderMembersProvider>
      </TimelineDisplayProvider>
    </SingleWalletProvider>
  );
}

/**
 * One folder the index served, drawn from its header and opened on demand.
 *
 * The card is the SAME `TimelineRunCard` a client-grouped folder draws — the
 * register supplies the words and the glyphs, the wire supplies the figures —
 * so the two paths are indistinguishable on the page, which is the point of
 * splitting display from grouping rather than reimplementing one in the other.
 */
function ServedFolderRow({
  folder,
  register,
  forceOpen,
  memberPasses,
  onlyDates,
  isFirst,
  isLast,
  renderMember,
}: {
  folder: ServedFolder;
  register: ServedFolderRegister;
  forceOpen: boolean;
  /** The page's filters as one predicate, or null when nothing is filtered. A
   *  folder stands while ANY member can pass, so an open one holds members
   *  of both kinds and only the first answers the filter. The header above
   *  them is deliberately NOT re-grained: it keeps its own count and its own
   *  span (`0019` rule 3). */
  memberPasses: ((e: BaseActivityEvent) => boolean) | null;
  /** The date range is the only filter in force — the empty line then names
   *  the dates rather than the filters. */
  onlyDates: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** One member's card, numbered from the folder's own ordinals — the same
   *  literal numbering the rest of the list runs on, one level down. */
  renderMember: (event: BaseActivityEvent, eventNumber: number, isLastMember: boolean) => ReactNode;
}) {
  const folders = useFolderMembers();
  const entry = register(folder);
  const state = folders.stateOf(folder.responseId);
  // Numbered from the folder's own ordinals BEFORE the filter narrows them, so
  // a member keeps the number it has in the position's history whichever day
  // the reader selected.
  const shown =
    state?.status === "ready" && state.events
      ? state.events
          .map((event, i) => ({ event, eventNumber: folder.ordinalFirst + i }))
          .filter(({ event }) => !memberPasses || memberPasses(event))
      : undefined;
  // A folder is admitted on its header — its SPAN for the date range — so a
  // narrow selection can reach none of its members (a day inside a wide span,
  // a counterparty the header cannot name). The card then says so in one line
  // rather than opening onto nothing — the header above it is still true.
  const members =
    shown && shown.length === 0
      ? [
          <p key="none" className="px-5 text-[11px] leading-relaxed text-muted-foreground">
            {onlyDates
              ? "No event in this folder falls within the selected dates."
              : "No event in this folder passes the filters."}
          </p>,
        ]
      : shown?.map((m, i) => renderMember(m.event, m.eventNumber, i === shown.length - 1));
  // Rule 6: "a folder header must be complete about its members". The index
  // names at most one member that the Σ would otherwise hide; the header says
  // so, in the index's own noun phrase, rather than leaving the reader to open
  // a folder they have no reason to open. `other` is the second half of the
  // same promise — with it the header's parts sum to `count`.
  const extras: ReactNode[] = [];
  if (folder.other > 0) {
    extras.push(
      <span
        key="other"
        data-prov-exempt=""
        className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap text-rb-500 bg-rb-500/10"
      >
        {folder.other.toLocaleString("en-US")} other
      </span>,
    );
  }
  if (folder.outlier) {
    extras.push(
      <span key="outlier" className="text-xs text-rb-500">
        including {folder.outlier.label}
      </span>,
    );
  }
  return (
    <TimelineRunCard
      count={folder.count}
      memberNoun={entry.memberNoun}
      aggregates={folderAggregates(folder)}
      tone={entry.tone}
      spineIcon={entry.spineIcon}
      warningLabel={entry.warningLabel}
      muted={entry.muted}
      folder
      folderBadge={entry.folderBadge}
      extraHeader={extras.length > 0 ? <>{extras}</> : undefined}
      firstTimestamp={folder.firstAt}
      lastTimestamp={folder.lastAt}
      isFirst={isFirst}
      isLast={isLast}
      summedByIndex
      forceOpen={forceOpen}
      onOpen={() => folders.open(folder)}
      members={members}
      error={state?.status === "error" ? state.error : null}
      stale={state?.stale}
    />
  );
}

function ChainTruthTimelineBody({
  tl,
  renderCard,
  toolbarLeading = "replayed from chain",
  displayItems = CHAIN_TRUTH_DISPLAY_ITEMS,
  emptyLabel = "No transaction history available.",
  runs,
  folderRegister,
  notes,
  liveNotes,
  liveNotesPending,
  liveWindow,
  footer,
  notice,
  boundary,
  csvExportCeiling,
  persistKeyPrefix,
  closed,
}: ChainTruthTimelineProps) {
  // Run-collapse is a display preference: flag off ⇒ no run specs reach the
  // rows memo, so it maps events straight to lone cards (the plain
  // renderEventRow path already handles date prefixes and spine flags).
  const { collapseRuns, showMarketNotes, toggle: toggleDisplay } = useTimelineDisplay();
  const activeRuns = collapseRuns ? runs : undefined;
  const events = tl.displayedEvents;
  const [windowSize, setWindowSize] = useState(WINDOW_CHUNK);
  const folders = useFolderMembers();
  // A SERVED list arrives already grouped, so there is nothing to detect and
  // the run memo below is skipped. Both halves have to be present: a register
  // without served rows would have nothing to draw, and served rows without a
  // register would have no words for it.
  const servedRows = folderRegister && tl.displayedRows ? tl.displayedRows : null;
  // A DATE FILTER SHOWS WHAT COVERS THE DAY. Since leg B the activity map
  // counts a folder's members on their own days — they are ordinary days, with
  // an ordinary click (settled 2026-09-12) — so a reader can now select a day
  // whose every event sits inside a folder. A folder header alone would be a
  // dead end there: it states its own span and its own Σ, neither of which is
  // an answer to "what happened on this day". So every folder the date filter
  // left standing opens to its members, and the member rows answer the filter.
  //
  // It is bounded by the filter itself: `useTimelineEvents` has already dropped
  // every folder whose span misses the range, so this is one or two reads, not
  // forty — through the queued, cached provider (`lib/shared/folder-members.tsx`).
  // The folder's own header is NEVER re-grained to the day (rule 3): `byDay`
  // carries a day's COUNT and not its per-leg amounts, so a re-stated header
  // would be half re-stated and half not.
  const openFilteredFolders = !!servedRows && tl.dateRange !== null;
  // AN ACTION, ASSET OR COUNTERPARTY FILTER OPENS WHAT IT SPLITS. A folder
  // stands while any of its members can pass, so on those axes a standing
  // folder can hold members the filter admits beside members it hides — four
  // supplies among ninety-six transfers. Its header cannot be re-grained
  // (rule 3), so it opens the way a date filter opens the folders covering a
  // day, and its members answer the filter row by row. A folder every member
  // of which passes stays shut: its header already describes exactly what
  // the filter admits. `matched` is the header's own answer
  // (lib/shared/timeline-folder-filter.ts).
  const splitByFilter = (row: { folder: ServedFolder; matched: number | null }) => row.matched !== row.folder.count;
  // The count line's numerator counts those members too, and the header can
  // say how many only on one countable axis at a time. Where it cannot, the
  // members are READ — a folder outside the drawn window included, since the
  // line counts the whole list — through the same queued, cached provider,
  // and the line states a floor ("at least") until the last one lands.
  const unsettledFolders = useMemo(
    () =>
      servedRows
        ? servedRows.flatMap((row) => (row.kind === "folder" && row.matched === null ? [row.folder] : []))
        : [],
    [servedRows],
  );
  useEffect(() => {
    for (const folder of unsettledFolders) folders.open(folder);
  }, [unsettledFolders, folders]);
  const toolbarTl = useMemo<TimelineEventsState>(() => {
    if (!servedRows || !tl.isFiltered) return tl;
    const { count, floor } = filteredEventCount(
      tl.filteredCount,
      servedRows.flatMap((row) => (row.kind === "folder" ? [{ folder: row.folder, matched: row.matched }] : [])),
      (folder) => {
        const state = folders.stateOf(folder.responseId);
        return state?.status === "ready" ? state.events : undefined;
      },
      tl.memberPasses,
    );
    return { ...tl, filteredCount: count, filteredCountIsFloor: floor };
  }, [tl, servedRows, folders]);

  // ── Share: pinned event mode + `?at=` landing ──────────────────────────
  // Lives here (not in useTimelineEvents) because both need `usePathname`
  // (the position's own path, with any trailing `/event/…` stripped) and the
  // rendered row DOM (the scroll/highlight/open-detail targets) — this is
  // already the one place that owns row rendering, and keeping the route
  // concern beside it means no family's page has to learn about either mode.
  const pathname = usePathname() ?? "";
  // The position's own path — right on the position page (a no-op strip
  // there) AND on the event page itself (strips the `/event/<id>` suffix),
  // so `EventShareProvider` below composes the same href shape everywhere.
  const positionPath = pathname.replace(/\/event\/[^/]+$/, "");
  const routeParams = useParams<{ eventId?: string | string[] }>();
  const rawEventId = Array.isArray(routeParams?.eventId) ? routeParams.eventId[0] : routeParams?.eventId;
  const pinnedId = rawEventId != null ? decodeEventId(rawEventId) : null;
  const chainId = useChainId();
  // The query params that are part of WHICH position this is, not view state:
  // Aave V3's `?market=` (Core vs Prime is a different account), Liquity V1's
  // `?epoch=` (a life), PWN's `?loan=`. A share href or a "View in timeline"
  // link that dropped one would land on a different subject. Read after mount
  // (not during render) so server and client agree on the first paint; the
  // href only has to be right by the time someone clicks copy.
  const [subjectQuery, setSubjectQuery] = useState("");
  useEffect(() => {
    try {
      const current = new URLSearchParams(window.location.search);
      const kept = new URLSearchParams();
      for (const key of SUBJECT_PARAMS) {
        const value = current.get(key);
        if (value) kept.set(key, value);
      }
      setSubjectQuery(kept.toString());
    } catch {
      setSubjectQuery("");
    }
  }, [pathname]);

  // A ring that fades in ~2s on the event a `?at=` landing scrolled to;
  // `prefers-reduced-motion` skips it entirely (see the landing effect).
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // The one event a `?at=` landing is still working to reveal/open/scroll to
  // — set once the id is found among `tl.sortedEvents` (revealEvent already
  // applied), cleared once the DOM row exists and has been acted on. Distinct
  // from pinned mode entirely: this only ever applies on the ordinary,
  // multi-event view.
  const [pendingLandingId, setPendingLandingId] = useState<string | null>(null);
  const [landingNotFoundId, setLandingNotFoundId] = useState<string | null>(null);
  // Applied at most once per mount — a visitor toggling filters afterward
  // must not re-trigger the landing off a stale `at=` the hook already
  // dropped from the address bar.
  const appliedAtRef = useRef(false);
  // The `at` id read off the URL, until it is either found among the served
  // events (→ `pendingLandingId`) or given up on (→ `landingNotFoundId`).
  const [landingWantedId, setLandingWantedId] = useState<string | null>(null);
  useEffect(() => {
    if (pinnedId || appliedAtRef.current) return;
    let raw: string | null;
    try {
      raw = new URLSearchParams(window.location.search).get("at");
    } catch {
      return;
    }
    if (!raw) return;
    appliedAtRef.current = true;
    setLandingWantedId(decodeEventId(raw));
  }, [pinnedId]);

  // The folder a `?at=` landing resolved its event key to — held open while
  // the landing runs, so the member card mounts and the DOM step below can
  // find it. Response-scoped, so it never leaves this component.
  const [landedFolderId, setLandedFolderId] = useState<string | null>(null);

  // Second stage of the `?at=` landing: resolve the wanted id against
  // whatever is served now; re-runs as the served list grows.
  //
  // An id that is not among the served EVENTS is not necessarily missing: on
  // a grouped page it may sit inside a folder, whose members are not on the
  // page until someone asks. So the folder route is asked next, BY EVENT KEY
  // — the durable coordinate, and the reason every share href in the wild
  // keeps working unchanged. It answers with the folder of the current
  // response that holds the event, and its members in the same breath.
  useEffect(() => {
    if (!landingWantedId) return;
    const target = tl.sortedEvents.find((e) => e.id === landingWantedId);
    if (target) {
      // Un-hides the event's type/asset/counterparty and clears any date
      // range, without persisting the correction or writing it into the URL —
      // see `revealEvent`'s own doc for why.
      tl.revealEvent(target);
      setPendingLandingId(target.id);
      setLandingWantedId(null);
      return;
    }
    if (folders.enabled) {
      const wanted = landingWantedId;
      setLandingWantedId(null);
      void folders.resolveEventKey(wanted).then((id) => {
        // A refusal is a stated fact and the notice says the same thing it
        // says for any id this page has not served — the route distinguishes
        // "already its own row", "below the window" and "no such folder", and
        // none of those is a different sentence for the reader.
        if (!id) {
          setLandingNotFoundId(wanted);
          return;
        }
        setLandedFolderId(id);
        setPendingLandingId(wanted);
      });
      return;
    }
    setLandingNotFoundId(landingWantedId);
    setLandingWantedId(null);
    // `tl` is a fresh object every render; the effect keys on the served
    // list and is idempotent once the id has resolved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingWantedId, tl.sortedEvents, folders.enabled]);

  // Pinned mode: the route's id against the served list first. On a page that
  // serves folders, a member of one is not among the served events until
  // someone asks, so a miss is then put to the folder route by EVENT KEY — the
  // `?at=` landing's path above — and the card is drawn from the members it
  // answers with (TO-DO-ui-jobs §11: a SparkLend transfer_in inside a
  // 100-event folder read "not found" on its own event page). A pinned page
  // draws the one card, so the folder itself is not drawn.
  //
  // What neither path reaches is an event below the page's window: the
  // per-event reads are windowed like the position page (the aave family's
  // pass `recent: TIMELINE_WINDOW_EVENTS`), and the folder route refuses a key
  // below the window. That is a stated miss and the notice says so.
  const pinnedServed = pinnedId ? tl.sortedEvents.find((e) => e.id === pinnedId) : undefined;
  // undefined: not asked yet, or in flight. null: the route refused the key.
  const [pinnedFolderId, setPinnedFolderId] = useState<FolderResponseId | null | undefined>(undefined);
  const askFolderForPin = Boolean(pinnedId) && !pinnedServed && folders.enabled;
  useEffect(() => {
    if (!askFolderForPin || !pinnedId) return;
    let live = true;
    setPinnedFolderId(undefined);
    void folders.resolveEventKey(pinnedId).then((id) => {
      if (live) setPinnedFolderId(id);
    });
    return () => {
      live = false;
    };
    // `folders` is a fresh object whenever any folder's members land; the
    // question is keyed on the id and on whether the served list holds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askFolderForPin, pinnedId]);
  const pinnedFolder = pinnedFolderId ? folders.stateOf(pinnedFolderId) : undefined;
  const pinnedMemberIdx = pinnedFolder?.events?.findIndex((e) => e.id === pinnedId) ?? -1;
  const pinnedMember = pinnedMemberIdx >= 0 ? pinnedFolder?.events?.[pinnedMemberIdx] : undefined;
  const pinnedEvent = pinnedServed ?? pinnedMember;
  // A member keeps the number it has in the position's history: the folder's
  // own first ordinal plus its place in it, as an open folder numbers it.
  const pinnedNumber = pinnedServed
    ? tl.eventNumberOf(pinnedServed)
    : pinnedMember && pinnedFolder?.folder
      ? pinnedFolder.folder.ordinalFirst + pinnedMemberIdx
      : 0;
  const pinnedPending = askFolderForPin && pinnedFolderId === undefined;

  // Settle the displayed list into rows: stretches of ≥min consecutive
  // matching events become one run row. Without `activeRuns` this is the
  // identity mapping.
  const rows = useMemo<TimelineRow[]>(() => {
    if (servedRows) return servedRows;
    if (!activeRuns || activeRuns.length === 0) {
      return events.map((event, flatIdx) => ({ kind: "event", event, flatIdx }) as const);
    }
    const out: TimelineRow[] = [];
    let i = 0;
    while (i < events.length) {
      const spec = activeRuns.find((r) => r.match(events[i]));
      if (!spec) {
        out.push({ kind: "event", event: events[i], flatIdx: i });
        i++;
        continue;
      }
      let j = i + 1;
      while (j < events.length && spec.match(events[j]) && (!spec.sameRun || spec.sameRun(events[j - 1], events[j])))
        j++;
      if (j - i >= spec.min) {
        out.push({ kind: "run", spec, events: events.slice(i, j), flatIdx: i });
      } else {
        for (let k = i; k < j; k++) out.push({ kind: "event", event: events[k], flatIdx: k });
      }
      i = j;
    }
    return out;
  }, [events, activeRuns, servedRows]);

  // Market notes, attached by anchor event id — OUTSIDE the rows.
  //
  // This is deliberately not a row kind. `rows` above is the one list every
  // count on the page is taken from ("Showing X of Y rows", the window, the
  // spine's first/last flags), so a note that entered it would move all of
  // them, and a fact about the market would start counting as an event of the
  // account's. Instead the notes stay in their own map and are rendered
  // alongside the row they anchor to, at the point of render.
  //
  // Computed regardless of `showMarketNotes`: the toolbar pill states how
  // many note rows the page WOULD show even while the flag is off — turning
  // notes off hides the rows (see `notesFor`), not the count.
  // "desc" is the page's one order now. The parameter stays on the function
  // because the MARKDOWN EXPORTS still render a life ascending, and a note has
  // to be placed the way the list around it reads.
  const anchored = useMemo(
    () => (notes?.length ? anchorMarketNotes(notes, events, "desc") : NO_ANCHORS),
    [notes, events],
  );

  /** The toolbar pill's own count: every anchored historical note, plus every
   *  live one (always in the head slot, no anchor needed) — the count of
   *  note rows the page would actually render. */
  const marketNoteCount = useMemo(() => {
    let n = liveNotes?.length ?? 0;
    for (const list of anchored.values()) n += list.length;
    return n;
  }, [anchored, liveNotes]);

  // The head slot: rendered above the newest row, which is the top of the
  // list. It holds two classes of pinned row — the live WINDOW (`liveWindow`,
  // topmost, and no business of the notes toggle) and the live NOTES, the
  // latter split into "rows" (once settled) and "skeleton" (their read still
  // in flight) so the two never show at once. Whatever stands highest there
  // takes the spine's lead-in dot and the `isFirst` flag, and every other
  // claim on them is suppressed below, so no two rows draw either.
  const liveRowsShown = showMarketNotes ? (liveNotes ?? []) : [];
  /** What the navigator marks: the notes this page is SHOWING. A reader who
   *  has put notes away does not get them back on the map, and the marks move
   *  no count either way — the toolbar's pill states every note the page has,
   *  whatever the toggle. */
  const navigatorNotes = useMemo(() => {
    if (!showMarketNotes) return NO_NOTES;
    const out: MarketNote[] = [...(liveNotes ?? [])];
    for (const list of anchored.values()) out.push(...list);
    return out;
  }, [showMarketNotes, anchored, liveNotes]);
  const liveSlotAtTop = liveRowsShown.length > 0;
  /** The live WINDOW's own occupancy of the head slot — read off the prop, not
   *  off `showMarketNotes`: it is not a market note, so putting the notes away
   *  leaves it standing (see the prop). It draws above the live notes, so when
   *  both are there this is the row the spine's lead-in dot belongs to. */
  const liveWindowAtTop = !!liveWindow;

  // The boundary card. A page that trims its own list passes one; the window
  // arm's is derived from the opening balance here, with the position at the
  // cut read off the OLDEST SERVED row's own before-figures (`sortedEvents[0]`
  // — ascending, so index 0 is the oldest). A prop wins over the derivation
  // so a page can never get two.
  const windowBoundary = useMemo(
    () => boundaryFromWindow(tl.historyWindow, tl.servedEventCount, boundaryStateFromOldestRow(tl.sortedEvents[0])),
    [tl.historyWindow, tl.sortedEvents],
  );
  const effectiveBoundary = boundary === undefined ? windowBoundary : boundary;
  // The download is offered only where the export exists and can be whole:
  // the total must be known (a window's opening balance in hand) and within
  // the arm's one-answer ceiling.
  const csvExport =
    csvExportCeiling !== undefined &&
    wholeHistoryExportable(lifetimeFiguresKnown(tl.historyWindow) ? tl.totalCount : null, csvExportCeiling);
  // The cut's own glyph is `boundaryAtBottom`, declared further down where
  // `hasMore` is: the omitted events are older than every drawn row, and the
  // older end of a newest-first list is its bottom.

  // Second half of the `?at=` landing (see the effect above): once
  // `revealEvent` has made the target visible, find it in `rows`, grow the
  // render window if it is a windowed prefix's job to reveal it, then — once
  // its wrapper row is actually in the DOM — open its detail panel, scroll it
  // into view (centered) and give it the fade highlight. A target buried
  // inside a COLLAPSED run has no row of its own to find here (the run only
  // mounts its members once expanded) — a known gap for a later pass; this
  // effect simply never resolves the pending id for that case rather than
  // looping or throwing.
  useEffect(() => {
    if (!pendingLandingId) return;
    const idx = rows.findIndex((r) => {
      if (r.kind === "event") return r.event.id === pendingLandingId;
      if (r.kind === "run") return r.events.some((e) => e.id === pendingLandingId);
      // A served folder holds its members by coordinate, not on the page —
      // the resolve step above named which folder holds this event.
      return r.folder.responseId === landedFolderId;
    });
    if (idx === -1) return;
    if (idx >= windowSize) {
      setWindowSize(Math.min(rows.length, idx + 1));
      return;
    }
    const el = document.getElementById(`event-${pendingLandingId}`);
    if (!el) return;
    clickToOpenIfClosed(pendingLandingId);
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* matchMedia unavailable — treat as no preference */
    }
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // The page above the timeline is still settling on a live landing — the
    // position card's chain-state reads and market tables land after this
    // scroll and grow it, pushing the target back under the fold (Aave V3
    // and Maple measured ~100px below a 900px viewport). Keep the target
    // centred while the document's height is still changing, for a short
    // window, and stop the moment the reader scrolls themselves.
    keepCentred(el, reduced);
    if (!reduced) {
      setHighlightId(pendingLandingId);
      setTimeout(() => setHighlightId(null), 2000);
    }
    setPendingLandingId(null);
    // `at` is read-only and dropped once applied — see useTimelineEvents.ts's
    // header on the same rule for the view-state params it owns.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("at");
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", next);
    } catch {
      /* non-fatal — the event stays revealed either way */
    }
    // `folders` is in the deps because a landing inside a served folder has
    // to re-run once the members mount: the row exists before the card does.
  }, [pendingLandingId, rows, windowSize, landedFolderId, folders]);

  // Any filter/sort/date change produces a fresh `displayedEvents` reference —
  // reset the window to the top so the user sees the head of the new list.
  useEffect(() => {
    setWindowSize(WINDOW_CHUNK);
  }, [events]);

  const hasMore = windowSize < rows.length;
  const growWindow = () => setWindowSize((s) => Math.min(s + WINDOW_CHUNK, rows.length));

  // THE TIP — the newest event, and the one node that carries the pulsing
  // dot (<SpineTipContext>). It is the FIRST row and the dot sits above it. A
  // live market-note row standing at that end takes the tip instead. The
  // boundary glyph, the oldest row and a pinned card never carry it.
  //
  // ⚠️ THE TIP IS A CLAIM ABOUT TIME, NOT ABOUT A LIST POSITION. With a date
  // filter on a past day the row at the tip end is months old and the pulsing
  // dot claims live-ness for it (Miles, 2026-09-11: "the top of the spine when
  // a day in the past is selected should have the layer icon and no pulsing
  // dot"). `tl.sortedEvents` is ascending, unfiltered and holds every loaded
  // event, so its LAST element is the newest the page holds; the newest
  // DISPLAYED event is the head of `events` in either order. The condition is
  // those two TIMESTAMPS and never "a filter is on": a protocol or asset
  // filter that leaves the newest event standing at the tip leaves the tip
  // true, and it keeps its pulse.
  //
  // BOTH ENDS READ THE ROWS, NOT `events`. On a served page the newest or
  // oldest moment can sit inside a folder, and an answer made only of folders
  // has no loose event at all (rails-ops TO-DO-ui-jobs §13). A folder counts by
  // its own span, clamped to a date range — the filter keeps a folder that
  // merely overlaps the range, and the part of it in view is what is shown.
  const clampToRange = (t: number) => (tl.dateRange ? Math.min(Math.max(t, tl.dateRange[0]), tl.dateRange[1]) : t);
  const rowNewestAt = (row: TimelineRow): number =>
    row.kind === "event"
      ? row.event.timestamp
      : row.kind === "run"
        ? row.events[0].timestamp
        : clampToRange(row.folder.lastAt);
  const rowOldestAt = (row: TimelineRow): number =>
    row.kind === "event"
      ? row.event.timestamp
      : row.kind === "run"
        ? row.events[row.events.length - 1].timestamp
        : clampToRange(row.folder.firstAt);
  const newestLooseAt = tl.sortedEvents.length === 0 ? null : tl.sortedEvents[tl.sortedEvents.length - 1].timestamp;
  const newestLoadedAt =
    tl.servedSpan && (newestLooseAt == null || tl.servedSpan.lastAt > newestLooseAt)
      ? tl.servedSpan.lastAt
      : newestLooseAt;
  const newestShownAt = rows.length === 0 ? null : rowNewestAt(rows[0]);
  const tipIsStale = newestLoadedAt != null && newestShownAt != null && newestShownAt < newestLoadedAt;
  // Where the dot is withheld the bare boundary row stands in its place — at
  // the top, which is where the dot was going to be.
  const tipBoundaryAtTop = tipIsStale;
  const tipSide: SpineTip | null = tipIsStale ? null : "above";
  // ── AND THE SAME THING AT THE OLDER END ────────────────────────────────
  // A page hides older events two ways, and only one of them is the window
  // CUT. On a position with no cut at all — 38 events, every one of them
  // loaded — a day selected in the filter still hides the 36 that came before
  // it, and the spine ended in nothing (Miles, 2026-09-11). So the same
  // timestamp comparison at the other end: the oldest event the page holds is
  // `tl.sortedEvents[0]` (ascending, unfiltered), against the oldest one it is
  // showing.
  //
  // Where a cut AND a filter both hide older events the CUT's own statement —
  // the card, or its bare row under the flag — is the one that stands, and
  // this is withheld (`!boundaryAt…` below). One end, one glyph: two would
  // read as two different omissions.
  const oldestLooseAt = tl.sortedEvents.length === 0 ? null : tl.sortedEvents[0].timestamp;
  const oldestLoadedAt =
    tl.servedSpan && (oldestLooseAt == null || tl.servedSpan.firstAt < oldestLooseAt)
      ? tl.servedSpan.firstAt
      : oldestLooseAt;
  const oldestShownAt = rows.length === 0 ? null : rowOldestAt(rows[rows.length - 1]);
  const tailIsCut = oldestLoadedAt != null && oldestShownAt != null && oldestShownAt > oldestLoadedAt;
  // On a SERVED list the newest row can be a FOLDER, and then no event on the
  // page is the tip — the folder's own node carries the dot instead, the same
  // way a client-grouped run's does when the newest event is among its
  // members. `tipRowIdx` is that row's place in the list; `tipEventId` stays
  // the event's id where the tip row IS an event, which is every case on a
  // flat page.
  const tipRowIdx = rows.length === 0 ? -1 : 0;
  const tipRow = tipRowIdx >= 0 ? rows[tipRowIdx] : undefined;
  const tipEventId = servedRows
    ? tipRow?.kind === "event"
      ? tipRow.event.id
      : null
    : events.length === 0
      ? null
      : events[0].id;
  const liveHoldsTip = liveSlotAtTop || liveWindowAtTop;
  // The omitted events continue PAST the last row, so the cut's glyph waits
  // for the local paging to draw every loaded row (the same gate the footer
  // uses) and then closes the list.
  const boundaryAtBottom = effectiveBoundary != null && !hasMore;
  // The older end is the bottom — and, like everything else down here, it
  // waits for the whole list to be drawn: while a "Show 50 more" button stands
  // below the rows, the older events are not hidden, they are one click away.
  const viewBoundaryAtBottom = tailIsCut && !hasMore && !boundaryAtBottom;
  // A row draws a spine TERMINUS only where nothing else stands at that end.
  // The top's occupants are the live window, the live-note slot and the tip's
  // withheld-dot glyph; the bottom's are the cut's and the view's.
  const topTerminusTaken = liveWindowAtTop || liveSlotAtTop || tipBoundaryAtTop;
  const bottomTerminusTaken = boundaryAtBottom || viewBoundaryAtBottom;
  const liveSkeletonAtTop = showMarketNotes && !!liveNotesPending;

  // Auto-grow as the bottom sentinel nears the viewport. The observer re-arms on
  // each window change (the sentinel stays mounted while `hasMore`); a 600px
  // rootMargin pre-loads the next chunk before the user reaches the end.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) growWindow();
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, events]);

  const windowed = hasMore ? rows.slice(0, windowSize) : rows;

  // Day-grouping over the FLAT displayed list (run members included), so the
  // date shows on the first card of each calendar day whether or not the
  // preceding event sits inside a collapsed run — the V2 trove behavior.
  const datePrefixAt = (flatIdx: number) => {
    const event = events[flatIdx];
    const prev = flatIdx > 0 ? events[flatIdx - 1] : undefined;
    const showDate = !prev || dayKey(event.timestamp) !== dayKey(prev.timestamp);
    return showDate ? `${shortDate(event.timestamp)} ${shortDateYear(event.timestamp)}` : null;
  };

  // Every event row's own share href — right on the position page and on the
  // event page itself, since `positionPath` above already strips the latter's
  // `/event/…` suffix. Wrapping here (rather than inside each family's card
  // composer) is what makes the copy-link control need no per-family edit at
  // all — see `CopyEventLink` in `event-card-footer.tsx`, which `EventCard`
  // reads this href into and passes down to; it draws nothing where there is
  // none.
  const shareHrefFor = (id: string) =>
    `${positionPath}/event/${encodeURIComponent(id)}${subjectQuery ? `?${subjectQuery}` : ""}`;

  const renderEventRow = (
    event: BaseActivityEvent,
    flatIdx: number,
    opts?: {
      inRun?: boolean;
      /** A member fetched out of a served folder is not in `displayedEvents`,
       *  so the hook has no number for it — the folder's own `ordinalFirst +
       *  i` is the answer, which is the same literal numbering one level
       *  down. */
      eventNumber?: number;
      /** A folder member's own date prefix, since `datePrefixAt` indexes the
       *  flat displayed list and a member is not in it. */
      datePrefix?: string | null;
      isLastMember?: boolean;
    },
  ) => (
    <EventDateContext.Provider
      key={event.id}
      value={opts?.datePrefix !== undefined ? opts.datePrefix : datePrefixAt(flatIdx)}
    >
      <EventShareProvider href={shareHrefFor(event.id)}>
        {/* The scroll/highlight target for a `?at=` landing (and, in pinned
            mode below, for the lone card) — `id` for `getElementById`,
            `data-event-id` as the brief's documented alternative for anything
            that prefers a data-attribute query. The ring fades over the
            `duration-[2000ms]` already on the wrapper; `highlightId` is only
            ever set when `prefers-reduced-motion` did NOT ask for none. */}
        {/* The tip reaches the card's own <SpineColumn> through context: a
            member of an expanded run re-provides null, so the run's folder
            node above it keeps the one dot. */}
        <SpineTipContext.Provider
          value={!closed && !opts?.inRun && !liveHoldsTip && event.id === tipEventId ? tipSide : null}
        >
          <div
            id={`event-${event.id}`}
            data-event-id={event.id}
            className={`rounded-xl transition-shadow duration-[2000ms] ${
              highlightId === event.id ? "ring-2 ring-teal-500/70" : "ring-0 ring-teal-500/0"
            }`}
          >
            {renderCard(event, {
              eventNumber: opts?.eventNumber ?? tl.eventNumberOf(event),
              // Line ends only — the dot is the tip's (see `tipEventId`).
              // Inside an expanded run the LAST member still owns the spine
              // terminus so the dotted segment ends where the timeline does.
              // Suppressed at the top when a live note now sits there
              // instead — see `liveSlotAtTop`.
              isFirst: flatIdx === 0 && !opts?.inRun && !topTerminusTaken,
              isLast:
                opts?.isLastMember !== undefined
                  ? opts.isLastMember
                  : flatIdx === events.length - 1 && !bottomTerminusTaken,
            })}
          </div>
        </SpineTipContext.Provider>
      </EventShareProvider>
    </EventDateContext.Provider>
  );

  // ── Pinned mode: `/…/event/<id>` renders ONE event, standalone ─────────
  // Drawn after every hook above has run (so hook order stays identical
  // regardless of the route), but before the ordinary multi-event body below
  // — a pinned page has nothing in common with it: no toolbar (nothing to
  // filter), no runs (the spec is bypassed), no window.
  if (pinnedId) {
    // Force the card open on its very first mount by writing card-open-store
    // during RENDER, before it — not in an effect: effects fire bottom-up
    // after the whole tree commits, so an effect here would always lose the
    // race against `EventCard`'s own mount effect, which has by then already
    // read (and missed) the old value. Safe here: the writer no-ops on the
    // server and is idempotent on the client, so React's dev-mode double
    // render just writes the same value twice.
    if (pinnedEvent && persistKeyPrefix) setCardOpen(`${persistKeyPrefix}:${pinnedEvent.id}`, true);
    const viewInTimelineHref = `${positionPath}?at=${encodeURIComponent(pinnedId)}${subjectQuery ? `&${subjectQuery}` : ""}`;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-rb-500">
          <span>One event from this position&rsquo;s history</span>
          <a href={viewInTimelineHref} className="text-blue-600 hover:underline dark:text-blue-400 shrink-0">
            View in timeline →
          </a>
        </div>
        {pinnedEvent ? (
          <EventDateContext.Provider
            value={`${shortDate(pinnedEvent.timestamp)} ${shortDateYear(pinnedEvent.timestamp)}`}
          >
            <EventShareProvider href={shareHrefFor(pinnedEvent.id)}>
              <div id={`event-${pinnedEvent.id}`} data-event-id={pinnedEvent.id} className="rounded-xl">
                {renderCard(pinnedEvent, { eventNumber: pinnedNumber, isFirst: true, isLast: true })}
              </div>
            </EventShareProvider>
          </EventDateContext.Provider>
        ) : pinnedPending ? (
          <SkeletonBlock height={PINNED_SKELETON_HEIGHT} />
        ) : (
          <EventNotFoundNotice id={pinnedId} chainId={chainId} />
        )}
      </div>
    );
  }

  // Auto-append the collapse toggle only when this page defines runs — a page
  // with none has nothing to collapse and must not show an inert toggle.
  // Market notes left the eye menu for the toolbar's own pill (below) — see
  // `marketNoteCount` and the toolbar's `onToggleMarketNotes`.
  // Never on a served page: its folders are not a reader's choice (decision
  // 0021). `?folders=0` answers flat, so that page groups in the browser and
  // keeps the toggle.
  const items = runs?.length && !servedRows ? [...displayItems, COLLAPSE_RUNS_ITEM] : displayItems;

  /** The notes that sit beside one row: an event row's own, or the union over
   *  a collapsed run's members — a note whose anchor is inside a folder
   *  renders against the RUN ROW, never inside the folder, where a reader who
   *  never expands it would not see it at all. Gated on `showMarketNotes`
   *  here (not on `anchored` itself — see its own comment) so the toggle
   *  hides rows without moving the toolbar pill's count. */
  const notesFor = (row: TimelineRow): MarketNote[] => {
    if (!showMarketNotes || anchored.size === 0) return NO_NOTES;
    if (row.kind === "event") return anchored.get(row.event.id) ?? NO_NOTES;
    // A served folder's members are not on the page, so no note can have
    // anchored to one: `anchorMarketNotes` runs over `displayedEvents`, which
    // holds the ungrouped events only. Nothing is lost — a note sits between
    // two of the account's own events, and those are exactly the rows that
    // stay ungrouped.
    if (row.kind === "folder") return NO_NOTES;
    return row.events.flatMap((e) => anchored.get(e.id) ?? NO_NOTES);
  };

  return (
    // How much of the loaded list is DRAWN, for anything reading this page
    // rather than scrolling it. The local paging draws `TIMELINE_PAGE_ROWS` at
    // a time and grows on the sentinel, so a read taken on first paint sees a
    // prefix of the rows — and everything that hangs off a row, market notes
    // included, is drawn with it. A count taken there is a count of the
    // window, not of the position (§38, 2026-09-20: a trove drawing 50 of its
    // 70 rows showed 7 of its 9 price-gap notes, and the two absent ones were
    // read as a defect in the rule for a day). The toolbar pill states the
    // whole count throughout; these two say when the list agrees with it.
    <div
      className="space-y-3"
      data-timeline-rows-drawn={Math.min(windowSize, rows.length)}
      data-timeline-rows-loaded={rows.length}
    >
      {/* data-skel-section feeds the skeleton memory layer (skeleton-size-recorder). */}
      <div data-skel-section="detail-timeline-header">
        <TimelineToolbar
          tl={toolbarTl}
          displayItems={items}
          leading={toolbarLeading}
          marketNoteCount={marketNoteCount}
          marketNotesOn={showMarketNotes}
          onToggleMarketNotes={() => toggleDisplay("showMarketNotes")}
          // The navigator prototype's marks (`?nav=1`). Reduced here — this is
          // where the notes it marks are anchored — and handed to the toolbar,
          // which owns the Date button the panel now hangs from. The panel
          // used to stand as a sibling of the rows; it floats over them now.
          navigatorNotes={navigatorNotes}
        />
      </div>
      {notice}
      {/* A `?at=` landing whose id never turned up in `tl.sortedEvents` — the
          list otherwise renders exactly as it would have without `at`. */}
      {landingNotFoundId && <EventNotFoundNotice id={landingNotFoundId} chainId={chainId} />}
      {/* ROWS, not `events`: a folder is something to draw, and a served
          answer made only of folders has no loose event at all. The empty
          label below is for a list with nothing to draw. */}
      {rows.length > 0 ? (
        <>
          <div className="flex flex-col gap-2">
            {/* The top is the NEWEST end, so the only omission that can stand
                here is the TIP's — drawn when the newest events the page holds
                are filtered out, so the row below is not the newest and the
                pulsing dot has been withheld from it. The cut's glyph and the
                view's both belong to the older end, which is the bottom.

                Above everything in the head slot as well as the rows — the
                glyph is the end of the drawn spine, and the spine is the
                account's events. */}
            {tipBoundaryAtTop && <TimelineBoundaryRow kind="tip" isFirst isLast={false} />}
            {/* The live window is the head row: it ends at now, so it stands
                above the live notes and takes the lead-in dot. The notes
                toggle does not reach it — it is not a note (see `liveWindow`). */}
            {liveWindow && (
              <SpineTipContext.Provider value={tipSide}>
                {liveWindow({ isFirst: !tipBoundaryAtTop })}
              </SpineTipContext.Provider>
            )}
            {liveSkeletonAtTop && <SkeletonBlock height={LIVE_NOTE_SKELETON_HEIGHT} />}
            {liveSlotAtTop &&
              liveRowsShown.map((note, i) => (
                <SpineTipContext.Provider key={`live_${note.id}`} value={i === 0 && !liveWindowAtTop ? tipSide : null}>
                  <MarketNoteRow
                    note={note}
                    isFirst={i === 0 && !tipBoundaryAtTop && !liveWindowAtTop}
                    isLast={false}
                  />
                </SpineTipContext.Provider>
              ))}
            {windowed.map((row, rowIdx) => {
              const rowNode =
                row.kind === "event" ? (
                  renderEventRow(row.event, row.flatIdx)
                ) : row.kind === "folder" ? (
                  <SpineTipContext.Provider
                    key={`folder_${row.folder.responseId}`}
                    // The folder's own node is the tip when the folder IS the
                    // newest row; its members re-provide null, so one dot.
                    value={!liveHoldsTip && rowIdx === tipRowIdx ? tipSide : null}
                  >
                    <ServedFolderRow
                      folder={row.folder}
                      register={folderRegister as ServedFolderRegister}
                      forceOpen={openFilteredFolders || splitByFilter(row) || row.folder.responseId === landedFolderId}
                      memberPasses={tl.isFiltered ? tl.memberPasses : null}
                      onlyDates={
                        tl.dateRange !== null &&
                        tl.visibleActionKeys.size === tl.eventOptions.length &&
                        tl.visibleAssetKeys.size === tl.assetOptions.length &&
                        tl.visibleCounterpartyKeys.size === tl.counterpartyOptions.length
                      }
                      // A served folder has no run around it to scope its
                      // spine termini to, so its place in the displayed list
                      // is the whole answer — suppressed at either end where
                      // a live note or the boundary card now sits there.
                      isFirst={folderTerminus(rowIdx, rows.length).isFirst && !topTerminusTaken}
                      isLast={folderTerminus(rowIdx, rows.length).isLast && !bottomTerminusTaken}
                      renderMember={(event, eventNumber, isLastMember) =>
                        renderEventRow(event, row.flatIdx, {
                          inRun: true,
                          eventNumber,
                          // A member's own day, read off the member itself:
                          // `datePrefixAt` indexes the flat displayed list,
                          // and a folder's members are not in it.
                          datePrefix: `${shortDate(event.timestamp)} ${shortDateYear(event.timestamp)}`,
                          isLastMember:
                            isLastMember && folderTerminus(rowIdx, rows.length).isLast && !bottomTerminusTaken,
                        })
                      }
                    />
                  </SpineTipContext.Provider>
                ) : (
                  <SpineTipContext.Provider
                    key={`run_${row.events[0].id}`}
                    // The run's own folder node is the tip when the newest
                    // event is among its members; the members re-provide null.
                    value={!liveHoldsTip && row.events.some((e) => e.id === tipEventId) ? tipSide : null}
                  >
                    {row.spec.render(row.events, {
                      isFirst: row.flatIdx === 0 && !topTerminusTaken,
                      isLast: row.flatIdx + row.events.length === events.length && !bottomTerminusTaken,
                      children: row.events.map((e, k) => renderEventRow(e, row.flatIdx + k, { inRun: true })),
                    })}
                  </SpineTipContext.Provider>
                );
              const rowNotes = notesFor(row);
              if (rowNotes.length === 0) return rowNode;
              // Below is older, so a note FOLLOWS the event it is known to
              // have happened before. The row itself is untouched — this only
              // wraps it.
              const noteRows = rowNotes.map((note) => <MarketNoteRow key={`note_${note.id}`} note={note} />);
              return (
                <Fragment
                  key={
                    row.kind === "event"
                      ? `evt_${row.event.id}`
                      : row.kind === "folder"
                        ? `folderrow_${row.folder.responseId}`
                        : `runrow_${row.events[0].id}`
                  }
                >
                  {rowNode}
                  {noteRows}
                </Fragment>
              );
            })}
            {/* The bottom is the OLDER end, so the omission here is the
                CUT's or — where there is no cut — the VIEW's. The two are
                exclusive by the guard, not by convention: where a cut and a
                filter both hide older events the cut's statement is the one
                that stands, and two glyphs would read as two omissions.

                ⚠️ THE CARD IS GONE FROM HERE (Miles, 2026-09-11): "just the
                layer icon in the spine and no event at all in the protocol".
                It was withheld under `?nav=1` from that day; the flag came off
                the same evening and the withholding came with it, on every
                family. <TimelineBoundaryRow> carries the list of what the card
                was the only statement of, so nobody rediscovers the loss by
                accident. */}
            {(boundaryAtBottom || viewBoundaryAtBottom) && (
              <TimelineBoundaryRow kind={boundaryAtBottom ? "cut" : "view"} isFirst={false} isLast />
            )}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="flex flex-col items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={growWindow}
                className="rounded-md border border-teal-600/40 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-600/10 dark:border-teal-400/40 dark:text-teal-400 dark:hover:bg-teal-400/10"
              >
                Show {Math.min(WINDOW_CHUNK, rows.length - windowSize)} more
              </button>
              <span className="text-[11px] tabular-nums text-rb-400">
                Showing {windowSize.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} rows
              </span>
            </div>
          )}
          {footer && !hasMore && footer}
        </>
      ) : (
        <>
          {/* A list with no rows but a boundary is not an empty history: every
              event sits before the cut (a wallet dormant since before a seed's
              cut, its whole life travelling as state). The card stands alone
              on the spine and says so; the empty label would say the
              opposite.

              ⚠️ THIS IS THE ONE PLACE THE CARD SURVIVES, and it is not an
              oversight. Everywhere else the card gave way to the bare spine
              node on 2026-09-11, because there the node TERMINATES A DRAWN
              LIST and the rows above it are the statement. Here there are no
              rows: a lone glyph on an otherwise blank panel would state
              nothing at all, and "no events" would state something false. */}
          {effectiveBoundary && !tl.isFiltered ? (
            <div className="flex flex-col gap-2">
              <TimelineBoundaryCard
                boundary={effectiveBoundary}
                protocolKey={tl.protocolKey}
                listed={0}
                csvExport={csvExport}
                isFirst
                isLast
              />
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-rb-500">
              {tl.isFiltered ? "All events filtered out — adjust the filters above to show some." : emptyLabel}
            </div>
          )}
          {footer && !tl.isFiltered && footer}
        </>
      )}
    </div>
  );
}
