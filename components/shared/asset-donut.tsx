"use client";

// A side's assets as a donut over a table (rails-ops TO-DO-position-card):
// the position card's breakdown for a side holding two or more assets,
// opened from the side's headline and icons (one button) in a popover
// (a bottom sheet on a phone; position-card.tsx). The table
// lists every asset, largest USD first: amount and icon (a press on the icon
// shows the ticker), USD value, and the colour key beside the share of the
// side. The donut draws the four largest and merges the rest into "Other";
// a press on a slice lights its rows and dims the rest. The figures read as
// plain text: the headlines carry the receipts. The colours are the side's
// tone graded toward the ground it sits on (`--donut-ground`, the overlay's)
// by size rank, TOP to --donut-floor
// (`--donut-collateral`, `--donut-debt`, `--donut-other`, app/globals.css).

import { useEffect, useState, type ReactNode } from "react";
import { formatUsdValue } from "@/lib/utils/format";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { RowHelp } from "@/components/shared/row-help";
import { QuietTipsContext, RevealTip } from "@/components/shared/reveal-tip";
import { ProvDetached } from "@/components/shared/provenance";

/** One asset of a side. */
export interface BreakdownAsset {
  /** Stable key, and the row's `data-breakdown-row`. */
  id: string;
  symbol: string;
  address?: string;
  /** The traced token amount. */
  amount: ReactNode;
  /** The oracle USD value, for the share, the order and the row's figure (in
   *  cents, `formatUsdValue`); null where unpriced. */
  usd: number | null;
  /** The traced USD figure, drawn only where `usd` is null. */
  usdText?: ReactNode;
}

export interface AssetBreakdown {
  assets: BreakdownAsset[];
  /** The dust control: balances worth under a cent, listed on a press. */
  dust?: ReactNode;
}

/** Slices of their own: the four largest assets, the rest as "Other". */
const SLICES = 4;
/** The strongest slice's strength (percent of the side's tone, the rest the
 *  card's ground). The faintest is `--donut-floor` (app/globals.css, per
 *  theme); the slices between are graded evenly by size rank. */
const TOP = 100;
const STEPS = (side: BreakdownSide, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const f = n > 1 ? Math.round((i / (n - 1)) * 1000) / 1000 : 0;
    return `color-mix(in oklab, var(--donut-${side}, ${side === "debt" ? "var(--color-green-400)" : "var(--color-blue-500)"}) calc(${TOP}% - (${TOP}% - var(--donut-floor, 25) * 1%) * ${f}), var(--donut-ground, var(--surface-raised)))`;
  });
const OTHER = "var(--donut-other, var(--color-rb-400))";
const DUST_TIP =
  "A balance worth under a cent at the oracle price, usually the last units a withdrawal or repayment left behind.";

export type BreakdownSide = "collateral" | "debt";
/** The thinnest slice, so it stays pressable; its corners shrink to fit. */
const MIN_ARC = (8 * Math.PI) / 180;
const PAD = 0.05;
/** The donut's one size, both sides and every width. The reference geometry
 *  is at 120 (outer radius 58, inner 29, corners of 3); the radii and corners
 *  scale with it, and the pad is an angle, so the shape holds. */
const SIZE = 104;

/** A share to one place: "<0.1%" and ">99.9%" at the ends where another
 *  asset exists. */
const pct = (x: number, alone: boolean) =>
  alone ? "100%" : x < 0.0005 ? "<0.1%" : x > 0.9995 ? ">99.9%" : `${(x * 100).toFixed(1)}%`;

type Slice = { key: string; label: string; share: number; colour: string; members: string[] };

/** The slices, largest first: the first four assets and the rest as
 *  "Other", each at least MIN_ARC wide. */
function slicesOf(sorted: BreakdownAsset[], total: number, side: BreakdownSide): Slice[] {
  const priced = sorted.filter((a) => (a.usd ?? 0) > 0);
  const head = priced.slice(0, SLICES);
  const tail = priced.slice(SLICES);
  const steps = STEPS(side, head.length);
  const out: Slice[] = head.map((a, i) => ({
    key: a.id,
    label: a.symbol,
    share: (a.usd ?? 0) / total,
    colour: steps[i],
    members: [a.id],
  }));
  if (tail.length > 0)
    out.push({
      key: "other",
      label: "Other",
      share: tail.reduce((t, a) => t + (a.usd ?? 0), 0) / total,
      colour: OTHER,
      members: tail.map((a) => a.id),
    });
  return out;
}

