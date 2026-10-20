"use client";

// One market note, drawn in the timeline between the two events it brackets.
// ----------------------------------------------------------------------------
// NOT AN EVENT, and the spine says so before a word is read: the quietest node
// on it (a hollow diamond, no party colour), and a header that names no
// action. An event card states something the ACCOUNT did; this states
// something that happened to the market while the account did nothing, and
// the two must never be mistaken for each other at a glance.
//
// It is also never counted. The row is attached at render time by the id of
// the event it sits beside (see lib/shared/market-note.ts and the `notes` prop
// on ChainTruthTimeline) and lives outside `tl`, `displayedEvents` and the row
// list, so no total, no filter count and no export table can move because a
// note rendered.
//
// A RATE NOTE IS A T1 ROW (Miles, 20 Oct 2026, ui-jobs 399): a note that
// states a rate from → to (every rate step; a vault's terms where the family
// hands a `rate`) names its kind in words ("Savings rate increased"), the
// rate after in the pink pill on the spine's flank, the date at the right and
// no ⋮ (a note has no event page or share link for one to hold). A run of
// them in one gap is one group row (`NoteRunRow`). What follows describes
// the row every other note keeps.
//
// THE MARK IS THE HEADER (Miles, 2026-09-04: "the numbers speak for
// themselves"). At rest the row reads on one vertical centre line — a pair
// of marks (the asset, and what it was measured in, overlapping), a
// lucide direction glyph (up-right / down-right) where the kind observed a
// move, and the one headline figure. A rate step states the LATER RATE,
// because "what does this position pay now" is what a reader asks of a rate
// (Miles, 2026-09-10); a vault's terms state the new figure. No words: what
// moved is named in the panel's stat label and the (i). The row has
// its own ground (`bg-note`, #1d212b dark / #f0f0f0 light) rather than the
// cards' `bg-raised`, so a note reads as a different KIND of row from an
// event before the diamond does — not a card waiting for a hover it never
// gets. Clicking the header opens the same kind of panel an
// event card opens: a stat grid with the figures each carrying their receipt,
// the (i) holding the prose a receipt cannot (which two logs were read, whose
// they were, how to confirm each without trusting Rails), and the "?" behind
// which the evergreen explanation of this KIND of note lives
// (lib/shared/learn-more-content.ts). Layer 0, 1, 2 — the card grammar.
//
// The geometry, the disclosure control and the row's own <ProvReceiptsScope>
// are <NoteRowShell>'s (components/shared/note-row-shell.tsx) — shared with the
// live-window row, which is a different class of fact in the same frame. The
// diamond lands on the same vertical line as the cards' own nodes, which is the
// whole point of giving the note a node at all: the reader has to see which two
// events it sits between. Every figure carries its own receipt.
//
// ONE SWITCH ON `kind`, and it is at the top of MarketNoteRow. What differs
// between a rate step and a vault's terms is the label,
// the headline figure, the stat cards, the derivation prose, the "?" content
// and how a value on the mark is written — nothing else. Each kind hands back
// exactly those and the shell draws them: same geometry, same diamond on the
// spine, same mark, same panel. A third kind is a third arm of that switch
// plus its own provenance module, never a branch in the layout.

import { useState, type ReactNode } from "react";
import { formatDate } from "@/lib/date";
import { usePathname } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { InfoDisclosure } from "@/components/shared/info-disclosure";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { useTimelineScale } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { SpineColumn } from "@/components/shared/spine-column";
import { H } from "@/lib/shared/explainer-prose";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  StatCard,
  StatSubline,
  StateTransition,
  TransitionArrow as CardArrow,
} from "@/components/shared/state-transition";
import { EventDateContext, EventTime } from "@/components/shared/event-time";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";
import { protocolIconSrc } from "@/lib/shared/protocols";
import { marketNoteRateStepContent, marketNoteVaultTermsContent } from "@/lib/shared/learn-more-content";
import { polarisModal } from "@/lib/polaris/event-templates";
import { aaveFamilyRateStepInterestProv, aaveFamilyRateStepProv } from "@/lib/aave-v3/market-note-provenance";
import { makerModal } from "@/lib/makerdao/event-templates";
import { makerRateStepInterestProv, makerRateStepProv } from "@/lib/makerdao/market-note-provenance";
import { rateStepInterestProv, rateStepProv } from "@/lib/polaris/market-note-provenance";
import {
  aaveFamilyEndLabel,
  aaveFamilyRateNoun,
  makerRateEndLabel,
  noteElapsedSeconds,
  polarisEndLabel,
  rateStepFigures,
  formatRatePercent,
  noteRateMove,
  noteRateSpan,
  isNoteRun,
  noteRunReading,
  noteT1Words,
  RATE_NOTE_T1,
  type LiveNoteGroup,
  type MarketNote,
  type MarketNotePoint,
  type NoteRun,
  type RateNoteWords,
  type RateStepNote,
  type VaultTermsNote,
} from "@/lib/shared/market-note";
import { CountChip } from "@/components/shared/count-chip";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";

/** A receipted figure in a stat card: the text, its receipt, and the mark of
 *  the asset it counts (none for a block, a ratio, a percentage). */
interface NoteFigure {
  text: string;
  prov: Provenance;
  /** The exact value the receipt records — defaults to `text`. */
  exact?: string;
  symbol?: string;
  /** Greyed, the way a regular card states a figure the event left as it
   *  was: the move did not change it. */
  muted?: boolean;
}

/** One cell of the open panel: a single figure, or a before → after pair. */
interface NoteStat {
  label: string;
  figure?: NoteFigure;
  transition?: { before: NoteFigure; after: NoteFigure };
  /** A small receipted line under the value — "23,739 USDp / year" — for the figure that qualifies the card's own
   *  rather than deserving a card of its own. Muted, as a reference or a
   *  qualifier of a held figure is, unless `changed`: the one sub-line the
   *  move itself sets (a rate step's "moved"). */
  sub?: { text?: string; figure: NoteFigure; suffix?: string; changed?: boolean };
}

/** The mark the asset was measured in, drawn overlapping the asset's own:
 *  the protocol whose rate or terms the note states. */
type MeasureMark = { kind: "protocol"; id: string };

