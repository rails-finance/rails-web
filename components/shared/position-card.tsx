"use client";

// The position card: one shell every family's card renders through (rails-ops
// TO-DO-position-card 322, ui-jobs 307), on the pattern of the event card's
// `EventCardSlots` (309). The shell owns the frame, the "Position summary"
// heading, the status tag, the ⋮ and its rows, the headline grid, the panel,
// the (i) row with its "?" and the counters, and the receipts scope. A family
// builds one `PositionCardSlots` object (Liquity's `useLiquityCardSlots` in
// components/protocol/liquity-family/liquity-position-card.tsx) and nothing
// else: it supplies figures and words, never which parts exist or where they
// sit.
//
// Two surfaces. `detail` (the position page) is a receipts scope with the
// heading, the ⋮, the panel, the (i), the "?" and the counters at the foot.
// `listing` is inert content inside a row <Link>: the headlines, the lifecycle
// pill and the family's listing ⋮, with no heading, panel or (i) (324), and
// the counters (recency, counts) together at the card's bottom right.
//
// A card is open or closed by its slots: a closed card carries `outcome` (its
// peaks as `heads`, the Outcome column, and a panel only for lines with no
// head); an open detail card carries `panel`.
//
// The listing branch is the one place in the app where <Prov> is meant to
// trace nothing, and the figures cannot tell which render they are in. The
// shell knows, so it declares it: <ProvUnscoped> keeps the dev unscoped-<Prov>
// warning quiet for listing rows and loud everywhere else.
//
// Hooks for the verifiers: the frame keeps `data-anatomy="P1 C1"` (`C1` on a listing card),
// `data-skel-section` and `data-prov-scope="position-card"`, and adds
// `data-position-card-shell` and `data-card-status` (and, outside production,
// `data-card-over-cap` on a card past the caps); each headline keeps
// `data-card-row=<i>` and adds `data-card-head=<id>`; the counters carry
// `data-card-counters`, inside a listing card's `data-card-foot`.

import { useContext, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { AssetBreakdownPanel, type AssetBreakdown } from "@/components/shared/asset-donut";
import { QuietTipsContext, RevealTip } from "@/components/shared/reveal-tip";
import { PositionCardEdgeContext } from "@/components/shared/position-card-edge";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { formatUsdValue } from "@/lib/utils/format";
import { OVERLAY_HEADING, POSITION_CARD_FRAME, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  POSITION_CARD_SCOPE,
  Prov,
  ProvInert,
  ProvReceiptsScope,
  ProvUnscoped,
  type Provenance,
  useProvScopeLit,
  useReceiptRegistry,
} from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  POSITION_CARD_MAX_HEADS,
  POSITION_CARD_MAX_STATS,
  PositionCardPanel,
  type PositionPanelColumns,
} from "@/components/shared/position-card-panel";
import { PositionCardMeta, type PositionCardMetaProps } from "@/components/shared/position-card-meta";
import { RowHelp } from "@/components/shared/row-help";
import { HeadingTip, TipLabel } from "@/components/shared/tip-label";
import { StatDash, StatValue } from "@/components/shared/stat-value";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { ExportMenu, type ExportMenuProps } from "@/components/shared/export-menu";
import { formatDate } from "@/lib/date";

export type { PositionPanelRow, PositionPanelColumns } from "@/components/shared/position-card-panel";

/** The status tag's colour: `muted` for an ending the owner chose or a
 *  dormant state (Closed, Zombie, Repaid, Expired, Denied), `danger` for a
 *  forced exit (Liquidated, Defaulted), `caution` for an ending a third party
 *  forced without a loss (Redeemed, Unsettled). */
export type PositionCardTone = "muted" | "danger" | "caution";

/** A position that is not plainly live: the word on the tag, and its tone. */
export interface PositionCardStatus {
  word: string;
  tone: PositionCardTone;
  /** The tag's read-more: a "?" after the tag on a detail card, drawn as a
   *  panel row's is. */
  tip?: string;
}