/** Arc angles, each at least MIN_ARC, the rest scaled to fill the circle. */
function anglesOf(slices: Slice[]): [number, number][] {
  const full = 2 * Math.PI;
  const raw = slices.map((s) => s.share * full);
  const small = raw.filter((a) => a < MIN_ARC).length;
  const big = raw.filter((a) => a >= MIN_ARC).reduce((t, a) => t + a, 0);
  const room = full - small * MIN_ARC;
  let at = -Math.PI / 2;
  return raw.map((a) => {
    const w = a < MIN_ARC ? MIN_ARC : big > 0 ? (a / big) * room : a;
    const span: [number, number] = [at, at + w];
    at += w;
    return span;
  });
}

// The slice's path: an annular sector with rounded corners and a pad angle,
// as d3-shape's arc() draws one (its corner and pad geometry, ported; the
// package is not a dependency). Angles are radians clockwise from 3 o'clock
// on screen; the centre is (0, 0).
const EPS = 1e-12;
const TAU = 2 * Math.PI;

class PathText {
  d = "";
  x: number | null = null;
  y: number | null = null;
  moveTo(x: number, y: number) {
    this.d += `M${x},${y}`;
    this.x = x;
    this.y = y;
  }
  lineTo(x: number, y: number) {
    this.d += `L${x},${y}`;
    this.x = x;
    this.y = y;
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw: boolean) {
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    if (this.x == null) this.moveTo(x0, y0);
    else if (Math.abs(this.x - x0) > 1e-6 || Math.abs((this.y ?? 0) - y0) > 1e-6) this.lineTo(x0, y0);
    if (!r) return;
    let da = ccw ? a0 - a1 : a1 - a0;
    if (da < 0) da = (da % TAU) + TAU;
    if (da > EPS) {
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      this.d += `A${r},${r},0,${da >= Math.PI ? 1 : 0},${ccw ? 0 : 1},${x1},${y1}`;
      this.x = x1;
      this.y = y1;
    }
  }
}

function intersect(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  const x10 = x1 - x0;
  const y10 = y1 - y0;
  const x32 = x3 - x2;
  const y32 = y3 - y2;
  let t = y32 * x10 - x32 * y10;
  if (t * t < EPS) return null;
  t = (x32 * (y0 - y2) - y32 * (x0 - x2)) / t;
  return [x0 + t * x10, y0 + t * y10] as const;
}

function cornerTangents(x0: number, y0: number, x1: number, y1: number, r1: number, rc: number, cw: boolean) {
  const x01 = x0 - x1;
  const y01 = y0 - y1;
  const lo = (cw ? rc : -rc) / Math.sqrt(x01 * x01 + y01 * y01);
  const ox = lo * y01;
  const oy = -lo * x01;
  const x11 = x0 + ox;
  const y11 = y0 + oy;
  const x10 = x1 + ox;
  const y10 = y1 + oy;
  const x00 = (x11 + x10) / 2;
  const y00 = (y11 + y10) / 2;
  const dx = x10 - x11;
  const dy = y10 - y11;
  const d2 = dx * dx + dy * dy;
  const r = r1 - rc;
  const D = x11 * y10 - x10 * y11;
  const d = (dy < 0 ? -1 : 1) * Math.sqrt(Math.max(0, r * r * d2 - D * D));
  let cx0 = (D * dy - dx * d) / d2;
  let cy0 = (-D * dx - dy * d) / d2;
  const cx1 = (D * dy + dx * d) / d2;
  const cy1 = (-D * dx + dy * d) / d2;
  const dx0 = cx0 - x00;
  const dy0 = cy0 - y00;
  const dx1 = cx1 - x00;
  const dy1 = cy1 - y00;
  if (dx0 * dx0 + dy0 * dy0 > dx1 * dx1 + dy1 * dy1) {
    cx0 = cx1;
    cy0 = cy1;
  }
  return { cx: cx0, cy: cy0, x01: -ox, y01: -oy, x11: cx0 * (r1 / r - 1), y11: cy0 * (r1 / r - 1) };
}

