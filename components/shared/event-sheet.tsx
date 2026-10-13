"use client";

// T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330; Miles's prototype
// reference/mocks/2026-10-13-event-card-overhaul-aave-v3.html): the card's
// `sheet` slot, drawn by the shell in place of the cells grid.
//
// Two side panels, Collateral then Debt, each headed by its name and the
// side's asset icons, its rows on one grid: label, asset figure with its icon,
// and a USD column behind a vertical rule. The event's rows (bold) and the
// side's total (large, in the USD column) always stand; a side the event did
// not touch says so beside its total. With the breakdown on, a tinted
// carry-forward layer stands above the event's rows ("Last event", "Interest
// since last event" with a sub-row per asset, "Market move", then "Before this
// event" under a dashed rule) and the Debt side lists every asset and the
// repaid ones. Beneath the sides, the Risk and Limits panels: label and value
// rows, each value a level that swaps to its change since the previous event
// (change-swap-value.tsx), the protocol's parameters as muted rows with the
// breakdown on.
//
// Under 640px one value column is drawn, the asset figure or the USD, picked by
// the asset | USD switch at the sheet's top; a row with no figure in the picked
// column draws the other.

import { useState, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { LedgerIcon } from "@/components/shared/event-ledger";
import { ChangeSwapValue, type SwapFigure } from "@/components/shared/change-swap-value";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** A figure on the sheet, with its receipt. */
export interface SheetFigure {
  text: ReactNode;
  info?: Provenance;
  /** The exact value the receipt keys on. */
  value?: string;
}

/** A row of a side panel. */
export interface SheetRow {
  /** Unique within the side; `data-sheet-row` on the row. */
  key: string;
  label: ReactNode;
  /** Muted words after the label: an asset's price ("· $0.9997"). */
  note?: ReactNode;
  /** The asset figure; its icon follows it. */
  amount?: SheetFigure & { symbol?: string };
  usd?: SheetFigure;
}

/** One side of the sheet. */
export interface SheetSide {
  side: FlowSide;
  /** The icons of the assets the side holds, after its name. */
  icons: string[];
  /** The carry-forward layer above the event's rows, drawn with the
   *  breakdown on: "Last event", the interest since it (its `sub` rows one per
   *  asset), "Market move". Holds only the rows the family can state. */
  carry: (SheetRow & { sub?: SheetRow[] })[];
  /** "Before this event", under a dashed rule after the carry rows. */
  before?: SheetRow;
  /** The event's rows on this side, bold; none where it did not touch it. */
  rows: SheetRow[];
  /** With the breakdown on, every asset the side holds after the event. */
  assets?: SheetRow[];
  /** With the breakdown on, the assets the side once held and holds none of. */
  repaid?: string[];
  /** The side's total after the event, in dollars; `none` names why there is
   *  none. */
  total: SheetFigure | { none: string };
}

/** A label and value row of the Risk or Limits panel. */
export interface SheetStat {
  key: string;
  label: ReactNode;
  value: SwapFigure | { none: string };
  /** The change since the previous event, which the value swaps to. */
  change?: SwapFigure | null;
  /** The level's tone, where it carries one (a ratio's zone colour). */
  tone?: string;
}

export interface SheetPanel {
  panel: "risk" | "limits";
  rows: SheetStat[];
  /** The protocol's parameters, muted, with the breakdown on. */
  breakdown?: SheetStat[];
  /** A line under the rows. */
  caption?: ReactNode;
}

/** The `sheet` slot. */
export interface EventSheet {
  sides: SheetSide[];
  panels: SheetPanel[];
}

/** The carry-forward layer's names, the same on every family's sheet. */
export const SHEET_WORDS = {
  last: "Last event",
  interest: "Interest since last event",
  market: "Market move",
  before: "Before this event",
};

/** Dollars as the sheet prints them: cents under $10, whole dollars above;
 *  `signed` puts "+" on a gain (a loss always reads "−"). */
export function sheetUsd(v: number, signed = false): string {
  const a = Math.abs(v);
  const body =
    a < 10
      ? a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : a.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const zero = !/[1-9]/.test(body);
  return `${zero ? "" : v < 0 ? "−" : signed ? "+" : ""}$${body}`;
}

const WORDS = {
  collateral: "Collateral",
  debt: "Debt",
  risk: "Risk",
  limits: "Limits",
  untouched: "Not changed by this event",
  repaid: (n: number) => `${n} repaid ${n === 1 ? "asset" : "assets"}`,
  column: "Column shown",
  tokens: "Asset",
  usd: "USD",
};

type Col = "tokens" | "usd";

const Fig = ({ f }: { f: SheetFigure }) =>
  f.info ? (
    <Prov info={f.info} value={f.value}>
      {f.text}
    </Prov>
  ) : (
    <>{f.text}</>
  );

/** The three columns: label, asset figure and its icon, USD. Under 640px the
 *  label and one value column. */
const GRID = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4";
const SUB = "col-span-full grid grid-cols-subgrid";
const USD_RULE = "border-l border-rb-300 pl-4 dark:border-rb-600";
/** The breakdown's tint. */
const TINT = "bg-blue-500/[0.06] dark:bg-blue-400/[0.07]";

type Tone = "event" | "plain" | "muted" | "sub";
const TONE: Record<Tone, string> = {
  event: "font-semibold text-foreground",
  plain: "text-foreground",
  muted: "text-rb-500",
  sub: "text-xs text-rb-500 sm:text-sm",
};

function AmountCell({ a }: { a: NonNullable<SheetRow["amount"]> }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <Fig f={a} />
      {a.symbol && <LedgerIcon symbol={a.symbol} muted />}
    </span>
  );
}

