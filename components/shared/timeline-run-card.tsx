"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Folder, FolderOpen } from "lucide-react";

import { EventCard } from "@/components/shared/event-card";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { SpineColumn, type SpineIcon } from "@/components/shared/spine-column";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { DisclosureChevron, ExpandChevron } from "@/components/shared/expand-chevron";
import { fmtHeaderMagnitude } from "@/lib/shared/header-values";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { useLinkedHover } from "@/hooks/useLinkedHover";

/**
 * Timeline run card — one row standing in for a stretch of consecutive
 * passive/third-party events (redemption touches on a heavily redeemed Trove,
 * a keeper's liquidation burst, an auction's slices, a queue's fills). It is
 * the same de-noising treatment the server applies to zero-delta "No change"
 * runs, but done client-side: because the member events are already in the
 * client's timeline payload, the row expands IN PLACE to the individual cards,
 * which the server-collapsed no-change run cannot.
 *
 * Unlike a no-change run, every member usually moved real value, so the row can
 * carry SUMMED magnitudes (`aggregates`) — each one a chain-derived Σ over the
 * members' own chain deltas, with a receipt that says so and points at the
 * members for the leaves. A run whose per-event figures are not the position's
 * own deltas (f(x)'s whole-tick rebalances) omits `aggregates` entirely and
 * renders count-only rather than misstate the position.
 *
 * Visual grammar mirrors the protocol's own single passive-event card: dotted
 * spine with the semantic icon, tinted verb + amount pairs, and the count in
 * the spine's folder pill. The row names no action in words — the verbs beside
 * the summed pairs already do (2026-09-02); the aria label names the members.
 *
 * ── TWO WAYS THE MEMBERS ARRIVE, ONE CARD
 *
 * Decision 0019's evening amendment moved grouping into the index for the
 * families whose rows carry their own running state, so the same card now
 * draws two things:
 *
 *   • a CLIENT-GROUPED run — `children`, the member cards already built,
 *     because their events are already in the page's payload. Fifteen
 *     families, unchanged;
 *   • a SERVED FOLDER — `onOpen` + `members`, where the header is all the page
 *     holds until the reader asks. The fetch may be genuinely slow and is
 *     designed for rather than against: the header has already answered the
 *     question, so an open is an audit and an audit can wait. `loading` draws
 *     a skeleton in the members' place, `error` draws one plain sentence, and
 *     the expanded area is NEVER empty — an empty area reads as "there was
 *     nothing here", which is never true of a folder.
 *
 * A collapse mid-flight does not abort the read: its result is cached by the
 * provider, so a re-open is instant and a slow read that lands into the cache
 * is exactly the point.
 */

/** One summed header pair — "Cleared 12.92 Ξ". The pair is hidden when the sum
 *  is 0, so a run that moved nothing on one leg shows only the other. */
export interface RunAggregate {
  /** Header verb: "Cleared", "Repaid", "Seized", "Sold", "Paid out". */
  verb: string;
  /** Σ of the members' magnitudes for this leg. */
  value: number;
  symbol: string;
  /** Resolve the icon under a different symbol — a receipt token wearing its
   *  underlying's mark (see TokenChipIcon's iconOverride). */
  iconSymbol?: string;
  /** Subject of the Σ receipt, e.g. "Collateral seized". */
  provWhat: string;
  /** How many member events feed this verb group, rendered as a mini muted
   *  pill after the pair (the spine ×N pill's own register) — a mixed folder
   *  carries its per-kind counts this way instead of a separate counter row.
   *  Bare count, no ×: beside a magnitude, "×25" would read as arithmetic. */
  count?: number;
}

