// The position card's right-hand panel (rails-ops TO-DO-position-card 322):
// the additive values as label and value rows in a bordered panel beside the
// key values. Always shown. Beside two key values it takes two columns of rows,
// beside three it narrows to one; below lg it stacks under the key values at
// full width. The listing card (324) shows the top rows as one line instead
// (`PositionPanelSummary`).

import type { ReactNode } from "react";

export interface PositionPanelRow {
  /** Stable key, and the row's `data-panel-row`. */
  id: string;
  label: string;
  value: ReactNode;
  /** A line under the row across the panel's width (a runway bar). */
  below?: ReactNode;
}

export function PositionCardPanel({ rows, columns = 1 }: { rows: PositionPanelRow[]; columns?: 1 | 2 }) {
  if (rows.length === 0) return null;
  const half = Math.ceil(rows.length / 2);
  const groups = columns === 2 ? [rows.slice(0, half), rows.slice(half)] : [rows];
  return (
    <div
      className={`rounded-xl bg-rb-200/50 px-4 py-3 dark:bg-white/[0.04] ${columns === 2 ? "grid gap-x-8 gap-y-1.5 sm:grid-cols-2" : ""}`}
      data-position-panel=""
      data-anatomy="C18"
    >
      {groups.map((group, g) => (
        <dl key={g} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-1.5">
          {group.map((r) => (
            <div key={r.id} className="contents" data-panel-row={r.id}>
              <dt className="text-xs font-semibold text-rb-500">{r.label}</dt>
              <dd className="min-w-0 text-sm font-semibold tabular-nums text-foreground/80">{r.value}</dd>
              {r.below && <dd className="col-span-2 -mt-0.5 mb-0.5">{r.below}</dd>}
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}

/** The listing card's panel (324): its top rows on one line. */
export function PositionPanelSummary({ rows }: { rows: { id: string; label: string; value: ReactNode }[] }) {
  if (rows.length === 0) return null;
  return (
    <div
      className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-rb-500"
      data-position-panel-summary=""
    >
      {rows.map((r) => (
        <span key={r.id} className="tabular-nums" data-panel-row={r.id}>
          {r.label} <span className="font-semibold text-foreground/80">{r.value}</span>
        </span>
      ))}
    </div>
  );
}