/** What one kind of note hands the shell. Nothing else varies. */
interface NoteBody {
  /** "USDp primary rate", "ETH-A stability fee" — the header's accessible
   *  name; the panel's stat label carries it in view. */
  label: string;
  measure: MeasureMark;
  /** The one figure the header states beside the mark. On a rate step it is
   *  the LATER RATE — what the position pays now, which is the question that
   *  note answers (Miles, 2026-09-10). */
  headline: NoteFigure;
  /** The quiet word naming what the headline counts — "primary rate",
   *  "stability fee" — sitting just after the headline figure.
   *  THE MARK IS THE HEADER: this is the one word of prose the
   *  header carries, so a reader never has to open the panel just to learn
   *  what moved. */
  quantity: string;
  stats: NoteStat[];
  /** The line above the cells: what the stretch is, and how long it ran. */
  intro?: { lead: string; elapsed?: NoteFigure; tail?: "ago" | "apart" };
  /** The two blocks the stretch runs between, stated in the (i) beneath. */
  blocks?: { before: NoteFigure; after: NoteFigure };
  /** The (i) beneath the cells: a paragraph. */
  derivation: ReactNode;
  /** False on a kind that observed ONE value rather than a move: the header
   *  then draws no direction glyph. A configuration event states its new
   *  terms and, often, no earlier ones — an arrow over it would be a
   *  direction nothing read. Default true, which is every kind built out of
   *  two observations. */
  direction?: boolean;
  learnMore: LearnMoreContent;
}

/** The two links one observation can be read at, built once from the page's
 *  own path so neither kind reimplements them. */
interface NoteLinks {
  /** The observation's own page on Rails, or null where there is none. */
  rails: (p: MarketNotePoint) => string | null;
  /** The transaction's logs on the chain's own explorer. */
  explorer: (p: MarketNotePoint) => string;
}

/** A 0x address as a path segment — the position pages this row renders on key
 *  the wallet in the last segment of the path (`/base/moonwell/0x…`), which is
 *  what lets the receipt link an observation made by ANOTHER wallet to that
 *  wallet's own page here. Anything else and the link is simply omitted. */
const ADDRESS_SEGMENT = /^0x[0-9a-fA-F]{40}$/;

export function MarketNoteRow({
  note,
  isLast = false,
  datePrefix = null,
}: {
  note: MarketNote;
  /** The day stamp the timeline gives this row on its day-stamp rule
   *  (`noteDatePrefixAfter` in ChainTruthTimeline). A live note reads "Now". */
  datePrefix?: string | null;
  /** Spine terminus flags — default false, the historical (anchored) shape:
   *  a note always sits between two rows, so it is never truly first or
   *  last. A LIVE note in the timeline's head slot is the new visual first
   *  row — unless the live WINDOW row stands above it there — see
   *  ChainTruthTimeline's `liveSlotAtTop` and `liveWindowAtTop`, which between
   *  them suppress every other claim on the flag so only one row on the page
   *  ever takes the spine's lead-in dot. */
  isLast?: boolean;
}) {
  const body = useNoteBody(note);
  const span = noteRateSpan(note);
  const words = noteT1Words(note);
  // A rate note takes the event row's shape, a T1 (ui-jobs 399): the kind in
  // words, the rate after in the pink pill on the spine's flank.
  if (span && words) {
    const move = noteRateMove(note);
    const head = words[move];
    return (
      <NoteRowShell
        icon="market"
        isLast={isLast}
        label={`${RATE_NOTE_T1.name}, ${head}, ${pct(span[1])}`}
        marker={{ attr: "data-market-note", value: note.id }}
        // The arrow from the move itself: a rate that rose from 0.00% rose.
        spine={noteSpine(note)}
        header={<T1Words>{head}</T1Words>}
        meta={<NoteTime note={note} datePrefix={datePrefix} />}
      >
        <NoteBodyPanel body={body} />
      </NoteRowShell>
    );
  }
  return (
    <NoteRowShell
      icon="market"
      isLast={isLast}
      label={body.label}
      marker={{ attr: "data-market-note", value: note.id }}
      header={
        <>
          <NoteHeadline note={note} body={body} />
          <NoteTime note={note} datePrefix={datePrefix} />
        </>
      }
    >
      <NoteBodyPanel body={body} />
    </NoteRowShell>
  );
}

const pct = (r: number) => `${r.toFixed(2)}%`;

/** The head's words, as an event row's T1 states its kind. */
function T1Words({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full shrink-0 items-center text-sm text-rb-500 max-sm:text-xs" data-head-kind="">
      {children}
    </span>
  );
}

/** Who set a rate note's rate, for the pill's glyph (ui-jobs 403): governance
 *  (Sky's Savings Rate, a vault's terms, MakerDAO's stability fee) takes the
 *  gavel; a rate the protocol's formula sets (Polaris's primary rate, an Aave
 *  family reserve's rate) takes none. */
function rateSetter(note: MarketNote): "governance" | "formula" {
  return note.kind === "vault-terms" || note.protocol === "makerdao" ? "governance" : "formula";
}

/** The spine's flank on a rate note: the rate after in the pink pill (a third
 *  party set it), the arrow the way it moved. */
function rateFlank(
  span: [number, number],
  info: Provenance,
  tone: "governance" | "formula",
  moves?: "up" | "down" | "both",
): NoteSpine {
  return {
    rateSpan: span,
    rateMoves: moves,
    rateTone: tone,
    rateProv: { info, value: pct(span[1]) },
  };
}

type NoteSpine = NonNullable<Parameters<typeof NoteRowShell>[0]["spine"]>;

/** The spine's flank on a rate note or a run: the rate after the last change
 *  in the pink pill, the arrow the note or every member moved it (the
 *  double-headed arrow where a run's members went both ways). Undefined on a
 *  note that states no rate, which is the note that keeps the boxed row. */
export function noteSpine(item: MarketNote | NoteRun): NoteSpine | undefined {
  if (isNoteRun(item)) {
    const r = noteRunReading(item);
    const moves = r.move === "increased" ? "up" : r.move === "decreased" ? "down" : "both";
    const last = r.members[r.members.length - 1];
    return rateFlank([r.from, r.to], rateProvOf(last, "to"), rateSetter(last), moves);
  }
  const span = noteRateSpan(item);
  if (!span || !noteT1Words(item)) return undefined;
  const move = noteRateMove(item);
  // The arrow from the move itself: a rate that rose from 0.00% rose.
  return rateFlank(
    span,
    rateProvOf(item, "to"),
    rateSetter(item),
    move === "increased" ? "up" : move === "decreased" ? "down" : undefined,
  );
}

/** The receipt behind a rate note's earlier or later rate. */
function rateProvOf(note: MarketNote, end: "from" | "to"): Provenance {
  if (note.kind === "vault-terms") return end === "from" && note.rate ? note.rate.fromProv : note.prov;
  if (note.protocol === "makerdao") return makerRateStepProv(note, "rate");
  if (note.protocol === "aave-v3" || note.protocol === "spark") return aaveFamilyRateStepProv(note, "rate");
  return rateStepProv(note, "rate");
}

/** A note's day stamp inside a group, on the timeline's rule. */
const dayStamp = (ts: number): string | null => (ts > 0 ? `${shortDate(ts)} ${shortDateYear(ts)}` : null);

/** A run of rate notes of one kind, no event between them, as one group row
 *  (ui-jobs 399; `noteRuns` in lib/shared/market-note.ts): the kind in words
 *  with the count, the last rate on the spine's flank with the group's arrow,
 *  the first and last dates. Opened: the run's first → last rate and its
 *  range, then one line per change, each opening to its own panel. */