export interface TimelineRunCardProps {
  count: number;
  /** Singular noun for one member — "liquidation". Pluralized (+s) in the Σ
   *  receipt and the aria label. */
  memberNoun: string;
  /** Summed header pairs. Omit for a count-only row. */
  aggregates?: RunAggregate[];
  /** Verb color + pill tone. Match the protocol's own single-event card:
   *  "caution" for routine adverse events (redemption), "danger" for terminal
   *  ones (liquidation, auction settlement), "neutral" for runs that carry no
   *  adverse signal at all (custody transfers) — neutral rb verbs, and pair it
   *  with spineIcon="custody" so no warning triangle renders. */
  tone?: "caution" | "danger" | "neutral";
  /** Spine glyph — "warning" for adverse runs, "external" for third-party
   *  actions that aren't a loss (keeper queue fills). */
  spineIcon?: SpineIcon;
  /** Short label for the desktop spine pill / mobile header pill. */
  warningLabel?: string;
  /** Folder register — the chunk-card treatment: this row is a chronological
   *  slice of a longer third-party stretch, not a semantic grouping of its
   *  own (see `lib/shared/timeline-chunks.ts`). On the spine the folder sits
   *  in the LEFT flank with a dot on the line and the count in a pill to the
   *  right — so the expanded members' own spine nodes line up to the folder's
   *  right and read as its contents. The folder node is clickable (same
   *  toggle as the header) and draws open while expanded, with a Finder-style
   *  disclosure chevron to its left (right = closed, down = open) — the row's
   *  only chevron; the header's trailing ▾ is dropped. Folder node and header
   *  hover as ONE control: pointing at either raises the header and lights
   *  the folder (`useLinkedHover`). On mobile, where the
   *  spine column is hidden, chevron + glyph move into the header — the same
   *  hand-off the warning pill makes — and the expanded members are held by
   *  a left rail + slight indent instead. */
  folder?: boolean;
  /** Small glyph on the folder's corner — a chunk whose members are all one
   *  kind wears that kind's mark (a liquidations-only folder carries the
   *  warning triangle). Only rendered with `folder`. */
  folderBadge?: ReactNode;
  /** Extra header content, rendered after the aggregate pairs. */
  extraHeader?: ReactNode;
  /** Chronological bounds of the run (either display order). */
  firstTimestamp: number;
  lastTimestamp: number;
  isFirst?: boolean;
  isLast?: boolean;
  /** Muted register (see EventCard.muted) — the collapsed run row renders at
   *  reduced opacity at rest. Pair with tone="neutral" for custody runs. */
  muted?: boolean;
  /** The run's member cards, rendered when expanded — the CLIENT-GROUPED
   *  path, where every member is already in the page's payload. Omit on a
   *  served folder and pass `members`/`onOpen` instead. */
  children?: ReactNode;
  /** The members of a SERVED folder, once their read has landed. UNDEFINED is
   *  the pending state — not yet asked for, or still in flight, which are the
   *  same thing to a reader looking at an open folder — and draws the
   *  skeleton. An EMPTY array is a different claim and is never sent: a folder
   *  with no members cannot exist. */
  members?: ReactNode[];
  /** Called on the FIRST open of a served folder — the members read. Never
   *  called again: the provider caches the answer, so a second open is a map
   *  lookup. */
  onOpen?: () => void;
  /** The members read failed, or the route refused the key. The route's own
   *  sentence, drawn in the members' place — a refusal is a stated fact, never
   *  an empty area. */
  error?: string | null;
  /** The position moved between the page's read and this open, so the members
   *  come from a newer grouping than the header above them. Drawn as one muted
   *  line ABOVE the members; the members themselves are never dropped on that
   *  account — they are true rows, just of a newer answer. */
  stale?: boolean;
  /** Open regardless of the reader's own click — a served folder a date filter
   *  left standing, or the one a permalink landed in. Never a display
   *  preference: a served page's folders are not a reader's choice (rails-ops
   *  decision 0021). */
  forceOpen?: boolean;
  /** The Σ was computed by the INDEX over members that are not on the page
   *  yet, rather than over the member cards below. Only the receipt's input
   *  note changes: the figure is the same chain-derived Σ either way, and the
   *  leaves arrive when the folder opens. */
  summedByIndex?: boolean;
}

/** Roughly three member rows — what the skeleton reserves while a served
 *  folder's members are in flight, measured off a closed event card's own
 *  header panel (`px-5 pt-4 pb-3` around one row) plus the list's gap. */
const MEMBERS_SKELETON_HEIGHT = 200;

/** Verb color per tone — the amount itself stays foreground-bold. */
const VERB_CLASSES: Record<"caution" | "danger" | "neutral", string> = {
  caution: "text-caution-600 dark:text-caution-400",
  danger: "text-red-600 dark:text-red-400",
  neutral: "text-rb-500",
};

/** Mobile header pill per tone (the desktop pill lives on the spine). */
const PILL_CLASSES: Record<"caution" | "danger" | "neutral", string> = {
  caution: "bg-caution-500 text-white",
  danger: "bg-red-500 text-white",
  neutral: "bg-rb-500 text-white",
};

