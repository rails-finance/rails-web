"use client";

// The timeline's filters on the listings' pills (N1.10, ui-jobs 735): one pill
// per axis the history offers (Type, Asset, Version, Address) and the Date
// pill, the filter sheet below sm. The listings' pills read and write a param
// object; the timeline keeps its view in useTimelineEvents (hidden sets,
// localStorage and the URL), so this file is the adapter between the two: a
// selection is the axis's VISIBLE keys, [] while every key shows, and a write
// becomes the hook's resets and toggles.

import { useRef, useState } from "react";
import { FilterPill } from "@/components/shared/filter-bar/filter-pill";
import { FilterSheet } from "@/components/shared/filter-bar/filter-sheet";
import { GroupEditor } from "@/components/shared/filter-bar/pill-editor";
import {
  groupDimensions,
  pillFor,
  resetAll,
  resetGroup,
  type PillModel,
} from "@/components/shared/filter-bar/pill-model";
import type { FilterDimension, FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { FilterOption } from "@/components/shared/filter-dropdown";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import type { TimelineAxesView, TimelineEventsState } from "@/hooks/useTimelineEvents";

type Axis = "type" | "asset" | "version" | "address";
export type TimelineFilters = BaseListFilters & Record<Axis, string[]>;

interface AxisSpec {
  axis: Axis;
  /** The pill's name. */
  name: string;
  options: FilterOption[];
  visible: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
  /** Option labels are names (symbols, versions, addresses), kept as written. */
  icon?: (o: FilterOption) => React.ReactNode;
}

/** The axes this history offers. One option is not an axis: every state of
 *  its control would show the same list. */
function axesOf(tl: TimelineEventsState): AxisSpec[] {
  const all: AxisSpec[] = [
    {
      axis: "type",
      name: "Type",
      options: tl.eventOptions,
      visible: tl.visibleActionKeys,
      toggle: tl.toggleHiddenAction,
      reset: tl.resetHiddenActions,
    },
    {
      axis: "asset",
      name: "Asset",
      options: tl.assetOptions,
      visible: tl.visibleAssetKeys,
      toggle: tl.toggleHiddenAsset,
      reset: tl.resetHiddenAssets,
      icon: (o) => <TokenChipIcon symbol={o.key} size={16} filterable={false} />,
    },
    {
      axis: "version",
      name: "Version",
      options: tl.versionOptions,
      visible: tl.visibleVersionKeys,
      toggle: tl.toggleHiddenVersion,
      reset: tl.resetHiddenVersions,
    },
    {
      axis: "address",
      name: "Address",
      options: tl.counterpartyOptions,
      visible: tl.visibleCounterpartyKeys,
      toggle: tl.toggleHiddenCounterparty,
      reset: tl.resetHiddenCounterparties,
    },
  ];
  return all.filter((a) => a.options.length > 1);
}

/** The axis's selection: the keys shown, or [] while every offered key shows. */
const selectionOf = (a: AxisSpec): string[] => {
  const shown = a.options.filter((o) => a.visible.has(o.key)).map((o) => o.key);
  return shown.length === a.options.length ? [] : shown;
};

/** The pill's value: the kept names where they are the fewer, else "All but"
 *  the hidden ones; the first name and a count past it. */
function axisWords(values: string[], options: FilterOptionDef[]): string {
  const kept = new Set(values);
  const shown = options.filter((o) => kept.has(o.value)).map((o) => o.label);
  const hidden = options.filter((o) => !kept.has(o.value)).map((o) => o.label);
  const list = (names: string[]) => (names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] ?? ""));
  return shown.length <= hidden.length ? list(shown) : `All but ${list(hidden)}`;
}

function dimensionOf(a: AxisSpec): FilterDimension<TimelineFilters> {
  return {
    id: a.axis,
    label: a.name,
    cardinality: "multi",
    options: a.options.map((o) => ({
      value: o.key,
      label: o.label,
      icon: a.icon?.(o) ?? o.icon,
      meta: o.count != null ? o.count.toLocaleString("en-US") : undefined,
    })),
    get: (f) => f[a.axis],
    set: (f, values) => ({ ...f, [a.axis]: values.length === a.options.length ? [] : values }),
    chipLabel: (values, options) => `${a.name}: ${axisWords(values, options)}`,
  };
}

export interface TimelineFilterModel {
  dimensions: FilterDimension<TimelineFilters>[];
  filters: TimelineFilters;
  onChange: (next: TimelineFilters) => void;
}

