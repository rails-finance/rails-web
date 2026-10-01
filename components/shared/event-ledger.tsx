"use client";

// The event card's ledger (rails-ops reference/lifetime-flows-scrubber.md,
// "The event card's sum"; anatomy T2.1). Each account cell of an opened card
// (Collateral, Debt) carries a toggle at its top right that opens the cell
// into its ledger: one row per kind of flow as of the event, the event's
// row highlighted, a rule, and the cell's name with the side before → after.
// Tokens first; USD in a second column after a thin divider where the
// timeline's Display switches show it, with Market move, the price's effect,
// in that column alone. On a phone the two columns take turns behind a
// small switch in the cell's header. The figures come from
// lib/shared/event-ledger.ts; a family's card provides its ledgers to its
// cells through EventLedgerContext (components/protocol/liquity-family/
// liquity-ledger.tsx, components/protocol/aave-v3/aave-family-event-receipt.tsx).

import { createContext, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { fillStyle } from "@/components/shared/lifetime-flows-tip";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { TransitionArrow } from "@/components/shared/state-transition";
import { EventLedgerContext } from "@/components/shared/event-ledger-context";
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
/** The opened cell's phone switch: which column shows, and the ledger's
 *  offer of one (its token's name, where it has a USD column). */
const ColContext = createContext<{ col: Col; offer: (unit: string | null) => void } | null>(null);

/** Phone widths, where the two number columns take turns. */
const PHONE_HIDE = "max-[480px]:hidden";

/** A T2 cell that can open into its side's ledger: the label at its top left,
 *  the toggle at its top right where the side has a ledger. `ledger`, where
 *  given, is the cell's ledger (null for none); else the card's
 *  EventLedgerContext provides it by `side`. Opened, the cell takes the
 *  grid's full width. */
export function LedgerCell({
  label,
  side,
  ledger,
  children,
  data,
  className = "",
  alignRight,
}: {
  /** Set the closed cell's figures right (default: on a card with ledgers). */
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
  return (
    <div
      className={`flex h-full min-w-0 flex-col rounded-xl bg-background px-4 py-3 ${isOpen ? "sm:col-span-2" : ""} ${className}`}
      {...data}
      {...(side ? { "data-ledger-cell": side } : {})}
      {...(isOpen ? { "data-ledger-open": "" } : {})}
    >
      <div className="mb-1.5 flex min-h-5 items-start gap-2">
        <div className="min-w-0 flex-1 text-xs font-semibold text-rb-500">{label}</div>
        {isOpen && unit && (
          <div
            role="group"
            aria-label="Column shown"
            className="-my-1 inline-flex shrink-0 rounded-md bg-sunken p-0.5 text-xs font-semibold min-[481px]:hidden"
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
        )}
        {has && (
          <button
            type="button"
            className="-m-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-rb-500 hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 sm:-m-1.5 sm:size-8"
            aria-expanded={isOpen}
            aria-controls={isOpen ? id : undefined}
            aria-label={isOpen ? `Close the ${name} ledger` : `Open the ${name} ledger`}
            title={isOpen ? "Close the ledger" : "How it adds up"}
            data-ledger-toggle={side ?? ""}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {isOpen ? <ChevronsDownUp size={16} aria-hidden /> : <ChevronsUpDown size={16} aria-hidden />}
          </button>
        )}
      </div>
      {isOpen ? (
        <ColContext.Provider value={{ col, offer: setUnit }}>
          <div id={id} data-anatomy="T2.1">
            {body}
          </div>
        </ColContext.Provider>
      ) : (
        <div
          className={
            (alignRight ?? (src != null || ledger !== undefined)) ? "flex flex-col items-end text-right" : "contents"
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A row's swatch: the bar's fill for its line, the dashed box for the
 *  price's effect and an asset's interest (lifetime-flows-tip.tsx `fillStyle`). */
function Swatch({ side, row }: { side: FlowSide; row: Pick<LedgerRow, "seg"> | null }) {
  if (row && !row.seg)
    return <i aria-hidden className="inline-block size-3 rounded-[2px] border border-dashed border-rb-500" />;
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
  /** Both number columns, which a phone shows one at a time. */
  two: boolean;
  /** On a phone, the column the switch hides. */
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
    hideTok: two && col === "usd" ? PHONE_HIDE : "",
    hideUsd: two && col === "tokens" ? PHONE_HIDE : "",
  };
}

/** The grid the rows sit in. On a phone one of two number columns shows. */
function LedgerGrid({ cols, children }: { cols: Cols; children: ReactNode }) {
  const grid = cols.two
    ? "grid-cols-[auto_minmax(0,1fr)_auto_auto] max-[480px]:grid-cols-[auto_minmax(0,1fr)_auto]"
    : "grid-cols-[auto_minmax(0,1fr)_auto]";
  return <div className={`grid ${grid} items-center gap-x-3 text-sm tabular-nums`}>{children}</div>;
}

const USD_CELL = "border-l border-rb-300 pl-3 dark:border-rb-600 max-[480px]:border-l-0 max-[480px]:pl-0";
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
        <span className="flex items-center py-1">
          <Swatch side={side} row={null} />
        </span>
        {/* The name and the figure share the label's column, so a wide
            before → after does not widen the column of figures above it. */}
        <span
          className={`col-span-2 flex min-w-0 items-center justify-between gap-3 py-1 ${hideTok ? "max-[480px]:col-span-1" : ""}`}
        >
          <span className="truncate font-semibold text-foreground">{name}</span>
          {cols.tokens ? (
            <span className={`whitespace-nowrap text-right ${hideTok}`}>
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
              <span className="whitespace-nowrap text-right" data-ledger-usd="">
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
          <span className={`whitespace-nowrap py-1 text-right ${USD_CELL} ${hideUsd}`} data-ledger-usd="">
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
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{SIDE_NAME[side]}</span>
          <span className="whitespace-nowrap text-right">
            {usd.before != null && (
              <BeforeArrow>
                {totalUsdBeforeProv ? <Prov info={totalUsdBeforeProv}>{usd.before}</Prov> : usd.before}
              </BeforeArrow>
            )}
            <span className="font-semibold text-foreground">
              <Prov info={totalUsdProv}>{usd.after}</Prov>
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
