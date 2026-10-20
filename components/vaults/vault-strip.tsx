"use client";

// The last 30 days (V5, rails-ops ui-jobs 413): a section under the vault card
// on the three vault pages, three tiles, Total assets · Share price · Holders.
// Each tile is the series' change over the one window of lib/vaults/yield.ts
// (the latest stored day against the stored day 30 days back, gaps widening
// it), the sentence naming the two reads' block, and a line of the stored
// days (reference/lifetime-price-chart.md ruling 3: one observation a day, a
// gap where the store has no row, nothing interpolated). No absolute figure:
// the number is the card's. The caption names the grain and the source once.

import { Prov } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { assetText } from "@/lib/shared/vault-amount-text";
import { stripChangeProv, stripYoungProv, type StripTile } from "@/lib/vaults/strip-provenance";
import { vaultHoldersProv } from "@/lib/vaults/row-provenance";
import type { VaultSummary } from "@/lib/vaults/summary";
import { changeText, type SeriesWindow, type VaultYield, type VaultYieldRead } from "@/lib/vaults/yield";
import type { VaultStripSeries } from "@/lib/vaults/yield-read";

const n = (v: number) => v.toLocaleString("en-US");
const dayText = (day: number) => formatDate(new Date(day * 86_400_000));

/** The price chart's line (components/shared/lifetime-flows-combined.tsx). */
const LINE_HUE = "var(--color-blue-500)";
const LINE_W = 1.5;
const VIEW_W = 300;
const VIEW_H = 40;
const PAD = 4;

/** The stored days as runs of consecutive days: a missing day ends a run. */
function runsOf(points: readonly VaultYieldRead[]): VaultYieldRead[][] {
  const runs: VaultYieldRead[][] = [];
  for (const p of points) {
    const run = runs[runs.length - 1];
    if (run && p.day === run[run.length - 1].day + 1) run.push(p);
    else runs.push([p]);
  }
  return runs;
}