function arcPath(r0: number, r1: number, a0: number, a1: number, padAngle: number, cornerRadius: number): string {
  const p = new PathText();
  const da = Math.abs(a1 - a0);
  const cw = a1 > a0;
  let a01 = a0;
  let a11 = a1;
  let a00 = a0;
  let a10 = a1;
  let da0 = da;
  let da1 = da;
  const ap = padAngle / 2;
  const rp = ap > EPS ? Math.sqrt(r0 * r0 + r1 * r1) : 0;
  const rc = Math.min(Math.abs(r1 - r0) / 2, cornerRadius);
  let rc0 = rc;
  let rc1 = rc;
  if (rp > EPS) {
    let p0 = Math.asin(Math.min(1, (rp / r0) * Math.sin(ap)));
    let p1 = Math.asin(Math.min(1, (rp / r1) * Math.sin(ap)));
    if ((da0 -= p0 * 2) > EPS) {
      p0 *= cw ? 1 : -1;
      a00 += p0;
      a10 -= p0;
    } else {
      da0 = 0;
      a00 = a10 = (a0 + a1) / 2;
    }
    if ((da1 -= p1 * 2) > EPS) {
      p1 *= cw ? 1 : -1;
      a01 += p1;
      a11 -= p1;
    } else {
      da1 = 0;
      a01 = a11 = (a0 + a1) / 2;
    }
  }
  const x01 = r1 * Math.cos(a01);
  const y01 = r1 * Math.sin(a01);
  const x10 = r0 * Math.cos(a10);
  const y10 = r0 * Math.sin(a10);
  const x11 = r1 * Math.cos(a11);
  const y11 = r1 * Math.sin(a11);
  const x00 = r0 * Math.cos(a00);
  const y00 = r0 * Math.sin(a00);
  if (rc > EPS && da < Math.PI) {
    const oc = intersect(x01, y01, x00, y00, x11, y11, x10, y10);
    if (oc) {
      const ax = x01 - oc[0];
      const ay = y01 - oc[1];
      const bx = x11 - oc[0];
      const by = y11 - oc[1];
      const kc =
        1 /
        Math.sin(
          Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by))))) / 2,
        );
      const lc = Math.hypot(oc[0], oc[1]);
      rc0 = Math.min(rc, (r0 - lc) / (kc - 1));
      rc1 = Math.min(rc, (r1 - lc) / (kc + 1));
    } else rc0 = rc1 = 0;
  }
  if (!(da1 > EPS)) p.moveTo(x01, y01);
  else if (rc1 > EPS) {
    const t0 = cornerTangents(x00, y00, x01, y01, r1, rc1, cw);
    const t1 = cornerTangents(x11, y11, x10, y10, r1, rc1, cw);
    p.moveTo(t0.cx + t0.x01, t0.cy + t0.y01);
    if (rc1 < rc) p.arc(t0.cx, t0.cy, rc1, Math.atan2(t0.y01, t0.x01), Math.atan2(t1.y01, t1.x01), !cw);
    else {
      p.arc(t0.cx, t0.cy, rc1, Math.atan2(t0.y01, t0.x01), Math.atan2(t0.y11, t0.x11), !cw);
      p.arc(0, 0, r1, Math.atan2(t0.cy + t0.y11, t0.cx + t0.x11), Math.atan2(t1.cy + t1.y11, t1.cx + t1.x11), !cw);
      p.arc(t1.cx, t1.cy, rc1, Math.atan2(t1.y11, t1.x11), Math.atan2(t1.y01, t1.x01), !cw);
    }
  } else {
    p.moveTo(x01, y01);
    p.arc(0, 0, r1, a01, a11, !cw);
  }
  if (!(r0 > EPS) || !(da0 > EPS)) p.lineTo(x10, y10);
  else if (rc0 > EPS) {
    const t0 = cornerTangents(x10, y10, x11, y11, r0, -rc0, cw);
    const t1 = cornerTangents(x01, y01, x00, y00, r0, -rc0, cw);
    p.lineTo(t0.cx + t0.x01, t0.cy + t0.y01);
    if (rc0 < rc) p.arc(t0.cx, t0.cy, rc0, Math.atan2(t0.y01, t0.x01), Math.atan2(t1.y01, t1.x01), !cw);
    else {
      p.arc(t0.cx, t0.cy, rc0, Math.atan2(t0.y01, t0.x01), Math.atan2(t0.y11, t0.x11), !cw);
      p.arc(0, 0, r0, Math.atan2(t0.cy + t0.y11, t0.cx + t0.x11), Math.atan2(t1.cy + t1.y11, t1.cx + t1.x11), cw);
      p.arc(t1.cx, t1.cy, rc0, Math.atan2(t1.y11, t1.x11), Math.atan2(t1.y01, t1.x01), !cw);
    }
  } else p.arc(0, 0, r0, a10, a00, cw);
  return `${p.d}Z`;
}

