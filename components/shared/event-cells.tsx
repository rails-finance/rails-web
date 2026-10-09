"use client";

// T2's grid (rails-ops reference/shared-event-card-spec.md §3; ui-jobs 309
// step 4): the card's `cells` slot, drawn by the shell. Ledger cells first at
// full width, then half-width stat cells, one column and two from 640px. The
// shell owns the colour rules: a value this event changed in the foreground
// and one it left muted, a before muted (ui-jobs 79); a heading in the
// foreground where its cell carries a before → after for this event, muted
// where it restates the standing value, and a derived cell's heading following
// its inputs (ui-jobs 243).

import { useContext, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  ClosedLabel,
  DeltaToggle,
  StatCard,
  StatSubline,
  StateTransition,
  changeTone,
} from "@/components/shared/state-transition";
import { ClosedTokens, LedgerCell, T2Skeleton, type ClosedUsdFigures } from "@/components/shared/event-ledger";
import { EventLedgerContext, ledgerFigure } from "@/components/shared/event-ledger-context";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** A figure in a cell: as the family formats it, with its receipt. */
export interface EventFigure {
  text: ReactNode;
  /** The amount, where the cell is a ledger cell's: the shell states it at
   *  the decimals the opened ledger prints. */
  n?: number;
  /** The sign before a change's magnitude. */
  sign?: string;
  info?: Provenance;
  /** The exact value the receipt keys on. */
  value?: string;
  /** The figure echoes another figure's receipt (the header's change). */
  echo?: { symbol?: string };
}

/** A cell's value: before → after, or a lead in words, then the after. */
export interface EventCellValue {
  before?: EventFigure;
  /** With `before`, the arrow toggles to "+delta =". */
  delta?: EventFigure;
  /** In place of `before →`: the change in words, which the shell follows
   *  with "=". */
  lead?: ReactNode;
  after?: EventFigure;
  /** The after's tone where it is not the change tone (a ratio's colour). */
  afterClass?: string;
  /** The word in place of the after (the position closed). */
  closed?: string;
  /** The word in place of an after that does not apply. */
  none?: string;
  /** The token whose icon follows the after. */
  icon?: string;
  /** The token's contract, where the family can name it: the icon asks the
   *  icon CDNs by address where the house table does not know the symbol. */
  iconAddress?: string;
  /** A figure after the after, in its line: the after's dollars as a chip,
   *  on a stat cell (a ledger cell states its dollars through `usd`). */
  chip?: ReactNode;
}

interface EventCellCommon {
  /** The cell's key, which a derived cell's `inputs` name. */
  key: string;
  label: string;
  /** This event moved the cell's value. */
  changed: boolean;
  /** The cells this one is derived from (a ratio from its collateral and
   *  debt): its heading is in the foreground where any of them moved. */
  inputs?: string[];
  value: EventCellValue;
  /** Lines under the value, each in the tone of what it qualifies. */
  sub?: { content: ReactNode; changed?: boolean }[];
}

export interface EventLedgerCellSpec extends EventCellCommon {
  kind: "ledger";
  side: FlowSide;
  /** The side's dollars, before → after, at the event's price. */
  usd?: ClosedUsdFigures;
}

export interface EventStatCellSpec extends EventCellCommon {
  kind: "stat";
}

export type EventCellSpec = EventLedgerCellSpec | EventStatCellSpec;

/** A cell's name before its figures land, for the skeleton. */
export type EventCellHead = { kind: "ledger"; side: FlowSide; label: string } | { kind: "stat"; label: string };

/** The `cells` slot: the ordered cells; or the cells to come, while the
 *  figures are read; or the reason the event has none. */
export type EventCells = EventCellSpec[] | { pending: EventCellHead[] } | { none: string };

function Figure({ f, icon, children }: { f: EventFigure; icon?: ReactNode; children: ReactNode }) {
  if (f.info && f.echo)
    return (
      <Prov echo info={f.info} value={f.value} symbol={f.echo.symbol}>
        {children}
      </Prov>
    );
  if (f.info)
    return (
      <Prov info={f.info} value={f.value} icon={icon}>
        {children}
      </Prov>
    );
  if (icon)
    return (
      <span className="inline-flex items-center gap-1">
        {children}
        {icon}
      </span>
    );
  return <>{children}</>;
}

