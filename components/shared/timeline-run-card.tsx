"use client";

import { formatExact } from "@/lib/utils/format";
import { ExactTip } from "@/components/shared/amount-text";
import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Calculator } from "lucide-react";

import { EventCard } from "@/components/shared/event-card";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { SpineColumn, type SpineIcon, type SpineTokenRow } from "@/components/shared/spine-column";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { GroupFrame, GroupNumbersContext, groupMenuWords, groupRangeText } from "@/components/shared/group-frame";
import { fmtHeaderMagnitude, useHeaderValueHideClass } from "@/lib/shared/header-values";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { spokenAmount } from "@/components/shared/mobile-spine";
import { formatDate } from "@/lib/date";

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
 * The closed run is a row on the spine (ui-jobs 250 set B): its legs summed as
 * nodes, the kind word in T1, the date range in the time slot, and the dotted
 * segment below that stands for the members not drawn; the group button above
 * ("Show 45 events") shows them, inside the bracket frame (`group-frame.tsx`).
 * A click on the nodes or the head opens the summary card: the sums with
 * their Σ receipts, and the date range.
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
   *  "caution" for a change to the owner's position the owner did not make
   *  (redemptions, tick rebalances; color-grammar.md §5), "danger" for terminal
   *  ones (liquidation, auction settlement), "neutral" for runs that carry no
   *  adverse signal at all (custody transfers) — neutral rb verbs, and pair it
   *  with spineIcon="custody" so no warning triangle renders. */
  tone?: "caution" | "danger" | "neutral";
  /** Spine glyph — "warning" for adverse runs, "external" for third-party
   *  actions that aren't a loss (keeper queue fills). */
  spineIcon?: SpineIcon;
  /** The kind's word T1 states ("Redemptions"), in the run's tone. Unset:
   *  the member noun, plural. */
  warningLabel?: string;
  /** A chronological slice of a longer stretch (`lib/shared/timeline-chunks.ts`):
   *  the summary card opens with the Σ glyph before the sums. */
  folder?: boolean;
  /** Not drawn since ui-jobs 250 set B (the group button and the frame mark
   *  a group); the callers' marks are left for the end-of-design pass. */
  folderBadge?: ReactNode;
  /** The event numbers the group holds, lowest and highest, where the caller
   *  knows them (a served folder's ordinals). Unset: `GroupNumbersContext`. */
  eventRange?: [number, number];
  /** The position across the group, for the summary card's sentence: each
   *  side's state before the first member and after the last ("the debt"
   *  first, then any other: "collateral"). */
  stateSpan?: { label: string; from: number; to: number; symbol: string }[];
  /** Header content drawn before the aggregate pairs: a shape run's summary. */
  lead?: ReactNode;
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
  /** While a served folder's members are read, a line above the skeleton
   *  saying so ("Reading 12 deposits…"). Unset draws the skeleton alone. */
  readingLine?: boolean;
}

/** True on the folder holding the event a `?at=` landing wants opened in
 *  place (`renderRunFolders` provides it): the folder opens as if clicked. */
export const RunLandingContext = createContext(false);

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