/** One row: its three cells, and under 640px the one value the switch picks. */
function Row({
  r,
  tone,
  col,
  pad = "py-1.5",
  indent = false,
}: {
  r: SheetRow;
  tone: Tone;
  col: Col;
  pad?: string;
  indent?: boolean;
}) {
  const t = TONE[tone];
  const phone =
    col === "usd" ? (r.usd ? "usd" : r.amount ? "amount" : null) : r.amount ? "amount" : r.usd ? "usd" : null;
  return (
    <div className="contents" data-sheet-row={r.key}>
      <span className={`min-w-0 ${pad} ${t} ${indent ? "pl-4" : ""}`}>
        {r.label}
        {r.note != null && <span className="text-rb-500"> · {r.note}</span>}
      </span>
      <span className={`${pad} text-right tabular-nums ${t} max-sm:hidden`} data-sheet-col="amount">
        {r.amount && <AmountCell a={r.amount} />}
      </span>
      <span
        className={`${pad} text-right tabular-nums whitespace-nowrap ${t} ${USD_RULE} max-sm:hidden`}
        data-sheet-col="usd"
      >
        {r.usd && <Fig f={r.usd} />}
      </span>
      <span className={`${pad} text-right tabular-nums whitespace-nowrap ${t} sm:hidden`} data-sheet-col="phone">
        {phone === "amount" && r.amount ? (
          <AmountCell a={r.amount} />
        ) : phone === "usd" && r.usd ? (
          <Fig f={r.usd} />
        ) : null}
      </span>
    </div>
  );
}