export function TimelineRunCard({
  count,
  memberNoun,
  aggregates,
  tone = "caution",
  spineIcon = "warning",
  warningLabel,
  folder,
  folderBadge,
  extraHeader,
  firstTimestamp,
  lastTimestamp,
  isFirst,
  isLast,
  muted,
  children,
  members,
  onOpen,
  error,
  stale,
  forceOpen,
  summedByIndex,
}: TimelineRunCardProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = ownOpen || !!forceOpen;
  // The members read fires once and only once — the provider caches the
  // answer, so re-opening is a map lookup and a collapse mid-flight loses
  // nothing.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!open || !onOpen || askedRef.current) return;
    askedRef.current = true;
    onOpen();
  }, [open, onOpen]);
  // Folder node (spine flank) + header are one control in two EventCard
  // subtrees; this joins their hover so either surface lights both.
  const { lit, bind } = useLinkedHover<"header" | "folder">();

  const [fromTs, toTs] =
    firstTimestamp <= lastTimestamp ? [firstTimestamp, lastTimestamp] : [lastTimestamp, firstTimestamp];
  const sameDay = shortDate(fromTs) === shortDate(toTs) && shortDateYear(fromTs) === shortDateYear(toTs);
  const range = sameDay
    ? `${shortDate(fromTs)} ${shortDateYear(fromTs)}`
    : `${shortDate(fromTs)} ${shortDateYear(fromTs)} – ${shortDate(toTs)} ${shortDateYear(toTs)}`;

  const toggle = () => setOwnOpen((v) => !v);

  const memberPlural = `${memberNoun}s`;

  // The summed figures are chain-derived aggregates: every addend is a member
  // event's own chain delta, each carrying its own receipt once the run is
  // expanded. The receipt states the aggregation; the members hold the leaves.
  //
  // ON A SERVED FOLDER THE ADDENDS ARE NOT ON THE PAGE YET, so the receipt says
  // where they are instead of pointing at leaves the reader does not have. It
  // stays `chain-derived` — the figure is the same Σ over the same per-event
  // chain deltas, computed by the index rather than by the browser, and
  // summing base units once is if anything more precise than the client's
  // scale-then-sum. It NEVER quotes the folder's id: that id is scoped to the
  // response it came in, and a receipt is a thing readers copy. The folder is
  // identified by its span and its count, which are durable facts.
  const runProv = (what: string): Provenance => ({
    kind: "chain-derived",
    summary: folder
      ? `${what} across this folder — the total over the ${count} ${memberPlural} it holds. Opening the folder shows each event with its receipt.`
      : `${what} across this run — the total over the ${count} ${memberPlural} in this row. Expanding the run shows each event with its receipt.`,
    formula: `Σ ${what.toLowerCase()} over ${count} events`,
    inputs: [
      {
        label: "member events",
        value: `${count} ${memberPlural}, ${range}`,
        kind: "chain",
        note: summedByIndex ? "each has a receipt; opening the folder loads them" : "each has a receipt",
      },
    ],
  });
  const fullNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

  const header = (
    <div
      className={`group/run cursor-pointer rounded-xl transition-colors px-5 pt-4 pb-3${lit ? " bg-raised" : ""}`}
      onClick={toggle}
      {...bind("header")}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${count} consecutive ${memberPlural} — ${open ? "collapse" : "expand"} the run`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* The dotted spine carries the pill on desktop; on mobile the badge
            moves into the header, matching the single passive card's hand-off.
            Folder rows never carry it — the corner mark + dot/connector tone
            already state the severity, at every width. */}
        {!folder && warningLabel && (
          <span
            className={`sm:hidden inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PILL_CLASSES[tone]}`}
          >
            {warningLabel}
          </span>
        )}
        {/* On mobile the spine column is hidden, so the folder glyph moves
            into the header — the same hand-off the warning pill makes — and
            its Finder-style disclosure chevron comes with it: right while
            closed, down while open, to the folder's left (the spine node
            carries the same pair on sm+). */}
        {folder && (
          <span
            className="sm:hidden mr-0.5 inline-flex items-center gap-1 text-rb-500 transition-colors group-hover/run:text-foreground"
            aria-hidden
          >
            <DisclosureChevron isOpen={open} />
            <span className="relative inline-flex">
              {open ? <FolderOpen size={16} strokeWidth={1.75} /> : <Folder size={16} strokeWidth={1.75} />}
              {folderBadge && (
                <span className="absolute -right-1.5 -bottom-1 inline-flex rounded-full bg-background p-px">
                  {folderBadge}
                </span>
              )}
            </span>
          </span>
        )}
        {/* The row reads as [icon] N [aggregates…] — the verbs beside each
            summed pair already name what happened, so a word naming it again
            was repetition and went, with the "×" beside it, on 2026-09-02
            (next to the Σ glyph it read as arithmetic). The icon reads as
            "Σ over this folder". Count still moves to the spine pill on sm+;
            on mobile, where the spine is hidden, it stays in the header —
            bare, like the spine pill. */}
        {/* data-prov-exempt: the count is an index row count, the "event
            numbers" class, not a chain-state figure. See SpineColumn's folder
            pill, which carries the same stamp for the same reason. */}
        {folder && (
          <span data-prov-exempt="" className="inline-flex items-center gap-1 text-sm font-medium text-rb-500">
            <Calculator size={15} strokeWidth={2} aria-hidden />
            <span className="sm:hidden">{count.toLocaleString("en-US")}</span>
          </span>
        )}
        {aggregates?.map(
          (agg, i) =>
            agg.value > 0 && (
              <span key={`${agg.verb}_${agg.symbol}_${i}`} className="inline-flex items-center gap-1.5 text-sm">
                <span className={VERB_CLASSES[tone]}>{agg.verb}</span>
                <Prov value={fullNum(agg.value)} symbol={agg.symbol} info={runProv(agg.provWhat)}>
                  <span className="font-bold text-foreground">{fmtHeaderMagnitude(agg.value)}</span>
                </Prov>
                <TokenChipIcon symbol={agg.symbol} iconOverride={agg.iconSymbol} size={16} />
                {agg.count != null && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap text-rb-500 bg-rb-500/10">
                    {agg.count.toLocaleString("en-US")}
                  </span>
                )}
              </span>
            ),
        )}
        {extraHeader}
        {/* `evt-meta`: below sm this span becomes the header's own first
            row (app/globals.css) — the date range sits right-aligned above
            the aggregates, the same hand-off every event card's date/time
            makes there. A folder row carries NO trailing chevron: its
            disclosure mark is the Finder-style chevron beside the folder
            glyph (spine node on sm+, header glyph below), so a second one
            here would say the same thing twice (Miles, 2026-09-02). A
            non-folder run row keeps the ▾. */}
        <span className="evt-meta ml-auto inline-flex items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-rb-500">{range}</span>
          {!folder && <ExpandChevron isOpen={open} group="run" />}
        </span>
      </div>
    </div>
  );

  // What sits under the header while it is open. A client-grouped run has its
  // members already; a served folder has them, or a skeleton, or one stated
  // sentence — and never nothing, because an empty expanded area reads as
  // "there was nothing here" and a folder is never empty.
  const staleLine = stale ? (
    <p key="stale" className="px-5 text-[11px] leading-relaxed text-rb-500">
      This position has moved since the page was opened; reload for the current history.
    </p>
  ) : null;
  let body: ReactNode = children;
  if (onOpen) {
    if (error) {
      body = (
        <p className="px-5 text-[11px] leading-relaxed text-rb-500">
          <span className="text-foreground">These events could not be loaded.</span> {error} The figures above are
          unchanged.
        </p>
      );
    } else if (members) {
      body = (
        <>
          {staleLine}
          {members}
        </>
      );
    } else {
      // Undefined members and no error means the read is still out. There is
      // no spinner: a spinner implies a fast answer is coming, and a first
      // open on a cold position pays for the whole grouping pass.
      body = <SkeletonBlock height={MEMBERS_SKELETON_HEIGHT} />;
    }
  }

  return (
    <>
      <EventCard
        avatar={<div className="hidden sm:block" />}
        iconColumn={
          <SpineColumn
            icon={folder ? "folder" : spineIcon}
            warningTone={tone === "danger" ? "critical" : "caution"}
            warningLabel={warningLabel}
            folderOpen={folder ? open : undefined}
            folderMark={folder ? folderBadge : undefined}
            folderCount={folder ? count : undefined}
            onFolderToggle={folder ? toggle : undefined}
            folderLit={folder ? lit : undefined}
            folderHover={folder ? bind("folder") : undefined}
            spine="dotted"
            isFirst={isFirst}
            isLast={!!isLast && !open}
          />
        }
        header={header}
        hideDetailChevron
        muted={muted}
      />
      {open &&
        (folder ? (
          // Mobile containment: a left rail + slight indent holds the
          // expanded members under their folder. On sm+ the wrapper is
          // display:contents — the members join the outer flex column (and
          // its gap) exactly as before, and the rail never draws; there the
          // containment reads from the spine instead (the folder in the left
          // flank, the members' nodes to its right).
          <div className="relative flex flex-col gap-2 ml-1 pl-2 sm:contents">
            {/* The rail draws with the spine's own dash (1px wide, 6px
                period) rather than border-dashed, whose dashes are longer
                and read as a different line. rgb(101 115 140) = rb-500, the
                spine's default tint. */}
            <div
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-px sm:hidden"
              style={{
                backgroundImage: "linear-gradient(to bottom, rgb(101 115 140) 50%, transparent 50%)",
                backgroundSize: "1px 6px",
              }}
            />
            {body}
          </div>
        ) : (
          body
        ))}
    </>
  );
}
