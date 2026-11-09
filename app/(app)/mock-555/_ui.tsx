// ui-jobs 555, door 1 mock: the parts. Plain server components on house
// tokens; none of them is shared with the live pages.

import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import type { PoolPosition } from "./_reads";

export const CARD = "rounded-xl border border-rb-200 bg-raised dark:border-rb-600";
export const MUTED = "text-rb-500 dark:text-rb-400";
export const LINK = "text-[var(--text-link)] hover:underline";

/** A figure to four significant digits, grouped; tiny figures keep their digits. */
export function num(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e9) return `${(x / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 })} bn`;
  if (a >= 1e6) return `${(x / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} M`;
  if (a >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return x.toLocaleString("en-US", { maximumSignificantDigits: sig });
}
export function pct(x: number, digits = 2): string {
  const s = (x * 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const zero = Number(s.replace(/[^0-9.]/g, "")) === 0;
  return `${zero ? "" : x > 0 ? "+" : "−"}${s.replace("-", "")}%`;
}
export function day(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Prices as shown: quote per base, flipped when that would read below 0.001. */
export function shown(p: PoolPosition) {
  if (p.price >= 0.001)
    return {
      price: p.price,
      then: p.priceThen,
      low: p.range.low,
      high: p.range.high,
      unit: `${p.quote.symbol} per ${p.base.symbol}`,
      side: p.side,
    };
  return {
    price: 1 / p.price,
    then: p.priceThen === null ? null : 1 / p.priceThen,
    low: 1 / p.range.high,
    high: 1 / p.range.low,
    unit: `${p.base.symbol} per ${p.quote.symbol}`,
    side: p.side === "below" ? ("above" as const) : p.side === "above" ? ("below" as const) : p.side,
  };
}

export function MockNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 rounded-lg border border-dashed border-rb-300 px-3 py-2 text-xs text-rb-500 dark:border-rb-600">
      <span className="font-semibold">Mock (ui-jobs 555).</span> {children}
    </p>
  );
}

export function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {sub && <p className={`text-xs ${MUTED}`}>{sub}</p>}
      </div>
      <span
        className={`mt-0.5 ${MUTED}`}
        title="The section's ⋮: Rails pages, off-site links, exports, Inspect provenance"
      >
        <MoreVertical size={16} aria-hidden />
      </span>
    </div>
  );
}

/** Where today's figure comes from. On the build the dots go; they are for Miles's read of the gaps. */
export type Source = "state" | "logs" | "sample" | "lane";
const SOURCE: Record<Source, { dot: string; text: string }> = {
  state: { dot: "bg-rb-500", text: "state at two blocks, before the DEX lane" },
  logs: { dot: "bg-rb-500", text: "the position's own logs, before the DEX lane" },
  sample: { dot: "border border-rb-500", text: "read live for the mock; the DEX lane's daily sample on the build" },
  lane: { dot: "border border-dashed border-rb-400", text: "waits for the DEX lane" },
};

export type Line = {
  key: string;
  label: string;
  /** The holder's figure, first. */
  yours: ReactNode | null;
  /** The pool's figure, after. */
  pool: ReactNode | null;
  receipt: string[];
  source: Source;
};

export function LineRow({ l }: { l: Line }) {
  return (
    <li className="flex gap-3 py-3" data-line={l.key} data-line-source={l.source}>
      <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${SOURCE[l.source].dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{l.label}</div>
        {l.yours && <p className="text-sm text-foreground">{l.yours}</p>}
        {l.pool && <p className={`text-sm ${l.yours ? MUTED : "text-foreground"}`}>{l.pool}</p>}
        {l.receipt.length > 0 && <p className={`mt-0.5 text-xs ${MUTED}`}>Receipt: {l.receipt.join("; ")}</p>}
      </div>
    </li>
  );
}

export function Readout({ lines }: { lines: Line[] }) {
  return (
    <section className={`${CARD} p-4`} data-door="readout">
      <SectionHead
        title="How the position and its pool are doing"
        sub="Measured from the chain over the last 30 days. Rails does not forecast, rate or recommend."
      />
      <ul className="divide-y divide-rb-200 dark:divide-rb-600">
        {lines.map((l) => (
          <LineRow key={l.key} l={l} />
        ))}
      </ul>
      <p className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${MUTED}`}>
        {(Object.keys(SOURCE) as Source[]).map((s) => (
          <span key={s}>
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${SOURCE[s].dot}`} /> {SOURCE[s].text}
          </span>
        ))}
      </p>
    </section>
  );
}

/** The range against the price, on a log scale padded around both. */
export function RangeBar({ p }: { p: PoolPosition }) {
  if (p.range.full) {
    return <p className={`text-xs ${MUTED}`}>Full range: the position is in range at every price.</p>;
  }
  const s = shown(p);
  const lo = Math.log(Math.min(s.low, s.price));
  const hi = Math.log(Math.max(s.high, s.price));
  const pad = (hi - lo) * 0.15 || 0.1;
  const x = (v: number) => ((Math.log(v) - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  return (
    <div className="mt-1" data-range-bar>
      <div className="relative h-6">
        <div className="absolute top-2.5 h-1 w-full rounded bg-rb-200 dark:bg-rb-700" />
        <div
          className="absolute top-1.5 h-3 rounded bg-blue-500/40"
          style={{ left: `${x(s.low)}%`, width: `${Math.max(0.5, x(s.high) - x(s.low))}%` }}
        />
        <div className="absolute top-0 h-6 w-0.5 bg-foreground" style={{ left: `${x(s.price)}%` }} />
      </div>
      <div className={`flex justify-between text-xs tabular-nums ${MUTED}`}>
        <span>
          Range {num(s.low)} to {num(s.high)}
        </span>
        <span>
          Price {num(s.price)} {s.unit}
        </span>
      </div>
    </div>
  );
}