function CellValue({ cell }: { cell: EventCellSpec }) {
  const { value: v, changed } = cell;
  const src = useContext(EventLedgerContext);
  const side = cell.kind === "ledger" ? cell.side : undefined;
  const dec = side ? (src?.decimals?.(side) ?? null) : null;
  const shown = (f: EventFigure): ReactNode => {
    const text = f.n != null && typeof f.text === "string" ? ledgerFigure(f.n, dec, f.text) : f.text;
    return !f.sign ? (
      text
    ) : typeof text === "string" ? (
      `${f.sign}${text}`
    ) : (
      <>
        {f.sign}
        {text}
      </>
    );
  };
  const before = v.before;
  const icon = v.icon ? <TokenChipIcon symbol={v.icon} address={v.iconAddress} size={16} /> : undefined;
  return (
    <>
      {v.lead != null ? (
        <span className="inline-flex items-center gap-1" data-cell-lead="">
          <span className="text-sm font-semibold text-foreground tabular-nums">{v.lead}</span>
          <span className="text-sm font-semibold text-rb-500">=</span>
        </span>
      ) : (
        before && (
          <DeltaToggle
            before={<Figure f={before}>{shown(before)}</Figure>}
            delta={v.delta ? <Figure f={v.delta}>{shown(v.delta)}</Figure> : null}
          />
        )
      )}
      {v.closed != null ? (
        <>
          <ClosedLabel text={v.closed} />
          {icon}
        </>
      ) : v.none != null ? (
        <span className="text-sm font-semibold text-rb-500">{v.none}</span>
      ) : (
        v.after && (
          <Figure f={v.after} icon={icon}>
            <span className={`text-sm font-semibold ${v.afterClass ?? changeTone(changed)}`}>{shown(v.after)}</span>
          </Figure>
        )
      )}
      {v.chip}
    </>
  );
}

function Cell({ cell, heading }: { cell: EventCellSpec; heading: boolean }) {
  const subs = cell.sub?.map((s, i) => (
    <StatSubline key={i} changed={s.changed}>
      {s.content}
    </StatSubline>
  ));
  if (cell.kind === "ledger")
    return (
      <LedgerCell label={cell.label} side={cell.side} changed={heading}>
        <StateTransition>
          <ClosedTokens usd={cell.usd}>
            <CellValue cell={cell} />
          </ClosedTokens>
        </StateTransition>
        {subs}
      </LedgerCell>
    );
  return (
    <StatCard label={cell.label} changed={heading}>
      <StateTransition>
        <CellValue cell={cell} />
      </StateTransition>
      {subs}
    </StatCard>
  );
}

/** The grid, drawn from the `cells` slot. */
export function EventCellGrid({ cells }: { cells: EventCells }) {
  if ("none" in cells) return null;
  if ("pending" in cells)
    return (
      <T2Skeleton
        ledgers={cells.pending.flatMap((c) => (c.kind === "ledger" ? [{ label: c.label, side: c.side }] : []))}
        stats={cells.pending.flatMap((c) => (c.kind === "stat" ? [c.label] : []))}
      />
    );
  const byKey = new Map(cells.map((c) => [c.key, c]));
  const heading = (c: EventCellSpec) => c.changed || !!c.inputs?.some((k) => byKey.get(k)?.changed);
  const ordered = [...cells.filter((c) => c.kind === "ledger"), ...cells.filter((c) => c.kind === "stat")];
  return (
    <div className="px-5 py-2">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-flow-row-dense sm:auto-rows-fr sm:grid-cols-2 sm:has-[[data-ledger-span]]:auto-rows-auto">
        {ordered.map((c) => (
          <Cell key={c.key} cell={c} heading={heading(c)} />
        ))}
      </div>
    </div>
  );
}
