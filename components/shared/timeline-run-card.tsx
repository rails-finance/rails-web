"use client";

import { SheetSkeleton } from "@/components/shared/event-sheet";
import { formatExact } from "@/lib/utils/format";
import { ExactTip } from "@/components/shared/amount-text";
import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { Fragment, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Calculator } from "lucide-react";

import { EventCard } from "@/components/shared/event-card";
import { GroupSheetCollector, type CollectedCard } from "@/components/shared/group-sheet";
import type { EventSheet, SheetFigure } from "@/components/shared/event-sheet";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import type { EventCardPrice } from "@/components/shared/event-price-row";
import { CountChip } from "@/components/shared/count-chip";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { type SpineColumnProps, type SpineIcon, type SpineTokenRow } from "@/components/shared/spine-column";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { GroupFrame, GroupNumbersContext, groupMenuWords, groupRangeText } from "@/components/shared/group-frame";
import { fmtHeaderMagnitude, useHeaderValueHideClass } from "@/lib/shared/header-values";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { spokenAmount } from "@/components/shared/mobile-spine";
import { formatDate } from "@/lib/date";
import type { Tone } from "@/lib/shared/tone";

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
 * nodes, the kind word and the count in T1, the count a chip after the word
 * (`CountChip`, ui-jobs 331), the date range in the time slot, and the list's line dotted below it for the members
 * not drawn; the row's ⋮ ("Show 48 grouped events") shows them, inside the
 * bracket frame (`group-frame.tsx`). A click on the nodes or the head opens the
 * summary card: Explanation, the run in bullets, and Figures, the members' merged
 * sheet or the sums with their Σ receipts.
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
   *  pill after the pair in the summary card: a mixed folder carries its
   *  per-kind counts this way.
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
  /** The T1 word's tone and the summed legs': "caution" for a change to the
   *  owner's position the owner did not make (redemptions, tick rebalances;
   *  color-grammar.md §5), "critical" for terminal ones (liquidation, auction
   *  settlement), "neutral" for runs that carry no adverse signal (custody
   *  transfers, with spineIcon="custody"). */
  tone?: Tone | "neutral";
  /** Spine glyph — "warning" for adverse runs, "external" for third-party
   *  actions that aren't a loss (keeper queue fills). */
  spineIcon?: SpineIcon;
  /** The kind's word T1 states ("Redemptions"), in the run's tone. Unset:
   *  the member noun, plural. */
  kindWord?: string;
  /** Whether the members are the owner's actions. Unset: not where the run is
   *  adverse (redemptions, liquidations) or a third party's (`external`). */
  byOwner?: boolean;
  /** Drawn as a folder (`lib/shared/run-folders.tsx`): the summary card opens
   *  with the Σ glyph before the sums. */
  folder?: boolean;
  /** The event numbers the group holds, lowest and highest, where the caller
   *  knows them (a served folder's ordinals). Unset: `GroupNumbersContext`. */
  eventRange?: [number, number];
  /** The position across the group, for the summary card's sentence: each
   *  side's state before the first member and after the last ("the debt"
   *  first, then any other: "collateral"). */
  stateSpan?: { label: string; from: number; to: number; symbol: string }[];
  /** The member noun's plural, where it is not the noun with "s" ("touches"). */
  memberPlural?: string;
  /** A family's own lines for the group's Explanation (ui-jobs 404): `who`
   *  in place of the generic subject of the first line, `lines` after it,
   *  and `covers` the sides those lines state, so the members' merged sheet
   *  adds no second line for them. */
  explain?: { who?: ReactNode; lines?: ReactNode[]; covers?: FlowSide[] };
  /** The family's own reading of the members' sheets for the Figures tab,
   *  where the shared merge does not read them as one (Polaris's touches). */
  mergeSheet?: (cards: CollectedCard[]) => EventSheet | null;
  /** Header content drawn before the aggregate pairs: a shape run's summary. */
  lead?: ReactNode;
  /** A muted line at the left of the opened card's sheet controls. */
  sheetLead?: ReactNode;
  /** Extra header content, rendered after the aggregate pairs. */
  extraHeader?: ReactNode;
  /** Chronological bounds of the run (either display order). */
  firstTimestamp: number;
  lastTimestamp: number;
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
const VERB_CLASSES: Record<Tone | "neutral", string> = {
  caution: "text-tone-caution",
  critical: "text-tone-critical",
  neutral: "text-rb-500",
};