/** The panel: the donut centred over the table. */
export function AssetBreakdownPanel({
  id,
  name,
  side,
  breakdown,
}: {
  id: string;
  /** The side's name, for the donut's label ("Collateral"). */
  name: string;
  side: BreakdownSide;
  breakdown: AssetBreakdown;
}) {
  const sorted = [...breakdown.assets].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  const total = sorted.reduce((t, a) => t + Math.max(0, a.usd ?? 0), 0);
  const slices = total > 0 ? slicesOf(sorted, total, side) : [];
  const alone = slices.length === 1 && sorted.length === 1;
  const angles = anglesOf(slices);
  const colourOf = (assetId: string) => slices.find((s) => s.members.includes(assetId))?.colour ?? OTHER;
  // The slice whose rows are lit: a press on a slice, cleared by a second
  // press on it, a press outside the donut or Escape.
  const [lit, setLit] = useState<string | null>(null);
  useEffect(() => {
    if (!lit) return;
    const away = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-breakdown-donut]")) setLit(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setLit(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [lit]);
  const sliceOfAsset = (assetId: string) => slices.find((s) => s.members.includes(assetId))?.key ?? null;
  const dim = (key: string | null) => lit != null && key !== lit;
  const k = SIZE / 120;
  const C = SIZE / 2;
  const R1 = 58 * k;
  const R0 = 29 * k;
  const CORNER = 3 * k;
  return (
    <div id={id} className="flex flex-col items-start text-sm" data-asset-breakdown="" data-anatomy="C19">
      {/* The donut centred over its table. */}
      <div className="flex w-max max-w-full flex-col items-center gap-3">
        {slices.length > 0 && (
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="group"
            aria-label={`${name} by asset`}
            className="shrink-0 overflow-visible"
            data-breakdown-donut={SIZE}
          >
            {slices.map((s, i) => {
              const [a0, a1] = angles[i];
              // A sliver narrower than 14px across its middle takes a wider,
              // invisible stroke to press on; it looks the same.
              const across = (a1 - a0) * ((R0 + R1) / 2);
              const hit = across < 14 ? Math.min(10, 14 - across) : 0;
              const toggle = () => setLit(lit === s.key ? null : s.key);
              return (
                <path
                  key={s.key}
                  d={arcPath(R0, R1, a0, a1, PAD, CORNER)}
                  transform={`translate(${C},${C})`}
                  fill={s.colour}
                  stroke={hit ? "transparent" : undefined}
                  strokeWidth={hit || undefined}
                  strokeLinejoin="round"
                  className="cursor-pointer outline-none transition-opacity duration-200 focus-visible:stroke-foreground focus-visible:[stroke-width:1.5px]"
                  style={{ opacity: dim(s.key) ? 0.35 : 1 }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={lit === s.key}
                  aria-label={`${s.label}, ${pct(s.share, alone)}`}
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    toggle();
                  }}
                  data-breakdown-slice={s.key}
                />
              );
            })}
          </svg>
        )}
        <div className="max-w-full">
          {/* Plain figures by design: the headlines above carry the receipts. */}
          <table className="border-collapse text-sm" data-prov-exempt="">
            <thead className="sr-only">
              <tr>
                <th>Amount</th>
                <th>USD value</th>
                <td aria-hidden />
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => {
                const key = sliceOfAsset(a.id);
                return (
                  <tr
                    key={a.id}
                    className="border-t border-rb-300 transition-opacity duration-200 first:border-t-0 dark:border-rb-700"
                    style={{ opacity: dim(key) ? 0.35 : 1 }}
                    data-breakdown-row={a.id}
                  >
                    <th
                      scope="row"
                      className={`py-1 pr-3 text-right font-normal tabular-nums transition-colors duration-200 ${lit != null && key === lit ? "text-foreground" : "text-rb-500"}`}
                    >
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className="sr-only">{a.symbol}</span>
                        <Plain>{a.amount}</Plain>
                        <RevealTip
                          tip={a.symbol}
                          label={a.symbol}
                          focusable
                          className="focus-ring -m-1 inline-flex rounded-full p-1"
                        >
                          <TokenChipIcon symbol={a.symbol} address={a.address} size={14} filterable={false} untitled />
                        </RevealTip>
                      </span>
                    </th>
                    <td className="whitespace-nowrap py-1 pr-3 text-right tabular-nums text-green-400">
                      <Plain>{a.usd != null ? formatUsdValue(a.usd) : (a.usdText ?? "—")}</Plain>
                    </td>
                    {/* The key, beside the share it stands for. */}
                    <td className="py-1 pr-2" aria-hidden>
                      <i className="block size-2.5 rounded-[2px]" style={{ background: colourOf(a.id) }} />
                    </td>
                    <td className="whitespace-nowrap py-1 text-right tabular-nums text-rb-500" data-breakdown-share="">
                      {a.usd != null && total > 0 ? pct(Math.max(0, a.usd) / total, alone) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {breakdown.dust ? (
        <div className="mt-1 flex h-5 items-center text-xs text-rb-500" data-breakdown-dust="">
          {breakdown.dust}
          <RowHelp tip={DUST_TIP} name="Dust" />
        </div>
      ) : null}
    </div>
  );
}

/** A figure as plain text: no receipt, no tooltip. */
function Plain({ children }: { children: ReactNode }) {
  return (
    <ProvDetached>
      <QuietTipsContext.Provider value={true}>{children}</QuietTipsContext.Provider>
    </ProvDetached>
  );
}