export function TimelineRunCard({
  count,
  memberNoun,
  aggregates,
  tone = "caution",
  spineIcon = "warning",
  warningLabel,
  folder,
  folderBadge,
  lead,
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
  readingLine,
  eventRange,
  stateSpan,
}: TimelineRunCardProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = ownOpen || !!forceOpen;
  const landing = useContext(RunLandingContext);
  useEffect(() => {
    if (landing) setOwnOpen(true);
  }, [landing]);
  // The members read fires once and only once — the provider caches the
  // answer, so re-opening is a map lookup and a collapse mid-flight loses
  // nothing.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!open || !onOpen || askedRef.current) return;
    askedRef.current = true;
    onOpen();
  }, [open, onOpen]);
  const hideVal = useHeaderValueHideClass();
  const membersId = useId();

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
  // A leg in a token whose decimals did not load (the timeline provides the
  // run's members' tokens) states no sum.
  const unreadOf = useUnreadTokenOf();

  // ── The summed legs, as the spine's nodes ─────────────────────────────
  // A run of redemptions or liquidations draws its legs as set A's warning
  // nodes: every leg left the position, so each points out ("12.41 →",
  // "37K →"), collateral first, in the run's tone. Any other run nets each
  // token's legs: a leg whose verb moves the token into the position counts
  // plus, one that moves it to the wallet minus, and the node's arrow points
  // the way the net goes. A run whose members moved no asset draws no node.
  const adverse = spineIcon === "warning" && tone !== "neutral";
  const legAggs = (aggregates ?? []).filter((agg) => agg.value > 0);
  const warningLegs = adverse
    ? [...legAggs]
        .sort((a, b) => Number(DEBT_VERB.test(a.verb)) - Number(DEBT_VERB.test(b.verb)))
        .map((agg) => ({ label: agg.verb, value: agg.value, symbol: agg.symbol }))
    : undefined;
  const netTokens = adverse || spineIcon === "custody" ? [] : netLegs(legAggs);
  // The group opens from its row's ⋮ ("Show 48 grouped events") and closes
  // from a member's ("Hide …"); the range of event numbers rides the items'
  // sub-line. A closed group's number column is empty.
  const contextRange = useContext(GroupNumbersContext);
  const numberRange = eventRange ?? contextRange;
  const rangeText = groupRangeText(numberRange);
  const onToggle = () => !forceOpen && toggle();
  const words2 = groupMenuWords(count, rangeText);
  const showMenu = { ...words2.show, show: () => !open && onToggle() };
  const hide = { ...words2.hide, hide: () => open && onToggle() };
  /** The closed row's column: the node, then the summed legs, then the dotted
   *  segment for the members not drawn. */
  const legsColumn = (
    <SpineColumn
      {...(adverse
        ? {
            icon: "warning" as const,
            warningLegs,
            warningLabel,
            warningTone: tone === "danger" ? "critical" : "caution",
          }
        : spineIcon === "custody"
          ? // A custody run moved the asset between accounts: the plane, no
            // flank (a transfer is neither direction).
            { icon: "custody" as const }
          : netTokens.length > 0
            ? { tokens: netTokens }
            : { icon: "none" as const })}
      undrawn
      isFirst={isFirst}
      isLast={!!isLast}
    />
  );
  // T1's word: the shape a served folder names, else the kind ("Redemptions",
  // "Transfers"), in the run's tone.
  const kindWord = warningLabel ?? `${memberPlural.charAt(0).toUpperCase()}${memberPlural.slice(1)}`;
  // The count rides T1 and the caption: "Redemptions (48)".
  const countMark = `(${count.toLocaleString("en-US")})`;

  /** The sums, verb by verb: the summary card's body, and T1's legs where
   *  the spine does not carry them (Timeline values off, a pinned page). */
  const sums = (hide: string, counts: boolean) =>
    aggregates?.map((agg, i) => {
      const unread = unreadOf(undefined, agg.symbol);
      if (unread)
        return (
          <span
            key={`${agg.verb}_${agg.symbol}_${i}`}
            className={`inline-flex items-center gap-1.5 text-sm ${hide}`}
            data-not-loaded=""
          >
            <span className="text-rb-500">{agg.verb}</span>
            <TokenAmountNotLoaded address={unread.address} label={unread.label} />
          </span>
        );
      return (
        agg.value > 0 && (
          <span key={`${agg.verb}_${agg.symbol}_${i}`} className={`inline-flex items-center gap-1.5 text-sm ${hide}`}>
            <span className="text-rb-500">{agg.verb}</span>
            <Prov value={fullNum(agg.value)} symbol={agg.symbol} info={runProv(agg.provWhat)}>
              <span className="font-bold text-foreground">
                <ExactTip
                  text={fmtHeaderMagnitude(agg.value, agg.symbol)}
                  exact={formatExact(agg.value)}
                  symbol={agg.symbol}
                />
              </span>
            </Prov>
            <TokenChipIcon symbol={agg.symbol} iconOverride={agg.iconSymbol} size={16} />
            {/* A receipt token wearing its underlying's mark names itself,
                so 0.0675 mWETH does not read as 0.0675 WETH. */}
            {agg.iconSymbol && agg.iconSymbol !== agg.symbol && (
              <span className="text-xs text-rb-500">{agg.symbol}</span>
            )}
            {counts && agg.count != null && (
              // data-prov-exempt: a row count, the "event numbers" class.
              <span
                data-prov-exempt=""
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap text-rb-500 bg-rb-500/10"
                title={`${agg.count.toLocaleString("en-US")} ${agg.verb.toLowerCase()} rows, grouped in this row; open it to see each`}
              >
                {agg.count.toLocaleString("en-US")}
              </span>
            )}
          </span>
        )
      );
    });
  const hasSums = legAggs.length > 0 || !!lead || !!extraHeader;

  /** The group's summary card: the sums and the date range. */
  // T2: one sentence of what the group holds, from the members: the head's
  // verbs in lower case, the sums at the head's precision, the effective
  // price where the run cleared a dollar debt against collateral, and the
  // position's span where the caller states it.
  const t2 = (() => {
    if (legAggs.length === 0) return null;
    const amt = (v: number, sym: string) => `${fmtHeaderMagnitude(v, sym)} ${sym}`;
    let clauses: string;
    let price = "";
    if (adverse) {
      clauses = legAggs.map((a) => `${a.verb.toLowerCase()} ${amt(a.value, a.symbol)}`).join(" and ");
      const debt = legAggs.find((a) => DEBT_VERB.test(a.verb));
      const coll = legAggs.find((a) => !DEBT_VERB.test(a.verb));
      if (debt && coll && coll.value > 0 && USD_DEBT.test(debt.symbol))
        price = `, an effective $${Math.round(debt.value / coll.value).toLocaleString("en-US")} per ${coll.symbol}`;
    } else {
      if (netTokens.length === 0) return null;
      clauses = netTokens
        .map((t) => {
          const out = t.direction === "left";
          const verb = legAggs.find((a) => a.symbol === t.symbol && OUT_VERB.test(a.verb) === out)?.verb;
          return `${verb ? `${verb.toLowerCase()} ` : ""}a net ${amt(Number(t.value), t.symbol)}`;
        })
        .join(" and ");
    }
    const spans = (stateSpan ?? []).map(
      (st, i) =>
        `${i === 0 ? st.label : st.label.replace(/^the /, "")} went from ${stateAmount(st.from)} to ${stateAmount(st.to)} ${st.symbol}`,
    );
    const spanText = spans.length ? `; ${spans.join(", ").replace(/, (\S+) went from/g, ", $1 from")}` : "";
    return `${count.toLocaleString("en-US")} ${count === 1 ? memberNoun : memberPlural} ${spanWords(fromTs, toTs)} ${clauses}${price}${spanText}.`;
  })();

  const summary = (
    <div data-group-summary="">
      {t2 && (
        <p className="px-5 pt-3 text-sm leading-relaxed text-rb-500" data-anatomy="T2" data-group-sentence="">
          {t2}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3 pb-4">
        {folder && (
          <span data-prov-exempt="" className="inline-flex items-center text-rb-500">
            <Calculator size={15} strokeWidth={2} aria-label="Sums over the group" />
          </span>
        )}
        {lead}
        {sums("", true)}
        {extraHeader}
        <span className="ml-auto text-xs text-rb-500">{range}</span>
      </div>
    </div>
  );

  /** T1: the kind word in the run's tone, the sums where the spine does not
   *  carry them, the date range in the time slot. */
  const head = (
    <div data-anatomy="L6" className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 pt-4 pb-3">
      {lead ? (
        <span className="inline-flex items-center gap-1.5" data-group-word="">
          {lead}
          <span className="text-sm text-rb-500">{countMark}</span>
        </span>
      ) : (
        <span className={`text-sm font-medium ${VERB_CLASSES[adverse ? tone : "neutral"]}`} data-group-word="">
          {kindWord} {countMark}
        </span>
      )}
      {sums(hideVal, false)}
      {extraHeader}
      <span className="evt-meta ml-auto inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-rb-500">{range}</span>
      </span>
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
      body = readingLine ? (
        <div className="relative" aria-busy="true">
          <SkeletonBlock height={MEMBERS_SKELETON_HEIGHT} />
          <p className="absolute inset-x-0 top-5 px-5 text-center text-xs text-rb-500" role="status">
            Reading {count.toLocaleString("en-US")} {count === 1 ? memberNoun : memberPlural}&hellip;
          </p>
        </div>
      ) : (
        <SkeletonBlock height={MEMBERS_SKELETON_HEIGHT} />
      );
    }
  }

  // The phone caption and the phone control's name: the word, the count and
  // the range ("Redemptions (48) · 1 Oct '25 – 12 Oct '25").
  const spokenRange = sameDay ? formatDate(fromTs) : `${formatDate(fromTs)} to ${formatDate(toTs)}`;
  const spokenSums = legAggs
    .filter((agg) => !unreadOf(undefined, agg.symbol))
    .map((agg) => `${agg.verb.toLowerCase()} ${spokenAmount(agg.value)} ${agg.symbol}`);
  const countText = `${count.toLocaleString("en-US")} ${count === 1 ? memberNoun : memberPlural}`;

  return (
    <GroupFrame
      open={open}
      show={showMenu.show}
      hide={hide}
      membersId={membersId}
      closed={
        <EventCard
          avatar={null}
          iconColumn={legsColumn}
          groupMenu={showMenu}
          header={head}
          phoneCaption={
            <>
              {kindWord} {countMark} &middot; {range}
            </>
          }
          spokenCaption={`${kindWord}, ${spokenRange}`}
          label={`${countText}, ${spokenRange}${spokenSums.length ? `: ${spokenSums.join(", ")}` : ""}`}
          detail={hasSums ? summary : undefined}
          detailLabel="The group's sums"
          noChevron
          muted={muted}
        />
      }
      members={body}
    />
  );
}