/** One headline figure. */
export interface PositionCardHead {
  /** The headline's name: its React key and `data-card-head`. */
  id: string;
  label: string;
  /** What the label means, on hover or tap (a dotted underline). */
  labelTip?: string;
  /** Keep `labelTip` on a listing card, where tips are otherwise quiet: a
   *  headline whose label needs its meaning in the row (Polaris's estimated
   *  ratio). */
  labelTipOnListing?: boolean;
  /** An icon after the label. The closed card's peaks carry their asset here
   *  (Liquity V2's closed face); an open headline puts it in `assets`. */
  labelIcon?: ReactNode;
  /** The large figure, drawn in the card's figure type. The family keeps its
   *  `Prov`, `FadeNumber` and `HighlightableValue` inside it. `null` draws a
   *  dash. */
  value: ReactNode | null;
  /** The figure waits on a live read: a pulsing bar stands where it lands. */
  pending?: boolean;
  /** The asset icon cluster beside the figure (its `AssetPopover`). */
  assets?: ReactNode;
  /** The line beneath the figure: its USD value, green for a live position and
   *  muted for a historic one (the node carries the colour). `null` keeps the
   *  line's height with nothing in it (unpriced), so the row stays level;
   *  absent draws no line, as on a figure already in USD. */
  usd?: ReactNode | null;
  /** A short third line in the muted label colour: the batch manager under
   *  Interest rate, "interest-free". */
  sub?: ReactNode;
  /** A side of two or more assets: on a detail card the donut button after
   *  the icon cluster opens their breakdown in a popover (a bottom sheet on
   *  a phone), one side at a time (`asset-donut.tsx`). */
  breakdown?: AssetBreakdown;
  /** The side's USD total and its receipt: the breakdown's heading states it
   *  exact, and carries the receipt the headline (inside the button) cannot. */
  total?: { usd: number; info: Provenance };
}

/** The (i) Explanation at the foot of a detail card. */
export interface PositionCardExplainer {
  /** The pane's prose; `null` draws no (i). */
  body: ReactNode | null;
  /** Open the pane on mount (a surface that remembers it). */
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** The pane's copy-this-view link. */
  viewHref?: () => string;
}

/** The export shapes on the card's ⋮: Copy Position, View as Markdown,
 *  Download CSV (`ExportMenu`'s props). */
export type PositionCardExports = Omit<ExportMenuProps, "variant" | "leading">;

/** The detail card's ⋮. The shell draws the family's identity rows first
 *  (`leading`: the position ID with copy, its NFT, the link to its page), then
 *  the export shapes, then Show or Hide provenance for the card. With no
 *  exports the ⋮ holds the identity rows and the provenance row. */
export interface PositionCardMenu {
  leading?: (close: () => void) => ReactNode;
  exports?: PositionCardExports | null;
}

/** A closed position's Outcome column, beside its peaks. */
export interface PositionCardOutcome {
  /** "Closed", "Liquidated", "Fully redeemed"; coloured by the status tone. */
  word: string;
  /** Dated lines under the word; a line with no label is the date alone. */
  dates?: { label?: string; at: number }[];
  /** A line under the dates (a liquidated Trove's claimable surplus). */
  footnote?: ReactNode;
  /** A fourth column ("Time open", "Surplus to claim"). */
  extra?: { label: string; value: ReactNode };
  /** What the ending means: a "?" after the Outcome label on a detail card,
   *  drawn as a panel row's is. */
  tip?: string;
}

/** The activity counters, and `extra`: a badge after the counts (Frankencoin's
 *  challenge marker on its listing). */
export type PositionCardCounters = PositionCardMetaProps & { extra?: ReactNode };

/** What both surfaces take. */
interface PositionCardSlotsCommon {
  /** `null` for a live position, else the tag (detail) or the lifecycle
   *  pill's word (listing). A live listing card shows OPEN. */
  status: PositionCardStatus | null;
  /** 1 to 4 headlines, left to right, on a grid of four at lg, two below it,
   *  one on a phone. A closed card passes its peaks. */
  heads: PositionCardHead[];
  /** Labels that carry information (270 item 6: Aave's market, Fluid's
   *  type, the testnet marker; the owner on a listing). Detail draws them at
   *  the right end of the heading row; listing after the pill, as Liquity
   *  V2's listing draws its owner. */
  identity?: ReactNode;
  /** A line above the headlines that stays in view: a deprecation banner, a
   *  running challenge, a refused reason. */
  notice?: ReactNode;
  /** The activity counters (age, transactions, liquidations, redemptions).
   *  Detail draws them at the right of the (i) row, listing at the right of
   *  the heading row. `null` where a card has none. */
  counters: PositionCardCounters | null;
}

