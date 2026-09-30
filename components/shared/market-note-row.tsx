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
// THE MARK IS THE HEADER (Miles, 2026-09-04: "the numbers speak for
// themselves"). At rest the row reads on one vertical centre line — a pair
// of marks (the asset, and what it was measured in, overlapping), a
// lucide direction glyph (up-right / down-right — the sign of a price-gap
// move, or a share-rate step's always-a-rise), the one headline figure, and —
// on the two kinds whose headline is a MOVE — the step mark with its two
// values. What the headline figure IS depends on the question the kind
// answers: a price gap and a share-rate step state the move (a magnitude or a
// ratio; the glyph carries the direction, not the figure's sign), a rate step
// states the LATER RATE, because "what does this position pay now" is what a
// reader asks of a rate (Miles, 2026-09-10) — and a rate step therefore draws
// no step mark, which would print that same later rate a second time. No
// words: what moved is named in the panel's stat label and the (i), not the
// header. The row has
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
// between a Moonwell share-rate step and a Liquity V2 price gap is the label,
// the headline figure, the stat cards, the derivation prose, the "?" content
// and how a value on the mark is written — nothing else. Each kind hands back
// exactly those and the shell draws them: same geometry, same diamond on the
// spine, same mark, same panel. A third kind is a third arm of that switch
// plus its own provenance module, never a branch in the layout.

import { type ReactNode } from "react";
import { formatTinyNonZero } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { usePathname } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { InfoDisclosure } from "@/components/shared/info-disclosure";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { usePreferences } from "@/lib/shared/preferences-context";
import { formatRatio } from "@/lib/shared/ratio-format";
import type { RatioMode } from "@/lib/shared/preferences";
import {
  PriceChipShell,
  StatCard,
  StatSubline,
  StateTransition,
  TransitionArrow as CardArrow,
  ValuePill as CardValuePill,
} from "@/components/shared/state-transition";
import { StepMark } from "@/components/shared/step-mark";
import { EventDateContext, EventTime } from "@/components/shared/event-time";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";
import { protocolIconSrc } from "@/lib/shared/protocols";
import {
  marketNotePriceGapContent,
  marketNoteRateStepContent,
  marketNoteShareRateContent,
  marketNoteVaultTermsContent,
} from "@/lib/shared/learn-more-content";
import { aaveFamilyRateStepInterestProv, aaveFamilyRateStepProv } from "@/lib/aave-v3/market-note-provenance";
import { aaveFamilyPriceGapProv } from "@/lib/aave-v3/liquidation-price-note-provenance";
import { aaveV4PriceGapHealthProv, aaveV4PriceGapProv } from "@/lib/aave-v4/market-note-provenance";
import { alchemixSharePricePositionProv, alchemixSharePriceProv } from "@/lib/alchemix/market-note-provenance";
import { priceGapPositionProv, priceGapProv } from "@/lib/liquity/market-note-provenance";
import { makerRateStepInterestProv, makerRateStepProv } from "@/lib/makerdao/market-note-provenance";
import { shareRateSliceProv, shareRateStepProv } from "@/lib/moonwell/market-note-provenance";
import {
  polarisPriceGapPositionProv,
  polarisPriceGapProv,
  rateStepInterestProv,
  rateStepProv,
} from "@/lib/polaris/market-note-provenance";
import {
  AAVE_V4_LIQUIDATION_HF,
  aaveFamilyEndLabel,
  aaveFamilyOracleOwner,
  aaveFamilyRateNoun,
  aaveV4EndLabel,
  alchemixEndLabel,
  formatShareRate,
  forkNoteHouse,
  LIVE_GAP_MOVE_FLOOR,
  LIVE_GAP_RUNWAY_SHARE,
  isAaveFamilyPriceGap,
  makerRateEndLabel,
  marketNoteFigures,
  noteElapsedSeconds,
  notePriceFormat,
  formatChange,
  formatChangeMagnitude,
  formatPrice,
  priceDecimals,
  PRICE_DECIMALS_CAP,
  separatingDecimals,
  polarisEndLabel,
  priceGapEndLabel,
  priceGapFigures,
  priceGapReason,
  rateStepFigures,
  type MarketNote,
  type MarketNotePoint,
  type PriceGapNote,
  type RateStepNote,
  type ShareRateStepNote,
  type VaultTermsNote,
} from "@/lib/shared/market-note";
import { heldAmountProv, valueAtPriceProv, type HeldSource } from "@/lib/shared/market-note-cell-provenance";

