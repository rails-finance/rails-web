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
// pill and the family's listing ⋮, with no heading, panel or (i) (324).
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
// Hooks for the verifiers: the frame keeps `data-anatomy="P1"`,
// `data-skel-section` and `data-prov-scope="position-card"`, and adds
// `data-position-card-shell` and `data-card-status`; each headline keeps
// `data-card-row=<i>` and adds `data-card-head=<id>`; the counters carry
// `data-card-counters`.

import type { ReactNode } from "react";
import { POSITION_CARD_FRAME, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  POSITION_CARD_SCOPE,
  ProvReceiptsScope,
  ProvUnscoped,
  useReceiptRegistry,
} from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { PositionCardPanel, type PositionPanelColumns } from "@/components/shared/position-card-panel";
import { PositionCardMeta, type PositionCardMetaProps } from "@/components/shared/position-card-meta";
import { RowHelp } from "@/components/shared/row-help";
import { TipLabel } from "@/components/shared/tip-label";
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
  /** 1 to 4 headlines, left to right. Four go two by two below lg. A closed
   *  card passes its peaks. */
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
  /** The family's listing ⋮ (Liquity V2's `TroveListingMenu`), or `null`. It
   *  must stop a press from reaching the row's <Link>. */
  menu: ReactNode | null;
  /** Present on a closed position. */
  outcome?: PositionCardOutcome;
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

// Four headlines go two by two until lg: four large figures do not fit a row
// narrower than that.
const OPEN_GRID: Record<number, string> = {
  1: "grid grid-cols-1 gap-4",
  2: "grid grid-cols-2 sm:grid-cols-2 gap-4",
  3: "grid grid-cols-2 sm:grid-cols-3 gap-4",
  4: "grid grid-cols-2 lg:grid-cols-4 gap-4",
};
// A closed card is four columns wide (peaks, Outcome, the extra) so cards in
// a stack line up.
const CLOSED_GRID = "grid grid-cols-2 sm:grid-cols-4 gap-4";

/** The "Position summary" heading at the left of a detail card's heading row. */
function PositionSummaryTitle() {
  return (
    <h2 className={`${SECTION_HEADING} text-rb-500`} data-position-summary="">
      Position summary
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
  className,
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
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-card-row={index} data-card-head={head}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rb-500">
        <TipLabel text={label} tip={labelTip} />
        {headerIcon}
        {help && <RowHelp tip={help} name={label} />}
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
 *  word in capitals. */
function ListingPill({ status }: { status: PositionCardStatus | null }) {
  return (
    <span
      className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${status ? TAG_TONE[status.tone] : OPEN_PILL}`}
      data-anatomy="C6"
    >
      {status ? status.word.toUpperCase() : "OPEN"}
    </span>
  );
}

function HeadBody({ head }: { head: PositionCardHead }) {
  return (
    <>
      {head.pending ? (
        <div className="h-9 w-20 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse mt-2" />
      ) : head.value == null ? (
        <StatDash />
      ) : (
        <StatValue>
          {head.assets ? (
            <span className="flex items-center gap-1.5">
              {head.value}
              {head.assets}
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

function OpenGrid({ heads }: { heads: PositionCardHead[] }) {
  const n = heads.length;
  return (
    <div className={OPEN_GRID[n] ?? OPEN_GRID[3]} data-anatomy="C10">
      {heads.map((h, i) => (
        <PositionCardRow
          key={h.id}
          index={i}
          head={h.id}
          label={h.label}
          labelTip={h.labelTip}
          headerIcon={h.labelIcon}
          // Three on a phone: the third spans the row, so it is not stranded
          // beside an empty cell.
          className={n === 3 && i === 2 ? "col-span-2 sm:col-span-1" : undefined}
        >
          <HeadBody head={h} />
        </PositionCardRow>
      ))}
    </div>
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
          labelTip={h.labelTip}
          headerIcon={h.labelIcon}
        >
          <HeadBody head={h} />
        </PositionCardRow>
      ))}
      {peaks.length < 2 && <div className="hidden sm:block" />}
      <PositionCardRow index={2} head="outcome" label="Outcome" help={detail ? outcome.tip : undefined}>
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

export function PositionCard({ slots }: { slots: PositionCardSlots }) {
  const registry = useReceiptRegistry();
  const detail = slots.surface === "detail";
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

  const header = (
    <div className="flex items-start gap-2 mb-3" data-anatomy="C5" {...(detail ? { "data-card-header": "" } : {})}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        {/* Wraps between pieces: at 390px an owner address would break in two
            beside a squeezed label. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          {detail ? (
            <>
              <PositionSummaryTitle />
              {slots.status && <StatusTag status={slots.status} />}
            </>
          ) : (
            <>
              <ListingPill status={slots.status} />
              {slots.identity}
            </>
          )}
        </span>
        {detail ? slots.identity : counters}
      </div>
      {/* The card's ⋮ at the top right of the header, whatever wraps beside it. */}
      {menu && <span className="-my-1 flex shrink-0 items-center">{menu}</span>}
    </div>
  );

  const body = (
    <div {...(closed ? { "data-anatomy": "C11" } : {})}>
      {header}
      {slots.outcome ? (
        <ClosedGrid heads={slots.heads} outcome={slots.outcome} tone={slots.status?.tone ?? "muted"} detail={detail} />
      ) : (
        <OpenGrid heads={slots.heads} />
      )}
      {detail && slots.panel && <PositionCardPanel columns={slots.panel} />}
    </div>
  );

  const frame = (
    <div
      data-position-card-shell=""
      data-card-status={slots.status ? slots.status.word.toLowerCase() : "live"}
      data-skel-section={detail ? "detail-card" : "listing-row"}
      data-anatomy={detail ? "P1" : undefined}
      data-prov-scope={detail ? POSITION_CARD_SCOPE : undefined}
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
