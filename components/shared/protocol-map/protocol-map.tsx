"use client";

// A protocol map (ui-jobs 873): one protocol's fixed diagram, filled with one
// address's activity. The layout and the fill (lib/shared/protocol-map/types.ts)
// carry everything about the protocol; this file names none. Sources sit above
// the address's box, mechanisms below it. Each filled edge is an arrow with its
// receipt (the summed amounts, each with its asset's icon) and a link to the
// timeline filtered to it. An edge or box with no fill is drawn dashed, so the
// map also shows the parts of the protocol the address never used.
//
// Clicking a box, a receipt or a timeline row selects it: the page holds the
// selection and passes it back, and `hotSets` says what it lights.

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatCompact } from "@/lib/shared/format-compact";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import {
  hotSets,
  MAP_HOLDER,
  mapExact,
  mapUnits,
  usedNodes,
  type MapAmount,
  type MapEdge,
  type MapFill,
  type MapLayout,
  type MapLine,
  type MapReceipt,
  type MapSelection,
  mapUnusedWords,
} from "@/lib/shared/protocol-map/types";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = [number, number];

/** A map receipt is a provenance receipt plus `rows`, which only the map reads. */
function receiptProv(r: MapReceipt): Provenance {
  const { rows: _rows, ...info } = r;
  return info;
}

/** One amount: the compact figure, then its asset's icon. With a receipt the
 *  figure carries it; `echo` marks a repeat of a figure shown elsewhere. */
function Amount({ a, receipt, echo }: { a: MapAmount; receipt?: MapReceipt; echo?: boolean }) {
  const exact = mapExact(a);
  const figure = formatCompact(mapUnits(a));
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={`${exact} ${a.asset}`}>
      {(a.receipt ?? receipt) ? (
        <Prov info={receiptProv((a.receipt ?? receipt)!)} value={exact} symbol={a.asset} echo={echo}>
          {figure}
        </Prov>
      ) : (
        figure
      )}
      <TokenChipIcon symbol={a.asset} address={a.address} size={14} filterable={false} untitled />
    </span>
  );
}

function Amounts({ amounts, receipt, echo }: { amounts: MapAmount[]; receipt?: MapReceipt; echo?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {amounts.map((a, i) => (
        <Amount key={`${a.address ?? a.asset}-${i}`} a={a} receipt={receipt} echo={echo} />
      ))}
    </span>
  );
}

function Line({ line }: { line: MapLine }) {
  const words = [line.label !== "note" ? line.label : null, line.text].filter(Boolean).join(" ");
  return (
    <div className="flex items-start justify-between gap-x-1.5 text-xs leading-5">
      {words && <span className="min-w-0 text-rb-500">{words}</span>}
      {line.amounts.length > 0 && (
        <span className="ml-auto flex flex-wrap justify-end gap-x-2">
          {line.amounts.map((a, i) => (
            <Amount key={`${a.address ?? a.asset}-${i}`} a={a} receipt={line.receipt} />
          ))}
        </span>
      )}
    </div>
  );
}

const bezier = (p: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((i) => k.reduce((s, c, j) => s + c * p[j][i], 0)) as Pt;
};

interface DrawnEdge {
  edge: MapEdge;
  used: boolean;
  d: string;
  head: string | null;
  chip: Pt;
}

/** Each edge's path. An unused edge whose reverse is used, or listed first,
 *  is left out: an unused pair draws as one dashed line. */
