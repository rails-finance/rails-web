"use client";

// The timeline's side of the Lifetime flows filter (lib/shared/flow-focus.ts;
// rails-ops TO-DO-ui-jobs 141): the chip over the list that names the flow
// line and the date it runs to, with a × that clears it, and the "Flow lines"
// menu beside the other filters, which reaches the same filter without the
// chart. Drawn only on a page that ties the panel to its timeline.

import { useEffect, useRef } from "react";
import { ChartBarBig, X } from "lucide-react";
import { FilterDropdown, type FilterOption } from "@/components/shared/filter-dropdown";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { fillStyle } from "@/components/shared/lifetime-flows-tip";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { chipText, type FlowLine } from "@/lib/shared/flow-focus";
import type { FlowSegment } from "@/lib/shared/flows-timeline";

const INFLOW = { collateral: "rgba(96, 165, 250, 0.35)", debt: "rgba(74, 222, 128, 0.35)" };

/** A line's swatch: its segment's fill, an inflow's faded hue, the balancing
 *  item's dashed square. */
function LineSwatch({ line, seg }: { line: FlowLine; seg?: FlowSegment }) {
  if (line.kind === "rest")
    return (
      <i aria-hidden className="inline-block size-2.5 shrink-0 rounded-[2px] border border-dashed border-rb-500" />
    );
  const style =
    line.kind === "in"
      ? { background: INFLOW[line.side] }
      : fillStyle(
          line.side,
          seg ?? { key: line.key, label: line.label, fill: line.kind === "held" ? "held" : "out", width: 0, value: 0 },
        );
  return <i aria-hidden className="inline-block size-2.5 shrink-0 rounded-[2px]" style={style} />;
}

/** "Flow lines": every line of both sides, one pick at a time. */
export function FlowFilterMenu() {
  const focus = useFlowFocus();
  const picked = useFlowFocusState((s) => s.filter?.key);
  const word = useFlowFocusState((s) => s.cursor?.word ?? "today");
  if (!focus || focus.lines.length === 0) return null;
  const { lines, store, model } = focus;
  const segOf = (l: FlowLine): FlowSegment | undefined => {
    const b = model?.buckets.find((x) => x.key === l.key);
    return b
      ? { key: b.key, label: b.label, fill: "out", tone: b.tone ?? "exit", hatch: b.hatch, width: 0, value: 0 }
      : undefined;
  };
  const options: FilterOption[] = lines.map((l, i) => ({
    key: l.key,
    label: l.kind === "held" ? `${l.label}: every event` : l.label,
    icon: <LineSwatch line={l} seg={segOf(l)} />,
    disabled: l.kind === "rest",
    title:
      l.kind === "rest"
        ? "No events: prices and interest move it"
        : l.kind === "held"
          ? `Every event to ${word}`
          : undefined,
    separatorBefore: i > 0 && lines[i - 1].side !== l.side,
  }));
  const pick = (key: string | undefined) => {
    const s = store.get();
    if (!key || s.filter?.key === key) return store.set({ filter: null });
    const l = lines.find((x) => x.key === key);
    if (!l || l.kind === "rest") return;
    store.set({ filter: { key: l.key, side: l.side, label: l.label }, applied: s.applied + 1 });
  };
  return (
    <span data-flow-filter-menu="">
      <FilterDropdown
        label="Flow lines"
        options={options}
        selected={picked}
        onSelect={pick}
        variant="button"
        align="right"
        verbatimLabels
        triggerIcon={<ChartBarBig size={12} />}
      />
    </span>
  );
}

/** The chip over the filtered list, and on each application the latest event
 *  of the list opened. `latestId` is the newest event the list shows. */
export function FlowFilterChip({ latestId, open }: { latestId: string | null; open: (id: string) => void }) {
  const focus = useFlowFocus();
  const filter = useFlowFocusState((s) => s.filter);
  const cursor = useFlowFocusState((s) => s.cursor);
  const applied = useFlowFocusState((s) => s.applied);
  const done = useRef(0);
  // Once per application, after the list has settled on the filter.
  useEffect(() => {
    if (!filter || applied === done.current || !latestId) return;
    done.current = applied;
    const t = window.setTimeout(() => open(latestId), 60);
    return () => window.clearTimeout(t);
  }, [filter, applied, latestId, open]);
  if (!focus) return null;
  return (
    <div data-flow-chip-slot="" className="scroll-mt-4">
      {filter && cursor && (
        <span
          className="inline-flex max-w-full min-h-11 items-center gap-0.5 rounded-full bg-sunken pl-3 text-sm sm:min-h-8 sm:text-[13px]"
          data-flow-chip={filter.key}
        >
          <span className="min-w-0">{chipText(filter, cursor)}</span>
          <button
            type="button"
            className={`${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-full sm:size-8`}
            aria-label="Clear: show every event"
            data-flow-chip-clear=""
            onClick={() => focus.store.set({ filter: null })}
          >
            <X size={14} aria-hidden />
          </button>
        </span>
      )}
    </div>
  );
}