interface PositionCardDetailCommon extends PositionCardSlotsCommon {
  surface: "detail";
  /** The heading's noun phrase; absent, "Position summary" (the vault card's
   *  "Vault summary", survey 2026-10-20 §7.4). */
  heading?: string;
  explainer: PositionCardExplainer;
  /** The "?" beside the (i) pane's foot, or `null`. */
  learnMore: LearnMoreContent | null;
  /** The ⋮; `null` draws none (an inert embed such as the home hero). */
  menu: PositionCardMenu | null;
  /** A full-width strip beneath the panel (Morpho Base's allocation band). */
  band?: ReactNode;
  /** A card-specific line at the foot, above the (i) row (a loading status,
   *  a block stamp). */
  foot?: ReactNode;
}

/** An open position on its page: the panel is required (empty columns draw
 *  nothing). */
interface PositionCardDetailOpen extends PositionCardDetailCommon {
  panel: PositionPanelColumns;
  outcome?: undefined;
}

/** A closed position on its page: peaks and Outcome. `panel` is optional
 *  here, for the lines that have no head (SparkLend's not-collateral peaks,
 *  f(x)'s reconciliation rows); it draws beneath the peaks. */
interface PositionCardDetailClosed extends PositionCardDetailCommon {
  outcome: PositionCardOutcome;
  panel?: PositionPanelColumns;
}

/** A row of a listing. */
export interface PositionCardListingSlots extends PositionCardSlotsCommon {
  surface: "listing";
  /** A listing ⋮, or `null`. Every family passes `null`: the listing card is
   *  one link and its position's actions live in the page's ⋮ (Miles,
   *  17 Oct 2026). A menu here must stop a press from reaching the <Link>. */
  menu: ReactNode | null;
  /** The position's market and ID, at the right end of the heading row (where
   *  a detail card draws its identity); `identity` keeps the holder on the left. */
  tag?: ReactNode;
  /** Present on a closed position. */
  outcome?: PositionCardOutcome;
  /** What stands where the lifecycle pill does, on a row that is not a
   *  position (the vault row, V1: its asset and venue mark). Absent, the pill. */
  lead?: ReactNode;
  /** The frame's `data-anatomy` code; absent, `C1`. */
  anatomy?: string;
}

export type PositionCardDetailSlots = PositionCardDetailOpen | PositionCardDetailClosed;
export type PositionCardSlots = PositionCardDetailSlots | PositionCardListingSlots;

const TAG_TONE: Record<PositionCardTone, string> = {
  muted: "bg-rb-300 dark:bg-rb-700 text-foreground/70",
  danger: "bg-red-500/20 text-red-500",
  caution: "bg-caution-500/20 text-tone-caution",
};
const OUTCOME_TONE: Record<PositionCardTone, string> = {
  muted: "text-rb-500",
  danger: "text-red-400",
  caution: "text-tone-caution",
};

// The headlines sit in one strict grid whatever their number (decision 0040):
// four columns at lg, two below it down to a phone. A card of three leaves the
// fourth cell empty, so headline figures line up across every family.
const OPEN_GRID = "grid grid-cols-2 lg:grid-cols-4 gap-4";
// A closed card is four columns wide (peaks, Outcome, the extra) so cards in
// a stack line up.
const CLOSED_GRID = "grid grid-cols-2 sm:grid-cols-4 gap-4";

/** The "Position summary" heading at the left of a detail card's heading row. */
function PositionSummaryTitle({ text = "Position summary" }: { text?: string }) {
  return (
    <h2 className={`${SECTION_HEADING} text-rb-500`} data-position-summary="">
      {text}
    </h2>
  );
}