export function NoteRunRow({ run, isLast = false }: { run: NoteRun; isLast?: boolean }) {
  const r = noteRunReading(run);
  const first = r.members[0];
  const last = r.members[r.members.length - 1];
  const words = noteT1Words(first) as RateNoteWords;
  const head = words[r.move];
  const range = noteRunDates(r.members);
  const lowNote = r.members.find((n) => noteRateSpan(n)!.some((v) => v === r.low)) ?? first;
  const highNote = r.members.find((n) => noteRateSpan(n)!.some((v) => v === r.high)) ?? first;
  const endOf = (n: MarketNote, v: number): "from" | "to" => (noteRateSpan(n)![1] === v ? "to" : "from");
  const fig = (n: MarketNote, v: number, end: "from" | "to", echo = false) => (
    <Prov echo={echo} info={rateProvOf(n, end)} value={pct(v)}>
      <span className="tabular-nums text-foreground">{pct(v)}</span>
    </Prov>
  );
  return (
    <NoteRowShell
      icon="market"
      isLast={isLast}
      label={`${RATE_NOTE_T1.name}, ${head}, ${changesWord(run.notes.length)}, ${pct(r.to)}, ${range}`}
      marker={{ attr: "data-market-note-run", value: run.id }}
      spine={noteSpine(run)}
      header={
        <T1Words>
          {head}
          <CountChip count={run.notes.length} />
        </T1Words>
      }
      meta={
        <span className="evt-meta ml-auto inline-flex min-h-6 items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-foreground">{range}</span>
        </span>
      }
    >
      <p className="px-5 pt-3 pb-1 text-sm text-rb-500" data-note-run-rate="">
        {fig(first, r.from, "from")} <span aria-hidden="true">→</span>
        <span className="sr-only">{RATE_NOTE_T1.to}</span> {fig(last, r.to, "to", true)}
        {r.showRange && (
          <>
            {`, ${RATE_NOTE_T1.between} `}
            {fig(lowNote, r.low, endOf(lowNote, r.low))}
            {` ${RATE_NOTE_T1.and} `}
            {fig(highNote, r.high, endOf(highNote, r.high))}
          </>
        )}
      </p>
      <div className="pb-1.5">
        {run.notes.map((note) => (
          <NoteLine key={note.id} note={note} headline={<RunLineHead note={note} words={words} />} />
        ))}
      </div>
    </NoteRowShell>
  );
}

/** One change inside a run: its words, the rate it set from → to, its date. */
function RunLineHead({ note, words }: { note: MarketNote; words: RateNoteWords }) {
  const span = noteRateSpan(note) as [number, number];
  return (
    <>
      <span className="min-w-0 truncate text-sm text-rb-500 max-sm:text-xs">{words[noteRateMove(note)]}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm max-sm:text-xs">
        <Prov info={rateProvOf(note, "from")} value={pct(span[0])}>
          <span className="tabular-nums text-rb-500">{pct(span[0])}</span>
        </Prov>
        <span aria-hidden="true" className="text-rb-500">
          →
        </span>
        <Prov info={rateProvOf(note, "to")} value={pct(span[1])}>
          <span className="tabular-nums font-semibold text-foreground">{pct(span[1])}</span>
        </Prov>
      </span>
      {/* Under 640px the day alone, so the line keeps its date beside its
          words (ui-jobs 403); the change's panel states the time. */}
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs">
        <span className="max-sm:hidden">
          <EventDateContext.Provider value={dayStamp(note.to.timestamp)}>
            <EventTime ts={note.to.timestamp} />
          </EventDateContext.Provider>
        </span>
        <span className="sm:hidden">{dayStamp(note.to.timestamp)}</span>
      </span>
    </>
  );
}

/** A run's dates: "29 Jul '25 – 5 Jul '26", or the one day. */
function noteRunDates(members: MarketNote[]): string {
  const a = dayStamp(members[0].to.timestamp) ?? "";
  const b = dayStamp(members[members.length - 1].to.timestamp) ?? "";
  return a === b ? a : `${a} – ${b}`;
}

const changesWord = (n: number) => `${n.toLocaleString("en-US")} ${RATE_NOTE_T1.changes}`;

/** What one note hands the row: its label, headline, cells and (i). The one
 *  switch on `kind` is here, shared by the lone row and a live group's line. */
function useNoteBody(note: MarketNote): NoteBody {
  const chainId = useChainId();
  const pathname = usePathname() ?? "";
  // The position's own path, on the position page and on a pinned event page
  // alike — the same strip ChainTruthTimeline does for its share hrefs.
  const positionPath = pathname.replace(/\/event\/[^/]+$/, "");

  /** Where one observation can be read in full: its own Rails event page when
   *  it is this position's event, that wallet's page when the path names a
   *  wallet, and the chain's explorer either way. */
  const links: NoteLinks = {
    rails: (p) => {
      const id = p.eventId ?? `${p.txHash}-${p.logIndex}`;
      if (p.eventId) return `${positionPath}/event/${encodeURIComponent(id)}`;
      // An observation with no wallet of its own has no wallet page to link
      // to: the Aave-family notes read the reserve's OWN ReserveDataUpdated,
      // which the Pool emits inside somebody's transaction without naming a
      // party the note could stand behind, so its `wallet` is empty. Without
      // this the link would resolve to an empty path segment.
      if (!ADDRESS_SEGMENT.test(p.wallet)) return null;
      const cut = positionPath.lastIndexOf("/");
      const owner = positionPath.slice(cut + 1);
      if (cut < 0 || !ADDRESS_SEGMENT.test(owner)) return null;
      if (owner.toLowerCase() === p.wallet) return null;
      return `${positionPath.slice(0, cut)}/${p.wallet}/event/${encodeURIComponent(id)}`;
    },
    explorer: (p) => explorerUrl(chainId, "tx-logs", p.txHash),
  };

  // The one switch. Everything below it is the same row whatever was observed.
  return note.kind === "rate-step" ? rateStepBody(note, links) : vaultTermsBody(note, links);
}

/** The header's figures: the marks, the direction, the headline and its
 *  quantity word. */
function NoteHeadline({ note, body }: { note: MarketNote; body: NoteBody }) {
  return (
    <>
      <MarkPair asset={note.marketSymbol} measure={body.measure} />
      {/* `>=`, not `>`: a live note is never gated on any move
          happening at all (see market-note.ts's `live` doc) — a
          truly flat read must not read as a fall. A historical
          note's selector always guards against an exact tie, so
          this only ever matters for a live one. */}
      {body.direction !== false && <DirectionGlyph rising={note.to.value >= note.from.value} />}
      <Figure figure={body.headline} className="text-sm font-semibold" />
      <span className="text-xs text-rb-500">{body.quantity}</span>
    </>
  );
}