/** A figure at a fixed number of decimals, grouped. Locale pinned. */
const grouped = (n: number, decimals: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** An amount the way a regular card's grid writes one: whole units from a
 *  thousand up, two places down to 0.01, formatTinyNonZero below. */
const amountText = (n: number): string => {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) < 0.01) return formatTinyNonZero(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

/** A receipted figure in a stat card: the text, its receipt, and the mark of
 *  the asset it counts (none for a block, a ratio, a percentage). */
interface NoteFigure {
  text: string;
  prov: Provenance;
  /** The exact value the receipt records — defaults to `text`. */
  exact?: string;
  symbol?: string;
  /** Resolve the mark under another symbol (mMAMO wearing MAMO's). */
  iconAs?: string;
  /** Greyed, the way a regular card states a figure the event left as it
   *  was: the price move did not change it. */
  muted?: boolean;
}

/** One cell of the open panel: a single figure, or a before → after pair. */
interface NoteStat {
  label: string;
  figure?: NoteFigure;
  transition?: { before: NoteFigure; after: NoteFigure };
  /** The figure's value at each end's price, drawn in the bordered value
   *  pill a regular card draws beside a collateral amount. */
  values?: { before: NoteFigure; after: NoteFigure };
  /** A small receipted line under the value — "branch minimum 110%",
   *  "23,739 BOLD / year" — for the figure that qualifies the card's own
   *  rather than deserving a card of its own. Muted, as a reference or a
   *  qualifier of a held figure is, unless `changed`: the one sub-line the
   *  move itself sets (a rate step's "moved"). */
  sub?: { text?: string; figure: NoteFigure; suffix?: string; changed?: boolean };
}

/** The price chip, bottom right, where a regular card states its price: one
 *  unit of the asset at each end. */
interface NoteChip {
  before: NoteFigure;
  after: NoteFigure;
  /** The asset one unit of which is priced; its mark closes the chip. */
  symbol: string;
  iconAs?: string;
  /** "$" for a USD price; otherwise the price is followed by its unit. */
  prefix?: string;
  unit?: string;
  title: string;
}

/** The mark the asset was measured in, drawn overlapping the asset's own:
 *  the dollar for an oracle price, the protocol for a share rate. */
type MeasureMark = { kind: "usd" } | { kind: "protocol"; id: string } | { kind: "token"; symbol: string };

/** What one kind of note hands the shell. Nothing else varies. */
interface NoteBody {
  /** "MAMO share rate", "WETH oracle price" — the header's accessible name;
   *  the panel's stat label carries it in view. */
  label: string;
  measure: MeasureMark;
  /** The one figure the header states beside the mark. On a move (a price gap,
   *  a share rate) it is the move; on a rate step it is the LATER RATE — what
   *  the position pays now, which is the question that note answers (Miles,
   *  2026-09-10). */
  headline: NoteFigure;
  /** The quiet word naming what the headline counts — "oracle price",
   *  "primary rate", "share rate" — sitting just after the headline figure.
   *  THE MARK IS THE HEADER: this is the one word of prose the
   *  header carries, so a reader never has to open the panel just to learn
   *  what moved. */
  quantity: string;
  stats: NoteStat[];
  /** The line above the cells: what the stretch is, and how long it ran. */
  intro?: { lead: string; elapsed?: NoteFigure; tail?: "ago" | "apart" };
  /** The price chip. Absent on a kind with no price (a rate, a vault's terms). */
  chip?: NoteChip;
  /** The two blocks the stretch runs between, stated in the (i) beneath. */
  blocks?: { before: NoteFigure; after: NoteFigure };
  /** The (i) beneath the cells: a paragraph, or (the price gap's form) one
   *  bullet per fact, in the shape of a regular event's explanation. */
  derivation: ReactNode | ReactNode[];
  /** False on a kind that observed ONE value rather than a move: the header
   *  then draws no direction glyph. A configuration event states its new
   *  terms and, often, no earlier ones — an arrow over it would be a
   *  direction nothing read. Default true, which is every kind built out of
   *  two observations. */
  direction?: boolean;
  /** How the step mark labels its two levels — and whether the header draws
   *  one at all. A rate step states no mark: since its headline became the
   *  later rate, the mark's own "to" label would print that same rate a
   *  second time an inch away, and one figure stated twice in one row reads
   *  as two facts. The from → to pair is in the panel's own stat card, where
   *  it is receipted. */
  format?: (n: number) => string;
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
  isFirst = false,
  isLast = false,
  datePrefix = null,
  defaultOpen,
  nodeControl,
}: {
  note: MarketNote;
  /** Mount with the panel open (a note opened from its spine marker). */
  defaultOpen?: boolean;
  /** The desktop marker's close control, laid over the node, which is then
   *  drawn filled (spine-note-markers.tsx). */
  nodeControl?: ReactNode;
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
  isFirst?: boolean;
  isLast?: boolean;
}) {
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

  // The T3 ratio-pair rule's viewer preference (see ratioPairNote): read once
  // here, since it reaches only the price-gap kind's collateral-ratio bullet.
  const { prefs } = usePreferences();

  // The one switch. Everything below it is the same row whatever was observed.
  const body =
    note.kind === "price-gap"
      ? priceGapBody(note, links, prefs.ratioMode)
      : note.kind === "rate-step"
        ? rateStepBody(note, links)
        : note.kind === "vault-terms"
          ? vaultTermsBody(note, links)
          : shareRateBody(note, links);

  return (
    <NoteRowShell
      icon={nodeControl ? "market-open" : "market"}
      nodeControl={nodeControl}
      isFirst={isFirst}
      isLast={isLast}
      label={body.label}
      marker={{ attr: "data-market-note", value: note.id }}
      defaultOpen={defaultOpen}
      header={
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
          {body.format && <StepMark from={note.from.value} to={note.to.value} format={body.format} />}
          <NoteTime note={note} datePrefix={datePrefix} />
        </>
      }
    >
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
                  {s.values && (
                    <>
                      <ValuePill figure={s.values.before} />
                      <TransitionArrow />
                      <ValuePill figure={s.values.after} />
                    </>
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
      {body.chip && <PriceChip chip={body.chip} />}
      <div className="px-4 pb-3 pt-1">
        <InfoDisclosure
          label="how this note was derived"
          rowExtra={
            <span className="ml-auto">
              <LearnMore inline content={body.learnMore} />
            </span>
          }
        >
          {Array.isArray(body.derivation) ? (
            // The bullet form of a regular event's (i), closing on the block
            // range. The blocks are stated only here, so they stay muted.
            <ProseExplainer
              items={[
                ...body.derivation,
                ...(body.blocks
                  ? [
                      <>
                        The stretch runs from block{" "}
                        <Figure figure={{ ...body.blocks.before, muted: true }} className="" /> to block{" "}
                        <Figure figure={{ ...body.blocks.after, muted: true }} className="" />.
                      </>,
                    ]
                  : []),
              ]}
            />
          ) : (
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
          )}
        </InfoDisclosure>
      </div>
    </NoteRowShell>
  );
}

/** A note as its spine marker states it: the tooltip and the open caption
 *  ("WETH price −12.0%", the header's grain) and the words a screen reader
 *  hears ("WETH price down 12.0%"). */
export function noteMarkerText(note: MarketNote): { tip: string; spoken: string } {
  const sym = note.marketSymbol;
  if (note.kind === "price-gap") {
    const dir = note.changePct < 0 ? "down" : "up";
    return {
      tip: `${sym} price ${formatChange(note.changePct)}`,
      spoken: `${sym} price ${dir} ${formatChangeMagnitude(note.changePct)}`,
    };
  }
  // The other kinds carry no one signed move on the price-gap's grain: the
  // marker names the quantity and its direction, and the open row the figures.
  const noun = note.kind === "rate-step" ? "rate" : note.kind === "share-rate-step" ? "share rate" : "terms";
  if (note.kind === "vault-terms") {
    const text = note.tip ?? `${sym} ${noun}`;
    return { tip: text, spoken: text };
  }
  // MakerDAO's fee notes state the ilk's fee both ends: "ETH-A fee 2.00% → 9.50%".
  if (note.kind === "rate-step" && note.protocol === "makerdao") {
    const f = rateStepFigures(note);
    const text = `${note.marketName ?? sym} fee ${f.fromRate} → ${f.toRate}`;
    return { tip: text, spoken: `${note.marketName ?? sym} fee from ${f.fromRate} to ${f.toRate}` };
  }
  const text = `${sym} ${noun} ${note.to.value >= note.from.value ? "up" : "down"}`;
  return { tip: text, spoken: text };
}

/** The asset's mark with the measure's overlapping it — WETH under the dollar,
 *  MAMO under Moonwell. The same chip geometry as InlineAssetCluster, so the
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
        {measure.kind === "usd" ? (
          <img src="/icons/usd.svg" alt="" width={24} height={24} className="rounded-full" />
        ) : measure.kind === "token" ? (
          <TokenChipIcon symbol={measure.symbol} size={24} filterable={false} />
        ) : (
          <img src={protocolIconSrc(measure.id)} alt="" width={24} height={24} className="rounded-full" />
        )}
      </span>
    </span>
  );
}

/** The direction glyph beside the headline figure: it carries the sign the
 *  figure no longer does (a price-gap headline is now an unsigned
 *  magnitude, and a share-rate ratio never carried one). An sr-only word
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
 *  later end is the price read at the chain head. Hidden with the timeline's
 *  timestamps, like a card's. */
function NoteTime({ note, datePrefix }: { note: MarketNote; datePrefix: string | null }) {
  const { showTimestamps } = useTimelineDisplay();
  if (!showTimestamps) return null;
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

/** A value in the bordered pill a regular card draws beside an amount. The
 *  price move is what changed it, so it takes the foreground tone unless the
 *  figure says it is muted. */
function ValuePill({ figure }: { figure: NoteFigure }) {
  return (
    <Prov info={figure.prov} value={figure.exact ?? figure.text}>
      <CardValuePill changed={!figure.muted}>{figure.text}</CardValuePill>
    </Prov>
  );
}

/** The price chip a regular card draws bottom right, with both ends. The two
 *  ends are the move the note states, so the chip takes the foreground tone. */
function PriceChip({ chip }: { chip: NoteChip }) {
  const end = (f: NoteFigure) => (
    <Prov info={f.prov} value={f.exact ?? f.text}>
      <span className="tabular-nums">
        {chip.prefix ?? ""}
        {f.text}
      </span>
    </Prov>
  );
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <PriceChipShell changed title={chip.title} marker>
        {end(chip.before)}
        <span aria-hidden="true" className="text-rb-500">
          →
        </span>
        {end(chip.after)}
        {chip.unit && <span>{chip.unit}</span>}
        <TokenChipIcon symbol={chip.symbol} iconOverride={chip.iconAs} size={14} filterable={false} />
      </PriceChipShell>
    </div>
  );
}

/** A receipted figure with, where it counts an asset, that asset's mark. */
function Figure({ figure, className }: { figure: NoteFigure; className: string }) {
  return (
    <Prov
      info={figure.prov}
      value={figure.exact ?? figure.text}
      symbol={figure.symbol}
      icon={
        figure.symbol ? (
          <TokenChipIcon symbol={figure.symbol} iconOverride={figure.iconAs} size={16} filterable={false} />
        ) : undefined
      }
    >
      <span className={`tabular-nums ${figure.muted ? "text-rb-500" : "text-foreground"} ${className}`}>
        {figure.text}
      </span>
    </Prov>
  );
}

/** A figure the (i) repeats from the cells or the chip above: the foreground
 *  tone of the T3 echo-colour rule, and an echo of the cell's receipt so the
 *  inspector's locator reaches both. Written exactly as the cell writes it.
 *  `muted` keeps the same echoed receipt (the locator still reaches it) but
 *  drops the foreground tone, for the T3 ratio-pair rule's "other form" case,
 *  where the cell's own figure isn't the one the viewer's preference shows. */
function Echo({
  figure,
  prefix = "",
  suffix = "",
  muted = false,
}: {
  figure: NoteFigure;
  prefix?: string;
  suffix?: string;
  muted?: boolean;
}) {
  const echoed = (
    <Prov echo info={figure.prov} value={figure.exact ?? figure.text} symbol={figure.symbol}>
      <span className={`tabular-nums ${muted ? "text-rb-500" : ""}`}>
        {prefix}
        {figure.text}
        {suffix}
      </span>
    </Prov>
  );
  return muted ? echoed : <H>{echoed}</H>;
}

/** The T3 ratio-pair rule (rails-ops standards/detail-page-anatomy.md, "The
 *  disclosure ladder"): a T3 statement of the collateral ratio states the LTV
 *  alongside it, the same fact read the other way, with whichever form the
 *  viewer's CR/LTV preference shows elsewhere on the page foreground, the
 *  other muted. This note's own stat card states only the collateral ratio
 *  (no CR/LTV toggle of its own), so the preference is read directly
 *  (`prefs.ratioMode`) rather than off a T2 cell that switches. The CR figure
 *  keeps its own receipt in both cases (`Echo`'s `muted` only swaps the
 *  colour); the LTV has none to echo, so its foreground is a plain `<H>` and
 *  its muted form is plain text, with no invented provenance. Both forms are
 *  written at a fixed two decimals, the ratio grain T2 uses elsewhere on the
 *  page, not this note's own separating-decimals grain. */
function ratioPairNote(cr: number, crFigure: NoteFigure, mode: RatioMode): ReactNode {
  const ltvText = formatRatio(cr, "ltv", 2);
  return mode === "ltv" ? (
    <>
      <Echo figure={crFigure} muted /> (LTV <H>{ltvText}</H>)
    </>
  ) : (
    <>
      <Echo figure={crFigure} /> (LTV {ltvText})
    </>
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

// ── Moonwell Base: a market's share rate stepped ────────────────────────────

function shareRateBody(note: ShareRateStepNote, links: NoteLinks): NoteBody {
  const f = marketNoteFigures(note);
  const observation = (p: MarketNotePoint, which: "before" | "after") => {
    if (which === "after" && note.live) {
      return (
        <>
          now: m{note.marketSymbol}&rsquo;s own exchange rate, read live at block {p.block.toLocaleString("en-US")} —
          not a log
        </>
      );
    }
    return (
      <>
        {which === "before" ? (note.live ? "this account's own last" : "last observation before") : "first after"}:{" "}
        {p.eventId ? "this account" : `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}`}
        &rsquo;s {p.kind} at block {p.block.toLocaleString("en-US")}
        {observationLinks(p, links)}
      </>
    );
  };
  // The regular Moonwell card states the mToken balance and what it
  // represents in the underlying. The balance is the account's own; the rate
  // moves what it is worth. A note with no slice states the rate alone.
  const stats: NoteStat[] = [];
  if (note.slice && f.units && f.before && f.after) {
    const s = note.slice;
    stats.push(
      {
        label: "mToken balance",
        figure: {
          text: f.units,
          prov: shareRateSliceProv(note, "units"),
          exact: String(s.units),
          symbol: s.unitSymbol,
          iconAs: s.valueSymbol,
          muted: true,
        },
      },
      {
        label: `Supplied (${s.valueSymbol})`,
        transition: {
          before: {
            text: f.before,
            prov: shareRateSliceProv(note, "before"),
            exact: String(s.before),
            symbol: s.valueSymbol,
          },
          after: {
            text: f.after,
            prov: shareRateSliceProv(note, "after"),
            exact: String(s.after),
            symbol: s.valueSymbol,
          },
        },
      },
    );
  }
  const elapsed = f.elapsed ? elapsedFigure(note, f.elapsed, shareRateStepProv(note, "elapsed")) : undefined;
  return {
    label: `${note.marketSymbol} share rate`,
    measure: { kind: "protocol", id: "moonwell" },
    headline: { text: f.ratio, prov: shareRateStepProv(note, "ratio"), exact: String(note.ratio) },
    quantity: "share rate",
    format: formatShareRate,
    // A historical step's two ends are other wallets' mints and redeems in the
    // market, so it is dated by their distance apart; a live note's earlier end
    // is this account's own last one.
    intro: note.live
      ? { lead: "Market fluctuation since this account's last mint or redeem", ...(elapsed ? { elapsed } : {}) }
      : {
          lead: "Share-rate step in the market, between two observations",
          ...(elapsed ? { elapsed, tail: "apart" } : {}),
        },
    chip: {
      before: { text: f.fromRate, prov: shareRateStepProv(note, "rate"), exact: String(note.from.value) },
      after: { text: f.toRate, prov: shareRateStepProv(note, "rate"), exact: String(note.to.value) },
      symbol: `m${note.marketSymbol}`,
      iconAs: note.marketSymbol,
      unit: note.marketSymbol,
      title: `One m${note.marketSymbol} in ${note.marketSymbol} at each end (${note.unitLabel})`,
    },
    blocks: {
      before: { text: f.fromBlock, prov: shareRateStepProv(note, "blocks"), exact: String(note.from.block) },
      after: { text: f.toBlock, prov: shareRateStepProv(note, "blocks"), exact: String(note.to.block) },
    },
    stats,
    learnMore: marketNoteShareRateContent(),
    derivation: note.live ? (
      <>
        This is a LIVE note: the earlier reading is this account&rsquo;s own last Mint or Redeem in the{" "}
        {note.marketSymbol} market — the underlying amount it emitted divided by the mTokens it was exchanged for — and
        the later one is m{note.marketSymbol}&rsquo;s own exchange rate read now, at the chain head, not a second log.{" "}
        {observation(note.from, "before")}; {observation(note.to, "after")}. Shown whenever this account still holds the
        market&rsquo;s mTokens, whatever the move — nothing having changed is itself the fact this note states.
        {note.slice && (
          <>
            {" "}
            The position&rsquo;s own slice holds this account&rsquo;s CURRENT mToken holding fixed — its live balance,
            read at the chain head — and moves only the rate, so it can differ from the balance right after the last
            Mint or Redeem if the account transferred mTokens since.
          </>
        )}
      </>
    ) : (
      <>
        The market&rsquo;s share rate is not read from anywhere: every Mint and Redeem in the {note.marketSymbol} market
        emits the underlying amount and the mTokens it was exchanged for, and their quotient is the rate at that block.
        Two adjacent observations bracket this step — {observation(note.from, "before")},{" "}
        {observation(note.to, "after")}. Nothing between them is drawn, because nothing between them was observed. A
        step is only stated where the change exceeds ten times the interest the market could have accrued over the same
        blocks.
        {note.slice && (
          <>
            {" "}
            The position&rsquo;s own slice is its mToken balance at the first of the two blocks, replayed from every
            mToken Transfer touching this wallet, multiplied by each end&rsquo;s rate.
          </>
        )}
      </>
    ),
  };
}

// ── Liquity V2's branch oracle price, or Polaris's market price — both moved
//    between two of the position's own events ───────────────────────────────
// One body function for both: Liquity V2's price is USD and its ends are a
// trove's own events (priceGapProv / priceGapPositionProv); Polaris's price
// is the market's own stable (USDp/GOLDp, never USD) and its ends are a
// CDP's own touches (polarisPriceGapProv / polarisPriceGapPositionProv).
// `note.measureKind === "protocol"` is the one flag that tells the two
// apart — set only by `polarisPriceGapNotesFor` — and it picks the measure
// mark, the end-label function, the position noun and the receipt builders
// alike; nothing else in the body branches.

function priceGapBody(note: PriceGapNote, links: NoteLinks, mode: RatioMode): NoteBody {
  // Aave V4's basket is a different position shape, not a different kind: one
  // note per ASSET, and a health factor over the whole basket where the other
  // two homes state one collateral ratio. Its own body below.
  if (note.protocol === "aave-v4") return aaveV4PriceGapBody(note, links);
  if (isAaveFamilyPriceGap(note)) return aaveFamilyPriceGapBody(note, links);
  if (note.protocol === "alchemix-v3") return alchemixSharePriceBody(note, links);
  const f = priceGapFigures(note);
  const p = note.position;
  const isPolaris = note.measureKind === "protocol";
  const endLabel = isPolaris ? polarisEndLabel : priceGapEndLabel;
  const positionNoun = isPolaris ? "CDP" : "trove";
  // A Liquity V2 fork's note names the fork (lib/shared/market-note.ts,
  // `forkPriceGapNotesFor`); its price is the branch PriceFeed's.
  const fork = forkNoteHouse(note);
  const feedNoun = isPolaris ? "the market's price feed" : fork ? `${fork}'s branch PriceFeed` : "Liquity's PriceFeed";
  const minimumLabel = isPolaris ? "the market's normal-mode minimum" : "branch minimum";
  const priceProv = isPolaris ? polarisPriceGapProv : priceGapProv;
  const positionProv = isPolaris ? polarisPriceGapPositionProv : priceGapPositionProv;
  /** Where one end's price was read: a position event (with its two links),
   *  or, on a live note's later end, the live read at the chain head. */
  const source = (point: MarketNotePoint, which: "earlier" | "later") => {
    if (which === "later" && note.live) {
      const liveNoun = isPolaris ? "the market's price feed, read live" : "the backend's live oracle read";
      return (
        <>
          {liveNoun} at the chain head, block {point.block.toLocaleString("en-US")}
        </>
      );
    }
    return (
      <>
        this {positionNoun}&rsquo;s {endLabel(point)} at block {point.block.toLocaleString("en-US")}
        {observationLinks(point, links)}
      </>
    );
  };
  const held: HeldSource = {
    recordedBy: `this ${positionNoun}'s ${p ? endLabel(note.from) : "event"}`,
    atBlock: p?.atBlock ?? note.from.block,
    ...(note.marketAddress && !isPolaris
      ? { contract: { name: `${note.marketSymbol} PriceFeed`, address: note.marketAddress } }
      : {}),
  };
  // Polaris prices pETH in the market's own stable, so its values are in that
  // stable, written after the figure; Liquity V2's are dollars.
  const stable = isPolaris ? note.unitLabel.split(" per ")[0] : null;
  const stats: NoteStat[] = [];
  // The figures the (i) repeats, kept as the cells built them.
  let collFig: NoteFigure | undefined;
  let valueFigs: { before: NoteFigure; after: NoteFigure } | undefined;
  let crFigs: { before: NoteFigure; after: NoteFigure } | undefined;
  let mcrFig: NoteFigure | undefined;
  if (p) {
    const vd = separatingDecimals(p.coll * note.from.value, p.coll * note.to.value, 0, 2);
    const money = (n: number) => (stable ? `${grouped(n, vd)} ${stable}` : `$${grouped(n, vd)}`);
    const priceText = (n: number) => formatPrice(n, priceDecimals(note));
    const priceUnit = stable ?? "USD";
    collFig = {
      text: isPolaris ? grouped(p.coll, 4) : p.coll.toFixed(4),
      exact: String(p.coll),
      symbol: note.marketSymbol,
      muted: true,
      prov: heldAmountProv(note, "collateral", String(p.coll), held),
    };
    valueFigs = {
      before: {
        text: money(p.coll * note.from.value),
        exact: String(p.coll * note.from.value),
        prov: valueAtPriceProv(
          note,
          "before",
          { label: "collateral", value: `${p.coll} ${note.marketSymbol}` },
          { value: priceText(note.from.value), unit: priceUnit },
          held,
        ),
      },
      after: {
        text: money(p.coll * note.to.value),
        exact: String(p.coll * note.to.value),
        prov: valueAtPriceProv(
          note,
          "after",
          { label: "collateral", value: `${p.coll} ${note.marketSymbol}` },
          { value: priceText(note.to.value), unit: priceUnit },
          held,
        ),
      },
    };
    stats.push({ label: "Collateral", figure: collFig, values: valueFigs });
    stats.push({
      label: "Debt",
      figure: {
        text: amountText(p.debt),
        exact: String(p.debt),
        ...(p.debtSymbol ? { symbol: p.debtSymbol } : {}),
        muted: true,
        prov: heldAmountProv(note, "debt", String(p.debt), held),
      },
    });
  }
  if (p && f.crBefore && f.crAfter && f.mcr) {
    crFigs = {
      before: { text: f.crBefore, prov: positionProv(note, "crBefore"), exact: String(p.crBefore) },
      after: { text: f.crAfter, prov: positionProv(note, "crAfter"), exact: String(p.crAfter) },
    };
    mcrFig = { text: f.mcr, prov: positionProv(note, "mcr"), exact: String(p.mcrPct) };
    stats.push({
      label: isPolaris ? "Collateral ratio" : "Collateral Ratio",
      transition: crFigs,
      sub: { text: minimumLabel, figure: mcrFig },
    });
  }
  if (p && !isPolaris && p.rate != null) {
    const yearly = p.debt * (p.rate / 100);
    stats.push({
      label: "Interest Rate",
      figure: {
        text: `${p.rate.toFixed(1)}%`,
        exact: String(p.rate),
        muted: true,
        prov: heldAmountProv(note, "annual interest rate", `${p.rate}%`, held),
      },
      ...(yearly > 0.01
        ? {
            sub: {
              figure: {
                text: amountText(yearly),
                exact: String(yearly),
                prov: heldAmountProv(note, "yearly interest", String(yearly), held, {
                  formula: "debt × annual interest rate",
                  inputs: [
                    {
                      label: "debt",
                      value: `${p.debt} ${p.debtSymbol ?? ""}`.trim(),
                      kind: "chain",
                      pclass: "emitted",
                    },
                    { label: "annual interest rate", value: `${p.rate}%`, kind: "chain", pclass: "emitted" },
                  ],
                }),
              },
              suffix: `${p.debtSymbol ?? ""} / year`.trim(),
            },
          }
        : {}),
    });
  }
  const pd = separatingDecimals(note.from.value, note.to.value, 0, PRICE_DECIMALS_CAP);
  const chip: NoteChip = {
    before: { text: grouped(note.from.value, pd), prov: priceProv(note, "price"), exact: String(note.from.value) },
    after: { text: grouped(note.to.value, pd), prov: priceProv(note, "price"), exact: String(note.to.value) },
    symbol: note.marketSymbol,
    ...(stable ? { unit: stable } : { prefix: "$" }),
    title: `${note.marketSymbol} price at each end of the stretch (${note.unitLabel})`,
  };
  const price = (fig: NoteFigure) => (
    <Echo figure={fig} prefix={chip.prefix ?? ""} suffix={chip.unit ? ` ${chip.unit}` : ""} />
  );
  // "then" and "now" on a live note; the two events on a historical one.
  const [thenWord, nowWord] = note.live ? ["then", "now"] : ["at the earlier event", "at the later event"];
  const atBlock = p ? (
    <Prov info={positionProv(note, "state")} value={String(p.atBlock)}>
      <span className="tabular-nums">{f.atBlock}</span>
    </Prov>
  ) : null;
  const derivation: ReactNode[] = [
    note.live ? (
      <>
        The {note.marketSymbol} price was {price(chip.before)} at {source(note.from, "earlier")}, and is{" "}
        {price(chip.after)} now, from {source(note.to, "later")}.
      </>
    ) : (
      <>
        The {note.marketSymbol} price was {price(chip.before)} at {source(note.from, "earlier")}, and{" "}
        {price(chip.after)} at {source(note.to, "later")}.
      </>
    ),
    !note.live && (
      <>
        Each price is the one {feedNoun} stated at that event&rsquo;s block. The {positionNoun} transacted nothing
        between the two events, so nothing between them is drawn.
      </>
    ),
    collFig && valueFigs && (
      <>
        The <Echo figure={collFig} suffix={` ${note.marketSymbol}`} /> of collateral was worth{" "}
        <Echo figure={valueFigs.before} /> {thenWord} and {note.live ? "is" : "was"} worth{" "}
        <Echo figure={valueFigs.after} /> {nowWord}.
      </>
    ),
    crFigs && mcrFig && p && (
      <>
        The collateral ratio was {ratioPairNote(p.crBefore, crFigs.before, mode)} {thenWord} and{" "}
        {note.live ? "is" : "was"} {ratioPairNote(p.crAfter, crFigs.after, mode)} {nowWord}, against{" "}
        {isPolaris ? "the market's normal-mode minimum" : "the branch minimum"} of <Echo figure={mcrFig} />.
      </>
    ),
    atBlock && <>Both ratios use the debt and collateral recorded at block {atBlock}; only the price moves.</>,
    p &&
      (note.live ? (
        <>
          Interest has accrued since block {f.atBlock}
          {isPolaris
            ? "."
            : ", so the position card's live ratio, which includes it, differs from the later ratio here."}
        </>
      ) : (
        <>Interest kept accruing across the stretch.</>
      )),
    p && isPolaris && (
      <>
        The minimum named here is the market&rsquo;s normal-mode MCR(). A defensive-mode minimum can be in force at a
        past block, but it is not indexed.
      </>
    ),
    p && !note.live && <>The stretch is stated because {priceGapReason(note)}.</>,
  ].filter(Boolean) as ReactNode[];
  return {
    label: `${note.marketSymbol} oracle price`,
    measure: isPolaris ? { kind: "protocol", id: note.measureProtocolId ?? "polaris" } : { kind: "usd" },
    quantity: "oracle price",
    headline: { text: f.changeMagnitude, prov: priceProv(note, "change"), exact: String(note.changePct) },
    // The step mark states the same two prices the stat card does, so it takes
    // the note's own grain rather than a default that could round them alike.
    format: notePriceFormat(note),
    intro: {
      lead: "Market fluctuation since the last event",
      ...(f.elapsed ? { elapsed: elapsedFigure(note, f.elapsed, priceProv(note, "elapsed")) } : {}),
    },
    chip,
    blocks: {
      before: { text: f.fromBlock, prov: priceProv(note, "blocks"), exact: String(note.from.block) },
      after: { text: f.toBlock, prov: priceProv(note, "blocks"), exact: String(note.to.block) },
    },
    stats,
    learnMore: marketNotePriceGapContent(isPolaris ? "polaris" : fork ? "liquity-fork" : "liquity-v2"),
    derivation,
  };
}

// ── Alchemix V3: the vault's share price, moved between two of a position's
//    readings ────────────────────────────────────────────────────────────────
// The price-gap kind on a position whose collateral is a vault share count.
// The price is one share in the asset underneath, stored with each reading, so
// the figures it moves are the collateral's value in that asset and the
// collateralisation, against the line's liquidation line
// (lib/alchemix/market-notes.ts).

function alchemixSharePriceBody(note: PriceGapNote, links: NoteLinks): NoteBody {
  const f = priceGapFigures(note);
  const p = note.position;
  const under = p?.valueSymbol ?? "the asset underneath";
  /** Where one end's share price was read: a reading at one of this
   *  position's rows, or, on a live note's later end, the position card's. */
  const source = (point: MarketNotePoint, which: "earlier" | "later") =>
    which === "later" && note.live ? (
      <>the position card&rsquo;s reading at block {point.block.toLocaleString("en-US")}</>
    ) : (
      <>
        this position&rsquo;s {alchemixEndLabel(point)} at block {point.block.toLocaleString("en-US")}
        {observationLinks(point, links)}
      </>
    );
  const held: HeldSource = {
    recordedBy: `this position's ${alchemixEndLabel(note.from)}`,
    atBlock: p?.atBlock ?? note.from.block,
  };
  // The regular card's reading grid: Debt, Collateral (the share count), and
  // the collateralisation the position card states. The share count and the
  // debt are the earlier reading's; only the share price moves.
  const stats: NoteStat[] = [];
  // The figures the (i) repeats, kept as the cells built them.
  let collFig: NoteFigure | undefined;
  let valueFigs: { before: NoteFigure; after: NoteFigure } | undefined;
  let crFigs: { before: NoteFigure; after: NoteFigure } | undefined;
  let mcrFig: NoteFigure | undefined;
  if (p) {
    stats.push({
      label: "Debt",
      figure: {
        text: amountText(p.debt),
        exact: String(p.debt),
        ...(p.debtSymbol ? { symbol: p.debtSymbol } : {}),
        muted: true,
        prov: heldAmountProv(note, "debt", String(p.debt), held),
      },
    });
    collFig = {
      text: amountText(p.coll),
      exact: String(p.coll),
      symbol: note.marketSymbol,
      muted: true,
      prov: heldAmountProv(note, "share count", String(p.coll), held),
    };
    valueFigs =
      f.valueBefore && f.valueAfter
        ? {
            before: {
              text: f.valueBefore,
              prov: alchemixSharePricePositionProv(note, "valueBefore"),
              exact: String(p.coll * note.from.value),
            },
            after: {
              text: f.valueAfter,
              prov: alchemixSharePricePositionProv(note, "valueAfter"),
              exact: String(p.coll * note.to.value),
            },
          }
        : undefined;
    stats.push({ label: "Collateral", figure: collFig, ...(valueFigs ? { values: valueFigs } : {}) });
  }
  if (p && f.crBefore && f.crAfter && f.mcr) {
    crFigs = {
      before: { text: f.crBefore, prov: alchemixSharePricePositionProv(note, "crBefore"), exact: String(p.crBefore) },
      after: { text: f.crAfter, prov: alchemixSharePricePositionProv(note, "crAfter"), exact: String(p.crAfter) },
    };
    mcrFig = { text: f.mcr, prov: alchemixSharePricePositionProv(note, "mcr"), exact: String(p.mcrPct) };
    stats.push({ label: "Collateralisation", transition: crFigs, sub: { text: "liquidation at", figure: mcrFig } });
  }
  const chip: NoteChip = {
    before: { text: f.fromPrice, prov: alchemixSharePriceProv(note, "price"), exact: String(note.from.value) },
    after: { text: f.toPrice, prov: alchemixSharePriceProv(note, "price"), exact: String(note.to.value) },
    symbol: note.marketSymbol,
    unit: under,
    title: `One ${note.marketSymbol} share in ${under} at each end of the stretch`,
  };
  // "then" and "now" on a live note; the two rows on a historical one.
  const [thenWord, nowWord] = note.live ? ["then", "now"] : ["at the earlier reading", "at the later reading"];
  const is = note.live ? "is" : "was";
  const derivation: ReactNode[] = [
    <>
      One {note.marketSymbol} share was worth <Echo figure={chip.before} suffix={` ${under}`} /> at{" "}
      {source(note.from, "earlier")}, and {is} <Echo figure={chip.after} suffix={` ${under}`} /> at{" "}
      {source(note.to, "later")}.
    </>,
    collFig && valueFigs && (
      <>
        The <Echo figure={collFig} suffix={` ${note.marketSymbol}`} /> of collateral was worth{" "}
        <Echo figure={valueFigs.before} /> {thenWord} and {is} worth <Echo figure={valueFigs.after} /> {nowWord}.
      </>
    ),
    crFigs && mcrFig && (
      <>
        Collateralisation was <Echo figure={crFigs.before} /> {thenWord} and {is} <Echo figure={crFigs.after} />{" "}
        {nowWord}, against the liquidation line of <Echo figure={mcrFig} />.
      </>
    ),
    p && (
      <>
        Both use the share count and debt read at block{" "}
        <Prov info={alchemixSharePricePositionProv(note, "state")} value={String(p.atBlock)}>
          <span className="tabular-nums">{f.atBlock}</span>
        </Prov>
        ; only the share price moves.
      </>
    ),
    <>
      {note.live ? (
        <>
          It is drawn where the price has moved at least {LIVE_GAP_MOVE_FLOOR * 100}% since the earlier reading, or the
          move used {LIVE_GAP_RUNWAY_SHARE * 100}% of the position&rsquo;s runway to the liquidation line.
        </>
      ) : (
        <>It is stated because {priceGapReason(note)}.</>
      )}
    </>,
  ].filter(Boolean) as ReactNode[];
  return {
    label: `${note.marketSymbol} share price`,
    measure: { kind: "token", symbol: under },
    quantity: "share price",
    headline: { text: f.changeMagnitude, prov: alchemixSharePriceProv(note, "change"), exact: String(note.changePct) },
    format: notePriceFormat(note),
    intro: {
      lead: "Market fluctuation since the last event",
      ...(f.elapsed ? { elapsed: elapsedFigure(note, f.elapsed, alchemixSharePriceProv(note, "elapsed")) } : {}),
    },
    chip,
    blocks: {
      before: { text: f.fromBlock, prov: alchemixSharePriceProv(note, "blocks"), exact: String(note.from.block) },
      after: { text: f.toBlock, prov: alchemixSharePriceProv(note, "blocks"), exact: String(note.to.block) },
    },
    stats,
    learnMore: marketNotePriceGapContent("alchemix-v3"),
    derivation,
  };
}

// ── Aave V4: ONE asset's oracle price, moved between two of a spoke
//    position's own rows ─────────────────────────────────────────────────────
// The same price-gap kind, on a position with a different shape. A trove has
// one collateral and one debt, so its note states a collateral ratio; an Aave
// account holds several collaterals against several debts in one spoke, so a
// note here is about ONE asset and the figure it moves is the HEALTH FACTOR of
// the whole basket the earlier row recorded. Where that basket is not fully
// priced, or a collateral's liquidation threshold is unknown, there is no
// health payload and the note is price-only — which only a liquidation-ended
// stretch ever is, since an adjustment-ended one has nothing to be measured
// against and is never stated.

function aaveV4PriceGapBody(note: PriceGapNote, links: NoteLinks): NoteBody {
  const f = priceGapFigures(note);
  const h = note.health;
  const end = (point: MarketNotePoint, which: "earlier" | "later") => {
    if (which === "later" && note.live) {
      return (
        <>
          the later price: a live read of Aave&rsquo;s oracle (/api/oracle/aave-v4), at the chain head block{" "}
          {point.block.toLocaleString("en-US")} — not a row of this position&rsquo;s
        </>
      );
    }
    // A live note's earlier price is a read too — the same oracle pinned to
    // the row's block. The row is named because it is where the stretch starts,
    // not because the figure came off it.
    if (which === "earlier" && note.live) {
      return (
        <>
          the earlier price: the oracle read at block {point.block.toLocaleString("en-US")} (/api/oracle/aave-v4?block=
          {point.block}), the block of this position&rsquo;s {aaveV4EndLabel(point)}
          {observationLinks(point, links)}
        </>
      );
    }
    return (
      <>
        the {which} price: this position&rsquo;s {aaveV4EndLabel(point)} at block {point.block.toLocaleString("en-US")}
        {observationLinks(point, links)}
      </>
    );
  };
  // The regular card's grid is Collateral, Debt, the ratio and the borrow
  // rate. The note carries the moved asset's own leg and the basket's totals
  // at the earlier row, so the moved side states the asset's amount and its
  // value at each price, the other side states its total, and the ratio cell
  // is the health factor the note measures. The borrow rate is not on a note.
  const held: HeldSource = {
    recordedBy: `this position's ${aaveV4EndLabel(note.from)}`,
    atBlock: h?.atBlock ?? note.from.block,
  };
  const stats: NoteStat[] = [];
  if (h) {
    const leg = h.leg;
    const priceUnit = "USD";
    const priceText = (n: number) => formatPrice(n, priceDecimals(note));
    const legCell = (label: string): NoteStat | null => {
      if (!leg) return null;
      const vb = leg.amount * note.from.value;
      const va = leg.amount * note.to.value;
      const vd = separatingDecimals(vb, va, 0, 2);
      const amount = { label: leg.side === "collateral" ? "collateral" : "debt", value: `${leg.amount} ${leg.symbol}` };
      return {
        label,
        figure: {
          text: amountText(leg.amount),
          exact: String(leg.amount),
          symbol: leg.symbol,
          muted: true,
          prov: heldAmountProv(note, `${leg.symbol} ${amount.label}`, String(leg.amount), held),
        },
        values: {
          before: {
            text: `$${grouped(vb, vd)}`,
            exact: String(vb),
            prov: valueAtPriceProv(
              note,
              "before",
              amount,
              { value: priceText(note.from.value), unit: priceUnit },
              held,
            ),
          },
          after: {
            text: `$${grouped(va, vd)}`,
            exact: String(va),
            prov: valueAtPriceProv(note, "after", amount, { value: priceText(note.to.value), unit: priceUnit }, held),
          },
        },
      };
    };
    const totalCell = (label: string, what: string, usd: number | undefined): NoteStat | null =>
      usd == null
        ? null
        : {
            label,
            figure: {
              text: `$${grouped(usd, 0)}`,
              exact: String(usd),
              muted: true,
              prov: heldAmountProv(note, what, String(usd), held, {
                formula: "Σ amount × price, at the row's own prices",
                inputs: [
                  {
                    label: what,
                    value: String(usd),
                    kind: "chain-derived",
                    pclass: "oracle",
                    note: `every ${label.toLowerCase()} asset on the row at block ${h.atBlock}, at the price the row recorded for it`,
                  },
                ],
              }),
            },
          };
    const collateral =
      leg?.side === "collateral"
        ? legCell("Collateral")
        : totalCell("Collateral", "collateral value", h.collateralValueUsd);
    const debt = leg?.side === "debt" ? legCell("Debt") : totalCell("Debt", "debt value", h.debtUsd);
    if (collateral) stats.push(collateral);
    if (debt) stats.push(debt);
  }
  if (h && f.hfBefore && f.hfAfter) {
    stats.push({
      label: "Health Factor",
      transition: {
        before: { text: f.hfBefore, prov: aaveV4PriceGapHealthProv(note, "hfBefore"), exact: String(h.hfBefore) },
        after: { text: f.hfAfter, prov: aaveV4PriceGapHealthProv(note, "hfAfter"), exact: String(h.hfAfter) },
      },
      sub: {
        text: "liquidation at",
        figure: {
          text: AAVE_V4_LIQUIDATION_HF,
          prov: aaveV4PriceGapHealthProv(note, "minimum"),
          exact: AAVE_V4_LIQUIDATION_HF,
        },
      },
    });
  }
  const pd = separatingDecimals(note.from.value, note.to.value, 0, PRICE_DECIMALS_CAP);
  return {
    label: `${note.marketSymbol} oracle price`,
    measure: { kind: "usd" },
    quantity: "oracle price",
    headline: { text: f.changeMagnitude, prov: aaveV4PriceGapProv(note, "change"), exact: String(note.changePct) },
    // The step mark states the same two prices the stat card does, so it takes
    // the note's own grain rather than a default that could round them alike.
    format: notePriceFormat(note),
    intro: {
      lead: "Market fluctuation since the last event",
      ...(f.elapsed ? { elapsed: elapsedFigure(note, f.elapsed, aaveV4PriceGapProv(note, "elapsed")) } : {}),
    },
    chip: {
      before: {
        text: grouped(note.from.value, pd),
        prov: aaveV4PriceGapProv(note, "price"),
        exact: String(note.from.value),
      },
      after: {
        text: grouped(note.to.value, pd),
        prov: aaveV4PriceGapProv(note, "price"),
        exact: String(note.to.value),
      },
      symbol: note.marketSymbol,
      prefix: "$",
      title: `${note.marketSymbol} price at each end of the stretch (${note.unitLabel})`,
    },
    blocks: {
      before: { text: f.fromBlock, prov: aaveV4PriceGapProv(note, "blocks"), exact: String(note.from.block) },
      after: { text: f.toBlock, prov: aaveV4PriceGapProv(note, "blocks"), exact: String(note.to.block) },
    },
    stats,
    learnMore: marketNotePriceGapContent("aave-v4"),
    derivation: note.live ? (
      <>
        This is a LIVE note: {end(note.from, "earlier")}; {end(note.to, "later")}. It states one asset&rsquo;s price —
        this spoke position holds a basket, and each asset in it moves on its own feed. Shown whenever the position
        still holds {note.marketSymbol} as collateral against debt, whatever the move — nothing having moved is itself
        the fact this note states.
        {h && (
          <>
            {" "}
            The two health factors hold every amount, and every OTHER asset&rsquo;s price, as this position&rsquo;s own
            row recorded them at block{" "}
            <Prov info={aaveV4PriceGapHealthProv(note, "state")} value={String(h.atBlock)}>
              <span className="tabular-nums">{f.atBlock}</span>
            </Prov>{" "}
            and move only the {note.marketSymbol} price, so the later one is what that basket is worth NOW rather than a
            second reading; interest has kept accruing since. The threshold each collateral is weighted by is the one
            the spoke reports now — Aave V4 states no static per-reserve threshold, and the one in force at that block
            is not indexed.
          </>
        )}
      </>
    ) : (
      <>
        The price is not read for this note: every row on this position already carries the {note.marketSymbol} price
        Aave&rsquo;s own oracle answered at that row&rsquo;s block, and these are the two rows either side of the
        stretch — {end(note.from, "earlier")}, {end(note.to, "later")}. Nothing between them is drawn, because the
        position transacted nothing between them and the index states no price where it did not. The note is about one
        asset: this spoke position holds a basket, and each asset in it moves on its own feed.
        {note.endedBy === "liquidation" && (
          <>
            {" "}
            A stretch that ends in a liquidation is drawn whatever the move, and only for the asset that liquidation
            seized — {note.marketSymbol} here. It does not say the move caused the seizure: the debt side of the basket
            moves too.
          </>
        )}
        {h ? (
          <>
            {" "}
            The two health factors hold every amount, and every OTHER asset&rsquo;s price, as this position&rsquo;s own
            row recorded them at block{" "}
            <Prov info={aaveV4PriceGapHealthProv(note, "state")} value={String(h.atBlock)}>
              <span className="tabular-nums">{f.atBlock}</span>
            </Prov>{" "}
            and move only the {note.marketSymbol} price, so the later one is what that basket came to be worth rather
            than a second reading; interest kept accruing across the stretch. The threshold each collateral is weighted
            by is the one the spoke reports now — Aave V4 states no static per-reserve threshold, and the one in force
            at that block is not indexed. The stretch is stated because {priceGapReason(note)}.
          </>
        ) : (
          <>
            {" "}
            No health factor is stated: the earlier row&rsquo;s snapshot does not price every asset in the basket, so
            there is nothing to weigh this move against without inventing a figure.
          </>
        )}
      </>
    ),
  };
}

// ── Aave V3 and SparkLend: the seized asset's oracle price before a
//    liquidation ───────────────────────────────────────────────────────────
// A row here carries the price of the one reserve it touched, so the note is
// price-only and drawn only before a liquidation, for the asset it seized
// (lib/aave-v3/liquidation-price-notes.ts). The earlier end is this position's
// last row that touched that asset; rows touching other reserves can sit
// between the two ends, and the derivation says so.

function aaveFamilyPriceGapBody(note: PriceGapNote, links: NoteLinks): NoteBody {
  const f = priceGapFigures(note);
  const sym = note.marketSymbol;
  const rowNoun = note.protocol === "spark" ? "a SparkLend row" : "an Aave V3 row";
  // Price-only: a V3 row prices the reserve it touched and no other, so there
  // is no position state at the earlier row to draw the regular grid from.
  const stats: NoteStat[] = [];
  const pd = separatingDecimals(note.from.value, note.to.value, 0, PRICE_DECIMALS_CAP);
  return {
    label: `${sym} oracle price`,
    measure: { kind: "usd" },
    quantity: "oracle price",
    headline: { text: f.changeMagnitude, prov: aaveFamilyPriceGapProv(note, "change"), exact: String(note.changePct) },
    format: notePriceFormat(note),
    intro: {
      lead: `Market fluctuation since this position last touched ${sym}`,
      ...(f.elapsed ? { elapsed: elapsedFigure(note, f.elapsed, aaveFamilyPriceGapProv(note, "elapsed")) } : {}),
    },
    chip: {
      before: {
        text: grouped(note.from.value, pd),
        prov: aaveFamilyPriceGapProv(note, "price"),
        exact: String(note.from.value),
      },
      after: {
        text: grouped(note.to.value, pd),
        prov: aaveFamilyPriceGapProv(note, "price"),
        exact: String(note.to.value),
      },
      symbol: sym,
      prefix: "$",
      title: `${sym} price at each end of the stretch (${note.unitLabel})`,
    },
    blocks: {
      before: { text: f.fromBlock, prov: aaveFamilyPriceGapProv(note, "blocks"), exact: String(note.from.block) },
      after: { text: f.toBlock, prov: aaveFamilyPriceGapProv(note, "blocks"), exact: String(note.to.block) },
    },
    stats,
    learnMore: marketNotePriceGapContent(note.protocol === "spark" ? "spark" : "aave-v3"),
    derivation: (
      <>
        The price is not read for this note: each end is a row on this page that carries the {sym} price{" "}
        {aaveFamilyOracleOwner(note)} oracle answered at its block. The earlier price is this position&rsquo;s{" "}
        {aaveFamilyEndLabel(note.from)} at block {note.from.block.toLocaleString("en-US")}
        {observationLinks(note.from, links)}, its last row that touched {sym} before the liquidation; the later price is
        the liquidation at block {note.to.block.toLocaleString("en-US")}
        {observationLinks(note.to, links)}. This position did not touch {sym} between them. Rows between them, if any,
        touched other reserves: {rowNoun} carries the price of the reserve it touched and no other. A stretch that ends
        in a liquidation is drawn whatever the move, and only for the asset that liquidation seized. It does not say the
        move caused the seizure: the debt side and the rest of the account move too. No health factor is stated here,
        because the rest of the account is not priced at the earlier row&rsquo;s block.
        {note.protocol === "aave-v3" && (
          <> Opening the liquidation&rsquo;s card reads the account before and after it, health factor included.</>
        )}
      </>
    ),
  };
}

// ── Polaris: the market's own primary rate stepped between two of a CDP's
//    OWN touches ────────────────────────────────────────────────────────────
// Unlike the other two kinds, both ends here ARE this position's own events —
// the rate is already on the row (context.data.primaryRate), read at the
// market's last PrimaryRateSet at or before each touch.

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
      label: "Rate resets in between",
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
    quantity: "primary rate",
    ...liftTimeCells(stats),
    learnMore: marketNoteRateStepContent("polaris"),
    derivation: note.live ? (
      <>
        This is a LIVE note: the primary rate is the market&rsquo;s Peg Stability Rate — algorithmic, set on the
        market&rsquo;s own PSM mints and redemptions, never chosen by this CDP&rsquo;s holder. The earlier value is the
        rate in force at this CDP&rsquo;s own last touch; the later is the cdpManager&rsquo;s own rate read now —{" "}
        {observation("from")}, {observation("to")}. Shown whenever this CDP is open, whatever the move — nothing having
        moved is itself the fact this note states.
        {note.setsBetween != null && (
          <> The market has reset the rate {f.sets} times since this CDP&rsquo;s own last touch.</>
        )}
        {note.interest && (
          <>
            {" "}
            The interest figures hold this CDP&rsquo;s own debt at that touch fixed and move only the rate; the
            secondary, utilisation-driven rate is added on top by the protocol and is not on this log.
          </>
        )}
      </>
    ) : (
      <>
        The primary rate is the market&rsquo;s Peg Stability Rate — algorithmic, set on the market&rsquo;s own PSM mints
        and redemptions, never chosen by this CDP&rsquo;s holder. The two values are the rate in force at the two
        touches this note runs between — {observation("from")}, {observation("to")}.{" "}
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
            The market reset the rate {f.sets} times in between; nothing between the two touches is drawn, because
            nothing between them was observed on this CDP.{" "}
          </>
        )}
        A stretch is stated only where the primary rate moved at least one percentage point, and consecutive stretches
        that moved it the same way are stated as one.
        {note.interest && (
          <>
            {" "}
            The interest figures hold this CDP&rsquo;s own debt at the earlier touch fixed and move only the rate; the
            secondary, utilisation-driven rate is added on top by the protocol and is not on this log.
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
      label: "Stated over",
      figure: {
        text: `${f.steps} of the vault's touches`,
        prov: makerRateStepProv(note, "steps"),
        exact: String(note.steps),
      },
    });
  }
  if (f.sets && note.setsBetween != null) {
    stats.push({
      label: "Fee resets in between",
      figure: { text: f.sets, prov: makerRateStepProv(note, "sets"), exact: String(note.setsBetween) },
    });
  }
  if (note.interest && f.debt && f.before && f.after) {
    const interest = note.interest;
    stats.push({
      label:
        note.live && interest.atBlock === note.to.block
          ? "Yearly interest on today's debt"
          : `Yearly interest on the debt recorded at block ${f.fromBlock}`,
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
      lead: `Governance ${note.setsBetween != null && note.setsBetween > 1 ? `changed ${ilk}'s fee ${f.sets} times` : `changed ${ilk}'s fee`} since the vault's ${note.live ? "last event" : "previous event"}`,
    },
    learnMore: marketNoteRateStepContent("makerdao"),
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
        {note.steps != null && (
          <>The fee moved the same way across {f.steps} of the vault&rsquo;s touches, so they make one note. </>
        )}
        {note.live
          ? "Governance sets this fee for every vault of the type; the vault's owner did nothing to change it."
          : "A note appears where the fee moved at least one percentage point between two of the vault's touches."}
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
    intro: { lead: "Market fluctuation since the last event", ...(elapsed ? { elapsed } : {}) },
    ...(blocksCell?.transition ? { blocks: blocksCell.transition } : {}),
  };
}