/** A state figure as the card's grid states it: whole units from a thousand,
 *  two places below. */
function stateAmount(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
}

/** A debt in dollars, against which an effective collateral price reads. */
const USD_DEBT = /USD|BOLD|LUSD|DAI|GHO|FRAX/i;

/** "between 1 and 12 Oct '25", "on 1 Sep '25", "between 28 Sep '25 and
 *  2 Oct '25". */
function spanWords(a: number, b: number): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const d1 = shortDate(lo);
  const d2 = shortDate(hi);
  const y1 = shortDateYear(lo);
  const y2 = shortDateYear(hi);
  if (d1 === d2 && y1 === y2) return `on ${d1} ${y1}`;
  const [day1, mon1] = d1.split(" ");
  const [day2, mon2] = d2.split(" ");
  if (mon1 === mon2 && y1 === y2) return `between ${day1} and ${day2} ${mon2} ${y2}`;
  return `between ${d1} ${y1} and ${d2} ${y2}`;
}

/** A verb that names the debt side of a leg: drawn last, after the
 *  collateral, as set A's warning nodes are. */
const DEBT_VERB = /^(cleared|repaid|repay|debt)/i;
/** A verb that moves the token to the wallet; every other one into the
 *  position. */
const OUT_VERB = /^(withdr|borrow|received|paid out|claimed|redeemed|sent)/i;

/** Net each token's legs: into the position plus, to the wallet minus. */
function netLegs(aggs: RunAggregate[]): SpineTokenRow[] {
  const net = new Map<string, { value: number; iconSymbol?: string }>();
  for (const agg of aggs) {
    const cur = net.get(agg.symbol) ?? { value: 0, iconSymbol: agg.iconSymbol };
    cur.value += OUT_VERB.test(agg.verb) ? -agg.value : agg.value;
    net.set(agg.symbol, cur);
  }
  return [...net.entries()]
    .filter(([, v]) => v.value !== 0)
    .map(([symbol, v]) => ({
      symbol,
      iconSymbol: v.iconSymbol,
      direction: v.value > 0 ? ("right" as const) : ("left" as const),
      value: Math.abs(v.value),
    }));
}