/** The opened note: the lead line, the cells and the (i). */
function NoteBodyPanel({ body }: { body: NoteBody }) {
  return (
    <>
      {body.intro && (
        <p className="px-5 pt-3 text-xs text-rb-500">
          {body.intro.lead}
          {body.intro.elapsed && (
            <>
              {", "}
              <Figure figure={{ ...body.intro.elapsed, muted: true }} className="text-xs" />
              {body.intro.tail === "apart" ? " apart" : " ago"}
            </>
          )}
        </p>
      )}
      {body.stats.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 px-5 py-2 sm:auto-rows-fr sm:grid-cols-2">
          {body.stats.map((s) => (
            <div key={s.label} className="h-full">
              <StatCard label={s.label}>
                <StateTransition>
                  {s.transition ? (
                    <>
                      <Figure figure={s.transition.before} className="text-sm font-semibold" />
                      <TransitionArrow />
                      <Figure figure={s.transition.after} className="text-sm font-semibold" />
                    </>
                  ) : (
                    s.figure && <Figure figure={s.figure} className="text-sm font-semibold" />
                  )}
                </StateTransition>
                {s.sub && (
                  <StatSubline changed={!!s.sub.changed} className="mt-1 flex items-center gap-1">
                    {s.sub.text && <span>{s.sub.text}</span>}
                    <Figure figure={{ ...s.sub.figure, muted: !s.sub.changed }} className="text-xs font-medium" />
                    {s.sub.suffix && <span>{s.sub.suffix}</span>}
                  </StatSubline>
                )}
              </StatCard>
            </div>
          ))}
        </div>
      )}
      <div className="px-4 pb-3 pt-1">
        <InfoDisclosure
          label="how this note was derived"
          rowExtra={
            <span className="ml-auto">
              <LearnMore inline content={body.learnMore} />
            </span>
          }
        >
          <p className="text-xs leading-relaxed text-rb-500">
            {body.derivation}
            {body.blocks && (
              <>
                {" "}
                The stretch runs from block{" "}
                <Figure figure={{ ...body.blocks.before, muted: true }} className="text-xs" /> to block{" "}
                <Figure figure={{ ...body.blocks.after, muted: true }} className="text-xs" />.
              </>
            )}
          </p>
        </InfoDisclosure>
      </div>
    </>
  );
}

/** The live group card's header. */
const LIVE_GROUP_TITLE = "Market since the last event";

/** The head slot's live notes as ONE card (`liveNoteGroup` in
 *  lib/shared/market-note.ts): one spine node, a header naming the card with
 *  "Now", and one line per note in the group's order. A line states what the
 *  note's lone row states at rest, and opens to that row's panel beneath it,
 *  so each note's cells and (i) stay one click away. A single live note keeps
 *  its lone row. */
export function LiveNoteGroupRow({
  group,
  isLast = false,
}: {
  group: LiveNoteGroup;
  /** Spine terminus flags, as on a lone note row in the head slot. */
  isLast?: boolean;
}) {
  const scale = useTimelineScale();
  return (
    <div data-live-note-group={group.notes.length} className={`spine-row relative ${scale.cardRounded}`}>
      <div className="spine-cell">
        <SpineColumn icon="market" isLast={isLast} />
      </div>
      <div className="spine-content rounded-xl bg-note pb-1.5" role="group" aria-label={LIVE_GROUP_TITLE}>
        <div className="flex items-center gap-2 px-5 pb-1 pt-4">
          <span className="text-xs font-medium text-rb-500">{LIVE_GROUP_TITLE}</span>
          <span className="ml-auto text-xs text-rb-500">Now</span>
        </div>
        {group.notes.map((note) => (
          <NoteLine key={note.id} note={note} />
        ))}
      </div>
    </div>
  );
}

/** One line of a group (the live group's, a run's): the note's headline, a
 *  chevron, and the note's panel beneath while open. Its own receipt scope,
 *  as a lone row has. */
