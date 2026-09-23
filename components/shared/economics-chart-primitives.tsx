"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";

// ── Types ──────────────────────────────────────────────────────────────────

export type TowerSegment = {
  key: string;
  label: string;
  value: number;
  colorClass: string;
  patternStyle?: CSSProperties;
  /** Optional tooltip body shown when this segment is hovered (desktop) or
   *  tapped (touch). Callers supply formatted markup so each protocol can
   *  decide its own units (USD on Aave; BOLD on Liquity debt etc.). The
   *  parent `TowerSide.tooltipFooter` is rendered beneath, on every segment
   *  of that side. */
  tooltip?: ReactNode;
  /** When true, the segment still occupies its slot in the tower layout
   *  (so toggling it on/off never reflows the chart — the visible segments
   *  stay pinned in place) but is painted `visibility: hidden` and is not
   *  interactive. Used by the "Hide inactive / repaid" display toggle to mute
   *  the lifetime-flow segments without rescaling the active ones. */
  hidden?: boolean;
};

export type PositionedSegment = TowerSegment & {
  bottomPct: number;
  heightPct: number;
};

export type BreakdownRow = {
  sign: string;
  label: string;
  amount: string;
  /** Full-precision figure for the tooltip + provenance trace when `amount` is a
   *  compact form ("11M"). Absent → `amount` is already exact. */
  exact?: string;
  symbol?: string;
  usdHint?: string;
  /** Receipt for the USD hint riding after the amount — the row's token
   *  figure restated in USD is its own value (amount × price), so it carries
   *  its own trace rather than hiding under the amount's. */
  usdProv?: Provenance;
  /** Full-precision USD figure behind the compact hint. */
  usdExact?: string;
  isResult?: boolean;
  hidden?: boolean;
  swatchClass?: string;
  swatchStyle?: CSSProperties;
  indent?: boolean;
  /** Optional React node rendered after the label (e.g. token icon) */
  icon?: React.ReactNode;
  /** Optional provenance for the amount — when set, the figure becomes
   *  click-inspectable while the provenance inspector is armed (zero-cost off). */
  prov?: Provenance;
};

// ── Constants ──────────────────────────────────────────────────────────────

export const CHART_HEIGHT = 220;
export const SEGMENT_GAP_PX = 2;
export const MIN_SEGMENT_PX = 2;

// ── Formatting helpers ─────────────────────────────────────────────────────

export function formatPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(0)}k`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function formatUsdValue(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Pattern generators ─────────────────────────────────────────────────────

export const checkerPattern = (color: string): CSSProperties => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><path d='M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2' stroke='${encodeURIComponent(color)}' stroke-width='2'/></svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml,${svg}")`,
    backgroundSize: "4px 4px",
    backgroundRepeat: "repeat",
  };
};

/** Reverse-diagonal counterpart to `checkerPattern` — same stroke weight, mirrored angle. */
export const reverseDiagonalPattern = (color: string): CSSProperties => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><path d='M-1,3 l2,2 M0,0 l4,4 M3,-1 l2,2' stroke='${encodeURIComponent(color)}' stroke-width='2'/></svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml,${svg}")`,
    backgroundSize: "4px 4px",
    backgroundRepeat: "repeat",
  };
};

// ── Common pattern constants ──────────────────────────────────────────────
// Pattern semantics across the protocol suite:
//   · Solid fill               = currently held
//   · Checker           (▦)   = another party's act on the position — a
//                                Liquity V2 redemption, a Polaris PSM share —
//                                pink (Tailwind pink-400), the site's colour
//                                for an external party (the delegate-rate
//                                pill, the spine's external-actor glyph).
//                                Never a verdict: whether it helped or hurt
//                                the position is stated in words, not tint.
//   · Forward diagonal  (╱╱╱)  = liquidation (loss / involuntary exit)
//   · Reverse diagonal  (╲╲╲)  = voluntary exit (Withdrawn, Repaid, Costs)

