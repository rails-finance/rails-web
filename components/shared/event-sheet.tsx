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
// breakdown on, and under them the lines a family keeps for the breakdown (a
// swap's gross legs). Every row the family gives a `tip` ends its label with a "?"
// that opens the tip on a click or a tap (reveal-tip.tsx), the totals and the
// repaid row included.
//
// A row above the panels holds the card's breakdown switch, "Show breakdown" /
// "Hide breakdown", which changes this card alone and starts off each time the
// card opens; an event's page draws the breakdown with no switch. Under 640px
// one value column is drawn, the asset figure or the USD, picked by the
// asset | USD switch at the other end of that row; a row with no figure in the picked
// column draws the other.

import { useState, type ReactNode } from "react";
import { HeadingTip } from "@/components/shared/tip-label";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { ChangeSwapValue, type SwapFigure } from "@/components/shared/change-swap-value";
import { ListChevronsIcon } from "@/components/shared/list-chevrons-icon";
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
  /** The asset figure; its icon follows it, and opens the asset's popover.
   *  `address`: the token's contract, where the family's data carries it. */
  amount?: SheetFigure & { symbol?: string; address?: string };
  usd?: SheetFigure;
  /** The row's read-more: what the figure is and where it comes from, behind
   *  a "?" at the end of the label. */
  tip?: string;
}

/** One side of the sheet. */
export interface SheetSide {
  side: FlowSide;
  /** The side's heading, in place of "Collateral" / "Debt": a lender's
   *  position has neither (Maple's "Pool claim"). `data-sheet-side` keeps the
   *  `side` value. */
  name?: string;
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
  /** The total line's words where the side has no rows; unset, "Not changed
   *  by this event" (a moment's card: "No events this day"). */
  untouched?: string;
  /** The total line's words where the side has rows; unset, "After this
   *  event" (a group's summary: "After these events"). */
  after?: string;
  /** The total's read-more, behind a "?" in its label cell. */
  totalTip?: string;
  /** The repaid assets row's read-more. */
  repaidTip?: string;
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
  /** The row's read-more, behind a "?" at the end of the label. */
  tip?: string;
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
  /** Lines under the panels drawn with the breakdown on (a swap's gross
   *  legs). */
  breakdownNotes?: ReactNode;
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
  after: "After this event",
  // The headings' read-mores (decision 0038), the same on every family.
  tipCollateral: "The position's collateral: what this event moved, then the total it stands at after.",
  tipDebt: "The position's debt: what this event moved, then the total it stands at after, interest included.",
  tipRisk: "How far the position stands from liquidation after this event.",
  tipLimits: "The protocol's limits on the position and the room left inside them after this event.",
  repaid: (n: number) => `${n} repaid ${n === 1 ? "asset" : "assets"}`,
  column: "Column shown",
  show: "Show breakdown",
  hide: "Hide breakdown",
  tokens: "Asset",
  usd: "USD",
  oracle: "The protocol's oracle, at this block",
  total: (side: string) => `${side} total`,
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

const nameOf = (label: ReactNode, key: string) => (typeof label === "string" ? label : key);

/** The three columns: label, asset figure and its icon, USD. Under 640px the
 *  label and one value column. */
const GRID = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4";
const SUB = "col-span-full grid grid-cols-subgrid";
const USD_RULE = "border-l border-rb-300 pl-4 dark:border-rb-600";
/** The breakdown's tint. */
const TINT = "bg-raised";

type Tone = "event" | "plain" | "muted" | "sub";
const TONE: Record<Tone, string> = {
  event: "font-semibold text-foreground",
  plain: "text-foreground",
  muted: "text-rb-500",
  sub: "text-xs text-rb-500 sm:text-sm",
};

/** Where a row's price comes from, as its USD receipt states it: the
 *  receipt's contract, or the oracle where the receipt's price input is the
 *  oracle's. */
function priceSourceOf(r: SheetRow): string | undefined {
  const info = r.usd?.info;
  const sym = r.amount?.symbol;
  if (!info || !sym) return undefined;
  if (info.contract?.name) return info.contract.name;
  const input = info.inputs?.find((x) => x.label === `${sym} price`);
  return input?.pclass === "oracle" ? WORDS.oracle : undefined;
}

/** The asset figure and its icon; the icon opens the asset's popover, which
 *  states the row's price (`note`) and its source where the row has them. */
function AmountCell({ r }: { r: SheetRow }) {
  const a = r.amount!;
  const focusAddress = useFlowFocus()?.model?.addresses?.[a.symbol ?? ""];
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <Fig f={a} />
      {a.symbol && (
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center" data-ledger-icon={a.symbol}>
          <AssetPopover
            symbol={a.symbol}
            address={a.address ?? focusAddress}
            price={r.note ?? undefined}
            priceSource={r.note != null ? priceSourceOf(r) : undefined}
            className="opacity-70"
          >
            <TokenChipIcon
              symbol={a.symbol}
              address={a.address ?? focusAddress}
              size={14}
              filterable={false}
              untitled
            />
          </AssetPopover>
        </span>
      )}
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
        <HeadingTip text={r.label} tip={r.tip} name={nameOf(r.label, r.key)} />
        {r.note != null && <span className="text-rb-500"> · {r.note}</span>}
      </span>
      <span className={`${pad} text-right tabular-nums ${t} max-sm:hidden`} data-sheet-col="amount">
        {r.amount && <AmountCell r={r} />}
      </span>
      <span
        className={`${pad} text-right tabular-nums whitespace-nowrap ${t} ${USD_RULE} max-sm:hidden`}
        data-sheet-col="usd"
      >
        {r.usd && <Fig f={r.usd} />}
      </span>
      <span className={`${pad} text-right tabular-nums whitespace-nowrap ${t} sm:hidden`} data-sheet-col="phone">
        {phone === "amount" && r.amount ? <AmountCell r={r} /> : phone === "usd" && r.usd ? <Fig f={r.usd} /> : null}
      </span>
    </div>
  );
}

