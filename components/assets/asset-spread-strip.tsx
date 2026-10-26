"use client";

// The spread strip under an asset chart (rails-ops reference/asset-key-map.md,
// "The spread"): each other line's deviation from the main line at the
// cursor, its day on the daily chart or its moment on the rounds chart. When
// every line stays within SPREAD_LIMIT the strip is one line saying so; a line
// that passes it names its largest gap, and that gap puts the cursor there. A
// Maker OSM line's gap names the hour's delay that causes it (Miles, 26 Oct
// 2026); so does the heading where the main line is one (an asset page read
// from Maker's side, `?via=makerdao`).

import { formatDate } from "@/lib/date";
import { delayedLine, lineReaders, type PageLine } from "@/lib/shared/asset-roster";
import { fmtSignedSpread, fmtSpread, SPREAD_LIMIT, type LineSpread } from "@/lib/shared/asset-spread";
import { roundTime } from "@/components/assets/round-time";

const DAY_MS = 86_400_000;
const dayDate = (day: number) => formatDate(new Date(day * DAY_MS));

export function AssetSpreadStrip({
  main,
  others,
  cursorDay,
  cursorTs,
  valueAt,
  onJump,
}: {
  main: PageLine;
  /** Each other drawn line with its spread from `main`. */
  others: { line: PageLine; spread: LineSpread }[];
  cursorDay: number | null;
  /** On the rounds chart: the cursor's moment, and each line's deviation then. */
  cursorTs?: number | null;
  valueAt?: (lineId: string) => number | null;
  onJump: (day: number, ts?: number) => void;
}) {
  if (others.length === 0) return null;
  const limit = fmtSpread(SPREAD_LIMIT);
  const mainName = main.oracle.name;
  const compared = others.filter((o) => o.spread.largest != null);
  const apart = others.length - compared.length;
  const loud = others.some((o) => o.spread.passes);
  const onRounds = valueAt != null;
  if (!loud) {
    const n = compared.length;
    return (
      <p className="mt-3 text-xs text-rb-500" data-asset-spread="quiet" data-anatomy="A3.1">
        {n === 0
          ? `No other line was read within ten minutes of ${mainName} on any day.`
          : `${n === 1 ? "The other line agrees" : `The ${n} other lines agree`} with ${mainName} within ${limit}${
              apart > 0 ? `; ${apart} more ${apart === 1 ? "was" : "were"} never read within ten minutes of it` : ""
            }.`}
      </p>
    );
  }
  // Two lines with one set of readers are told apart by their oracle.
  const labels = others.map((o) => lineReaders(o.line));
  const label = (i: number) =>
    labels.filter((l) => l === labels[i]).length > 1 ? `${labels[i]} (${others[i].line.oracle.name})` : labels[i];
  const when = (g: NonNullable<LineSpread["largest"]>) => (g.ts != null ? roundTime(g.ts) : dayDate(g.day));
  const stamp = onRounds
    ? cursorTs != null
      ? roundTime(cursorTs)
      : null
    : cursorDay != null
      ? dayDate(cursorDay)
      : null;
  return (
    <div className="mt-3 text-xs" data-asset-spread="loud" data-anatomy="A3.1">
      <div className="flex items-baseline justify-between gap-3 text-rb-500">
        <span>
          Each line against {mainName}
          {delayedLine(main) ? ", an hour-delayed price" : ""}; a gap past {limit} is named
        </span>
        {stamp && <span className="shrink-0 tabular-nums">{stamp}</span>}
      </div>
      <ul className="mt-1 space-y-0.5">
        {others.map((o, i) => {
          const at = onRounds
            ? (valueAt(o.line.id) ?? undefined)
            : cursorDay == null
              ? undefined
              : o.spread.byDay.get(cursorDay);
          const big = o.spread.passes ? o.spread.largest : null;
          const cause = delayedLine(o.line) ? ", an hour-delayed price," : "";
          return (
            <li
              key={o.line.id}
              className="flex items-baseline justify-between gap-3"
              data-asset-spread-line={o.line.id}
              data-asset-spread-gap={big ? big.dev : undefined}
              data-asset-spread-delayed={cause ? "" : undefined}
            >
              {big ? (
                <button
                  type="button"
                  className="min-w-0 text-left text-foreground hover:underline"
                  onClick={() => onJump(big.day, big.ts)}
                  title="Put the cursor on this gap"
                >
                  {label(i)}
                  {cause} {fmtSpread(big.dev)} {big.dev > 0 ? "above" : "below"} {mainName}, {when(big)}
                </button>
              ) : (
                <span className="min-w-0 text-rb-500">
                  {label(i)}
                  {o.spread.largest == null ? " (never read within ten minutes of it)" : ""}
                </span>
              )}
              <span
                className={`shrink-0 tabular-nums ${at != null && Math.abs(at) > SPREAD_LIMIT ? "text-[var(--caution)]" : "text-rb-500"}`}
                data-asset-spread-at={at ?? ""}
                title={
                  at == null
                    ? onRounds
                      ? "No stored round for this line at this moment"
                      : "Not read within ten minutes of the main line on this day"
                    : undefined
                }
              >
                {at == null ? "–" : fmtSignedSpread(at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
