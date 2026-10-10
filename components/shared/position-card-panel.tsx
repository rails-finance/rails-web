// The position card's inset panel (rails-ops TO-DO-position-card 322): the
// additive values as label and value rows, in two columns beneath the
// headline row and across its width. Below sm the columns stack, the left
// column first. One size and weight for every row: labels muted, values in
// the foreground, no charts. The listing card has no panel (324).

import type { ReactNode } from "react";

export interface PositionPanelRow {
  /** Stable key, and the row's `data-panel-row`. */
  id: string;
  label: string;
  value: ReactNode;
}

export function PositionCardPanel({ columns }: { columns: [PositionPanelRow[], PositionPanelRow[]] }) {
  const filled = columns.filter((c) => c.length > 0);
  if (filled.length === 0) return null;
  return (
    <div
      className="mt-4 grid gap-x-10 gap-y-1.5 rounded-xl bg-rb-200/50 px-4 py-3 text-sm dark:bg-white/[0.04] sm:grid-cols-2"
      data-position-panel=""
      data-anatomy="C18"
    >
      {filled.map((group, g) => (
        <dl key={g} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-1.5">
          {group.map((r) => (
            <div key={r.id} className="contents" data-panel-row={r.id}>
              <dt className="text-rb-500">{r.label}</dt>
              <dd className="min-w-0 tabular-nums text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}