/** The timeline's state as the listings' param object, and the write back. */
export function timelineFilterModel(tl: TimelineEventsState): TimelineFilterModel {
  const axes = axesOf(tl);
  const filters: TimelineFilters = {
    q: "",
    sortBy: "time",
    sortOrder: "desc",
    type: [],
    asset: [],
    version: [],
    address: [],
  };
  for (const a of axes) filters[a.axis] = selectionOf(a);
  const onChange = (next: TimelineFilters) => {
    for (const a of axes) {
      const want = next[a.axis];
      const was = filters[a.axis];
      if (want.length === was.length && want.every((k) => was.includes(k))) continue;
      // Back to every key shown, then hide what the selection leaves out (the
      // hook's toggles queue on its state, so the run lands as one view).
      a.reset();
      if (want.length === 0) continue;
      const keep = new Set(want);
      for (const o of a.options) if (!keep.has(o.key)) a.toggle(o.key);
    }
  };
  return { dimensions: axes.map(dimensionOf), filters, onChange };
}

/** A draft as the hook's four hidden sets: an offered axis hides what its
 *  selection leaves out (nothing while it is []), an axis with no pill keeps
 *  what it hides now. */
export function draftAxesView(tl: TimelineEventsState, draft: TimelineFilters): TimelineAxesView {
  const offered = new Map(axesOf(tl).map((a) => [a.axis, a]));
  const hidden = (axis: Axis, options: FilterOption[], visible: Set<string>): Set<string> => {
    const keep = offered.has(axis) ? draft[axis] : null;
    if (keep == null) return new Set(options.filter((o) => !visible.has(o.key)).map((o) => o.key));
    if (keep.length === 0) return new Set();
    return new Set(options.filter((o) => !keep.includes(o.key)).map((o) => o.key));
  };
  return {
    hiddenActions: hidden("type", tl.eventOptions, tl.visibleActionKeys),
    hiddenAssets: hidden("asset", tl.assetOptions, tl.visibleAssetKeys),
    hiddenVersions: hidden("version", tl.versionOptions, tl.visibleVersionKeys),
    hiddenCounterparties: hidden("address", tl.counterpartyOptions, tl.visibleCounterpartyKeys),
  };
}

/** Every axis back to showing all; the date is the caller's. */
export function clearTimelineFilters(m: TimelineFilterModel): void {
  m.onChange(resetAll(groupDimensions(m.dimensions, m.filters), m.filters));
}

/** The pills of the axes, in registry order, each with its editor. */
type DraftCount = (draft: TimelineFilters) => number | Promise<number>;

export function TimelineAxisPills({
  model,
  count,
  countFor,
}: {
  model: TimelineFilterModel;
  count?: { total: number; noun: string };
  countFor?: DraftCount;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupDimensions(model.dimensions, model.filters);
  return (
    <>
      {groups.map((g) => {
        const pill = pillFor(g, model.filters);
        return (
          <AxisPill
            key={pill.name}
            pill={pill}
            open={open === pill.name}
            setOpen={(o) => setOpen(o ? pill.name : null)}
            model={model}
            count={count}
            countFor={countFor}
          />
        );
      })}
    </>
  );
}

function AxisPill({
  pill,
  open,
  setOpen,
  model,
  count,
  countFor,
}: {
  pill: PillModel<TimelineFilters>;
  open: boolean;
  setOpen: (o: boolean) => void;
  model: TimelineFilterModel;
  count?: { total: number; noun: string };
  countFor?: DraftCount;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div ref={anchorRef} className="contents" data-timeline-axis={pill.dims[0].id}>
      <FilterPill
        name={pill.name}
        state={pill.state}
        locked={pill.locked}
        label={pill.label}
        value={pill.value}
        spoken={pill.spoken}
        expanded={open}
        onOpen={() => setOpen(!open)}
        onRemove={() => {
          model.onChange(resetGroup(pill, model.filters));
          requestAnimationFrame(() => buttonRef.current?.focus());
        }}
        buttonRef={buttonRef}
      >
        {open && (
          <GroupEditor
            group={pill}
            locked={pill.locked}
            filters={model.filters}
            onChange={model.onChange}
            onClose={() => {
              setOpen(false);
              requestAnimationFrame(() => buttonRef.current?.focus());
            }}
            anchorRef={anchorRef}
            count={count}
            countFor={countFor}
          />
        )}
      </FilterPill>
    </div>
  );
}

/** The Filters button and its sheet, below sm. */
export function TimelineFilterSheet({
  model,
  count,
  countFor,
}: {
  model: TimelineFilterModel;
  count?: { total: number; noun: string };
  countFor?: DraftCount;
}) {
  if (model.dimensions.length === 0) return null;
  return (
    <FilterSheet
      dimensions={model.dimensions}
      filters={model.filters}
      onChange={model.onChange}
      count={count}
      countFor={countFor}
    />
  );
}
