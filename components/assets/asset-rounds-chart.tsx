"use client";

// An asset chart's stored rounds (rails-ops reference/asset-key-map.md,
// "Rounds and the daily join"; anatomy A3.3): every change of each line's
// value in force over the rounds' span, held flat to the next (a step), the
// main line in its hue and the others thin beneath it on one axis. The
// cursor follows the pointer; its readout names the main line's price then
// and the round that set it (proxy round id, block, transaction), and the
// spread strip under the chart reads the same moment.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { LINE_HUE } from "@/components/shared/lifetime-flows-combined";
import { formatPrice, priceAxis, priceAxisLabels } from "@/lib/shared/flows-price";
import { roundAt, type PriceRounds } from "@/lib/shared/price-series";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { roundTime } from "@/components/assets/round-time";

const H = 180;
const PAD_L = 44;
const PAD_R = 8;
const PAD_Y = 8;

/** A proxy round id (phase << 64 | aggregator round) as "phase 2, round 86,510". */
export function roundName(id: string): string {
  const n = BigInt(id);
  const shift = BigInt(64);
  const phase = n >> shift;
  const round = n - (phase << shift);
  return `phase ${phase.toString()}, round ${Number(round).toLocaleString("en-US")}`;
}

/** A feed's view pair as words: "eth_usd_71041d" → "ETH / USD",
 *  "wsteth_steth_exchange_rate" → "WSTETH / STETH exchange rate". */
export function legName(pair: string): string {
  const [a, b, ...rest] = pair.replace(/_[0-9a-f]{6}$/, "").split("_");
  return [b ? `${a.toUpperCase()} / ${b.toUpperCase()}` : a.toUpperCase(), ...rest].join(" ");
}

export interface RoundsChartLine {
  id: string;
  name: string;
  rounds: PriceRounds;
}

export function AssetRoundsChart({
  lines,
  mainId,
  chain,
  cursorTs,
  onCursorTs,
}: {
  lines: RoundsChartLine[];
  mainId: string;
  chain: number;
  /** The moment the cursor stands at (null: the checkpoint). */
  cursorTs: number | null;
  onCursorTs: (ts: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const main = lines.find((l) => l.id === mainId) ?? lines[0];
  const t0 = Math.min(...lines.map((l) => l.rounds.points[0][0]));
  const t1 = Math.max(...lines.map((l) => l.rounds.asOf.ts));
  const axis = useMemo(() => priceAxis(lines.flatMap((l) => l.rounds.points.map((p) => p[1]))), [lines]);
  const labels = useMemo(() => priceAxisLabels(axis.ticks), [axis]);
  const run = Math.max(1, w - PAD_L - PAD_R);
  const x = useCallback((t: number) => PAD_L + ((t - t0) / Math.max(1, t1 - t0)) * run, [t0, t1, run]);
  const y = (v: number) => H - PAD_Y - ((v - axis.min) / (axis.max - axis.min || 1)) * (H - PAD_Y * 2);
  const step = (r: PriceRounds) =>
    r.points
      .map((p, i) => {
        const next = r.points[i + 1]?.[0] ?? r.asOf.ts;
        return `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}H${x(next).toFixed(1)}`;
      })
      .join("");
  const at = cursorTs ?? t1;
  const cur = roundAt(main.rounds, at);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const t = t0 + ((px - PAD_L) / run) * (t1 - t0);
    onCursorTs(Math.max(t0, Math.min(t1, Math.round(t))));
  };
  const leg = cur ? main.rounds.legs[cur[3]] : null;
  const tx = (h: string) => explorerUrl(chain as ChainId, "tx", h);
  return (
    <div data-asset-rounds-chart="" data-anatomy="A3.3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs" data-asset-rounds-readout="">
        <span className="text-rb-500 tabular-nums">{roundTime(at)}</span>
        {cur && (
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">{formatPrice(cur[1], "USD")}</span>
            <span className="text-rb-500">
              {" "}
              {leg?.kind === "cap" ? "cap row" : cur[6] ? roundName(cur[6]) : "round"}
              {main.rounds.legs.length > 1 && leg?.kind === "feed" ? ` of ${legName(leg.name)}` : ""}, block{" "}
              {cur[4].toLocaleString("en-US")},{" "}
              <a href={tx(cur[5])} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                {cur[5].slice(0, 10)}…
              </a>
            </span>
          </span>
        )}
      </div>
      <div ref={box} className="relative w-full">
        {w > 0 && (
          <svg
            width={w}
            height={H}
            className="block touch-none"
            role="img"
            aria-label={`${main.name}, every stored round from ${roundTime(t0)} to ${roundTime(t1)}`}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => onCursorTs(null)}
          >
            {axis.ticks.map((t, i) => (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={w - PAD_R}
                  y1={y(t)}
                  y2={y(t)}
                  className="stroke-rb-400/12 dark:stroke-rb-500/15"
                  strokeWidth={1}
                />
                <text x={PAD_L - 4} y={y(t) + 3} textAnchor="end" className="fill-rb-500 text-[10px] tabular-nums">
                  {labels[i]}
                </text>
              </g>
            ))}
            {lines
              .filter((l) => l !== main)
              .map((l) => (
                <path
                  key={l.id}
                  d={step(l.rounds)}
                  fill="none"
                  className="stroke-rb-400/60 dark:stroke-rb-500/60"
                  strokeWidth={1}
                  data-asset-rounds-line={l.id}
                />
              ))}
            <path
              d={step(main.rounds)}
              fill="none"
              stroke={LINE_HUE.collateral}
              strokeWidth={1.5}
              data-asset-rounds-line={main.id}
              data-asset-rounds-main=""
            />
            <line x1={x(at)} x2={x(at)} y1={0} y2={H} className="stroke-foreground" strokeWidth={1} />
            {cur && (
              <circle
                cx={x(at)}
                cy={y(cur[1])}
                r={3.5}
                fill={LINE_HUE.collateral}
                className="stroke-background"
                strokeWidth={1.5}
              />
            )}
          </svg>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-rb-500 tabular-nums" style={{ paddingLeft: PAD_L }}>
        <span>{roundTime(t0)}</span>
        <span>{roundTime(t1)}</span>
      </div>
    </div>
  );
}