export function TimelineRunCard({
  count,
  memberNoun,
  aggregates,
  tone = "caution",
  spineIcon = "warning",
  kindWord: kindWordProp,
  byOwner,
  folder,
  lead,
  sheetLead,
  extraHeader,
  firstTimestamp,
  lastTimestamp,
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
  memberPlural: memberPluralProp,
  explain,
  mergeSheet,
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
  // The summary card's balance sheet, read from the members' own
  // (`group-sheet.tsx`) once it opens; null where they do not read as one.
  // Undefined until the members are read and collected: the summary then
  // stands as the sheet's skeleton, never the sums it may replace.
  const [merged, setMerged] = useState<{ sheet: EventSheet; price?: EventCardPrice } | null | undefined>(undefined);
  const onSheet = useCallback(
    (m: { sheet: EventSheet; price?: EventCardPrice } | null | undefined) => setMerged(m),
    [],
  );

  const [fromTs, toTs] =
    firstTimestamp <= lastTimestamp ? [firstTimestamp, lastTimestamp] : [lastTimestamp, firstTimestamp];
  const sameDay = shortDate(fromTs) === shortDate(toTs) && shortDateYear(fromTs) === shortDateYear(toTs);
  const range = sameDay
    ? `${shortDate(fromTs)} ${shortDateYear(fromTs)}`
    : `${shortDate(fromTs)} ${shortDateYear(fromTs)} – ${shortDate(toTs)} ${shortDateYear(toTs)}`;

  const toggle = () => setOwnOpen((v) => !v);

  const memberPlural = memberPluralProp ?? `${memberNoun}s`;

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
  // "37K →"), the collateral below the debt, in the run's tone. Any other run
  // nets each token's legs: a leg whose verb moves the token into the position
  // counts plus, one that moves it to the wallet minus, and the node's arrow
  // points the way the net goes. A run whose members moved no asset draws no
  // node.
  const adverse = spineIcon === "warning" && tone !== "neutral";
  const legAggs = (aggregates ?? []).filter((agg) => agg.value > 0);
  const warningLegs = adverse
    ? [...legAggs]
        .sort((a, b) => Number(DEBT_VERB.test(a.verb)) - Number(DEBT_VERB.test(b.verb)))
        .map((agg) => ({ label: agg.verb, value: agg.value, symbol: agg.symbol }))
    : undefined;
  const netTokens = adverse || spineIcon === "custody" ? [] : netLegs(legAggs);
  // The group opens from its row's ⋮ ("Show 48 grouped events") and closes
  // from a member's ("Group 48 events"); the range of event numbers rides the items'
  // sub-line. The bracket carries the range at its ends, closed and open,
  // and the closed row's number column is empty (ui-jobs 331 point 4).
  const contextRange = useContext(GroupNumbersContext);
  const numberRange = eventRange ?? contextRange;
  const rangeText = groupRangeText(numberRange);
  const onToggle = () => !forceOpen && toggle();
  const words2 = groupMenuWords(count, rangeText);
  const showMenu = { ...words2.show, show: () => !open && onToggle() };
  const hide = { ...words2.hide, hide: () => open && onToggle() };
  /** The closed row's column: the node, then the summed legs; the list's
   *  line runs dotted below it where the members were not the owner's
   *  actions (mobile decision 18). */
  const actedByOwner = byOwner ?? !(adverse || spineIcon === "external");
  const legsColumn: SpineColumnProps = {
    ...(adverse
      ? {
          icon: "warning" as const,
          warningLegs,
          warningTone: tone === "critical" ? "critical" : "caution",
        }
      : spineIcon === "custody"
        ? // A custody run moved the asset between accounts: the plane, no
          // flank (a transfer is neither direction).
          { icon: "custody" as const }
        : netTokens.length > 0
          ? { tokens: netTokens }
          : // Nothing summed: the members' glyph alone, so the row's spine
            // is never empty (a run of batch rate changes draws their ⊜).
            { icon: spineIcon === "warning" ? ("none" as const) : spineIcon }),
    dotted: !actedByOwner,
    isLast: !!isLast,
  };
  // T1's word: the shape a served folder names, else the kind ("Redemptions",
  // "Transfers"), in the run's tone.
  const kindWord = kindWordProp ?? `${memberPlural.charAt(0).toUpperCase()}${memberPlural.slice(1)}`;
  // The count rides T1 and the caption as a chip after the word (ui-jobs 331).
  const countMark = <CountChip count={count} />;

  /** The sums, verb by verb: the summary card's body, and T1's legs where
   *  the spine does not carry them (a pinned page). */
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
  const hasSums = legAggs.length > 0 || !!lead || !!sheetLead || !!extraHeader || !!explain;

  // The members the sheet reads: a client-grouped run's cards, or a served
  // folder's once read (the summary's open asks for them).
  const sheetMembers = onOpen ? members : children;
  const collector = sheetMembers != null && (
    <GroupSheetCollector members={sheetMembers} count={count} label={kindWord} merge={mergeSheet} onSheet={onSheet} />
  );

  // ── T3: the group's Explanation (rails-ops TO-DO-ui-jobs 372, decision
  // 0044). One generator for every family and run kind, as bullets, each
  // dropped where its data is missing: what happened (who, how many of what,
  // when, the sums verb by verb), the effective price where an adverse run
  // cleared a dollar debt against collateral, each side's before and after,
  // and where the members are. At most two figures to a bullet beyond the
  // count and the dates, and five bullets.
  const W = GROUP_EXPLANATION_WORDS;
  const saidLegs = legAggs.filter((a) => !unreadOf(undefined, a.symbol));
  const bold = (n: ReactNode) => <strong className="font-semibold text-foreground">{n}</strong>;
  // A leg whose verb is the one before it drops the verb: "borrowed 400 GHO
  // and 575 USDC".
  const sumClause = (a: RunAggregate, verb: boolean) => (
    <>
      {verb && `${pastTense(a.verb)} `}
      <Prov echo value={fullNum(a.value)} symbol={a.symbol} info={runProv(a.provWhat)}>
        {bold(<ExactTip text={fmtHeaderMagnitude(a.value, a.symbol)} exact={formatExact(a.value)} symbol={a.symbol} />)}
      </Prov>{" "}
      {a.symbol}
    </>
  );
  const joinAnd = (legs: RunAggregate[]) =>
    legs.map((a, i) => (
      <Fragment key={`${a.verb}_${a.symbol}`}>
        {i > 0 && ` ${W.and} `}
        {sumClause(a, i === 0 || legs[i - 1].verb !== a.verb)}
      </Fragment>
    ));
  const pairs: RunAggregate[][] = [];
  for (let i = 0; i < saidLegs.length; i += 2) pairs.push(saidLegs.slice(i, i + 2));
  const bullets: ReactNode[] = [];
  const countText = `${count.toLocaleString("en-US")} ${count === 1 ? memberNoun : memberPlural}`;
  const span = spanWords(fromTs, toTs);
  // Who: the holder on an owner's run, a third party where the caller says
  // the members are another party's acts (`byOwner` false on an external
  // run: Maple's queue fills); a run of transfers, of the owner's losses or
  // of mixed events names its events alone.
  const who = explain?.who
    ? explain.who
    : actedByOwner && spineIcon !== "custody"
      ? W.holder
      : spineIcon === "external" && byOwner === false
        ? W.thirdParty
        : null;
  const shownPairs = pairs.slice(0, MAX_LEG_BULLETS);
  const unsaid = saidLegs.length - shownPairs.flat().length;
  bullets.push(
    who ? (
      <>
        {who} {countText} {span}
        {pairs[0] && (
          <>
            {" "}
            {W.inAll} {joinAnd(pairs[0])}
          </>
        )}
        .
      </>
    ) : (
      <>
        {countText} {span}
        {pairs[0] && <> {joinAnd(pairs[0])}</>}.
      </>
    ),
  );
  for (const pair of shownPairs.slice(1))
    bullets.push(
      <>
        {W.also} {joinAnd(pair)}.
      </>,
    );
  if (unsaid > 0) bullets.push(W.moreSums(unsaid));
  bullets.push(...(explain?.lines ?? []));
  const debtLeg = adverse ? saidLegs.find((a) => DEBT_VERB.test(a.verb)) : undefined;
  const collLeg = adverse ? saidLegs.find((a) => !DEBT_VERB.test(a.verb)) : undefined;
  if (debtLeg && collLeg && collLeg.value > 0 && USD_DEBT.test(debtLeg.symbol)) {
    const price = debtLeg.value / collLeg.value;
    bullets.push(
      <>
        {W.price}{" "}
        <Prov value={String(price)} info={priceProv(debtLeg, collLeg, count, memberPlural, fullNum)}>
          {bold(`$${Math.round(price).toLocaleString("en-US")}`)}
        </Prov>{" "}
        {W.per} {collLeg.symbol}.
      </>,
    );
  }
  const sideOf = (label: string): FlowSide => (/debt/i.test(label) ? "debt" : "collateral");
  const covered = new Set<string>(explain?.covers ?? []);
  for (const st of stateSpan ?? []) {
    covered.add(sideOf(st.label));
    bullets.push(
      <>
        {capitalFirst(/^the /i.test(st.label) ? st.label : `the ${st.label}`)} {W.wentFrom} {bold(stateAmount(st.from))}{" "}
        {W.to} {bold(stateAmount(st.to))} {st.symbol}.
      </>,
    );
  }
  bullets.push(...sheetSideBullets(merged?.sheet, covered));
  // The collector and the folder's read sit in the Explanation too, so the
  // members are read and the sheet's sides reach the bullets while it is open.
  const explainer = groupExplainer(
    bullets,
    <>
      {hasSums && collector}
      {hasSums && onOpen && !members && <AskMembers onOpen={onOpen} askedRef={askedRef} />}
    </>,
  );
  /** The Figures tab: the members' merged sheet, its skeleton while they are
   *  collected, or the sums where the members draw no sheet (Liquity V2's
   *  redemption group draws its members' sheet alone). */
  const summary = merged ? (
    <div data-group-summary="" data-group-sheet="">
      {collector}
    </div>
  ) : merged === undefined && (sheetMembers != null || (onOpen && !members)) ? (
    <div data-group-summary="">
      {collector}
      {onOpen && !members && <AskMembers onOpen={onOpen} askedRef={askedRef} />}
      <SheetSkeleton />
    </div>
  ) : (
    <div data-group-summary="">
      {collector}
      {onOpen && !members && <AskMembers onOpen={onOpen} askedRef={askedRef} />}
      {/* The header above names the group (`lead`) and dates it: the strip
          states the sums and their counts. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3 pb-4">
        {folder && (
          <span data-prov-exempt="" className="inline-flex items-center text-rb-500">
            <Calculator size={15} strokeWidth={2} aria-label="Sums over the group" />
          </span>
        )}
        {sums("", true)}
        {extraHeader}
      </div>
    </div>
  );

  /** T1: the kind word in the run's tone, the sums where the spine does not
   *  carry them, the date range in the time slot. */
  const head = (
    <div data-anatomy="L6" className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 pt-4 pb-3">
      {lead ? (
        <span className="inline-flex items-center text-sm" data-group-word="">
          {lead}
          {countMark}
        </span>
      ) : (
        <span
          className={`inline-flex items-center text-sm font-medium ${VERB_CLASSES[adverse ? tone : "neutral"]}`}
          data-group-word=""
        >
          {kindWord}
          {countMark}
        </span>
      )}
      {sums(hideVal, false)}
      {extraHeader}
      <span className="evt-meta ml-auto inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-foreground">{range}</span>
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
  // The frame draws its members as a list (`WindowedMembers`), so each line
  // that stands in their place carries a key.
  let body: ReactNode = children;
  if (onOpen) {
    if (error) {
      body = (
        <p key="error" className="px-5 text-[11px] leading-relaxed text-rb-500">
          <span className="text-foreground">These events could not be loaded.</span> {error} The figures above are
          unchanged.
        </p>
      );
    } else if (members) {
      body = members;
    } else {
      // Undefined members and no error means the read is still out. There is
      // no spinner: a spinner implies a fast answer is coming, and a first
      // open on a cold position pays for the whole grouping pass.
      body = readingLine ? (
        <div key="reading" className="relative" aria-busy="true">
          <SkeletonBlock height={MEMBERS_SKELETON_HEIGHT} />
          <p className="absolute inset-x-0 top-5 px-5 text-center text-xs text-rb-500" role="status">
            Reading {count.toLocaleString("en-US")} {count === 1 ? memberNoun : memberPlural}&hellip;
          </p>
        </div>
      ) : (
        <SkeletonBlock key="reading" height={MEMBERS_SKELETON_HEIGHT} />
      );
    }
  }

  // The phone caption and the phone control's name: the word, the count and
  // the range ("Redemptions [48] · 1 Oct '25 – 12 Oct '25", the count a chip).
  const spokenRange = sameDay ? formatDate(fromTs) : `${formatDate(fromTs)} to ${formatDate(toTs)}`;
  const spokenSums = legAggs
    .filter((agg) => !unreadOf(undefined, agg.symbol))
    .map((agg) => `${agg.verb.toLowerCase()} ${spokenAmount(agg.value)} ${agg.symbol}`);

  return (
    <GroupFrame
      open={open}
      show={showMenu.show}
      hide={hide}
      membersId={membersId}
      range={numberRange}
      closed={
        <EventCard
          avatar={null}
          groupMenu={showMenu}
          slots={{
            spine: legsColumn,
            head: { row: head },
            caption: "",
            cells: { none: "A run's figures are its members' sums, stated in the summary." },
            sheet: merged ? (sheetLead ? { ...merged.sheet, lead: sheetLead } : merged.sheet) : undefined,
            price: merged?.price,
            ledgers: { none: "A run's ledgers are its members'." },
            notes: hasSums ? summary : undefined,
            explainer,
            learnMore: null,
          }}
          phoneCaption={
            <>
              {kindWord}
              {countMark} &middot; <span className="text-foreground">{range}</span>
            </>
          }
          spokenCaption={`${kindWord}, ${spokenRange}`}
          label={`${countText}, ${spokenRange}${spokenSums.length ? `: ${spokenSums.join(", ")}` : ""}`}
          group="summary"
          muted={muted}
        />
      }
      members={body}
      membersLead={onOpen && !error && members ? staleLine : undefined}
    />
  );
}

/** A served folder's members read, started when its summary card opens. */
function AskMembers({ onOpen, askedRef }: { onOpen: () => void; askedRef: React.MutableRefObject<boolean> }) {
  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    onOpen();
  }, [onOpen, askedRef]);
  return null;
}

/** The group Explanation's words (rails-ops TO-DO-ui-jobs 372), the same on
 *  every family's. */
export const GROUP_EXPLANATION_WORDS = {
  holder: "The holder made",
  thirdParty: "A third party made",
  inAll: "and in all",
  and: "and",
  also: "They also",
  price: "The debt cleared at an effective",
  per: "per",
  wentFrom: "went from",
  to: "to",
  side: { collateral: "The collateral", debt: "The debt" } as Record<FlowSide, string>,
  moreSums: (n: number) => `The Figures tab has the other ${n.toLocaleString("en-US")} sums.`,
  /** A header verb that is a participle, in the past tense a sentence takes. */
  pastTense: { withdrawn: "withdrew", "written off": "wrote off", "debt cleared": "cleared" } as Record<string, string>,
};

const boldFig = (n: ReactNode) => <strong className="font-semibold text-foreground">{n}</strong>;

/** A sheet figure in an explanation bullet: bold, echoing the sheet's receipt. */
export function sheetFig(f: SheetFigure, symbol?: string): ReactNode {
  return f.info ? (
    <Prov echo info={f.info} value={f.value} symbol={symbol}>
      {boldFig(f.text)}
    </Prov>
  ) : (
    boldFig(f.text)
  );
}

/** "The debt went from X to Y BOLD." for each side of a group's merged sheet
 *  that states its before and after and is not in `covered` (side ids); a
 *  side the group left where it found it says nothing. */
export function sheetSideBullets(sheet: EventSheet | undefined, covered: Set<string>): ReactNode[] {
  const W = GROUP_EXPLANATION_WORDS;
  const same = (x: SheetFigure, y: SheetFigure) =>
    x.value != null && y.value != null
      ? Number(x.value) === Number(y.value)
      : typeof x.text === "string" && x.text === y.text;
  const out: ReactNode[] = [];
  for (const s of sheet?.sides ?? []) {
    const key = s.id ?? s.side;
    if (covered.has(key)) continue;
    covered.add(key);
    const name = s.name ? `The ${s.name.toLowerCase()}` : W.side[s.side];
    const b = s.before?.amount;
    const a = s.totalAmount;
    const symbol = b?.symbol ?? a?.symbol;
    if (b && a && symbol) {
      if (!same(b, a))
        out.push(
          <>
            {name} {W.wentFrom} {sheetFig(b, symbol)} {W.to} {sheetFig(a, symbol)} {symbol}.
          </>,
        );
    } else if (s.before?.usd && "text" in s.total && !same(s.before.usd, s.total))
      out.push(
        <>
          {name} {W.wentFrom} {sheetFig(s.before.usd)} {W.to} {sheetFig(s.total)}.
        </>,
      );
  }
  return out;
}

/** A group's Explanation in the shell's slot: the first bullet as the teaser
 *  (`data-group-sentence`), the rest under it, at most five. It explains the
 *  position and carries no interface hint (Miles, 19 Oct 2026). `extra` mounts
 *  in the body and draws nothing (the sheet's collector). */
export function groupExplainer(bullets: ReactNode[], extra?: ReactNode) {
  const [first, ...rest] = bullets.slice(0, MAX_BULLETS);
  return {
    first: <span data-group-sentence="">{first}</span>,
    body: (
      <>
        {extra}
        <ProseExplainer items={rest} />
      </>
    ),
  };
}

/** The explanation's bullets at most (rails-ops standards/prose-limits-and-zones.md, Z2). */
export const MAX_BULLETS = 5;
/** The bullets the sums take at most, two to a bullet; the rest are counted. */
const MAX_LEG_BULLETS = 2;

function pastTense(verb: string): string {
  const v = verb.toLowerCase();
  return GROUP_EXPLANATION_WORDS.pastTense[v] ?? v;
}

function capitalFirst(s: string): string {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** The receipt of an adverse group's effective price: the debt it cleared
 *  over the collateral it took, both summed over the members. */
function priceProv(
  debt: RunAggregate,
  coll: RunAggregate,
  count: number,
  plural: string,
  fullNum: (n: number) => string,
): Provenance {
  const d = debt.provWhat.toLowerCase();
  const c = coll.provWhat.toLowerCase();
  return {
    kind: "chain-derived",
    summary: `Effective price across this group — the ${d} divided by the ${c}, each summed over the ${count} ${plural}.`,
    formula: `Σ ${d} ÷ Σ ${c}`,
    inputs: [
      { label: d, value: `${fullNum(debt.value)} ${debt.symbol}`, kind: "chain" },
      { label: c, value: `${fullNum(coll.value)} ${coll.symbol}`, kind: "chain" },
    ],
  };
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
export function spanWords(a: number, b: number): string {
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

/** A verb that names the debt side of a leg: drawn above the collateral, as
 *  set A's warning nodes are. */
const DEBT_VERB = /^(cleared|repaid|repay|debt)/i;
/** A verb that moves the token to the wallet; every other one into the
 *  position. */
const OUT_VERB = /^(withdr|borrow|received|paid out|claimed|redeemed|sent)/i;

/** A verb on the debt side of an owner's leg. */
const DEBT_SIDE_VERB = /^(borrow|repa|cleared|debt)/i;

/** Net each token's legs: into the position plus, to the wallet minus. The
 *  collateral comes first, so the spine draws it below the debt. */
function netLegs(aggs: RunAggregate[]): SpineTokenRow[] {
  const net = new Map<string, { value: number; iconSymbol?: string; debt: boolean }>();
  for (const agg of aggs) {
    const cur = net.get(agg.symbol) ?? { value: 0, iconSymbol: agg.iconSymbol, debt: false };
    cur.value += OUT_VERB.test(agg.verb) ? -agg.value : agg.value;
    cur.debt ||= DEBT_SIDE_VERB.test(agg.verb);
    net.set(agg.symbol, cur);
  }
  return [...net.entries()]
    .filter(([, v]) => v.value !== 0)
    .sort(([, a], [, b]) => Number(a.debt) - Number(b.debt))
    .map(([symbol, v]) => ({
      symbol,
      iconSymbol: v.iconSymbol,
      direction: v.value > 0 ? ("right" as const) : ("left" as const),
      value: Math.abs(v.value),
    }));
}