function Sparkline({ points, label }: { points: readonly VaultYieldRead[]; label: string }) {
  if (points.length === 0) return null;
  const first = points[0].day;
  const span = Math.max(1, points[points.length - 1].day - first);
  const values = points.map((p) => Number(p.raw));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (day: number) => ((day - first) / span) * VIEW_W;
  // A flat series is a flat line through the middle.
  const y = (v: number) => (hi === lo ? VIEW_H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (VIEW_H - 2 * PAD));
  const runs = runsOf(points);
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="mt-2 block h-10 w-full overflow-visible"
      role="img"
      aria-label={label}
      data-strip-line=""
      data-strip-days={points.map((p) => p.day).join(",")}
      data-strip-runs={runs.length}
    >
      {runs.map((run) => (
        <path
          key={run[0].day}
          // A lone day is a dot: a zero-length stroke with a round cap.
          d={
            run.length === 1
              ? `M${x(run[0].day)},${y(Number(run[0].raw))}h0`
              : run.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day)},${y(Number(p.raw))}`).join("")
          }
          fill="none"
          stroke={LINE_HUE}
          strokeWidth={run.length === 1 ? 3 : LINE_W}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

type Measured = Extract<SeriesWindow, { from: VaultYieldRead }>;

/** The tile's sentence for a measured window. */
function changeSentence(tile: StripTile, v: VaultSummary, w: Measured, jump?: { day: number; change: number }) {
  const tail = ` over the ${w.days} days to block ${n(w.to.block)}`;
  if (w.change != null) {
    return `${changeText(w.change)}${tail}${jump ? `, ${changeText(jump.change)} of it on ${dayText(jump.day)}` : ""}`;
  }
  // A window that starts at zero has no percentage; the move is stated.
  if (BigInt(w.to.raw) === BigInt(0)) return `0 throughout the ${w.days} days to block ${n(w.to.block)}`;
  const to =
    tile === "holders"
      ? n(Number(w.to.raw))
      : assetText({ raw: w.to.raw, value: Number(BigInt(w.to.raw)) / 10 ** v.asset.decimals }, v.asset.decimals);
  return `from 0 to ${to}${tile === "holders" ? "" : ` ${v.asset.symbol}`}${tail}`;
}

function Tile({
  tile,
  label,
  children,
  window: w,
}: {
  tile: StripTile;
  label: string;
  children: React.ReactNode;
  window?: Measured;
}) {
  return (
    <div
      className="min-w-0 rounded-xl border border-rb-200 px-3 py-2.5 dark:border-rb-500/30"
      data-strip-tile={tile}
      {...(w
        ? {
            "data-strip-from-day": String(w.from.day),
            "data-strip-from-block": String(w.from.block),
            "data-strip-from-raw": w.from.raw,
            "data-strip-to-day": String(w.to.day),
            "data-strip-to-block": String(w.to.block),
            "data-strip-to-raw": w.to.raw,
            "data-strip-change": w.change == null ? "from-zero" : String(w.change),
          }
        : {})}
    >
      <div className="text-xs font-semibold text-rb-500">{label}</div>
      {children}
    </div>
  );
}

/** One series' tile: its change and its line, or what the store holds instead. */
function SeriesTile({
  tile,
  label,
  vault: v,
  series,
  jump,
  none,
}: {
  tile: StripTile;
  label: string;
  vault: VaultSummary;
  series: { key: string; window: SeriesWindow } | null;
  jump?: { day: number; change: number };
  /** What the tile says where the store holds no series. */
  none?: React.ReactNode;
}) {
  const w = series?.window;
  if (series && w && "from" in w) {
    return (
      <Tile tile={tile} label={label} window={w}>
        <p className="mt-1 text-[13px] text-foreground" data-strip-sentence="">
          <Prov info={stripChangeProv(tile, v, series.key, w)}>{changeSentence(tile, v, w, jump)}</Prov>
        </p>
        <Sparkline
          points={w.points}
          label={`${label}, one read a day over the ${w.days} days to block ${n(w.to.block)}`}
        />
      </Tile>
    );
  }
  if (series && w && "none" in w && w.none === "young") {
    return (
      <Tile tile={tile} label={label}>
        <p className="mt-1 text-[13px] text-rb-500" data-strip-sentence="" data-strip-none="young">
          <Prov info={stripYoungProv(tile, v, series.key, w.firstDay)}>{`series from ${dayText(w.firstDay)}`}</Prov>
        </p>
        <Sparkline points={w.points} label={`${label}, one read a day from ${dayText(w.firstDay)}`} />
      </Tile>
    );
  }
  return (
    <Tile tile={tile} label={label}>
      <p
        className="mt-1 text-[13px] text-rb-500"
        data-strip-sentence=""
        data-strip-none={series == null ? "unread" : "no-series"}
      >
        {none ?? (series == null ? "daily series not read" : "no daily series yet")}
      </p>
    </Tile>
  );
}

export function VaultStrip({
  vault: v,
  strip,
  yieldFigure,
}: {
  vault: VaultSummary;
  /** The store's three windows; null where the store did not answer. */
  strip: VaultStripSeries | null;
  /** The share price's Yield, for the one-day jump its subline names. */
  yieldFigure?: VaultYield;
}) {
  const c = v.census;
  const holdersMeasured = strip != null && "from" in strip.holders.window;
  const holdersYoung = strip != null && "none" in strip.holders.window && strip.holders.window.none === "young";
  // Holders: the store's series once it serves one; until then the census's
  // read and no line. A family with no census says so, as the card does.
  const holdersNone =
    c == null ? (
      <span data-strip-census="none">no census</span>
    ) : (
      <span data-strip-census={c.atBlock}>
        <Prov info={vaultHoldersProv(v, c)}>{`${n(c.holders)} holders at the census block ${n(c.atBlock)}`}</Prov>; no
        daily series yet
      </span>
    );
  return (
    <section className="mb-6" data-anatomy="V5" data-vault-strip={v.address} data-skel-section="vault-strip">
      <h2 className="text-sm font-semibold text-foreground">The last 30 days</h2>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SeriesTile tile="total-assets" label="Total assets" vault={v} series={strip?.totalAssets ?? null} />
        <SeriesTile
          tile="share-price"
          label="Share price"
          vault={v}
          series={strip?.sharePrice ?? null}
          jump={yieldFigure && "jump" in yieldFigure ? yieldFigure.jump : undefined}
        />
        <SeriesTile
          tile="holders"
          label="Holders"
          vault={v}
          series={strip == null ? null : strip.holders}
          none={holdersMeasured || holdersYoung ? undefined : holdersNone}
        />
      </div>
      <p className="mt-2 text-[11px] text-rb-500" data-strip-caption="">
        One read a day at the day&rsquo;s block, from Rails&rsquo;s daily store.
      </p>
    </section>
  );
}
