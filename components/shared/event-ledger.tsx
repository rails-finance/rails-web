"use client";

// The event card's ledger (rails-ops reference/lifetime-flows-scrubber.md,
// "The event card's sum"; anatomy T2.1). Each account cell of an opened card
// (Collateral, Debt) is one row closed, its closing line: before → after, and a toggle at the right end of the cell's first line (the
// name's line) that opens the cell into its ledger: one row per kind of flow
// as of the event, the event's row highlighted, a rule, and the closing line.
// The toggle is one chevron, fixed to the cell's top right, that turns over
// when the cell is open, so a tap opens and a tap at the same point closes; a click anywhere on that first line does the same. Tokens
// first; USD in a second column after a thin divider where the timeline's
// Display switches show it, with Market move, the price's effect, in that
// column alone. In a cell narrower than 28rem the two columns take turns
// behind a small switch over the rows. The figures come from
// lib/shared/event-ledger.ts; a family's card provides its ledgers to its
// cells through EventLedgerContext (components/protocol/liquity-family/
// liquity-ledger.tsx, components/protocol/aave-v3/aave-family-event-receipt.tsx).

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { HUE, INFLOW_SWATCH, fillStyle } from "@/components/shared/lifetime-flows-tip";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { StatCard, TransitionArrow } from "@/components/shared/state-transition";
import { EventLedgerContext, LEDGER_PENDING } from "@/components/shared/event-ledger-context";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { eventCum, type EventCum } from "@/lib/shared/flow-focus";
import type { Ledger, LedgerRow } from "@/lib/shared/event-ledger";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import {
  flowAssetProv,
  flowInterestUsdProv,
  flowRemainderProv,
  flowSegmentProv,
  flowTokenProv,
  ledgerAssetUsdProv,
  ledgerPartProv,
} from "@/lib/shared/flows-timeline-provenance";

/** Each side's hue, as the bars draw it. */
export const SIDE_HUE: Record<FlowSide, string> = {
  collateral: "var(--color-blue-500)",
  debt: "var(--color-green-400)",
};
export const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;
export const SIDE_NAME: Record<FlowSide, string> = { collateral: "Collateral", debt: "Debt" };

/** The event's running totals, where the page's flow model holds its day. */
export function useEventCum(eventId: string | undefined): EventCum | null {
  const focus = useFlowFocus();
  return useMemo(
    () => (focus?.model && eventId ? eventCum(focus.model, focus.events, eventId) : null),
    [focus?.model, focus?.events, eventId],
  );
}

export { EventLedgerContext, type EventLedgerSource } from "@/components/shared/event-ledger-context";

type Col = "tokens" | "usd";
/** The opened cell's column switch: which column shows, and the ledger's
 *  offer of one (its token's name, where it has a USD column). */
const ColContext = createContext<{ col: Col; offer: (unit: string | null) => void } | null>(null);

/** A cell narrower than 28rem (a phone's, a tablet's beside the spine),
 *  where the two number columns take turns. */
const NARROW_HIDE = "@max-md:hidden";

/** The side's swatch beside its name, as the ledger's closing line draws it. */
const SideSwatch = ({ side }: { side: FlowSide }) => (
  <i aria-hidden className="inline-block size-3 shrink-0 rounded-[2px]" style={{ background: SIDE_HUE[side] }} />
);

/** The toggle: one chevron, no box, fixed to the cell's top right, level with
 *  the name's line, closed and opened, so it never moves. It darkens when the
 *  pointer is on the cell's first line (`LINE_HOVER`) or on the
 *  chevron. 32px hit area (44px at phone width, where the cell's padding holds
 *  the larger one without growing the row); the keyboard focus ring is an
 *  outline on `focus-visible` only, so a pointer or a tap never shows it. */
const TOGGLE =
  "absolute right-2.5 top-1.5 inline-flex size-8 items-center justify-center rounded-md text-rb-500 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 max-sm:right-1 max-sm:top-0 max-sm:size-11";