function SidePanel({ s, breakdown, col }: { s: SheetSide; breakdown: boolean; col: Col }) {
  const touched = s.rows.length > 0;
  const carry = breakdown && (s.carry.length > 0 || s.before);
  const listed = breakdown && ((s.assets?.length ?? 0) > 0 || (s.repaid?.length ?? 0) > 0);
  const name = s.side === "collateral" ? WORDS.collateral : WORDS.debt;
  return (
    <section
      className="min-w-0 rounded-xl bg-background px-4 pb-2 pt-3 text-sm"
      data-sheet-side={s.side}
      data-sheet-touched={touched ? "true" : "false"}
      aria-label={name}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <h3 className="text-sm font-semibold text-rb-500">{name}</h3>
        {s.icons.length > 0 && <InlineAssetCluster symbols={s.icons} size={16} overlap={5} max={4} />}
      </div>
      <div className={GRID}>
        {carry && (
          <>
            <div className={`${SUB} ${TINT} -mx-2 rounded-t-md px-2`} data-sheet-layer="carry">
              {s.carry.map((r) => (
                <div key={r.key} className="contents">
                  <Row r={r} tone={r.key === "last" ? "muted" : "plain"} col={col} />
                  {r.sub?.map((x) => (
                    <Row key={x.key} r={x} tone="sub" col={col} pad="py-1" indent />
                  ))}
                </div>
              ))}
            </div>
            {s.before && (
              <div
                className={`${SUB} ${TINT} -mx-2 rounded-b-md border-t border-dashed border-rb-300 px-2 dark:border-rb-600`}
              >
                <Row r={s.before} tone="muted" col={col} pad="py-2" />
              </div>
            )}
          </>
        )}
        {s.rows.map((r) => (
          <Row key={r.key} r={r} tone="event" col={col} pad="py-2" />
        ))}
        {listed && (
          <div className={`${SUB} ${TINT} -mx-2 mt-1 rounded-md px-2`} data-sheet-layer="assets">
            {s.assets?.map((r) => (
              <Row key={r.key} r={r} tone="plain" col={col} />
            ))}
            {(s.repaid?.length ?? 0) > 0 && (
              <Row
                r={{
                  key: "repaid",
                  label: WORDS.repaid(s.repaid!.length),
                  note: s.repaid!.join(", "),
                  amount: { text: "0.00" },
                  usd: { text: "$0" },
                }}
                tone="muted"
                col={col}
              />
            )}
          </div>
        )}
        {(touched || listed) && (
          <div aria-hidden className="col-span-full mt-1 border-t border-rb-300 dark:border-rb-600" />
        )}
        <div className="contents" data-sheet-row="total">
          <span className={`min-w-0 self-center py-2 text-sm ${touched ? "" : "text-rb-500"}`}>
            {touched ? null : WORDS.untouched}
          </span>
          <span className="py-2 max-sm:hidden" />
          <span
            className={`whitespace-nowrap py-2 text-right text-base font-semibold tabular-nums text-foreground ${USD_RULE} max-sm:border-l-0 max-sm:pl-0`}
            role="group"
            aria-label={`${name} total`}
          >
            {"none" in s.total ? (
              <span className="text-sm font-normal text-rb-500">{s.total.none}</span>
            ) : (
              <Fig f={s.total} />
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

function StatRows({ rows, muted, name }: { rows: SheetStat[]; muted?: boolean; name: string }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className="contents" data-sheet-row={r.key}>
          <span className={`min-w-0 py-1.5 ${muted ? "text-rb-500" : "text-foreground"}`}>{r.label}</span>
          <span className={`py-1.5 text-right ${muted ? "text-rb-500" : "text-foreground"}`}>
            {"none" in r.value ? (
              <span className="text-rb-500">{r.value.none}</span>
            ) : (
              <ChangeSwapValue
                level={r.value}
                change={r.change}
                name={typeof r.label === "string" ? r.label : name}
                className={r.tone}
              />
            )}
          </span>
        </div>
      ))}
    </>
  );
}

function StatPanel({ p, breakdown }: { p: SheetPanel; breakdown: boolean }) {
  const name = p.panel === "risk" ? WORDS.risk : WORDS.limits;
  return (
    <section
      className="min-w-0 rounded-xl bg-background px-4 py-3 text-sm"
      data-sheet-panel={p.panel}
      aria-label={name}
    >
      <h3 className="mb-1 text-sm font-semibold text-rb-500">{name}</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
        <StatRows rows={p.rows} name={name} />
        {breakdown && p.breakdown && p.breakdown.length > 0 && (
          <div className={`${SUB} ${TINT} -mx-2 rounded-md px-2`} data-sheet-layer="parameters">
            <StatRows rows={p.breakdown} muted name={name} />
          </div>
        )}
      </div>
      {p.caption && <p className="mt-2 text-xs leading-relaxed text-rb-500">{p.caption}</p>}
    </section>
  );
}

/** The sheet, drawn from the `sheet` slot. `breakdown`: the timeline's switch,
 *  always on an event page. `data` marks the sheet (the state of the read its
 *  figures come from). */
export function EventSheetView({
  sheet,
  breakdown,
  data,
}: {
  sheet: EventSheet;
  breakdown: boolean;
  data?: Record<string, string>;
}) {
  const [col, setCol] = useState<Col>("usd");
  return (
    <div className="px-5 py-2" data-sheet="" data-sheet-breakdown={breakdown ? "on" : "off"} {...data}>
      <div className="mb-2 flex justify-end sm:hidden">
        <div
          role="group"
          aria-label={WORDS.column}
          className="inline-flex shrink-0 rounded-md bg-sunken p-0.5 text-xs font-semibold"
          data-sheet-switch=""
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
              {c === "tokens" ? WORDS.tokens : WORDS.usd}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {sheet.sides.map((s) => (
          <SidePanel key={s.side} s={s} breakdown={breakdown} col={col} />
        ))}
        {sheet.panels.length > 0 && (
          <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2">
            {sheet.panels.map((p) => (
              <StatPanel key={p.panel} p={p} breakdown={breakdown} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