export const REDEMPTION_PATTERN = checkerPattern("rgba(244, 114, 182, 0.6)");
export const LIQUIDATION_PATTERN = checkerPattern("rgba(248, 113, 113, 0.6)");
export const REPAID_PATTERN = reverseDiagonalPattern("rgba(74, 222, 128, 0.5)");
export const WITHDRAWN_PATTERN = reverseDiagonalPattern("rgba(96, 165, 250, 0.5)");

// ── Compact number formatter ──────────────────────────────────────────────

function compactSuffix(n: number, divisor: number, suffix: string): string {
  const v = (n / divisor).toFixed(1);
  return v.endsWith(".0") ? v.slice(0, -2) + suffix : v + suffix;
}

export function fmt(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000) return compactSuffix(n, 1_000_000, "M");
  if (Math.abs(n) >= 1_000) return compactSuffix(n, 1_000, "K");
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function computeTowerLayout(
  segments: TowerSegment[],
  maxValue: number,
  chartHeight = CHART_HEIGHT,
): PositionedSegment[] {
  if (!maxValue || !isFinite(maxValue)) return [];
  const visible = segments.filter((s) => s.value > 0 && isFinite(s.value));
  if (visible.length === 0) return [];
  const totalGapPx = Math.max(0, visible.length - 1) * SEGMENT_GAP_PX;
  const availableHeight = chartHeight - totalGapPx;
  let cursorPx = 0;
  return visible.map((seg, i) => {
    if (i > 0) cursorPx += SEGMENT_GAP_PX;
    const heightPx = Math.max((seg.value / maxValue) * availableHeight, MIN_SEGMENT_PX);
    const pos: PositionedSegment = { ...seg, bottomPct: cursorPx, heightPct: heightPx };
    cursorPx += heightPx;
    return pos;
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

const SIDEBAR_KEY = "__sidebar__";

export function TowerBar({
  segments,
  sideBar,
  height = CHART_HEIGHT,
  tooltipSide = "right",
  sideBarTooltip,
  sideBarTooltipSide = "left",
}: {
  segments: PositionedSegment[];
  /** Single-segment side bar (legacy) or stacked principal + accrued segments.
   *  `hidden` keeps the bar's column reserved (no horizontal shift of the
   *  tower) while painting it invisibly — same role as `TowerSegment.hidden`. */
  sideBar?:
    | { heightPct: number; color: string; hidden?: boolean }
    | { segments: Array<{ heightPct: number; color: string; patternStyle?: CSSProperties }>; hidden?: boolean };
  height?: number;
  /** Which side of the tower a *segment* tooltip floats out from. Left tower
   *  uses 'right'; right tower uses 'left' to keep the popover inside the chart. */
  tooltipSide?: "left" | "right";
  /** Tooltip body for the faded side bar — typically the lifetime total
   *  (e.g. "Total Deposited $12,345"). Skipped when omitted. */
  sideBarTooltip?: ReactNode;
  /** Which side the sideBar tooltip floats out from. Defaults to 'left' so
   *  it stays clear of the tower segments. */
  sideBarTooltipSide?: "left" | "right";
}) {
  const sideBarSegments = sideBar
    ? "segments" in sideBar
      ? sideBar.segments.filter((s) => s.heightPct > 0)
      : sideBar.heightPct > 0
        ? [{ heightPct: sideBar.heightPct, color: sideBar.color }]
        : []
    : [];

  const sideBarHidden = !!sideBar?.hidden;
  const sideBarTotalHeight = sideBarSegments.reduce((s, seg) => s + seg.heightPct, 0);
  const sideBarInteractive = !!sideBarTooltip && sideBarTotalHeight > 0 && !sideBarHidden;

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tap-anywhere-else closes the active tooltip (touch dismiss + desktop
  // outside-click). Only attaches while a tooltip is open.
  useEffect(() => {
    if (!activeKey) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setActiveKey(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [activeKey]);

  const activeSegment = activeKey && activeKey !== SIDEBAR_KEY ? segments.find((s) => s.key === activeKey) : null;
  const sideBarActive = activeKey === SIDEBAR_KEY;

  return (
    <div ref={containerRef} className="flex gap-px shrink-0">
      {sideBarSegments.length > 0 && (
        <div className="relative shrink-0" style={{ width: 5, height }}>
          {
            sideBarSegments.reduce<{ cursor: number; nodes: ReactNode[] }>(
              (acc, seg, i) => {
                acc.nodes.push(
                  <div
                    key={i}
                    className="absolute w-full rounded-sm"
                    style={{
                      bottom: acc.cursor,
                      height: seg.heightPct,
                      backgroundColor: seg.color,
                      ...seg.patternStyle,
                      visibility: sideBarHidden ? "hidden" : undefined,
                    }}
                  />,
                );
                acc.cursor += seg.heightPct;
                return acc;
              },
              { cursor: 0, nodes: [] },
            ).nodes
          }
          {sideBarInteractive && (
            // Hit area: stretch slightly outward (−left-1) so the 5px-wide
            // bar isn't a microscopic touch target. Sits above the painted
            // segments via z-10.
            <div
              className="absolute -left-1 right-0 inset-y-0 cursor-pointer z-10"
              onMouseEnter={() => setActiveKey(SIDEBAR_KEY)}
              onMouseLeave={() => setActiveKey((prev) => (prev === SIDEBAR_KEY ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                setActiveKey(SIDEBAR_KEY);
              }}
            />
          )}
          {sideBarActive && sideBarTooltip && (
            <div
              className={`absolute z-20 ${sideBarTooltipSide === "right" ? "left-full ml-2" : "right-full mr-2"} pointer-events-none`}
              style={{
                // Center on the sideBar's filled extent, clamped inside the bar.
                bottom: Math.max(0, Math.min(sideBarTotalHeight / 2 - 24, height - 48)),
              }}
            >
              <div className="min-w-[160px] max-w-[240px] rounded-md border border-rb-300 dark:border-rb-700 bg-white dark:bg-rb-900 shadow-lg px-2.5 py-1.5 text-[11px] text-foreground">
                {sideBarTooltip}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="relative w-16 sm:w-20" style={{ height }}>
        {segments.map((seg) => {
          const interactive = !!seg.tooltip && !seg.hidden;
          return (
            <div
              key={seg.key}
              className={`absolute left-0 right-0 rounded-sm ${interactive ? "cursor-pointer" : ""}`}
              style={{ bottom: seg.bottomPct, height: seg.heightPct, visibility: seg.hidden ? "hidden" : undefined }}
              onMouseEnter={interactive ? () => setActiveKey(seg.key) : undefined}
              onMouseLeave={interactive ? () => setActiveKey((prev) => (prev === seg.key ? null : prev)) : undefined}
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      setActiveKey(seg.key);
                    }
                  : undefined
              }
            >
              {seg.colorClass && <div className={`absolute inset-0 rounded-sm ${seg.colorClass}`} />}
              {seg.patternStyle && (
                <div className="absolute inset-0 rounded-sm pointer-events-none bg-sunken" style={seg.patternStyle} />
              )}
            </div>
          );
        })}
        {activeSegment && (
          <div
            className={`absolute z-20 ${tooltipSide === "right" ? "left-full ml-2" : "right-full mr-2"} pointer-events-none`}
            style={{
              // Vertically center on the segment, clamped inside the tower.
              bottom: Math.max(0, Math.min(activeSegment.bottomPct + activeSegment.heightPct / 2 - 24, height - 48)),
            }}
          >
            <div className="min-w-[160px] max-w-[240px] rounded-md border border-rb-300 dark:border-rb-700 bg-white dark:bg-rb-900 shadow-lg px-2.5 py-1.5 text-[11px] text-foreground">
              {activeSegment.tooltip}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  const visible = rows.filter((r) => !r.hidden);
  // Layout: sign (~14px) | swatch (~14px) | label (flex) | amount (150px,
  // left-aligned). Whole table caps at 300px so the amount column always
  // starts at the half-width mark — keeps swatches vertically aligned and
  // amounts reading like a column rather than ragged-right text.
  return (
    <table className="text-[11px] border-collapse table-fixed" style={{ width: "100%", maxWidth: 300 }}>
      <colgroup>
        <col className="w-3.5" />
        <col className="w-3.5" />
        <col />
        <col style={{ width: 150 }} />
      </colgroup>
      <tbody>
        {visible.map((row, i) => {
          const rowText = row.isResult
            ? "text-foreground font-bold"
            : row.indent
              ? "text-rb-500 font-medium"
              : "text-rb-500 font-bold";
          // Result rows pick up a top divider in rb-500 so the total reads as
          // the sum-line beneath the per-asset contributions.
          const cellBorder = row.isResult ? "border-t border-rb-300 dark:border-rb-600" : "";
          return (
            <tr key={i} className={rowText}>
              <td className={`py-1 text-right pr-0.5 tabular-nums ${cellBorder}`}>{row.sign}</td>
              <td className={`py-1 pr-1 ${cellBorder}`}>
                {row.swatchClass || row.swatchStyle ? (
                  <span
                    className={`inline-block w-2 h-2 rounded-xs overflow-hidden ${row.swatchClass ?? ""}`}
                    style={row.swatchStyle}
                  />
                ) : null}
              </td>
              <td className={`py-1 ${cellBorder}`}>
                {/* Label truncates; the token chip never clips away (long
                    labels like "Deposited (all time)" would otherwise swallow
                    it inside the ellipsizing cell). */}
                <span className="flex min-w-0 items-center">
                  <span className="truncate">{row.label}</span>
                  {row.icon && <span className="ml-1 inline-flex shrink-0 align-middle">{row.icon}</span>}
                </span>
              </td>
              <td className={`py-1 pl-3 text-right tabular-nums whitespace-nowrap ${cellBorder}`}>
                {row.prov ? (
                  <Prov info={row.prov} value={row.exact}>
                    <span title={row.exact}>{row.amount}</span>
                  </Prov>
                ) : (
                  <span title={row.exact}>{row.amount}</span>
                )}
                {row.usdHint &&
                  (row.usdProv ? (
                    <Prov info={row.usdProv} value={row.usdExact}>
                      <span className="font-normal ml-1">{row.usdHint}</span>
                    </Prov>
                  ) : (
                    <span className="font-normal ml-1">{row.usdHint}</span>
                  ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────

// ── Dual Tower Chart ──────────────────────────────────────────────────────

export interface TowerSide {
  /** Optional label shown above the breakdown */
  label?: ReactNode;
  segments: TowerSegment[];
  breakdownRows: BreakdownRow[];
  sideBar?:
    | { heightPct: number; color: string; hidden?: boolean }
    | { segments: Array<{ heightPct: number; color: string; patternStyle?: CSSProperties }>; hidden?: boolean };
  /** Placeholder element rendered in the tower area when segments are empty */
  placeholder?: ReactNode;
  /** Tooltip body shown when hovering / tapping the faded side bar — used
   *  for the lifetime total (e.g. "Total Deposited $12,345"). The side bar
   *  itself only renders in historic mode; in live mode this is ignored. */
  sideBarTooltip?: ReactNode;
  /** Further bars drawn beside the first on this side, each scaled against the
   *  same maxValue — one per token where a side holds several units. */
  additionalBars?: Array<Pick<TowerSide, "segments" | "sideBar" | "sideBarTooltip">>;
}

export interface DualTowerChartProps {
  left: TowerSide;
  right?: TowerSide;
  /** Override the chart height (default: CHART_HEIGHT = 220) */
  height?: number;
  /** Override the max value for tower scaling (auto-calculated if omitted) */
  maxValue?: number;
  /** Extra class name on the outer wrapper */
  className?: string;
}

export function DualTowerChart({ left, right, height = CHART_HEIGHT, maxValue, className }: DualTowerChartProps) {
  const sideSum = (side: TowerSide) =>
    [side, ...(side.additionalBars ?? [])].reduce(
      (t, bar) => t + bar.segments.reduce((s, seg) => s + Math.max(0, seg.value), 0),
      0,
    );
  const leftSum = sideSum(left);
  const rightSum = right ? sideSum(right) : 0;
  const moreBars = (side: TowerSide, tooltipSide: "left" | "right") =>
    side.additionalBars?.map((bar, i) => (
      <TowerBar
        key={i}
        segments={computeTowerLayout(bar.segments, towerMax, height)}
        sideBar={bar.sideBar}
        height={height}
        tooltipSide={tooltipSide}
        sideBarTooltip={bar.sideBarTooltip}
        sideBarTooltipSide={tooltipSide === "right" ? "left" : "right"}
      />
    ));
  const towerMax = maxValue ?? Math.max(leftSum, rightSum) * 1.08;

  const leftPositioned = computeTowerLayout(left.segments, towerMax, height);
  const rightPositioned = right ? computeTowerLayout(right.segments, towerMax, height) : [];

  const showLeft = leftSum > 0;
  const hasLeftPlaceholder = !!left.placeholder;
  const showRightTower = !!right && rightSum > 0;
  const showRightBreakdown = !!right && right.breakdownRows.length > 0;
  const hasRightPlaceholder = !!right?.placeholder;
  const leftSlotVisible = showLeft || hasLeftPlaceholder;
  const rightSlotVisible = showRightTower || hasRightPlaceholder;

  if (!leftSlotVisible && !rightSlotVisible) {
    if (!showRightBreakdown) return null;
  }

  // Stacked layout (under xl) puts towers on top and the breakdown tables
  // centered beneath. lg: switches to side-by-side with the left breakdown
  // right-aligned (its right edge flush to the tower's left edge) and the
  // right breakdown left-aligned (mirrored). The 300px wrapper around each
  // table holds its alignment box at exactly the table width so flex
  // alignment moves the visible block, not just the surrounding whitespace.
  if (showLeft && !showRightTower && !showRightBreakdown && !hasRightPlaceholder) {
    return (
      <div
        className={`flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-3 ${className ?? ""}`}
      >
        <div className="flex items-end justify-center gap-1 py-2">
          <TowerBar
            segments={leftPositioned}
            sideBar={left.sideBar}
            height={height}
            tooltipSide="right"
            sideBarTooltip={left.sideBarTooltip}
            sideBarTooltipSide="left"
          />
          {moreBars(left, "right")}
        </div>
        <div className="lg:flex-1 lg:flex lg:flex-col">
          <div className="lg:mt-auto w-[300px] max-w-full">
            <BreakdownTable rows={left.breakdownRows} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-3 ${className ?? ""}`}>
      {/* Left breakdown */}
      <div className="order-2 lg:order-none lg:flex-1 lg:flex lg:flex-col lg:items-center">
        <div className="lg:mt-auto w-[300px] max-w-full">
          <BreakdownTable rows={left.breakdownRows} />
        </div>
      </div>

      {/* Towers */}
      <div className="flex items-end justify-center gap-1 py-2 order-1 lg:order-none">
        {showLeft && (
          <TowerBar
            segments={leftPositioned}
            sideBar={left.sideBar}
            height={height}
            tooltipSide="right"
            sideBarTooltip={left.sideBarTooltip}
            sideBarTooltipSide="left"
          />
        )}
        {showLeft && moreBars(left, "right")}
        {!showLeft && hasLeftPlaceholder && left.placeholder}
        {leftSlotVisible && rightSlotVisible && <div className="w-2 shrink-0" />}
        {showRightTower && (
          <TowerBar
            segments={rightPositioned}
            sideBar={right!.sideBar}
            height={height}
            tooltipSide="left"
            sideBarTooltip={right!.sideBarTooltip}
            sideBarTooltipSide="right"
          />
        )}
        {showRightTower && moreBars(right!, "left")}
        {!showRightTower && hasRightPlaceholder && right!.placeholder}
      </div>

      {/* Right breakdown — shown when right side has breakdown rows or placeholder */}
      {(showRightBreakdown || hasRightPlaceholder) && (
        <div className="order-3 lg:order-none lg:flex-1 lg:flex lg:flex-col lg:items-center">
          <div className="lg:mt-auto w-[300px] max-w-full">
            <BreakdownTable rows={right!.breakdownRows} />
          </div>
        </div>
      )}
    </div>
  );
}