/** One headline: its label, then the figure and the lines under it. */
function PositionCardRow({
  index,
  head,
  label,
  labelTip,
  headerIcon,
  help,
  explain,
  className,
  style,
  children,
}: {
  index: number;
  /** The headline's name (`data-card-head`). */
  head: string;
  label: string;
  labelTip?: string;
  headerIcon?: ReactNode;
  /** A "?" read-more after the label (the Outcome's `tip`). */
  help?: string;
  /** A detail card: the label itself opens its read-more. */
  explain?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className ?? ""}`} style={style} data-card-row={index} data-card-head={head}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rb-500">
        {explain ? (
          <HeadingTip text={label} tip={labelTip ?? help} />
        ) : (
          // A listing passes a labelTip only where the head keeps it.
          <QuietTipsContext.Provider value={false}>
            <TipLabel text={label} tip={labelTip} />
          </QuietTipsContext.Provider>
        )}
        {headerIcon}
        {help && !explain && <RowHelp tip={help} name={label} />}
      </div>
      {children}
    </div>
  );
}

/** The small tag at the left of a detail card's heading row, with its "?". */
function StatusTag({ status }: { status: PositionCardStatus }) {
  return (
    <span className="inline-flex items-center">
      <span className={`rounded-xs px-1.5 py-0.5 text-[11px] font-semibold ${TAG_TONE[status.tone]}`} data-anatomy="C6">
        {status.word}
      </span>
      {status.tip && <RowHelp tip={status.tip} name={status.word} />}
    </span>
  );
}

const OPEN_PILL = "bg-positive/20 text-positive";

/** The listing's lifecycle pill: OPEN for a live position, else the status
 *  word in capitals. On the wallet view an open position draws none, AT RISK
 *  excepted (`PositionCardEdge`). */
function ListingPill({ status }: { status: PositionCardStatus | null }) {
  const edge = useContext(PositionCardEdgeContext);
  if (!status && edge?.atRisk)
    return (
      <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${TAG_TONE.caution}`} data-anatomy="C6">
        AT RISK
      </span>
    );
  if (!status && edge?.surface === "wallet") return null;
  return (
    <span
      className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${status ? TAG_TONE[status.tone] : OPEN_PILL}`}
      data-anatomy="C6"
    >
      {status ? status.word.toUpperCase() : "OPEN"}
    </span>
  );
}

function HeadBody({
  head,
  toggle,
}: {
  head: PositionCardHead;
  /** The breakdown's button, where the side has one on a detail card. */
  toggle?: {
    open: boolean;
    panelId: string;
    onToggle: () => void;
    buttonRef: (el: HTMLButtonElement | null) => void;
  };
}) {
  // The figure, the side's icons and "+N" as one button: it opens the
  // breakdown. The figure inside keeps its receipt row but takes no click
  // and no tip; the breakdown's heading carries both.
  const trigger = toggle && (
    <button
      ref={toggle.buttonRef}
      type="button"
      onClick={(e) => {
        // The card can be a link: the press is the button's alone.
        e.preventDefault();
        e.stopPropagation();
        toggle.onToggle();
      }}
      aria-haspopup="dialog"
      aria-expanded={toggle.open}
      aria-controls={toggle.open ? toggle.panelId : undefined}
      aria-label={[
        head.total ? `${head.label} ${formatUsdValue(head.total.usd)}` : head.label,
        head.breakdown ? `${head.breakdown.assets.length} assets` : null,
        "show breakdown",
      ]
        .filter(Boolean)
        .join(", ")}
      className={`-mx-1.5 -my-1 flex cursor-pointer flex-wrap items-center gap-x-1.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-rb-200/70 focus-ring dark:hover:bg-rb-700/60 ${toggle.open ? "bg-rb-200/70 dark:bg-rb-700/60" : ""}`}
      data-card-assets-toggle={head.id}
      data-anatomy="C19"
    >
      <QuietTipsContext.Provider value={true}>
        <ProvInert>{head.value}</ProvInert>
        <span className="inline-flex shrink-0 items-center">{head.assets}</span>
      </QuietTipsContext.Provider>
    </button>
  );
  return (
    <>
      {head.pending ? (
        <div className="h-9 w-20 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse mt-2" />
      ) : head.value == null ? (
        <StatDash />
      ) : (
        <StatValue>
          {trigger ? (
            trigger
          ) : head.assets ? (
            // Wraps inside the column: a long figure puts its icons on the
            // next line rather than push the page out at 390 (ui-jobs 361).
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              {head.value}
              {/* shrink-0: a long figure must never squeeze the icon away. */}
              <span className="inline-flex shrink-0 items-center">{head.assets}</span>
            </span>
          ) : (
            head.value
          )}
        </StatValue>
      )}
      {head.usd !== undefined && (
        <div className="text-xs mt-0.5 min-h-[1rem] tabular-nums" data-card-usd="">
          {head.usd}
        </div>
      )}
      {head.sub != null && (
        <div className="text-xs mt-0.5 min-h-[1rem] text-rb-500" data-card-sub="">
          {head.sub}
        </div>
      )}
    </>
  );
}

function OpenGrid({ heads, detail }: { heads: PositionCardHead[]; detail: boolean }) {
  // The breakdowns: the donut button opens its side's in a popover anchored
  // to it (a bottom sheet on a phone), one side at a time; the card keeps
  // its shape.
  const [open, setOpen] = useState<string | null>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelId = useId();
  const sideOf = (h: PositionCardHead) => (h.id === "debt" ? "debt" : "collateral");
  const has = (h: PositionCardHead) => detail && !!h.breakdown && h.breakdown.assets.length > 1;
  const toggleOf = (h: PositionCardHead) =>
    has(h)
      ? {
          open: open === h.id,
          panelId: `${panelId}-${h.id}`,
          onToggle: () => setOpen((o) => (o === h.id ? null : h.id)),
          buttonRef: (el: HTMLButtonElement | null) => {
            buttons.current[h.id] = el;
          },
        }
      : undefined;
  const openHead = heads.find((h) => h.id === open && has(h));
  const close = (refocus: boolean) => {
    const id = open;
    setOpen(null);
    if (refocus && id) buttons.current[id]?.focus();
  };
  const exact = formatUsdValue;
  const title = openHead ? (openHead.total ? `${openHead.label} ${exact(openHead.total.usd)}` : openHead.label) : "";
  return (
    <>
      <div className={OPEN_GRID} data-anatomy="C10">
        {heads.map((h, i) => (
          <PositionCardRow
            key={h.id}
            index={i}
            head={h.id}
            label={h.label}
            labelTip={detail || h.labelTipOnListing ? h.labelTip : undefined}
            headerIcon={h.labelIcon}
            explain={detail}
          >
            <HeadBody head={h} toggle={toggleOf(h)} />
          </PositionCardRow>
        ))}
      </div>
      {openHead?.breakdown && (
        // The overlay renders in a portal, but its events still pass through
        // the card's React handlers: this stops them here.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <AnchoredPanel
            id={`${panelId}-${openHead.id}`}
            label={title}
            anchor={() => buttons.current[openHead.id] ?? null}
            onClose={() => close(true)}
            fit={420}
            drop
            name="breakdown-panel"
            // The slices grade toward the overlay's ground.
            surface="overlay"
            className="[--donut-ground:var(--surface-overlay)] max-sm:[--donut-ground:var(--surface-raised)] dark:[--donut-ground:var(--color-rb-900)]"
          >
            <p className="mb-3 flex items-baseline gap-2 pr-8 sm:pr-0" data-breakdown-heading="">
              <span className={OVERLAY_HEADING}>{openHead.label}</span>
              {openHead.total && (
                <Prov info={openHead.total.info} echo>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {exact(openHead.total.usd)}
                  </span>
                </Prov>
              )}
            </p>
            <AssetBreakdownPanel
              key={openHead.id}
              id={`${panelId}-${openHead.id}-body`}
              name={openHead.label}
              side={sideOf(openHead)}
              breakdown={openHead.breakdown}
            />
          </AnchoredPanel>
        </span>
      )}
    </>
  );
}

function ClosedGrid({
  heads,
  outcome,
  tone,
  detail,
}: {
  heads: PositionCardHead[];
  outcome: PositionCardOutcome;
  tone: PositionCardTone;
  /** The Outcome's "?" draws on a detail card only: a listing card sits
   *  inside its row's link. */
  detail: boolean;
}) {
  const peaks = heads.slice(0, 2);
  return (
    <div className={CLOSED_GRID} data-anatomy="C10">
      {peaks.map((h, i) => (
        <PositionCardRow
          key={h.id}
          index={i}
          head={h.id}
          label={h.label}
          labelTip={detail || h.labelTipOnListing ? h.labelTip : undefined}
          headerIcon={h.labelIcon}
          explain={detail}
        >
          <HeadBody head={h} />
        </PositionCardRow>
      ))}
      {peaks.length < 2 && <div className="hidden sm:block" />}
      <PositionCardRow
        index={2}
        head="outcome"
        label="Outcome"
        help={detail ? outcome.tip : undefined}
        explain={detail}
      >
        <div className={`text-lg font-bold mt-2 ${OUTCOME_TONE[tone]}`}>{outcome.word}</div>
        {outcome.dates?.map((d, i) => (
          <div key={d.label ?? i} className="text-xs text-rb-500 mt-0.5">
            {d.label ? `${d.label} ${formatDate(d.at)}` : formatDate(d.at)}
          </div>
        ))}
        {outcome.footnote}
      </PositionCardRow>
      {outcome.extra ? (
        <PositionCardRow index={3} head="extra" label={outcome.extra.label}>
          {outcome.extra.value}
        </PositionCardRow>
      ) : (
        <div className="hidden sm:block" />
      )}
    </div>
  );
}

function DetailMenu({ menu }: { menu: PositionCardMenu }) {
  return menu.exports ? (
    <ExportMenu variant="card" leading={menu.leading} {...menu.exports} />
  ) : (
    <ToolsMenu variant="card" leading={menu.leading} />
  );
}

// The caps (decision 0040): at most 4 headlines and 6 stats on a card.
// The slots are built at render from what the position holds (a stat shows
// only where its figure exists), so no static count or tuple type can see the
// number a card reaches; the shell counts what it is handed. Outside
// production an over-cap card warns once in the console and carries
// `data-card-over-cap`; it renders as it is, since which value goes is
// Miles's call (warn-level until he rules on the cards over today).
const warnedOverCap = new Set<string>();
function overCap(slots: PositionCardSlots): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const heads = slots.heads.length;
  const stats = slots.surface === "detail" && slots.panel ? slots.panel[0].length + slots.panel[1].length : 0;
  if (heads <= POSITION_CARD_MAX_HEADS && stats <= POSITION_CARD_MAX_STATS) return null;
  const key = `${heads}h${stats}s`;
  const ids = slots.heads.map((h) => h.id).join(",");
  if (typeof window !== "undefined" && !warnedOverCap.has(ids + key)) {
    warnedOverCap.add(ids + key);
    console.warn(
      `[position-card] ${heads} headlines and ${stats} stats: the card holds at most ${POSITION_CARD_MAX_HEADS} and ${POSITION_CARD_MAX_STATS}. Headlines: ${ids}`,
    );
  }
  return key;
}

export function PositionCard({ slots }: { slots: PositionCardSlots }) {
  const registry = useReceiptRegistry();
  const detail = slots.surface === "detail";
  const lit = useProvScopeLit(detail ? POSITION_CARD_SCOPE : null);
  const closed = slots.outcome != null;
  const { extra: countersExtra, ...meta } = slots.counters ?? {};
  const counters = slots.counters ? (
    // `contents`: the wrapper names the cluster without taking part in the row's layout.
    <span className="contents" data-card-counters="">
      <PositionCardMeta {...meta} />
      {countersExtra}
    </span>
  ) : null;
  const menu = detail ? slots.menu && <DetailMenu menu={slots.menu} /> : slots.menu;
  const edge = useContext(PositionCardEdgeContext);
  const wallet = !detail && edge?.surface === "wallet";
  const chainPill =
    !detail && edge?.chain ? (
      // Outside the row's quiet tips: the glyph's tip names the chain.
      <QuietTipsContext.Provider value={false}>
        <RevealTip tip={edge.chain.name} focusable align="end" className="rounded-sm focus-ring">
          <span
            role="img"
            aria-label={edge.chain.name}
            className="flex h-4 items-center text-rb-500"
            data-pill="chain"
            data-anatomy="W6"
          >
            <ChainGlyph id={edge.chain.id} className="h-4 w-4" />
          </span>
        </RevealTip>
      </QuietTipsContext.Provider>
    ) : null;
  const protocolMark =
    wallet && edge?.protocol ? (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/80 dark:text-foreground/70"
        data-wallet-protocol={edge.protocol.id}
        data-anatomy="W5"
      >
        <ProtocolIcon id={edge.protocol.id} className="h-4 w-4 shrink-0" />
        {edge.protocol.name}
      </span>
    ) : null;
  const panel = detail ? slots.panel : undefined;
  const over = overCap(slots);

  const header = (
    <div className="flex items-start gap-2 mb-3" data-anatomy="C5" {...(detail ? { "data-card-header": "" } : {})}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        {/* Wraps between pieces: at 390px an owner address would break in two
            beside a squeezed label. */}
        {/* On the wallet view an identity left empty by its dropped wallet pill
            takes no gap. */}
        <span className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 ${wallet ? "[&>:empty]:hidden" : ""}`}>
          {protocolMark}
          {detail ? (
            <>
              <PositionSummaryTitle text={slots.surface === "detail" ? slots.heading : undefined} />
              {slots.status && <StatusTag status={slots.status} />}
            </>
          ) : (
            <>
              {slots.lead ?? <ListingPill status={slots.status} />}
              {slots.identity}
            </>
          )}
        </span>
        {detail
          ? slots.identity
          : (slots.tag || chainPill) && (
              // Quiet like the figures: the listing card is one link.
              <QuietTipsContext.Provider value={true}>
                <span className="ml-auto flex items-center gap-2">
                  {slots.tag}
                  {chainPill}
                </span>
              </QuietTipsContext.Provider>
            )}
      </div>
      {/* The card's ⋮ at the top right of the header, whatever wraps beside it,
          centred on the heading's first line. */}
      {menu && <span className="-mb-1 -mt-1.5 flex shrink-0 items-center">{menu}</span>}
    </div>
  );

  const body = (
    <div {...(closed ? { "data-anatomy": "C11" } : {})}>
      {header}
      {/* A listing card is one link: its figures and labels open no tips
          (the position page keeps them). */}
      <QuietTipsContext.Provider value={!detail}>
        {slots.outcome ? (
          <ClosedGrid
            heads={slots.heads}
            outcome={slots.outcome}
            tone={slots.status?.tone ?? "muted"}
            detail={detail}
          />
        ) : (
          <OpenGrid heads={slots.heads} detail={detail} />
        )}
      </QuietTipsContext.Provider>
      {panel && <PositionCardPanel columns={panel} />}
      {/* A listing card's recency and counts, together at its bottom right. */}
      {!detail && counters && (
        <div className="mt-2 flex items-center justify-end gap-2" data-card-foot="">
          {counters}
        </div>
      )}
    </div>
  );

  const frame = (
    <div
      data-position-card-shell=""
      data-card-status={slots.status ? slots.status.word.toLowerCase() : "live"}
      data-skel-section={detail ? "detail-card" : "listing-row"}
      data-anatomy={detail ? "P1 C1" : (slots.anatomy ?? "C1")}
      data-prov-scope={detail ? POSITION_CARD_SCOPE : undefined}
      data-prov-lit={lit ? "" : undefined}
      data-card-over-cap={over ?? undefined}
      className={POSITION_CARD_FRAME}
    >
      {slots.notice}
      {body}
      {detail && (
        <>
          {slots.band}
          {slots.foot}
          <ProvenanceInfoTabs
            className="mt-3"
            rowExtra={
              counters ? <span className="ml-auto flex items-center gap-2 self-center">{counters}</span> : undefined
            }
            explanation={slots.explainer.body ?? undefined}
            learnMore={slots.learnMore}
            viewHref={slots.explainer.viewHref}
            explanationDefaultOpen={slots.explainer.defaultOpen}
            onExplanationToggle={slots.explainer.onToggle}
            anatomy={CARD_ANATOMY}
            label={explanationLabel(slots.heading)}
          />
        </>
      )}
    </div>
  );

  return detail ? (
    // verify-unscoped-prov's tripwire: return `frame` bare from this branch and
    // every detail card's figures report as unscoped.
    <ProvReceiptsScope registry={registry} scopeId={POSITION_CARD_SCOPE}>
      {frame}
    </ProvReceiptsScope>
  ) : (
    <ProvUnscoped>{frame}</ProvUnscoped>
  );
}

const CARD_ANATOMY = { explanation: "C3", learnMore: "C4" };

/** The (i) toggle's noun from the heading: "Vault summary" → "vault
 *  explanation"; no heading, "position explanation". */
const explanationLabel = (heading?: string): string => {
  const noun = (heading ?? "Position summary").replace(/ summary$/i, "");
  return `${noun.charAt(0).toLowerCase()}${noun.slice(1)} explanation`;
};