/** The cell's rule that darkens the chevron while the pointer is on the first line. */
const LINE_HOVER = "[&:has([data-ledger-first]:hover)>[data-ledger-toggle]]:text-foreground";
/** What a click on the first line leaves alone: controls, links and the figures
 *  that carry a receipt or an exact-value tip keep their tap. */
const OWN_TAP = "button, a, input, select, textarea, [role=button], [data-prov-pickable], [data-reveal-tip]";
/** The first line leaves room for the toggle at its right end. */
const TOGGLE_ROOM = "pr-11 sm:pr-[38px]";

/** A pending figure: one pulsing bar where a value will stand. The bar is
 *  `bg-skeleton`, which the T2 panel's surface does not show, so it sits
 *  inside a cell (`bg-background`). It holds still under reduced motion. */
export function PendingBar({ className = "w-24" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 rounded-md bg-skeleton animate-pulse motion-reduce:animate-none ${className}`}
      data-pending-bar=""
    />
  );
}

/** The T2 area before the chain read lands: the loaded grid's cells with their
 *  names and a bar where each figure will stand. Collateral and Debt are
 *  full-width rows of a closed ledger cell's height; each name in `stats` is a
 *  half-width cell under them (health factor, LTV, rate), as the loaded
 *  card lays them. The swap to the loaded cells moves nothing sideways. */
export function T2Skeleton({ stats = [], data }: { stats?: string[]; data?: Record<string, string> }) {
  return (
    <EventLedgerContext.Provider value={LEDGER_PENDING}>
      <div className="px-5 py-2" aria-busy="true" data-t2-skeleton="" {...data}>
        <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-flow-row-dense sm:grid-cols-2">
          <LedgerCell label="Collateral" side="collateral">
            {null}
          </LedgerCell>
          <LedgerCell label="Debt" side="debt">
            {null}
          </LedgerCell>
          {stats.map((label) => (
            <StatCard key={label} label={label}>
              <PendingBar />
            </StatCard>
          ))}
        </div>
        <span className="sr-only">Reading the position at this block</span>
      </div>
    </EventLedgerContext.Provider>
  );
}

/** A T2 cell that can open into its side's ledger (anatomy T2.1). Closed, the
 *  cell is one row, the ledger's closing line on its own: the side's swatch
 *  and name, its figures at the right (before → after in tokens, USD after
 *  a thin divider), and the toggle at the first line's right end where the side
 *  has a ledger. Opened, the first line stays (swatch, name, toggle) and the
 *  ledger's rows stand under it above a rule and the closing line, so the
 *  toggle stays where the pointer pressed it and the cell grows downward. `ledger`, where given, is the cell's ledger
 *  (null for none); else the card's EventLedgerContext provides it by
 *  `side`. On a card with ledgers the cell takes the grid's full width
 *  closed and opened (`data-ledger-span`), so no other cell moves sideways;
 *  the card's grid sizes its rows to their content where a cell spans
 *  (`sm:has-[[data-ledger-span]]:auto-rows-auto`). */
export function LedgerCell({
  label,
  side,
  ledger,
  children,
  data,
  className = "",
  alignRight,
}: {
  /** Closed, set the figures at the right of the name's row (default: on a
   *  card with ledgers). False: the name's row holds the toggle alone and
   *  the figures stand under it (the state card's asset lists). */
  alignRight?: boolean;
  label: ReactNode;
  side?: FlowSide;
  ledger?: ReactNode | null;
  children: ReactNode;
  /** Data attributes for the cell. */
  data?: Record<string, string>;
  className?: string;
}) {
  const src = useContext(EventLedgerContext);
  const has = ledger !== undefined ? ledger != null : side != null && !!src?.has(side);
  const [open, setOpen] = useState(false);
  const [col, setCol] = useState<Col>("tokens");
  const [unit, setUnit] = useState<string | null>(null);
  const id = useId();
  const isOpen = open && has;
  const body = isOpen ? (ledger !== undefined ? ledger : side ? src?.render(side) : null) : null;
  const name = typeof label === "string" ? label : side ? SIDE_NAME[side] : "cell";
  const ledgerCard = src != null || ledger !== undefined;
  // The first line, the name's, toggles the cell wherever it is pressed except
  // on a control or a figure that carries a receipt or an exact-value tip, and
  // not at the end of a drag that selected text. The chevron stays the one
  // focusable control (a keyboard reaches the toggle through it); the line's
  // click is a pointer convenience, so it carries no role and no tab stop. It
  // stops the click here, as the chevron does, so the click does not reach the
  // card above.
  const onLine = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if ((e.target as Element).closest(OWN_TAP)) return;
    if (typeof window !== "undefined" && (window.getSelection()?.toString().length ?? 0) > 0) return;
    setOpen((v) => !v);
  };
  const line = has ? { "data-ledger-first": "", onClick: onLine } : {};
  const toggle = has ? (
    <button
      type="button"
      className={TOGGLE}
      aria-expanded={isOpen}
      aria-controls={isOpen ? id : undefined}
      aria-label={`${name}, how it adds up`}
      title={isOpen ? "Close the ledger" : "How it adds up"}
      data-ledger-toggle={side ?? ""}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ChevronDown
        size={16}
        aria-hidden
        className={`transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
      />
    </button>
  ) : null;
  const nameRow = (
    <span className="flex min-h-5 shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
      {side && <SideSwatch side={side} />}
      {label}
    </span>
  );
  const right = alignRight ?? ledgerCard;
  if (src?.pending && ledger === undefined && side)
    return (
      <div
        className={`@container flex h-full min-w-0 flex-col rounded-xl bg-background px-4 py-3 col-span-full ${className}`}
        {...data}
        data-ledger-cell={side}
        data-ledger-span=""
        data-ledger-pending=""
      >
        <div className="flex min-h-5 items-center justify-between gap-3">
          {nameRow}
          <PendingBar />
        </div>
      </div>
    );
  return (
    <div
      className={`@container relative flex h-full min-w-0 flex-col rounded-xl bg-background px-4 py-3 ${ledgerCard ? "col-span-full" : ""} ${has ? LINE_HOVER : ""} ${className}`}
      {...data}
      {...(side ? { "data-ledger-cell": side } : {})}
      {...(ledgerCard ? { "data-ledger-span": "" } : {})}
      {...(isOpen ? { "data-ledger-open": "" } : {})}
    >
      {isOpen ? (
        <>
          <div className={`mb-1.5 flex cursor-pointer items-start ${TOGGLE_ROOM}`} data-ledger-row="head" {...line}>
            {nameRow}
          </div>
          <ColContext.Provider value={{ col, offer: setUnit }}>
            {unit && (
              <div className="mb-1.5 flex justify-end @md:hidden">
                <div
                  role="group"
                  aria-label="Column shown"
                  className="inline-flex shrink-0 rounded-md bg-sunken p-0.5 text-xs font-semibold"
                  data-ledger-switch=""
                >
                  {(["tokens", "usd"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={col === c}
                      className={`min-h-7 rounded px-2 ${col === c ? "bg-background text-foreground" : "text-rb-500"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCol(c);
                      }}
                    >
                      {c === "tokens" ? unit : "USD"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div id={id} data-anatomy="T2.1">
              {body}
            </div>
          </ColContext.Provider>
        </>
      ) : right ? (
        // The figures keep to the name's line where they fit, else they take
        // the next line; the toggle stays at the name's line's right end.
        <div
          className={`flex flex-wrap items-start gap-x-3 gap-y-1 ${has ? `cursor-pointer ${TOGGLE_ROOM}` : ""}`}
          data-ledger-row="closed"
          {...line}
        >
          {nameRow}
          <div className="flex flex-1 flex-col items-end text-right">{children}</div>
        </div>
      ) : (
        <>
          <div
            className={`mb-1.5 flex items-start ${has ? `cursor-pointer ${TOGGLE_ROOM}` : ""}`}
            data-ledger-row="closed"
            {...line}
          >
            {nameRow}
          </div>
          {children}
        </>
      )}
      {toggle}
    </div>
  );
}

/** A closed ledger cell's tokens, before → after, kept on one line. */
export function ClosedTokens({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap">{children}</span>;
}

/** A closed ledger cell's USD after its tokens: a thin divider, then the
 *  side's dollars before → after the event (the after alone where no before
 *  is given). In a cell narrower than 36rem (a tablet's or a phone's) tokens
 *  and dollars do not share a line: the dollars take the line under the
 *  tokens, set right, with no divider. */
export function ClosedUsd({ before, after }: { before?: ReactNode; after: ReactNode }) {
  return (
    <span
      className="ml-1 inline-flex items-center justify-end gap-1 whitespace-nowrap border-l border-rb-300 pl-2 text-sm tabular-nums text-rb-500 dark:border-rb-600 @max-xl:ml-0 @max-xl:basis-full @max-xl:border-l-0 @max-xl:pl-0"
      data-ledger-closed-usd=""
    >
      {before != null && (
        <span className="inline-flex items-center gap-1" data-ledger-closed-usd-before="">
          {before}
          <TransitionArrow size="sm" />
        </span>
      )}
      {after}
    </span>
  );
}

/** An asset's interest: what grew the balance, in the side's faded inflow
 *  hue, outlined in dashes because no flow moved it. */
const INTEREST_SWATCH: Record<FlowSide, CSSProperties> = {
  collateral: { background: INFLOW_SWATCH.collateral, borderColor: HUE.collateral.line },
  debt: { background: INFLOW_SWATCH.debt, borderColor: HUE.debt.line },
};

/** A row's swatch: the bar's fill for its line; an asset's interest the
 *  side's faded hue in a dashed outline of the side's line colour, apart from
 *  every flow's fill; the price's effect a grey dashed box
 *  (lifetime-flows-tip.tsx `fillStyle`). */
function Swatch({ side, row }: { side: FlowSide; row: Pick<LedgerRow, "seg" | "role"> | null }) {
  if (row && !row.seg && row.role === "interest")
    return (
      <i
        aria-hidden
        className="inline-block size-3 rounded-[2px] border border-dashed"
        style={INTEREST_SWATCH[side]}
        data-ledger-swatch="interest"
      />
    );
  if (row && !row.seg)
    return (
      <i
        aria-hidden
        className="inline-block size-3 rounded-[2px] border border-dashed border-rb-500"
        data-ledger-swatch="market"
      />
    );
  return (
    <i
      aria-hidden
      className="inline-block size-3 rounded-[2px]"
      style={row?.seg ? fillStyle(side, row.seg) : { background: SIDE_HUE[side] }}
    />
  );
}

/** The ledger grid's columns: the swatch, the label, tokens, USD. */
interface Cols {
  tokens: boolean;
  usd: boolean;
  /** Both number columns, which a narrow cell shows one at a time. */
  two: boolean;
  /** In a narrow cell, the column the switch hides. */
  hideTok: string;
  hideUsd: string;
}

function useCols(tokens: boolean, usd: boolean, unitWord: string, offerSwitch: boolean): Cols {
  const colCtx = useContext(ColContext);
  const two = tokens && usd;
  const col: Col = colCtx?.col ?? "tokens";
  const offer = colCtx?.offer;
  useEffect(() => {
    if (offerSwitch && offer) offer(two ? unitWord : null);
  }, [offerSwitch, offer, two, unitWord]);
  return {
    tokens,
    usd,
    two,
    hideTok: two && col === "usd" ? NARROW_HIDE : "",
    hideUsd: two && col === "tokens" ? NARROW_HIDE : "",
  };
}

/** The grid the rows sit in. In a narrow cell one of two number columns
 *  shows. */
function LedgerGrid({ cols, children }: { cols: Cols; children: ReactNode }) {
  const grid = cols.two
    ? "grid-cols-[auto_minmax(0,1fr)_auto_auto] @max-md:grid-cols-[auto_minmax(0,1fr)_auto]"
    : "grid-cols-[auto_minmax(0,1fr)_auto]";
  return <div className={`grid ${grid} items-center gap-x-3 text-sm tabular-nums`}>{children}</div>;
}

const USD_CELL = "border-l border-rb-300 pl-3 dark:border-rb-600 @max-md:border-l-0 @max-md:pl-0";
const RULE = "col-span-full mt-1.5 mb-1 border-t border-rb-300 dark:border-rb-600";

function BeforeArrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 pr-1 align-middle text-rb-500">
      {children}
      <TransitionArrow size="sm" />
    </span>
  );
}

/** One ledger's rows, a rule and its total line, as cells of a LedgerGrid. */
function LedgerRows({
  ledger,
  cols,
  name,
  at,
  totalUsdProv,
  totalUsdBeforeProv,
  usdProvOf,
  daily = false,
  subhead,
  spaced = false,
}: {
  ledger: Ledger;
  cols: Cols;
  /** Space above the subhead (a ledger after another). */
  spaced?: boolean;
  name: string;
  at: string;
  totalUsdProv?: Provenance;
  totalUsdBeforeProv?: Provenance;
  usdProvOf?: (r: LedgerRow) => Provenance | undefined;
  daily?: boolean;
  subhead?: ReactNode;
}) {
  const side = ledger.side;
  const { two, hideTok, hideUsd } = cols;
  const unit = ledger.symbol ?? "USD";
  const tokenProv = (r: LedgerRow): Provenance =>
    r.role === "before" || r.role === "event"
      ? ledgerPartProv(r.label, unit, at, r.role)
      : flowTokenProv(r.label, unit, at, r.role === "interest" ? "interest" : "line");
  const usdProv = (r: LedgerRow): Provenance => {
    const own = usdProvOf?.(r);
    if (own) return own;
    if (r.role === "market")
      return flowRemainderProv(r.label, side, at, "the change in the price since each flow, no funds moved");
    if (r.role === "interest") return flowInterestUsdProv(r.label, at);
    if (r.role === "before" || r.role === "event") return ledgerPartProv(r.label, "USD", at, r.role);
    return flowSegmentProv(
      r.seg ?? { key: r.line, label: r.label, fill: "in", width: 0, value: 0 },
      side,
      at,
      false,
      daily,
    );
  };
  const tone = (r: LedgerRow) => (r.role === "event" ? "font-semibold text-foreground" : "text-rb-500");
  const total = ledger.tokens;
  return (
    <div
      className="contents"
      data-ledger={side}
      data-ledger-unit={ledger.tokens ? "token" : "usd"}
      {...(ledger.symbol ? { "data-ledger-symbol": ledger.symbol } : {})}
      {...(ledger.decimals != null ? { "data-ledger-decimals": ledger.decimals } : {})}
    >
      {subhead && (
        <div
          className={`col-span-full flex items-center gap-1.5 pb-1 font-semibold text-foreground${spaced ? " mt-5" : ""}`}
        >
          {subhead}
        </div>
      )}
      {ledger.rows.map((r) => {
        // The price's effect has no token amount: it goes with the USD column.
        const hideRow = two && r.tokens == null ? hideUsd : "";
        return (
          <div
            key={r.key}
            className="contents"
            data-ledger-row={r.role}
            data-ledger-line={r.line}
            {...(r.tokens ? { "data-ledger-units": r.tokens.units } : {})}
            {...(r.usd && ledger.usd ? { "data-ledger-dollars": r.usd.dollars } : {})}
          >
            <span className={`flex items-center py-1 ${hideRow}`}>
              <Swatch side={side} row={r} />
            </span>
            <span className={`truncate py-1 ${tone(r)} ${hideRow}`} title={r.label}>
              {r.label}
            </span>
            {cols.tokens && (
              <span className={`whitespace-nowrap py-1 text-right ${tone(r)} ${hideTok} ${hideRow}`}>
                {r.tokens ? <Prov info={tokenProv(r)}>{r.tokens.text}</Prov> : null}
              </span>
            )}
            {cols.usd && (
              <span
                className={`whitespace-nowrap py-1 text-right ${tone(r)} ${two ? USD_CELL : ""} ${hideUsd} ${hideRow}`}
                data-ledger-usd=""
              >
                {r.usd && ledger.usd ? <Prov info={usdProv(r)}>{r.usd.text}</Prov> : null}
              </span>
            )}
          </div>
        );
      })}
      <div aria-hidden className={RULE} />
      <div
        className="contents"
        data-ledger-row="total"
        {...(total ? { "data-ledger-units": total.units } : {})}
        {...(ledger.usd ? { "data-ledger-dollars": ledger.usd.dollars } : {})}
      >
        <span className="flex min-h-7 items-center self-start">
          <Swatch side={side} row={null} />
        </span>
        {/* The line carries no visible name (the cell's first line states it);
            the figure shares the label's column, so a wide before → after does
            not widen the column of figures above it. */}
        <span
          role="group"
          aria-label={`${name} total`}
          className={`col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 py-1 ${hideTok ? "@max-md:col-span-1" : ""}`}
        >
          {cols.tokens ? (
            <span className={`ml-auto whitespace-nowrap text-right ${hideTok}`}>
              {total?.before != null && (
                <BeforeArrow>
                  <Prov info={ledgerPartProv(name, unit, at, "held-before")}>{total.before}</Prov>
                </BeforeArrow>
              )}
              {total && (
                <span className="font-semibold text-foreground">
                  <Prov info={flowTokenProv(name, unit, at, "held")}>{total.after}</Prov>
                </span>
              )}
            </span>
          ) : (
            ledger.usd && (
              <span className="ml-auto whitespace-nowrap text-right" data-ledger-usd="">
                {ledger.usd.before != null && (
                  <BeforeArrow>
                    {totalUsdBeforeProv ? (
                      <Prov info={totalUsdBeforeProv}>{ledger.usd.before}</Prov>
                    ) : (
                      ledger.usd.before
                    )}
                  </BeforeArrow>
                )}
                <span className="font-semibold text-foreground">
                  {totalUsdProv ? <Prov info={totalUsdProv}>{ledger.usd.after}</Prov> : ledger.usd.after}
                </span>
              </span>
            )
          )}
        </span>
        {cols.tokens && cols.usd && (
          <span className={`self-end whitespace-nowrap py-1 text-right ${USD_CELL} ${hideUsd}`} data-ledger-usd="">
            {ledger.usd && (
              <span className="text-rb-500">
                {totalUsdProv ? <Prov info={totalUsdProv}>{ledger.usd.after}</Prov> : ledger.usd.after}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** One ledger: its rows, a rule, and the total line. */
export function LedgerTable({
  ledger,
  name,
  at,
  totalUsdProv,
  totalUsdBeforeProv,
  daily = false,
  subhead,
}: {
  ledger: Ledger;
  /** The total line's words: the cell's name. */
  name: string;
  /** "this event (5 Jul '25)". */
  at: string;
  /** The receipts of the total's USD, after and before the transaction. */
  totalUsdProv?: Provenance;
  totalUsdBeforeProv?: Provenance;
  daily?: boolean;
  /** A line above the rows (an asset's icon and symbol). */
  subhead?: ReactNode;
}) {
  const cols = useCols(ledger.tokens != null, ledger.usd != null, ledger.symbol ?? "Tokens", true);
  return (
    <LedgerGrid cols={cols}>
      <LedgerRows
        ledger={ledger}
        cols={cols}
        name={name}
        at={at}
        totalUsdProv={totalUsdProv}
        totalUsdBeforeProv={totalUsdBeforeProv}
        daily={daily}
        subhead={subhead}
      />
    </LedgerGrid>
  );
}

/** A side holding several assets: one short ledger per asset, each closing on
 *  its balance, then the side's total in USD (the assets add only there). */
export function AssetLedgers({
  side,
  assets,
  usd,
  at,
  totalUsdProv,
  totalUsdBeforeProv,
  usdShownFor,
}: {
  side: FlowSide;
  assets: Ledger[];
  usd: { before: string | null; after: string; dollars: number };
  at: string;
  totalUsdProv: Provenance;
  totalUsdBeforeProv?: Provenance;
  /** Whether the Display switches show an asset's USD. */
  usdShownFor: (l: Ledger) => boolean;
}) {
  const shown = assets.map((a) =>
    usdShownFor(a) ? a : { ...a, usd: null, rows: a.rows.filter((r) => r.tokens).map((r) => ({ ...r, usd: null })) },
  );
  const cols = useCols(
    true,
    shown.some((a) => a.usd != null),
    "Tokens",
    true,
  );
  const held = side === "collateral" ? "Held" : "Owed";
  return (
    <div data-ledger-assets={side}>
      <LedgerGrid cols={cols}>
        {shown.map((a, i) => (
          <LedgerRows
            key={a.symbol}
            spaced={i > 0}
            ledger={a}
            cols={cols}
            name={held}
            at={at}
            totalUsdProv={a.symbol ? flowAssetProv(a.symbol, heldSeg(side), side, at, false) : undefined}
            usdProvOf={(r) =>
              r.role === "market" || r.role === "interest"
                ? ledgerAssetUsdProv(r.label, a.symbol ?? "", at, r.role)
                : r.role === "flow" && r.seg
                  ? flowAssetProv(a.symbol ?? "", r.seg, side, at, false)
                  : undefined
            }
            subhead={
              <>
                <TokenChipIcon symbol={a.symbol ?? ""} size={16} filterable={false} />
                {a.symbol}
              </>
            }
          />
        ))}
        <div aria-hidden className={`${RULE} mt-3`} />
        <div
          className="col-span-full flex items-center gap-3 py-1"
          data-ledger-row="side-total"
          data-ledger-dollars={usd.dollars}
        >
          <Swatch side={side} row={null} />
          <span
            role="group"
            aria-label={`${SIDE_NAME[side]} total`}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3"
          >
            <span className="ml-auto whitespace-nowrap text-right">
              {usd.before != null && (
                <BeforeArrow>
                  {totalUsdBeforeProv ? <Prov info={totalUsdBeforeProv}>{usd.before}</Prov> : usd.before}
                </BeforeArrow>
              )}
              <span className="font-semibold text-foreground">
                <Prov info={totalUsdProv}>{usd.after}</Prov>
              </span>
            </span>
          </span>
        </div>
      </LedgerGrid>
    </div>
  );
}

/** What a side holds or owes, as the bars' segment, for its receipts. */
const heldSeg = (side: FlowSide): FlowSegment => ({
  key: `${side}-held`,
  label: side === "collateral" ? "Held" : "Owed",
  fill: "held",
  width: 0,
  value: 0,
});

/** Where the page does not hold every event of the day, the rows stand at
 *  the day's close. */
export function DayCloseNote({ cum, eventTs }: { cum: EventCum; eventTs?: number }) {
  if (cum.exact) return null;
  return (
    <p className="mt-2 text-sm text-rb-500" data-ledger-day-close="">
      The page does not hold every event of {eventTs != null ? dayStamp(eventTs) : "this day"}, so the rows stand at the
      close of that day.
    </p>
  );
}