function drawEdges(layout: MapLayout, fill: MapFill, boxes: Record<string, Box>, width: number): DrawnEdge[] {
  const node = new Map(layout.nodes.map((n) => [n.id, n]));
  const index = new Map(layout.edges.map((e, i) => [`${e.from}|${e.to}`, i]));
  const out: DrawnEdge[] = [];
  layout.edges.forEach((e, i) => {
    const a = boxes[e.from];
    const b = boxes[e.to];
    const na = node.get(e.from);
    const nb = node.get(e.to);
    if (!a || !b || !na || !nb) return;
    const used = fill.edges[e.id] != null;
    const rev = index.get(`${e.to}|${e.from}`);
    if (!used && rev != null && (fill.edges[layout.edges[rev].id] != null || rev < i)) return;
    const lane = used ? (e.lane ?? 0) * 9 : 0;
    const cx = (r: Box) => r.x + r.w / 2;
    // Where an edge meets the holder's long side: spread by where the other
    // end sits across the grid, so a fan of arrows does not meet at one point.
    const onHolder = (r: Box, other: Box) =>
      r.x + r.w * Math.min(0.92, Math.max(0.08, (cx(other) - 0) / Math.max(1, width)));
    const xOf = (id: string, r: Box, other: Box) => (id === MAP_HOLDER ? onHolder(r, other) : cx(r));
    let p: [Pt, Pt, Pt, Pt];
    let dir: "up" | "down" | "left" | "right";
    if (na.row === nb.row) {
      const left = b.x < a.x;
      const y1 = a.y + a.h / 2 + lane;
      const y2 = b.y + b.h / 2 + lane;
      const x1 = left ? a.x : a.x + a.w;
      const x2 = left ? b.x + b.w : b.x;
      const mx = (x1 + x2) / 2;
      p = [
        [x1, y1],
        [mx, y1],
        [mx, y2],
        [x2, y2],
      ];
      dir = left ? "left" : "right";
    } else {
      const down = nb.row > na.row;
      const x1 = xOf(e.from, a, b) + lane;
      const x2 = xOf(e.to, b, a) + lane;
      const y1 = down ? a.y + a.h : a.y;
      const y2 = down ? b.y : b.y + b.h;
      const my = (y1 + y2) / 2;
      p = [
        [x1, y1],
        [x1, my],
        [x2, my],
        [x2, y2],
      ];
      dir = down ? "down" : "up";
    }
    const [x2, y2] = p[3];
    const s = 5;
    const head = used
      ? {
          down: `${x2},${y2} ${x2 - s},${y2 - s * 1.4} ${x2 + s},${y2 - s * 1.4}`,
          up: `${x2},${y2} ${x2 - s},${y2 + s * 1.4} ${x2 + s},${y2 + s * 1.4}`,
          right: `${x2},${y2} ${x2 - s * 1.4},${y2 - s} ${x2 - s * 1.4},${y2 + s}`,
          left: `${x2},${y2} ${x2 + s * 1.4},${y2 - s} ${x2 + s * 1.4},${y2 + s}`,
        }[dir]
      : null;
    // A receipt sits nearer the end away from the holder, where arrows spread.
    const t = e.from === MAP_HOLDER ? 0.66 : e.to === MAP_HOLDER ? 0.36 : 0.5;
    out.push({
      edge: e,
      used,
      d: `M${p[0][0]},${p[0][1]} C${p[1][0]},${p[1][1]} ${p[2][0]},${p[2][1]} ${p[3][0]},${p[3][1]}`,
      head,
      chip: bezier(p, t),
    });
  });
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export interface ProtocolMapProps {
  layout: MapLayout;
  fill: MapFill;
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
  /** A filled edge's "N transactions" link was followed on this page. */
  onFilter?: (edgeId: string) => void;
  /** Under the holder box's title (the address, shortened). */
  holderNote?: ReactNode;
  /** The words of a selected timeline row, for the selection's sentence. */
  rowLabel?: (rowId: string) => string | null;
}

export function ProtocolMap({ layout, fill, selection, onSelect, onFilter, holderNote, rowLabel }: ProtocolMapProps) {
  const frame = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLElement | null>>({});
  const [geo, setGeo] = useState<{ w: number; h: number; boxes: Record<string, Box> } | null>(null);

  const measure = useCallback(() => {
    const f = frame.current;
    if (!f) return;
    const base = f.getBoundingClientRect();
    const boxes: Record<string, Box> = {};
    for (const [id, el] of Object.entries(boxRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      boxes[id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    }
    setGeo({ w: base.width, h: base.height, boxes });
  }, []);

  useLayoutEffect(() => {
    measure();
    const f = frame.current;
    if (!f || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(f);
    return () => ro.disconnect();
  }, [measure, fill]);

  const used = useMemo(() => usedNodes(layout, fill), [layout, fill]);
  const hot = useMemo(() => hotSets(layout, fill, selection), [layout, fill, selection]);
  // With the edges unknown, the map draws its boxes alone.
  const unknown = fill.edgesUnknown === true;
  const edges = useMemo(
    () => (geo && !unknown ? drawEdges(layout, fill, geo.boxes, geo.w) : []),
    [layout, fill, geo, unknown],
  );
  const title = (id: string) => layout.nodes.find((n) => n.id === id)?.title ?? id;
  const toggle = (s: NonNullable<MapSelection>) =>
    onSelect(selection && selection.type === s.type && selection.id === s.id ? null : s);

  let sentence: ReactNode = null;
  let filterEdge: string | null = null;
  if (selection?.type === "edge") {
    const e = layout.edges.find((x) => x.id === selection.id);
    const f = fill.edges[selection.id];
    if (e && f) {
      filterEdge = e.id;
      sentence = (
        <>
          <span className="font-semibold text-foreground">
            {title(e.from)} → {title(e.to)}
          </span>
          {f.amounts.length > 0 && (
            <>
              : <Amounts amounts={f.amounts} receipt={f.receipt} echo />
            </>
          )}
          {fill.counted.rows < fill.counted.total
            ? `, over ${f.rowCount.toLocaleString("en-US")} of the newest ${plural(fill.counted.rows, "transaction")}.`
            : `, over ${plural(f.rowCount, "transaction")}.`}
        </>
      );
    }
  } else if (selection?.type === "node") {
    sentence = (
      <>
        <span className="font-semibold text-foreground">{title(selection.id)}</span>:{" "}
        {fill.counted.rows < fill.counted.total
          ? `${hot.rows.size.toLocaleString("en-US")} of the newest ${plural(fill.counted.rows, "transaction")}.`
          : `${plural(hot.rows.size, "transaction")}.`}
      </>
    );
  } else if (selection?.type === "row") {
    const via = [...hot.edges].map((id) => {
      const e = layout.edges.find((x) => x.id === id)!;
      return `${title(e.from)} → ${title(e.to)}`;
    });
    sentence = (
      <>
        <span className="font-semibold text-foreground">{rowLabel?.(selection.id) ?? "This transaction"}</span>
        {via.length > 0 ? `: ${via.join(", ")}.` : ": on no arrow of this map."}
      </>
    );
  }

  const rows = Math.max(...layout.nodes.map((n) => n.row));

  return (
    <div className="space-y-3" data-protocol-map={layout.id} data-anatomy="O1">
      <div className="overflow-x-auto">
        <div ref={frame} className="relative min-w-[1040px] py-1">
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={geo?.w ?? 0}
            height={geo?.h ?? 0}
            aria-hidden="true"
          >
            {edges.map((x) => {
              const isHot = hot.edges.has(x.edge.id);
              const dim = hot.any && !isHot;
              const tone = !x.used
                ? "text-rb-300 dark:text-rb-500"
                : isHot
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-blue-500/70 dark:text-blue-400/70";
              return (
                <g
                  key={x.edge.id}
                  className={`${tone} ${dim && x.used ? "opacity-20" : ""}`}
                  data-map-edge={x.edge.id}
                  data-anatomy="O3"
                  data-map-used={x.used ? "" : undefined}
                >
                  <path
                    d={x.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={x.used ? (isHot ? 2.5 : 1.75) : 1.25}
                    strokeDasharray={x.used ? undefined : "3 4"}
                  />
                  {x.head && <polygon points={x.head} fill="currentColor" />}
                </g>
              );
            })}
          </svg>
          <div
            className="relative grid items-start gap-x-4 gap-y-20"
            style={{
              gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, auto)`,
            }}
          >
            {layout.nodes.map((n) => {
              const isUsed = used.has(n.id);
              const clickable = isUsed && !unknown;
              const isHot = hot.nodes.has(n.id);
              const holder = n.id === MAP_HOLDER;
              const lines = fill.nodes[n.id]?.lines ?? [];
              const frameCls = holder
                ? "border-2 border-blue-500/60 dark:border-blue-400/60"
                : unknown
                  ? "border border-[var(--card-border)]"
                  : isUsed
                    ? "border border-blue-500/40 dark:border-blue-400/40"
                    : "border border-dashed border-rb-300 dark:border-rb-500";
              const titleCls = `text-sm ${isUsed ? "font-semibold text-foreground" : "font-medium text-rb-500"}`;
              const body = (
                <>
                  {clickable ? (
                    // The box's control is its title, so the receipts inside
                    // the box are not nested in a button.
                    <button
                      type="button"
                      className={`${titleCls} cursor-pointer self-start rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`}
                      aria-pressed={isHot}
                      onClick={() => toggle({ type: "node", id: n.id })}
                    >
                      {n.title}
                    </button>
                  ) : (
                    <span className={titleCls}>{n.title}</span>
                  )}
                  {holder && holderNote && <span className="text-xs text-rb-500">{holderNote}</span>}
                  {n.blurb && <span className="text-xs leading-snug text-rb-500">{n.blurb}</span>}
                  {lines.length > 0 && (
                    <span className="mt-1.5 flex flex-col">
                      {lines.map((l, i) => (
                        <Line key={i} line={l} />
                      ))}
                    </span>
                  )}
                </>
              );
              const cls = `flex min-w-0 flex-col gap-0.5 rounded-xl bg-[var(--card-background)] px-3 py-2.5 text-left ${frameCls} ${
                isHot ? "ring-2 ring-[var(--focus-ring)]" : ""
              } ${hot.any && !isHot && isUsed ? "opacity-50" : ""}`;
              const style = { gridColumn: `${n.col} / span ${n.span}`, gridRow: String(n.row) };
              return clickable ? (
                // A press anywhere on the box selects it too, except on a
                // receipt, a link or the title's button.
                <div
                  key={n.id}
                  ref={(el) => {
                    boxRefs.current[n.id] = el;
                  }}
                  className={`${cls} cursor-pointer hover:bg-[var(--surface-hover)]`}
                  style={style}
                  data-map-node={n.id}
                  data-anatomy="O2"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a, button, [data-prov-inspect], .prov-locate-box")) return;
                    toggle({ type: "node", id: n.id });
                  }}
                >
                  {body}
                </div>
              ) : (
                <div
                  key={n.id}
                  ref={(el) => {
                    boxRefs.current[n.id] = el;
                  }}
                  className={cls}
                  style={style}
                  data-map-node={n.id}
                  data-anatomy="O2"
                  data-map-idle=""
                >
                  {body}
                </div>
              );
            })}
          </div>
          {edges
            .filter((x) => x.used)
            .map((x) => {
              const f = fill.edges[x.edge.id];
              const isHot = hot.edges.has(x.edge.id);
              return (
                <div
                  key={x.edge.id}
                  className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border bg-raised px-1.5 py-0.5 text-xs shadow-sm ${
                    isHot ? "border-blue-500 dark:border-blue-400" : "border-[var(--card-border)]"
                  } ${hot.any && !isHot ? "opacity-40" : ""}`}
                  style={{ left: x.chip[0], top: x.chip[1] }}
                  data-map-receipt={x.edge.id}
                  data-anatomy="O4"
                >
                  <button
                    type="button"
                    className="cursor-pointer text-foreground"
                    aria-pressed={isHot}
                    onClick={() => toggle({ type: "edge", id: x.edge.id })}
                  >
                    <span className="sr-only">
                      {title(x.edge.from)} → {title(x.edge.to)}:{" "}
                    </span>
                    {f.amounts.length > 0 ? (
                      <Amounts amounts={f.amounts} receipt={f.receipt} />
                    ) : (
                      // A count of index rows, which carries no receipt.
                      <span data-prov-exempt="">{plural(f.rowCount, "transaction")}</span>
                    )}
                  </button>
                  <a
                    href={f.timelineHref}
                    className={`${INLINE_LINK} tabular-nums`}
                    title={`The timeline filtered to ${plural(f.rowCount, "transaction")} on this arrow`}
                    aria-label={`Show this arrow's ${plural(f.rowCount, "transaction")} in the timeline`}
                    onClick={(ev) => {
                      if (!onFilter || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
                      ev.preventDefault();
                      onFilter(x.edge.id);
                    }}
                  >
                    {f.amounts.length > 0 ? `${f.rowCount}↓` : "↓"}
                  </a>
                </div>
              );
            })}
        </div>
      </div>
      {!unknown && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-rb-500" data-anatomy="O6">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-blue-500/70" aria-hidden="true" />
            Used by this address
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-6 border-t border-dashed border-rb-300 dark:border-rb-500"
              aria-hidden="true"
            />
            {mapUnusedWords(fill)}
          </span>
          <span>Each arrow&rsquo;s ↓ link opens the timeline filtered to its transactions.</span>
        </div>
      )}
      {sentence && (
        <div
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-blue-500/40 bg-[var(--surface-inset)] px-3 py-2 text-sm text-rb-500"
          data-map-selection=""
          data-anatomy="O5"
        >
          <p className="min-w-0">{sentence}</p>
          <span className="flex gap-4">
            {filterEdge && onFilter && (
              <button type="button" className={`${INLINE_LINK} cursor-pointer`} onClick={() => onFilter(filterEdge!)}>
                Show only these in the timeline
              </button>
            )}
            <button type="button" className={`${INLINE_LINK} cursor-pointer`} onClick={() => onSelect(null)}>
              Clear
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