function NoteLine({ note, headline }: { note: MarketNote; headline?: ReactNode }) {
  const body = useNoteBody(note);
  const registry = useReceiptRegistry();
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  return (
    <ProvReceiptsScope registry={registry}>
      <div data-market-note={note.id} data-market-note-open={open ? "" : undefined}>
        <div
          className="group/evt cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={body.label}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
        >
          <div className={`flex items-center gap-2 pr-5${headline ? " max-sm:gap-1 max-sm:pr-3" : ""}`}>
            <div
              className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 py-1.5 pl-5${headline ? " max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:pl-4" : ""}`}
            >
              {headline ?? <NoteHeadline note={note} body={body} />}
            </div>
            <ExpandChevron isOpen={open} group="evt" className="shrink-0" />
          </div>
        </div>
        {open && (
          <div className="mx-2 mb-1.5 rounded-lg border border-rb-200 dark:border-rb-700">
            <NoteBodyPanel body={body} />
          </div>
        )}
      </div>
    </ProvReceiptsScope>
  );
}

/** The asset's mark with the measure's overlapping it — USDp under Polaris,
 *  wstETH under MakerDAO. The same chip geometry as InlineAssetCluster, so the
 *  pair reads as one object. Decoration: the header's accessible name says
 *  what the pair says. */
function MarkPair({ asset, measure }: { asset: string; measure: MeasureMark }) {
  const chip = "relative inline-flex items-center justify-center overflow-hidden rounded-full bg-note p-0.5";
  return (
    <span className="inline-flex shrink-0 items-center" data-note-marks="" data-prov-hidden="" aria-hidden="true">
      <span className={chip} style={{ zIndex: 2 }}>
        <TokenChipIcon symbol={asset} size={24} filterable={false} />
      </span>
      <span className={chip} style={{ marginLeft: -8, zIndex: 1 }}>
        <img src={protocolIconSrc(measure.id)} alt="" width={24} height={24} className="rounded-full" />
      </span>
    </span>
  );
}

/** The direction glyph beside the headline figure: the headline states the
 *  later rate, so the glyph carries which way it moved. An sr-only word
 *  precedes it, so a screen reader still gets the direction. */
function DirectionGlyph({ rising }: { rising: boolean }) {
  const Icon = rising ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className="sr-only">{rising ? "up" : "down"}</span>
      <Icon size={20} strokeWidth={2} className="text-rb-500 shrink-0" aria-hidden="true" />
    </>
  );
}

/** The elapsed time as a figure: the receipt records the exact seconds. */
function elapsedFigure(note: MarketNote, text: string, prov: Provenance): NoteFigure {
  return { text, prov, exact: `${noteElapsedSeconds(note) ?? ""} s` };
}

/** The row's time, where a card states its own: the date of the stretch's
 *  later end, on the timeline's day-stamp rule, or "Now" on a live note, whose
 *  later end is a read at the chain head. */
function NoteTime({ note, datePrefix }: { note: MarketNote; datePrefix: string | null }) {
  if (note.live) {
    return (
      <span className="evt-meta ml-auto inline-flex items-center gap-2">
        <span className="text-xs text-rb-500">Now</span>
      </span>
    );
  }
  if (!(note.to.timestamp > 0)) return null;
  return (
    <span className="evt-meta ml-auto inline-flex items-center gap-2">
      <span className="text-xs">
        <EventDateContext.Provider value={datePrefix}>
          <EventTime ts={note.to.timestamp} />
        </EventDateContext.Provider>
      </span>
    </span>
  );
}

/** The regular card's arrow, with the "→" kept in the text so a copied or
 *  exported reading of the note still says which way the pair runs. */
function TransitionArrow() {
  return (
    <>
      <CardArrow />
      <span className="sr-only">→</span>
    </>
  );
}

/** A receipted figure with, where it counts an asset, that asset's mark. */
function Figure({ figure, className }: { figure: NoteFigure; className: string }) {
  return (
    <Prov
      info={figure.prov}
      value={figure.exact ?? figure.text}
      symbol={figure.symbol}
      icon={figure.symbol ? <TokenChipIcon symbol={figure.symbol} size={16} filterable={false} /> : undefined}
    >
      <span className={`tabular-nums ${figure.muted ? "text-rb-500" : "text-foreground"} ${className}`}>
        {figure.text}
      </span>
    </Prov>
  );
}

/** One end of an observation, in the disclosure prose: whose log it was and the
 *  two places it can be read. */
function observationLinks(p: MarketNotePoint, links: NoteLinks) {
  const href = links.rails(p);
  return (
    <>
      {" ("}
      {href && (
        <>
          <a href={href} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
            on Rails
          </a>
          {", "}
        </>
      )}
      <a href={links.explorer(p)} target="_blank" rel="noopener noreferrer" className="link-external">
        log {p.logIndex} on the chain&rsquo;s explorer
      </a>
      {")"}
    </>
  );
}

// ── An ERC-4626 vault's own terms, changed for every holder at once ─────────
// The one kind whose words and receipt arrive WITH the note rather than being
// composed here — see `VaultTermsNote`. What a vault's configuration event
// means is the family's mechanic, and the family already states it beside that
// mechanic; this arm is the geometry and nothing else, which is why it is the
// shortest of the four.
//
// It states no direction and draws no step mark. A `TargetRateUpdated` carries
// one rate and no earlier one, and an arrow over a single reading would be a
// move nobody observed.

function vaultTermsBody(note: VaultTermsNote, links: NoteLinks): NoteBody {
  const figure: NoteFigure = { text: note.headline, prov: note.prov };
  return {
    label: `${note.marketSymbol} — ${note.quantity}`,
    measure: { kind: "protocol", id: note.measureProtocolId },
    headline: figure,
    quantity: note.quantity,
    direction: false,
    stats: [
      { label: note.quantity, figure },
      {
        label: "Block",
        figure: {
          text: note.to.block.toLocaleString("en-US"),
          prov: note.prov,
          exact: String(note.to.block),
        },
      },
    ],
    learnMore: marketNoteVaultTermsContent(),
    derivation: (
      <>
        {note.statement}, read from the vault&rsquo;s own <code>{note.termsKind}</code> configuration log at block{" "}
        {note.to.block.toLocaleString("en-US")} (
        <a href={links.explorer(note.to)} target="_blank" rel="noopener noreferrer" className="link-external">
          on the chain&rsquo;s explorer
        </a>
        ). It is not this address&rsquo;s event: it moved every holder&rsquo;s terms at once, which is why it sits among
        the rows without being one of them and is counted in nothing on this page. The values are the log&rsquo;s own
        words, raw. What the vault&rsquo;s terms are NOW is the reading in the sections above, at the page&rsquo;s own
        block.
      </>
    ),
  };
}

// ── Polaris: the market's own primary rate stepped between two of a CDP's
//    OWN touches ────────────────────────────────────────────────────────────
// Both ends here are this position's events: the rate is already on the
// row (context.data.primaryRate), read at the market's last PrimaryRateSet at
// or before each touch.

function rateStepBody(note: RateStepNote, links: NoteLinks): NoteBody {
  if (note.protocol === "makerdao") return makerRateStepBody(note, links);
  // The Aave family is a different POSITION shape, not a different kind: one
  // account holds several reserves at once and each reserve carries two rates,
  // so a note is per (reserve, side) and the header word has to say which side.
  if (note.protocol === "aave-v3" || note.protocol === "spark") return aaveFamilyRateStepBody(note, links);
  const f = rateStepFigures(note);

  /** One end of the step: the CDP's own touch, and — when the backend's
   *  per-row join has it — the market's PrimaryRateSet the rate was read
   *  from. The PSM user who fired that log is a wallet unrelated to this
   *  CDP, so its Rails link resolves to nothing (no eventId, no owner match)
   *  and only the explorer link is offered — the row never implies that
   *  wallet did anything here. */
  const observation = (which: "from" | "to") => {
    const p = which === "from" ? note.from : note.to;
    if (which === "to" && note.live) {
      return (
        <>
          now: the cdpManager&rsquo;s own primary rate, read live at block {p.block.toLocaleString("en-US")} — not a
          touch of this CDP&rsquo;s
        </>
      );
    }
    const o = which === "from" ? note.observed.from : note.observed.to;
    if (!o) {
      return (
        <>
          {polarisEndLabel(p)}: this CDP&rsquo;s own touch at block {p.block.toLocaleString("en-US")}
          {observationLinks(p, links)}
        </>
      );
    }
    const setPoint: MarketNotePoint = {
      block: o.block,
      timestamp: o.timestamp,
      value: p.value,
      txHash: o.txHash,
      logIndex: o.logIndex,
      wallet: o.txFrom,
      kind: "PrimaryRateSet",
    };
    return (
      <>
        {polarisEndLabel(p)}: the market&rsquo;s PrimaryRateSet at block {o.block.toLocaleString("en-US")}, fired by a
        PSM user unrelated to this CDP{observationLinks(setPoint, links)}
      </>
    );
  };

  const stats: NoteStat[] = [
    {
      label: "Primary rate (% per year)",
      transition: {
        before: { text: f.fromRate, prov: rateStepProv(note, "rate"), exact: String(note.from.value) },
        after: { text: f.toRate, prov: rateStepProv(note, "rate"), exact: String(note.to.value) },
      },
      // The move itself, under the pair it is the difference of: the header
      // states the later rate now, so this card is where the size of the
      // step is stated — with its own receipt, as it always had.
      sub: {
        text: "moved",
        changed: true,
        figure: { text: f.delta, prov: rateStepProv(note, "delta"), exact: String(note.deltaPp) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: rateStepProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: rateStepProv(note, "blocks"), exact: String(note.to.block) },
      },
      ...(f.elapsed
        ? { sub: { text: "elapsed", figure: elapsedFigure(note, f.elapsed, rateStepProv(note, "elapsed")) } }
        : {}),
    },
  ];
  if (f.steps && note.steps != null) {
    stats.push({
      label: "Stated over",
      figure: {
        text: `${f.steps} of the CDP's touches`,
        prov: rateStepProv(note, "steps"),
        exact: String(note.steps),
      },
    });
  }
  if (f.sets && note.setsBetween != null) {
    stats.push({
      label: "Rate re-sets in between, one per PSM mint or redemption",
      figure: { text: f.sets, prov: rateStepProv(note, "sets"), exact: String(note.setsBetween) },
    });
  }
  if (note.interest && f.debt && f.before && f.after) {
    const interest = note.interest;
    stats.push({
      label: `Yearly interest on the debt at block ${f.fromBlock}`,
      transition: {
        before: {
          text: f.before,
          prov: rateStepInterestProv(note, "before"),
          exact: String(interest.before),
          symbol: note.marketSymbol,
        },
        after: {
          text: f.after,
          prov: rateStepInterestProv(note, "after"),
          exact: String(interest.after),
          symbol: note.marketSymbol,
        },
      },
      sub: {
        text: "on",
        figure: {
          text: f.debt,
          prov: rateStepInterestProv(note, "debt"),
          exact: String(interest.debt),
          symbol: note.marketSymbol,
        },
      },
    });
  }

  return {
    label: `${note.marketSymbol} primary rate`,
    measure: { kind: "protocol", id: "polaris" },
    headline: { text: f.toRate, prov: rateStepProv(note, "rate"), exact: String(note.to.value) },
    // The headline is the later rate, so the earlier one and the direction
    // ride beside it in words, and no glyph: "↓ 0.00%" read as a move of
    // nothing on a rate that fell to zero.
    quantity: `primary rate, ${note.to.value >= note.from.value ? "up" : "down"} from ${f.fromRate}`,
    direction: false,
    ...liftTimeCells(stats),
    learnMore: polarisModal("rate_step"),
    derivation: note.live ? (
      <>
        This is a LIVE note: the primary rate is the market&rsquo;s Peg Stability Rate — algorithmic, set on the
        market&rsquo;s PSM mints and redemptions. The earlier value is the rate in force at this CDP&rsquo;s own last
        touch; the later is the cdpManager&rsquo;s own rate read now — {observation("from")}, {observation("to")}. Shown
        whenever this CDP is open, whatever the move — nothing having moved is itself the fact this note states.
        {note.setsBetween != null && (
          <>
            {" "}
            The market has re-set the rate {f.sets} times since this CDP&rsquo;s last touch: the primary rate is re-set
            at every PSM mint or redemption in the market.
          </>
        )}
        {note.interest && (
          <>
            {" "}
            The interest figures hold this CDP&rsquo;s own debt at that touch fixed and move only the rate; the
            secondary rate, which rises with the market&rsquo;s debt-to-reserve ratio, is added on top by the protocol
            and is not on this log.
          </>
        )}
      </>
    ) : (
      <>
        The primary rate is the market&rsquo;s Peg Stability Rate — algorithmic, set on the market&rsquo;s own PSM mints
        and redemptions. The two values are the rate in force at the two touches this note runs between —{" "}
        {observation("from")}, {observation("to")}.{" "}
        {note.steps != null && (
          <>
            Those two ends are {f.steps} of this CDP&rsquo;s touches apart: the rate moved the same way at every step in
            between, and a run of steps one after another in one direction is one thing happening to this position — so
            it is stated as one stretch, and the receipt lists each step it took in. A step the other way ends the run
            and begins the next note.{" "}
          </>
        )}
        {note.setsBetween != null && (
          <>
            The market re-set the rate {f.sets} times in between: the primary rate is re-set at every PSM mint or
            redemption in the market, and {f.sets} of them fell between these two touches. Nothing between the two
            touches is drawn, because nothing between them was observed on this CDP.{" "}
          </>
        )}
        A stretch is stated only where the primary rate moved at least one percentage point, and consecutive stretches
        that moved it the same way are stated as one.
        {note.interest && (
          <>
            {" "}
            The interest figures hold this CDP&rsquo;s own debt at the earlier touch fixed and move only the rate; the
            secondary rate, which rises with the market&rsquo;s debt-to-reserve ratio, is added on top by the protocol
            and is not on this log.
          </>
        )}
      </>
    ),
  };
}

