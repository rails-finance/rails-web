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
import { usePathname } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { InfoDisclosure } from "@/components/shared/info-disclosure";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatCard, StateTransition } from "@/components/shared/state-transition";
import { StepMark } from "@/components/shared/step-mark";
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
  formatShareRate,
  isAaveFamilyPriceGap,
  makerRateEndLabel,
  marketNoteFigures,
  noteElapsedSeconds,
  notePriceFormat,
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
}

/** One cell of the open panel: a single figure, or a before → after pair. */
interface NoteStat {
  label: string;
  figure?: NoteFigure;
  transition?: { before: NoteFigure; after: NoteFigure };
  /** A small receipted line under the value — "branch minimum 110%", "1
   *  minute between them" — for the figure that qualifies the card's own
   *  rather than deserving a card of its own. */
  sub?: { text: string; figure: NoteFigure };
}

/** The mark the asset was measured in, drawn overlapping the asset's own:
 *  the dollar for an oracle price, the protocol for a share rate. */
type MeasureMark = { kind: "usd" } | { kind: "protocol"; id: string };

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
  derivation: ReactNode;
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
}: {
  note: MarketNote;
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

  // The one switch. Everything below it is the same row whatever was observed.
  const body =
    note.kind === "price-gap"
      ? priceGapBody(note, links)
      : note.kind === "rate-step"
        ? rateStepBody(note, links)
        : note.kind === "vault-terms"
          ? vaultTermsBody(note, links)
          : shareRateBody(note, links);

  return (
    <NoteRowShell
      icon="market"
      isFirst={isFirst}
      isLast={isLast}
      label={body.label}
      marker={{ attr: "data-market-note", value: note.id }}
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
        </>
      }
    >
      <div className="grid grid-cols-1 gap-2.5 px-5 py-2 sm:auto-rows-fr sm:grid-cols-2">
        {body.stats.map((s) => (
          <div key={s.label} className="h-full">
            <StatCard label={s.label}>
              <StateTransition>
                {s.transition ? (
                  <>
                    <Figure figure={s.transition.before} className="text-sm font-semibold" />
                    <span className="text-rb-400 dark:text-rb-500" aria-hidden="true">
                      →
                    </span>
                    <Figure figure={s.transition.after} className="text-sm font-semibold" />
                  </>
                ) : (
                  s.figure && <Figure figure={s.figure} className="text-sm font-semibold" />
                )}
              </StateTransition>
              {s.sub && (
                <div className="mt-1 flex items-center gap-1 text-xs text-rb-500">
                  <span>{s.sub.text}</span>
                  <Figure figure={s.sub.figure} className="text-xs font-medium" />
                </div>
              )}
            </StatCard>
          </div>
        ))}
      </div>
      <div className="px-4 pb-3 pt-1">
        <InfoDisclosure
          label="how this note was derived"
          rowExtra={
            <span className="ml-auto">
              <LearnMore inline content={body.learnMore} />
            </span>
          }
        >
          <p className="text-xs leading-relaxed text-rb-500">{body.derivation}</p>
        </InfoDisclosure>
      </div>
    </NoteRowShell>
  );
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
      <span className={`tabular-nums text-foreground ${className}`}>{figure.text}</span>
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
  const stats: NoteStat[] = [
    {
      label: `Share rate (${note.unitLabel})`,
      transition: {
        before: { text: f.fromRate, prov: shareRateStepProv(note, "rate"), exact: String(note.from.value) },
        after: { text: f.toRate, prov: shareRateStepProv(note, "rate"), exact: String(note.to.value) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: shareRateStepProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: shareRateStepProv(note, "blocks"), exact: String(note.to.block) },
      },
      ...(f.elapsed
        ? { sub: { text: "elapsed", figure: elapsedFigure(note, f.elapsed, shareRateStepProv(note, "elapsed")) } }
        : {}),
    },
  ];
  if (note.slice && f.units && f.before && f.after) {
    const s = note.slice;
    stats.push(
      {
        label: note.live ? "This account holds" : "This account held",
        figure: {
          text: f.units,
          prov: shareRateSliceProv(note, "units"),
          exact: String(s.units),
          symbol: s.unitSymbol,
          iconAs: s.valueSymbol,
        },
      },
      {
        label: "Worth",
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
  return {
    label: `${note.marketSymbol} share rate`,
    measure: { kind: "protocol", id: "moonwell" },
    headline: { text: f.ratio, prov: shareRateStepProv(note, "ratio"), exact: String(note.ratio) },
    quantity: "share rate",
    format: formatShareRate,
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

function priceGapBody(note: PriceGapNote, links: NoteLinks): NoteBody {
  // Aave V4's basket is a different position shape, not a different kind: one
  // note per ASSET, and a health factor over the whole basket where the other
  // two homes state one collateral ratio. Its own body below.
  if (note.protocol === "aave-v4") return aaveV4PriceGapBody(note, links);
  if (isAaveFamilyPriceGap(note)) return aaveFamilyPriceGapBody(note, links);
  const f = priceGapFigures(note);
  const p = note.position;
  const isPolaris = note.measureKind === "protocol";
  const endLabel = isPolaris ? polarisEndLabel : priceGapEndLabel;
  const positionNoun = isPolaris ? "CDP" : "trove";
  const feedNoun = isPolaris ? "the market's own price feed" : "Liquity&rsquo;s own PriceFeed";
  const minimumLabel = isPolaris ? "the market's normal-mode minimum" : "branch minimum";
  const priceProv = isPolaris ? polarisPriceGapProv : priceGapProv;
  const positionProv = isPolaris ? polarisPriceGapPositionProv : priceGapPositionProv;
  const end = (point: MarketNotePoint, which: "earlier" | "later") => {
    if (which === "later" && note.live) {
      const liveNoun = isPolaris ? "the market's own price feed, read live" : "the backend's live oracle read";
      return (
        <>
          the later price: {liveNoun}, at the chain head block {point.block.toLocaleString("en-US")} — not a{" "}
          {positionNoun} event
        </>
      );
    }
    return (
      <>
        the {which} price: this {positionNoun}&rsquo;s {endLabel(point)} at block {point.block.toLocaleString("en-US")}
        {observationLinks(point, links)}
      </>
    );
  };
  const stats: NoteStat[] = [
    {
      label: `Oracle price (${note.unitLabel})`,
      transition: {
        before: { text: f.fromPrice, prov: priceProv(note, "price"), exact: String(note.from.value) },
        after: { text: f.toPrice, prov: priceProv(note, "price"), exact: String(note.to.value) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: priceProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: priceProv(note, "blocks"), exact: String(note.to.block) },
      },
    },
  ];
  if (p && f.crBefore && f.crAfter && f.mcr && f.atBlock) {
    stats.push({
      label: "Collateral ratio at each price",
      transition: {
        before: { text: f.crBefore, prov: positionProv(note, "crBefore"), exact: String(p.crBefore) },
        after: { text: f.crAfter, prov: positionProv(note, "crAfter"), exact: String(p.crAfter) },
      },
      sub: {
        text: minimumLabel,
        figure: { text: f.mcr, prov: positionProv(note, "mcr"), exact: String(p.mcrPct) },
      },
    });
  }
  if (f.elapsed) {
    stats.push({ label: "Elapsed", figure: elapsedFigure(note, f.elapsed, priceProv(note, "elapsed")) });
  }
  return {
    label: `${note.marketSymbol} oracle price`,
    measure: isPolaris ? { kind: "protocol", id: note.measureProtocolId ?? "polaris" } : { kind: "usd" },
    quantity: "oracle price",
    headline: { text: f.changeMagnitude, prov: priceProv(note, "change"), exact: String(note.changePct) },
    // The step mark states the same two prices the stat card does, so it takes
    // the note's own grain rather than a default that could round them alike.
    format: notePriceFormat(note),
    stats,
    learnMore: marketNotePriceGapContent(),
    derivation: note.live ? (
      <>
        This is a LIVE note: {end(note.from, "earlier")}; {end(note.to, "later")}. Shown whenever this {positionNoun} is
        open, whatever the move — nothing having moved is itself the fact this note states.
        {p && (
          <>
            {" "}
            The two ratios hold the debt and collateral the earlier event recorded at block{" "}
            <Prov info={positionProv(note, "state")} value={String(p.atBlock)}>
              <span className="tabular-nums">{f.atBlock}</span>
            </Prov>{" "}
            fixed and move only the price, so the later one is what that state is worth NOW rather than a second
            reading; interest has kept accruing since.
            {!isPolaris && <> The position card&rsquo;s live ratio also carries the interest accrued since then.</>}
            {isPolaris && (
              <>
                {" "}
                The minimum named here is always the market&rsquo;s own normal-mode MCR() — a defensive-mode minimum can
                be in force at a past block, but it is not indexed.
              </>
            )}
          </>
        )}
      </>
    ) : (
      <>
        The price is not read for this note: every event on this {positionNoun} already carries the {note.marketSymbol}{" "}
        price {feedNoun} stated at that event&rsquo;s block, and these are the two events either side of the stretch —{" "}
        {end(note.from, "earlier")}, {end(note.to, "later")}. Nothing between them is drawn, because the {positionNoun}{" "}
        transacted nothing between them and the index states no price where it did not.
        {p && (
          <>
            {" "}
            The two ratios hold the debt and collateral the earlier event recorded at block{" "}
            <Prov info={positionProv(note, "state")} value={String(p.atBlock)}>
              <span className="tabular-nums">{f.atBlock}</span>
            </Prov>{" "}
            and move only the price, so the later one is what that state came to be worth rather than a second reading;
            interest kept accruing across the stretch.
            {isPolaris && (
              <>
                {" "}
                The minimum named here is always the market&rsquo;s own normal-mode MCR() — a defensive-mode minimum can
                be in force at a past block, but it is not indexed.
              </>
            )}{" "}
            The stretch is stated because {priceGapReason(note)}.
          </>
        )}
      </>
    ),
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
  const stats: NoteStat[] = [
    {
      label: `Oracle price (${note.unitLabel})`,
      transition: {
        before: { text: f.fromPrice, prov: aaveV4PriceGapProv(note, "price"), exact: String(note.from.value) },
        after: { text: f.toPrice, prov: aaveV4PriceGapProv(note, "price"), exact: String(note.to.value) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: aaveV4PriceGapProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: aaveV4PriceGapProv(note, "blocks"), exact: String(note.to.block) },
      },
    },
  ];
  if (h && f.hfBefore && f.hfAfter) {
    stats.push({
      label: "Health factor at each price",
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
  if (f.elapsed) {
    stats.push({ label: "Elapsed", figure: elapsedFigure(note, f.elapsed, aaveV4PriceGapProv(note, "elapsed")) });
  }
  return {
    label: `${note.marketSymbol} oracle price`,
    measure: { kind: "usd" },
    quantity: "oracle price",
    headline: { text: f.changeMagnitude, prov: aaveV4PriceGapProv(note, "change"), exact: String(note.changePct) },
    // The step mark states the same two prices the stat card does, so it takes
    // the note's own grain rather than a default that could round them alike.
    format: notePriceFormat(note),
    stats,
    learnMore: marketNotePriceGapContent(),
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
  const stats: NoteStat[] = [
    {
      label: `Oracle price (${note.unitLabel})`,
      transition: {
        before: { text: f.fromPrice, prov: aaveFamilyPriceGapProv(note, "price"), exact: String(note.from.value) },
        after: { text: f.toPrice, prov: aaveFamilyPriceGapProv(note, "price"), exact: String(note.to.value) },
      },
    },
    {
      label: "Blocks",
      transition: {
        before: { text: f.fromBlock, prov: aaveFamilyPriceGapProv(note, "blocks"), exact: String(note.from.block) },
        after: { text: f.toBlock, prov: aaveFamilyPriceGapProv(note, "blocks"), exact: String(note.to.block) },
      },
    },
  ];
  if (f.elapsed) {
    stats.push({ label: "Elapsed", figure: elapsedFigure(note, f.elapsed, aaveFamilyPriceGapProv(note, "elapsed")) });
  }
  return {
    label: `${sym} oracle price`,
    measure: { kind: "usd" },
    quantity: "oracle price",
    headline: { text: f.changeMagnitude, prov: aaveFamilyPriceGapProv(note, "change"), exact: String(note.changePct) },
    format: notePriceFormat(note),
    stats,
    learnMore: marketNotePriceGapContent(),
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
      sub: { text: "moved", figure: { text: f.delta, prov: rateStepProv(note, "delta"), exact: String(note.deltaPp) } },
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
    stats,
    learnMore: marketNoteRateStepContent(),
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
            between, and a run of steps one after another in one direction is one thing happening to this position
            rather than {f.steps} — so it is stated as one stretch, and the receipt lists each step it took in. A step
            the other way ends the run and begins the next note.{" "}
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

  /** One end of the step: the vault's own touch, and the drip the fee in force
   *  at it was first evidenced by. Nobody "fired" that drip in a sense that
   *  touches this vault — a drip is a keeper call anyone may make, and the duty
   *  it compounds at is governance's — so the row offers only the explorer link
   *  for it and never implies a party. */
  const observation = (which: "from" | "to") => {
    const p = which === "from" ? note.from : note.to;
    if (which === "to" && note.live) {
      return (
        <>
          now: the Jug&rsquo;s own base + duty for this ilk, compounded over a year and read live at block{" "}
          {p.block.toLocaleString("en-US")} — not a drip
        </>
      );
    }
    const o = which === "from" ? note.observed.from : note.observed.to;
    if (!o) {
      return (
        <>
          {makerRateEndLabel(p)}: this vault&rsquo;s own touch at block {p.block.toLocaleString("en-US")}
          {observationLinks(p, links)}
        </>
      );
    }
    const dripPoint: MarketNotePoint = {
      block: o.block,
      timestamp: o.timestamp,
      value: p.value,
      txHash: o.txHash,
      logIndex: o.logIndex,
      wallet: o.txFrom,
      kind: "drip",
    };
    return (
      <>
        {makerRateEndLabel(p)}: the first Jug.drip at that fee, block {o.block.toLocaleString("en-US")}
        {observationLinks(dripPoint, links)}
      </>
    );
  };

  const stats: NoteStat[] = [
    {
      label: "Stability fee (% per year)",
      transition: {
        before: { text: f.fromRate, prov: makerRateStepProv(note, "rate"), exact: String(note.from.value) },
        after: { text: f.toRate, prov: makerRateStepProv(note, "rate"), exact: String(note.to.value) },
      },
      sub: {
        text: "moved",
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
      label: `Yearly interest on the debt recorded at block ${f.fromBlock}`,
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

  return {
    label: `${ilk} stability fee`,
    measure: { kind: "protocol", id: "makerdao" },
    headline: { text: f.toRate, prov: makerRateStepProv(note, "rate"), exact: String(note.to.value) },
    quantity: "stability fee",
    stats,
    learnMore: marketNoteRateStepContent(),
    derivation: note.live ? (
      <>
        This is a LIVE note: the {ilk} stability fee is governance&rsquo;s own duty on the Jug — nobody borrowing in
        this ilk chooses it. The earlier value is the fee in force at this vault&rsquo;s own last touch, the later one
        the Jug&rsquo;s base + duty read now and compounded over a year — {observation("from")}, {observation("to")}.
        Both ends are the same quantity, reached two ways. Shown whenever this vault is open, whatever the move —
        nothing having moved is itself the fact this note states.
        {note.interest && (
          <>
            {" "}
            The interest figures hold this vault&rsquo;s own {debtSymbol} debt at that touch fixed and move only the
            fee; interest actually charged compounds continuously into the ilk&rsquo;s rate accumulator and settles on
            the vault&rsquo;s own next touch.
          </>
        )}
      </>
    ) : (
      <>
        MakerDAO states no stability fee anywhere a row can carry it: governance files a duty on the Jug, and the
        spell&rsquo;s own block is not indexed. What the index holds is the Vat&rsquo;s rate accumulator moving — every
        Jug.drip applies <span className="whitespace-nowrap">rate_delta = rate_before × (duty^Δt − 1)</span>, so the fee
        a drip compounded at falls out of its own delta and the seconds since the ilk&rsquo;s previous drip. The fee in
        force at a touch is therefore the ilk&rsquo;s last rate SET at or before it — the first drip at a new fee, which
        is the earliest observable moment of a governance change — and every set is CONFIRMED by reading the Jug&rsquo;s
        duty at that drip&rsquo;s own block before it is stated. The two values here are the fees in force at this
        vault&rsquo;s own two touches — {observation("from")}, {observation("to")}.{" "}
        {note.steps != null && (
          <>
            Those two ends are {f.steps} of this vault&rsquo;s touches apart: the fee moved the same way at every step
            in between, and a run of steps one after another in one direction is one thing happening to this vault
            rather than {f.steps} — so it is stated as one stretch, and the receipt lists each step it took in. A step
            the other way ends the run and begins the next note.{" "}
          </>
        )}
        {note.setsBetween != null && note.setsBetween > 0 && (
          <>
            Governance reset the fee {f.sets} {note.setsBetween === 1 ? "time" : "times"} in between; nothing between
            the two touches is drawn, because nothing between them was observed on this vault.{" "}
          </>
        )}
        A stretch is stated only where the fee moved at least one percentage point.
        {note.interest && (
          <>
            {" "}
            The interest figures hold this vault&rsquo;s own {debtSymbol} debt at the earlier touch fixed — its
            normalized art valued at the rate accumulator in force at that block — and move only the fee.
          </>
        )}
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
      label: `Yearly interest on the ${isSupply ? "supply" : "debt"} recorded at block ${f.fromBlock}`,
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
    stats,
    learnMore: marketNoteRateStepContent(),
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
