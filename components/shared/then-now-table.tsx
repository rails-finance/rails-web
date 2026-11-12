"use client";

// The then / now table (rails-ops standards/reading-contract.md §3): a change
// over time as two figures side by side, a dated past column and "Now", rows
// grouped under a short title. Every cell is a figure or a single word and
// carries its row's receipt; a row with no past side by nature leaves that
// cell blank, and one whose past side was not read shows "—".

import { Prov, type Provenance } from "@/components/shared/provenance";

export interface ThenNowRow {
  id: string;
  label: string;
  /** The figure at the past block; null where there is none. */
  then: string | null;
  now: string;
  /** A fact with no past side by nature (a change, a setting). */
  single?: true;
  /** One line under the label: why a figure moved or why a cell is empty. Up to
   *  eight words, lower case, no full stop; the (i) carries the full account. */
  note?: string;
  info: Provenance | null;
  /** The row's `data-*` hooks. */
  data?: Record<string, string>;
}
export interface ThenNowGroup {
  title: string;
  rows: ThenNowRow[];
}
export interface ThenNowWords {
  /** The past column's date; null where the page has no past read. */
  then: string | null;
  now: string;
  groups: ThenNowGroup[];
}

const figure = (text: string, info: Provenance | null) => (info ? <Prov info={info}>{text}</Prov> : text);

export function thenNowMarkdown({ then, now, groups }: ThenNowWords): string[] {
  return groups.flatMap((g) => [
    "",
    `### ${g.title}`,
    "",
    then ? `| | ${then} | ${now} |` : `| | ${now} |`,
    then ? "|---|---:|---:|" : "|---|---:|",
    ...g.rows.map((r) =>
      then
        ? `| ${r.label}${r.note ? ` (${r.note})` : ""} | ${r.single ? "" : (r.then ?? "—")} | ${r.now} |`
        : `| ${r.label}${r.note ? ` (${r.note})` : ""} | ${r.now} |`,
    ),
  ]);
}

export function ThenNowTable({ then, now, groups, rowAnatomy }: ThenNowWords & { rowAnatomy: string }) {
  const cols = then
    ? "grid-cols-[minmax(0,1fr)_5rem_5rem] sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"
    : "grid-cols-[minmax(0,1fr)_5rem] sm:grid-cols-[minmax(0,1fr)_8rem]";
  return (
    <div className="mt-2 max-w-2xl rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
      {groups.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? "mt-4" : undefined} data-readout-group={g.title}>
          <div className={`grid ${cols} gap-x-4 pb-1.5 text-xs text-rb-500`}>
            <span className="font-semibold text-foreground">{g.title}</span>
            {then && <span className="text-right">{gi === 0 ? then : ""}</span>}
            <span className="text-right">{gi === 0 ? now : ""}</span>
          </div>
          <ul className="divide-y divide-rb-200 border-t border-rb-200 dark:divide-rb-500/30 dark:border-rb-500/30">
            {g.rows.map((row) => (
              <li
                key={row.id}
                className={`grid ${cols} gap-x-4 py-2 text-[13px] leading-snug tabular-nums`}
                data-anatomy={rowAnatomy}
                {...row.data}
              >
                <span className="text-rb-500">
                  {row.label}
                  {row.note && (
                    <span className="block text-xs text-rb-500/80" data-row-note="">
                      {row.note}
                    </span>
                  )}
                </span>
                {then && (
                  <span className="text-right text-rb-500">
                    {row.single ? "" : row.then == null ? "—" : figure(row.then, row.info)}
                  </span>
                )}
                <span className="text-right text-foreground">{figure(row.now, row.info)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
