"use client";

// The timeline's spine line, drawn once per list (ui-jobs 304): a 1px line on
// the rows container from the top of the drawn spine to its last node. The top
// is the head slot's pulsing dot where one is drawn, else the first node; the bottom
// is the last node's centre. Every node (`data-spine-node`) and the dot
// (`data-spine-tip`) take part wherever they are drawn, and the nodes' halo
// keeps the line clear of the glyphs. Below a node marked
// `data-spine-undrawn` (a closed group's) the stretch down to the next node is
// dotted in the group's tone: the members not drawn (ui-jobs 250 point 5).
// The last node of the list (`data-spine-end`, a row's `isLast`) ends the
// line; a list drawn in part runs it on past its last drawn node.

import { useLayoutEffect, useRef, useState } from "react";
import { SPINE_COLORS, type WarningTone } from "@/components/shared/spine-column";

/** How far the line runs out of the foot of a list drawn in part: the reach
 *  of the line into a next row's node (the list's 8px gap, the row's padding
 *  and its column's 16px top padding). */
const TAIL = 28;

/** The bare gap between the tip's pulsing dot and the line below it. */
const TIP_GAP = 6;

interface Stretch {
  top: number;
  height: number;
  /** Dotted in this tone, else solid neutral ink. */
  dotted: WarningTone | "default" | null;
  /** Where the dashes start, so the first one meets the node's foot. */
  phase: number;
}

const same = (a: Stretch[], b: Stretch[]) =>
  a.length === b.length &&
  a.every(
    (s, i) => s.top === b[i].top && s.height === b[i].height && s.dotted === b[i].dotted && s.phase === b[i].phase,
  );

export function SpineLine() {
  const ref = useRef<HTMLDivElement>(null);
  const [x, setX] = useState<number | null>(null);
  const [stretches, setStretches] = useState<Stretch[] | null>(null);
  useLayoutEffect(() => {
    const list = ref.current?.parentElement;
    if (!list) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const base = list.getBoundingClientRect();
      let tipBottom: number | null = null;
      let nodeX: number | null = null;
      const nodes: {
        cy: number;
        foot: number;
        marker: boolean;
        end: boolean;
        undrawn: WarningTone | "default" | null;
        origin?: number;
      }[] = [];
      for (const el of list.querySelectorAll<HTMLElement>("[data-spine-node], [data-spine-tip]")) {
        // A node under a hidden width's markup has no box.
        if (el.getClientRects().length === 0) continue;
        const r = el.getBoundingClientRect();
        if (el.hasAttribute("data-spine-tip")) {
          // A row's dot draws its own lead-in above its node; the head
          // slot's dot leads the line down to the markers.
          if (el.closest("[data-spine-node]")) continue;
          tipBottom = Math.min(tipBottom ?? Infinity, r.bottom - base.top + TIP_GAP);
          continue;
        }
        if (nodeX == null) nodeX = r.left + r.width / 2 - base.left;
        nodes.push({
          cy: r.top + r.height / 2 - base.top,
          foot: r.bottom - base.top,
          marker: el.getAttribute("data-spine-node") === "marker",
          end: el.hasAttribute("data-spine-end"),
          undrawn: (el.getAttribute("data-spine-undrawn") as WarningTone | "default" | null) ?? null,
        });
      }
      nodes.sort((a, b) => a.cy - b.cy);
      // A market-note marker in a dotted stretch keeps it dotted, its dashes
      // in step with the group's.
      let origin = 0;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.marker && i > 0) {
          n.undrawn = nodes[i - 1].undrawn;
        } else if (n.undrawn) origin = n.foot;
        n.origin = origin;
      }
      const next: Stretch[] = [];
      const push = (top: number, bottom: number, dotted: WarningTone | "default" | null, phase = 0) => {
        if (!(bottom > top)) return;
        const last = next[next.length - 1];
        if (!dotted && last && !last.dotted && Math.abs(last.top + last.height - top) < 0.5) {
          last.height = bottom - last.top;
          return;
        }
        next.push({ top, height: bottom - top, dotted, phase });
      };
      if (nodes.length > 0 && tipBottom != null && tipBottom < nodes[0].cy) push(tipBottom, nodes[0].cy, null);
      for (let i = 0; i + 1 < nodes.length; i++) {
        const a = nodes[i];
        const phase = a.undrawn ? ((((a.origin ?? a.foot) - a.cy) % 6) + 6) % 6 : 0;
        push(a.cy, nodes[i + 1].cy, a.undrawn, phase);
      }
      // A list drawn in part (more rows to load) runs on past its last
      // drawn node, out of the list's foot.
      const tail = nodes[nodes.length - 1];
      if (tail && !tail.end) {
        const phase = tail.undrawn ? ((((tail.origin ?? tail.foot) - tail.cy) % 6) + 6) % 6 : 0;
        push(tail.cy, base.height + TAIL, tail.undrawn, phase);
      }
      setX((cur) => (cur === nodeX ? cur : nodeX));
      setStretches((cur) => (cur && same(cur, next) ? cur : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(list);
    const mutation = new MutationObserver(schedule);
    mutation.observe(list, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  const ink = SPINE_COLORS.default;
  return (
    <div ref={ref} aria-hidden data-spine-list-line="" className="contents">
      {stretches == null ? (
        // Until it is measured (the server's paint), the line runs from the
        // first row's node to near the list's foot, on the spine's x.
        <div
          className="pointer-events-none absolute left-1/2 w-px -translate-x-1/2 sm:left-[calc(4px+(100%-8px)*0.2)]"
          style={{ top: 36, bottom: 24, backgroundColor: ink }}
        />
      ) : (
        x != null &&
        stretches.map((s, i) => (
          <div
            key={i}
            data-spine-stretch={s.dotted ? "dotted" : "solid"}
            className="pointer-events-none absolute w-px -translate-x-1/2"
            style={{
              left: x,
              top: s.top,
              height: s.height,
              ...(s.dotted
                ? {
                    backgroundImage: `linear-gradient(to bottom, ${SPINE_COLORS[s.dotted]} 50%, transparent 50%)`,
                    backgroundSize: "1px 6px",
                    backgroundPositionY: s.phase,
                  }
                : { backgroundColor: ink }),
            }}
          />
        ))
      )}
    </div>
  );
}