function SidePanel({ s, breakdown, col }: { s: SheetSide; breakdown: boolean; col: Col }) {
  const touched = s.rows.length > 0;
  const carry = breakdown && (s.carry.length > 0 || s.before);
  const listed = breakdown && ((s.assets?.length ?? 0) > 0 || (s.repaid?.length ?? 0) > 0);
  const name = s.name ?? (s.side === "collateral" ? WORDS.collateral : WORDS.debt);
  return (
    <section
      className="min-w-0 rounded-xl bg-background px-4 pb-2 pt-3 text-sm"
      data-sheet-side={s.side}
      data-sheet-touched={touched ? "true" : "false"}
      aria-label={name}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <h3 className="text-sm font-semibold text-rb-500">
          <HeadingTip
            text={name}
            tip={s.name ? undefined : s.side === "collateral" ? WORDS.tipCollateral : WORDS.tipDebt}
          />
        </h3>
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
                  tip: s.repaidTip,
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
          <span className="min-w-0 self-center py-2 text-sm text-rb-500">
            {/* The total line's words open its read-more: "After this event"
                on a side the event moved, the side's own words elsewhere. */}
            <HeadingTip
              text={touched ? (s.after ?? WORDS.after) : (s.untouched ?? WORDS.untouched)}
              tip={s.totalTip}
              name={WORDS.total(name)}
            />
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
          <span className={`min-w-0 py-1.5 ${muted ? "text-rb-500" : "text-foreground"}`}>
            <HeadingTip text={r.label} tip={r.tip} name={nameOf(r.label, r.key)} />
          </span>
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
      <h3 className="mb-1 text-sm font-semibold text-rb-500">
        <HeadingTip text={name} tip={p.panel === "risk" ? WORDS.tipRisk : WORDS.tipLimits} />
      </h3>
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

/** The sheet before its figures land: its control row, its side panels
 *  (the first as a side the event moved: a row and the total; the rest the
 *  total alone) and its Risk and Limits pair, each line at the loaded line's
 *  height with a bar where its figure will stand, so the swap moves nothing. */
export function SheetSkeleton({ sides = 2, panels = 2 }: { sides?: number; panels?: number }) {
  const bar = (w: string) => <span className={`block h-3 rounded bg-rb-200 dark:bg-rb-700 ${w}`} />;
  return (
    <div className="animate-pulse px-5 py-2" aria-busy="true" data-sheet-skeleton="">
      <div className="mb-2 flex justify-end">
        <span className="block size-7 rounded-md bg-sunken" />
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: sides }, (_, i) => (
          <div key={i} className="rounded-xl bg-background px-4 pb-2 pt-3 text-sm">
            <div className="mb-2 flex h-5 items-center">{bar("w-20")}</div>
            {i === 0 && (
              <>
                <div className="flex h-9 items-center justify-between">
                  {bar("w-28")}
                  {bar("w-16")}
                </div>
                <div className="mt-1 border-t border-rb-300 dark:border-rb-600" />
              </>
            )}
            <div className="flex h-10 items-center justify-end">{bar("w-20")}</div>
          </div>
        ))}
        {panels > 0 && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {Array.from({ length: panels }, (_, i) => (
              <div key={i} className="rounded-xl bg-background px-4 py-3 text-sm">
                <div className="mb-1 flex h-5 items-center">{bar("w-14")}</div>
                {[0, 1].map((r) => (
                  <div key={r} className="flex h-8 items-center justify-between">
                    {bar("w-24")}
                    {bar("w-12")}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="sr-only">Reading the position at this block</span>
    </div>
  );
}

/** The sheet, drawn from the `sheet` slot. `breakdown`: the breakdown stands
 *  with no switch (an event's page); else the card's switch, off at first,
 *  shows it. `data` marks the sheet (the state of the read its figures come
 *  from). */
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
  const [shown, setShown] = useState(false);
  const on = breakdown || shown;
  return (
    <div className="px-5 py-2" data-sheet="" data-sheet-breakdown={on ? "on" : "off"} {...data}>
      <div
        className={`mb-2 flex items-center justify-end gap-3 ${breakdown ? "sm:hidden" : ""}`}
        data-sheet-controls=""
      >
        <div
          role="group"
          aria-label={WORDS.column}
          className="inline-flex shrink-0 rounded-md bg-sunken p-0.5 text-xs font-semibold sm:hidden"
          data-sheet-column=""
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
        {!breakdown && (
          <button
            type="button"
            aria-label={shown ? WORDS.hide : WORDS.show}
            title={shown ? WORDS.hide : WORDS.show}
            data-sheet-switch=""
            onClick={(e) => {
              e.stopPropagation();
              setShown((v) => !v);
            }}
            className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md text-rb-500 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 max-sm:min-h-9 max-sm:min-w-9"
          >
            <ListChevronsIcon open={shown} className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {sheet.sides.map((s) => (
          <SidePanel key={s.side} s={s} breakdown={on} col={col} />
        ))}
        {sheet.panels.length > 0 && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {sheet.panels.map((p) => (
              <StatPanel key={p.panel} p={p} breakdown={on} />
            ))}
          </div>
        )}
      </div>
      {on && sheet.breakdownNotes && (
        <div className="-mx-5 pt-2" data-sheet-layer="notes">
          {sheet.breakdownNotes}
        </div>
      )}
    </div>
  );
}