// ── MakerDAO: the ilk's own stability fee, between two of a vault's OWN
//    touches ─────────────────────────────────────────────────────────────────
// The same KIND as the Polaris rate step and the same geometry, but almost
// every noun differs, and one thing about the evidence differs too. Maker
// states no fee on a row: governance files a `duty` on the Jug, the spell's own
// block is not indexed, and the only trace in the index is the Vat's rate
// accumulator moving. So the fee in force at a touch is the ilk's last RATE SET
// at or before it — the first Jug.drip that compounded at a new duty — derived
// from that drip's own delta and then CONFIRMED by reading the Jug at the
// drip's block. The receipts say so; the derivation prose names the drip, never
// a spell.
//
// The chip is the ilk's COLLATERAL (wstETH) and the debt is the Vat's own unit
// (DAI/USDS), so the interest stat carries its own symbol rather than the
// market's — see `note.interest.symbol`.

function makerRateStepBody(note: RateStepNote, links: NoteLinks): NoteBody {
  const f = rateStepFigures(note);
  const ilk = note.marketName ?? note.marketSymbol;
  const debtSymbol = note.interest?.symbol ?? note.marketSymbol;

  const stats: NoteStat[] = [
    {
      label: "Stability fee (% per year)",
      transition: {
        before: { text: f.fromRate, prov: makerRateStepProv(note, "rate"), exact: String(note.from.value) },
        after: { text: f.toRate, prov: makerRateStepProv(note, "rate"), exact: String(note.to.value) },
      },
      sub: {
        text: "moved",
        changed: true,
        figure: { text: f.delta, prov: makerRateStepProv(note, "delta"), exact: String(note.deltaPp) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: makerRateStepProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: makerRateStepProv(note, "blocks"), exact: String(note.to.block) },
      },
    },
  ];
  if (f.steps && note.steps != null) {
    stats.push({
      label: "Covers",
      figure: {
        text: `${f.steps} gaps between the vault's events, as one note`,
        prov: makerRateStepProv(note, "steps"),
        exact: String(note.steps),
      },
    });
  }
  if (f.sets && note.setsBetween != null) {
    stats.push({
      label: "Times governance changed the fee",
      figure: { text: f.sets, prov: makerRateStepProv(note, "sets"), exact: String(note.setsBetween) },
    });
  }
  if (note.grouped) {
    const g = note.grouped;
    stats.push({
      label: "Grouped events inside",
      figure: {
        text: `${g.events.toLocaleString("en-US")} in ${g.folders === 1 ? "one folder" : `${g.folders.toLocaleString("en-US")} folders`}`,
        prov: makerRateStepProv(note, "grouped"),
        exact: String(g.events),
      },
    });
  }
  if (note.interest && f.debt && f.before && f.after) {
    const interest = note.interest;
    stats.push({
      label:
        note.live && interest.atBlock === note.to.block
          ? "Yearly interest on today's debt"
          : `Yearly interest on the debt on ${formatDate(note.from.timestamp)}`,
      transition: {
        before: {
          text: f.before,
          prov: makerRateStepInterestProv(note, "before"),
          exact: String(interest.before),
          symbol: debtSymbol,
        },
        after: {
          text: f.after,
          prov: makerRateStepInterestProv(note, "after"),
          exact: String(interest.after),
          symbol: debtSymbol,
        },
      },
      sub: {
        text: "on",
        figure: {
          text: f.debt,
          prov: makerRateStepInterestProv(note, "debt"),
          exact: String(interest.debt),
          symbol: debtSymbol,
        },
      },
    });
  }
  if (f.elapsed) {
    stats.push({ label: "Elapsed", figure: elapsedFigure(note, f.elapsed, makerRateStepProv(note, "elapsed")) });
  }

  const lifted = liftTimeCells(stats);
  return {
    label: `${ilk} stability fee`,
    measure: { kind: "protocol", id: "makerdao" },
    headline: { text: f.toRate, prov: makerRateStepProv(note, "rate"), exact: String(note.to.value) },
    quantity: "stability fee",
    ...lifted,
    intro: {
      ...lifted.intro,
      // A merged or grouped-page note names its earlier end by date: "previous
      // event" would name a row inside a folder.
      lead: `Governance ${note.setsBetween != null && note.setsBetween > 1 ? `changed ${ilk}'s fee ${f.sets} times` : `changed ${ilk}'s fee`} since ${note.steps != null || note.grouped ? `the vault's event on ${formatDate(note.from.timestamp)}` : `the vault's ${note.live ? "last event" : "previous event"}`}`,
    },
    learnMore: makerModal("rate_step"),
    // T3 in plain words. How the fee at each touch is found (the Jug.drip
    // derivation) is the receipts' job: makerRateStepProv.
    derivation: (
      <>
        {ilk}&rsquo;s stability fee {note.deltaPp >= 0 ? "rose" : "fell"} from <H>{f.fromRate}</H> at this vault&rsquo;s{" "}
        {makerRateEndLabel(note.from).toLowerCase()} on {formatDate(note.from.timestamp)} to <H>{f.toRate}</H>{" "}
        {note.live ? (
          "today"
        ) : (
          <>
            by its {makerRateEndLabel(note.to).toLowerCase()} on {formatDate(note.to.timestamp)}
          </>
        )}
        {note.setsBetween != null && note.setsBetween > 0 ? (
          <>; governance changed it {note.setsBetween === 1 ? "once" : `${f.sets} times`} in between</>
        ) : null}
        .{" "}
        {note.interest && f.before && f.after && f.debt ? (
          <>
            On the <H>{f.debt}</H> this vault{" "}
            {note.live && note.interest.atBlock === note.to.block ? (
              <>owes now</>
            ) : (
              <>owed on {formatDate(note.from.timestamp)}</>
            )}
            , that is about <H>{f.after}</H> a year, against <H>{f.before}</H> at the earlier fee. The fee is added to
            the debt continuously; nothing is billed.{" "}
          </>
        ) : null}
        {note.owedNothing ? <>The vault owed nothing across this stretch, so the change cost it nothing. </> : null}
        {note.path && (note.setsBetween == null || note.setsBetween > 1 || note.steps != null) ? (
          <>
            Across the stretch the fee ranged from {formatRatePercent(note.path.min)} to{" "}
            {formatRatePercent(note.path.max)} and averaged about <H>{formatRatePercent(note.path.average)}</H> a year,
            weighted by how long each rate was in force.{" "}
            {note.lastPath ? (
              <>
                Since the vault&rsquo;s previous event, on {formatDate(note.lastPath.from)}, it ranged from{" "}
                {formatRatePercent(note.lastPath.min)} to {formatRatePercent(note.lastPath.max)} and averaged about{" "}
                <H>{formatRatePercent(note.lastPath.average)}</H> a year.{" "}
              </>
            ) : null}
          </>
        ) : null}
        {note.steps != null && (
          <>
            The fee moved the same way over {f.steps} stretches between the vault&rsquo;s events, so they make one
            note.{" "}
          </>
        )}
        {note.grouped && (
          <>
            {note.grouped.events.toLocaleString("en-US")} of the vault&rsquo;s events sit inside this stretch, held in{" "}
            {note.grouped.folders === 1 ? "one folder" : `${note.grouped.folders.toLocaleString("en-US")} folders`} on
            this page, so the note runs between the two events drawn as rows. The flat view (
            <code className="text-xs">?folders=0</code>) cuts the stretch at those events.{" "}
          </>
        )}
        {note.live
          ? "Governance sets this fee for every vault of the type; the vault's owner did nothing to change it."
          : "A note appears wherever governance changed the fee between two of the vault's events."}
      </>
    ),
  };
}

// ── The Aave family: ONE reserve's rate, on ONE side, between two of a
//    position's own touches ─────────────────────────────────────────────────
// Aave V3 (Core / Prime / EtherFi) and SparkLend, one body for both. The kind
// is the same as Polaris's and MakerDAO's — a market's own rate between two of
// a position's own touches — but the position has a different shape: a
// V3-family account is one cross-collateralised account holding several
// reserves at once, and EACH reserve carries a supply rate the account earns
// and a variable borrow rate it pays. So the chip is the RESERVE, the header
// word is "supply rate" or "borrow rate", and the stat naming the holding says
// which side it is about. Neither the word nor the stat is a verdict: the side
// is a fact of the note (`RateStepNote.side`).
//
// The rate is not on the row here, unlike Polaris. Both ends are the reserve's
// own ReserveDataUpdated, found by two DIFFERENT as-of rules — at or before
// the earlier touch, and strictly before the later one but never from inside
// its own transaction — and the derivation prose below says so in words,
// because that difference is what separates the market's move from the
// position's own doing.

function aaveFamilyRateStepBody(note: RateStepNote, links: NoteLinks): NoteBody {
  const f = rateStepFigures(note);
  const rateNoun = aaveFamilyRateNoun(note);
  const marketName = note.marketName ?? note.marketSymbol;
  const isSupply = note.side === "supply";

  /** One end of the step: the position's own touch, and the reserve's own
   *  ReserveDataUpdated the rate was read from. That log is the Pool's, fired
   *  inside somebody's transaction in this reserve — often not this
   *  position's — so it is offered as an explorer link and never implied to
   *  be an action of this account's. */
  const observation = (which: "from" | "to") => {
    const p = which === "from" ? note.from : note.to;
    if (which === "to" && note.live) {
      return (
        <>
          now: the Pool&rsquo;s own getReserveData for the {note.marketSymbol} reserve, read live at block{" "}
          {p.block.toLocaleString("en-US")} — a slot read at the head, not a log
        </>
      );
    }
    const o = which === "from" ? note.observed.from : note.observed.to;
    if (!o) {
      return (
        <>
          {aaveFamilyEndLabel(p)}: this position&rsquo;s own touch at block {p.block.toLocaleString("en-US")}
          {observationLinks(p, links)}
        </>
      );
    }
    const logPoint: MarketNotePoint = {
      block: o.block,
      timestamp: o.timestamp,
      value: p.value,
      txHash: o.txHash,
      logIndex: o.logIndex,
      wallet: "",
      kind: "ReserveDataUpdated",
    };
    return (
      <>
        {aaveFamilyEndLabel(p)}:{" "}
        {which === "from"
          ? "the reserve's last ReserveDataUpdated at or before this position's own action"
          : "the reserve's last ReserveDataUpdated at its next touch, read before the position's own transaction"}
        , block {o.block.toLocaleString("en-US")}
        {observationLinks(logPoint, links)}
      </>
    );
  };

  const stats: NoteStat[] = [
    {
      label: `${isSupply ? "Supply" : "Borrow"} rate (% per year)`,
      transition: {
        before: { text: f.fromRate, prov: aaveFamilyRateStepProv(note, "rate"), exact: String(note.from.value) },
        after: { text: f.toRate, prov: aaveFamilyRateStepProv(note, "rate"), exact: String(note.to.value) },
      },
      sub: {
        text: "moved",
        changed: true,
        figure: { text: f.delta, prov: aaveFamilyRateStepProv(note, "delta"), exact: String(note.deltaPp) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: aaveFamilyRateStepProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: aaveFamilyRateStepProv(note, "blocks"), exact: String(note.to.block) },
      },
    },
  ];
  if (note.interest && f.debt && f.before && f.after) {
    const interest = note.interest;
    stats.push({
      label: `Yearly interest on the ${isSupply ? "supply" : "debt"} held on ${formatDate(note.from.timestamp)}`,
      transition: {
        before: {
          text: f.before,
          prov: aaveFamilyRateStepInterestProv(note, "before"),
          exact: String(interest.before),
          symbol: note.marketSymbol,
        },
        after: {
          text: f.after,
          prov: aaveFamilyRateStepInterestProv(note, "after"),
          exact: String(interest.after),
          symbol: note.marketSymbol,
        },
      },
      sub: {
        text: "on",
        figure: {
          text: f.debt,
          prov: aaveFamilyRateStepInterestProv(note, "amount"),
          exact: String(interest.debt),
          symbol: note.marketSymbol,
        },
      },
    });
  }
  if (f.elapsed) {
    stats.push({ label: "Elapsed", figure: elapsedFigure(note, f.elapsed, aaveFamilyRateStepProv(note, "elapsed")) });
  }

  return {
    label: `${note.marketSymbol} ${rateNoun}`,
    measure: { kind: "protocol", id: note.protocol === "spark" ? "spark" : "aave-v3" },
    headline: { text: f.toRate, prov: aaveFamilyRateStepProv(note, "rate"), exact: String(note.to.value) },
    quantity: rateNoun,
    ...liftTimeCells(stats),
    learnMore: marketNoteRateStepContent(note.protocol === "spark" ? "spark" : "aave-v3"),
    derivation: note.live ? (
      <>
        This is a LIVE note: the {note.marketSymbol} {rateNoun} on {marketName} is the reserve&rsquo;s own, not this
        position&rsquo;s — utilisation across every account in the reserve makes it, and nobody chooses it. The earlier
        value is the rate this position&rsquo;s own last touch left in force; the later is the Pool&rsquo;s
        getReserveData read now, at the chain head — {observation("from")}, {observation("to")}. Shown whenever this
        position still holds this reserve on this side, whatever the move — nothing having moved is itself the fact this
        note states. A side whose rate is nothing at both ends is not drawn at all: a reserve nobody borrows pays no
        supply rate, and &ldquo;0.00% → 0.00%&rdquo; is an absence rather than a reading.
        {note.interest && (
          <>
            {" "}
            The interest figures hold this position&rsquo;s own {note.marketSymbol} {isSupply ? "supply" : "debt"} at
            that touch fixed and move only the rate; what it has actually {isSupply ? "earned" : "cost"} since is
            whatever the reserve&rsquo;s own index has done to the balance, which the position&rsquo;s next row will
            record.
          </>
        )}
      </>
    ) : (
      <>
        The {note.marketSymbol} {rateNoun} on {marketName} is not on either of this position&rsquo;s rows: the Pool
        emits a ReserveDataUpdated on every action that touches the reserve, whoever made it, and the rate is the field
        on that log. The two ends here are that log, found two ways. The earlier is the last one AT OR BEFORE this
        position&rsquo;s own {aaveFamilyEndLabel(note.from)} — the Pool emits it inside that transaction, before the
        position&rsquo;s own event, so it is the rate that action left in force. The later is the last one before the
        position&rsquo;s next touch and NOT inside that touch&rsquo;s own transaction, so a move the position itself
        caused there — a large borrow lifting utilisation — is never stated as the market&rsquo;s. {observation("from")}
        , {observation("to")}. Nothing between them is drawn, because this position transacted nothing between them. A
        stretch is stated only where the rate moved at least one percentage point.
        {note.interest && (
          <>
            {" "}
            The interest figures hold this position&rsquo;s own {note.marketSymbol} {isSupply ? "supply" : "debt"} at
            the earlier touch fixed and move only the rate; what it actually {isSupply ? "earned" : "cost"} across the
            stretch is whatever the reserve&rsquo;s own index did to the balance, which the position&rsquo;s own next
            row records.
          </>
        )}
      </>
    ),
  };
}

/** The rate-step kinds build their cells with the stretch's blocks and elapsed
 *  time among them. The opened note states the elapsed time in its lead line
 *  and the blocks in the (i), so they come out of the grid here, receipts and
 *  all. */
function liftTimeCells(stats: NoteStat[]): Pick<NoteBody, "stats" | "intro" | "blocks"> {
  const blocksCell = stats.find((c) => c.label === "Blocks" && c.transition);
  const elapsedCell = stats.find((c) => c.label === "Elapsed" && c.figure);
  const elapsed = elapsedCell?.figure ?? (blocksCell?.sub?.text === "elapsed" ? blocksCell.sub.figure : undefined);
  return {
    stats: stats.filter((c) => c !== blocksCell && c !== elapsedCell),
    intro: { lead: "Rate change since the last event", ...(elapsed ? { elapsed } : {}) },
    ...(blocksCell?.transition ? { blocks: blocksCell.transition } : {}),
  };
}
