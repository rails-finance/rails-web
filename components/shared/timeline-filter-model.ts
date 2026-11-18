// The timeline's axes as the listings' filter model (ui-jobs 735): the
// listings' pills read and write a param object; the timeline keeps its view
// in useTimelineEvents (hidden sets, localStorage and the URL). A selection
// is the axis's VISIBLE keys, [] while every key shows and [NONE_SHOWN] while
// none does, and a write becomes the hook's resets and toggles. Pure, so
// scripts/test/timeline-filter-model.test.mjs runs it on a stand-in state.
//
// Size (ui-jobs 752) is the listings' Size panel on the same fields (`debt`,
// `coll`), one pill holding the ranges the page offers; a write goes to the
// hook's `setSizeRange`.

import type { ReactNode } from "react";
import { groupDimensions, resetAll } from "@/components/shared/filter-bar/pill-model";
import type { FilterDimension, FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { FilterOption } from "@/components/shared/filter-dropdown";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import type { TimelineAxesView, TimelineEventsState } from "@/hooks/useTimelineEvents";
import { sizeDimensions } from "@/lib/shared/size-dimensions";
import type { SizeSide, TimelineSizeDim } from "@/lib/shared/timeline-size";

export type Axis = "type" | "asset" | "version" | "address";
/** Each pill's code beside N1.10 (app-anatomy L1), by its first dimension. */
const HIDE_AXIS_ANATOMY = { type: "L1.3", asset: "L1.4", version: "L1.5", address: "L1.6" };
const SIZE_PILL_ANATOMY = "L1.13";
export const AXIS_ANATOMY: Record<string, string> = {
  ...HIDE_AXIS_ANATOMY,
  debt: SIZE_PILL_ANATOMY,
  coll: SIZE_PILL_ANATOMY,
};
export type TimelineFilters = BaseListFilters & Record<Axis, string[]> & Record<SizeSide, string[]>;

/** The Size panel's ranges, each in its unit with its own top; the panel's
 *  one line names what the figures are. */
function sizeDimsOf(dims: readonly TimelineSizeDim[], note: string | undefined): FilterDimension<TimelineFilters>[] {
  return dims.flatMap((d, i) =>
    sizeDimensions<TimelineFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      sides: [d.side],
      top: d.top,
      ...(d.side === "debt" ? { debtLabel: d.word, debtUnit: d.unit } : { collLabel: d.word, collUnit: d.unit }),
      panelNote: i === dims.length - 1 ? note : undefined,
    }),
  );
}

/** The panel's line: what a figure is, in the units the ranges use. */
export function sizeNote(dims: readonly TimelineSizeDim[]): string | undefined {
  if (dims.length === 0) return undefined;
  const units = [...new Set(dims.map((d) => d.unit))];
  const list = units.length > 1 ? `${units.slice(0, -1).join(", ")} and ${units[units.length - 1]}` : units[0];
  return `The amount each event moved, in ${list}.`;
}

interface AxisSpec {
  axis: Axis;
  /** The pill's name. */
  name: string;
  options: FilterOption[];
  visible: Set<string>;
  /** The keys the hook holds hidden on this axis, offered or not. */
  hiddenRaw: string[];
  toggle: (key: string) => void;
  reset: () => void;
  /** Option labels are names (symbols, versions, addresses), kept as written. */
  icon?: (o: FilterOption) => ReactNode;
}

/** The selection of an axis that hides every key it offers ("Type None"):
 *  set, so its × and Clear all reach it. */
export const NONE_SHOWN = "__none__";

/** The axes this history offers. One option is not an axis (every state of
 *  its control would show the same list) unless a link or a stored view hides
 *  it, which leaves a pill to undo that by. */
function axesOf(tl: TimelineEventsState, assetIcon?: (symbol: string) => ReactNode): AxisSpec[] {
  const all: AxisSpec[] = [
    {
      axis: "type",
      hiddenRaw: tl.hiddenKeys.action,
      name: "Type",
      options: tl.eventOptions,
      visible: tl.visibleActionKeys,
      toggle: tl.toggleHiddenAction,
      reset: tl.resetHiddenActions,
    },
    {
      axis: "asset",
      hiddenRaw: tl.hiddenKeys.asset,
      name: "Asset",
      options: tl.assetOptions,
      visible: tl.visibleAssetKeys,
      toggle: tl.toggleHiddenAsset,
      reset: tl.resetHiddenAssets,
      icon: assetIcon ? (o) => assetIcon(o.key) : undefined,
    },
    {
      axis: "version",
      hiddenRaw: tl.hiddenKeys.version,
      name: "Version",
      options: tl.versionOptions,
      visible: tl.visibleVersionKeys,
      toggle: tl.toggleHiddenVersion,
      reset: tl.resetHiddenVersions,
    },
    {
      axis: "address",
      hiddenRaw: tl.hiddenKeys.counterparty,
      name: "Address",
      options: tl.counterpartyOptions,
      visible: tl.visibleCounterpartyKeys,
      toggle: tl.toggleHiddenCounterparty,
      reset: tl.resetHiddenCounterparties,
    },
  ];
  return all.filter((a) => a.options.length > 1 || (a.options.length === 1 && !a.visible.has(a.options[0].key)));
}

/** The axis's selection: the keys shown, [] while every offered key shows,
 *  [NONE_SHOWN] while none does. */
const selectionOf = (a: AxisSpec): string[] => {
  const shown = a.options.filter((o) => a.visible.has(o.key)).map((o) => o.key);
  if (shown.length === a.options.length) return [];
  return shown.length === 0 ? [NONE_SHOWN] : shown;
};

/** The keys a selection hides. */
const hiddenBy = (a: AxisSpec, selection: string[]): Set<string> =>
  selection.length === 0 ? new Set() : new Set(a.options.filter((o) => !selection.includes(o.key)).map((o) => o.key));

/** The pill's value: the kept names where they are the fewer, else "All but"
 *  the hidden ones; the first name and a count past it. */
function axisWords(values: string[], options: FilterOptionDef[]): string {
  const kept = new Set(values);
  // An umbrella whose legs all stand on one side reads as the umbrella's name there.
  const names = (side: (o: FilterOptionDef) => boolean) => {
    const out: string[] = [];
    for (const o of options) {
      if (!side(o)) continue;
      const p = o.parent;
      if (p && options.filter((x) => x.parent?.value === p.value).every(side)) {
        if (!out.includes(p.label)) out.push(p.label);
      } else out.push(o.label);
    }
    return out;
  };
  const shown = names((o) => kept.has(o.value));
  const hidden = names((o) => !kept.has(o.value));
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
      suffix: o.suffix,
      meta: o.count != null ? o.count.toLocaleString("en-US") : undefined,
      parent: o.parent && {
        value: o.parent.key,
        label: o.parent.label,
        meta: o.parent.count != null ? o.parent.count.toLocaleString("en-US") : undefined,
      },
    })),
    get: (f) => f[a.axis],
    set: (f, picked) => {
      const values = picked.filter((v) => v !== NONE_SHOWN);
      return { ...f, [a.axis]: values.length === a.options.length ? [] : values };
    },
    chipLabel: (values, options) => `${a.name}: ${values.includes(NONE_SHOWN) ? "None" : axisWords(values, options)}`,
  };
}

export interface TimelineFilterModel {
  dimensions: FilterDimension<TimelineFilters>[];
  filters: TimelineFilters;
  onChange: (next: TimelineFilters) => void;
}

/** The timeline's state as the listings' param object, and the write back. */
export function timelineFilterModel(
  tl: TimelineEventsState,
  assetIcon?: (symbol: string) => ReactNode,
): TimelineFilterModel {
  const axes = axesOf(tl, assetIcon);
  const filters: TimelineFilters = {
    q: "",
    sortBy: "time",
    sortOrder: "desc",
    type: [],
    asset: [],
    version: [],
    address: [],
    debt: tl.sizeRanges.debt ?? [],
    coll: tl.sizeRanges.coll ?? [],
  };
  for (const a of axes) filters[a.axis] = selectionOf(a);
  const size = sizeDimsOf(tl.sizeDims, sizeNote(tl.sizeDims));
  const onChange = (next: TimelineFilters) => {
    for (const d of tl.sizeDims) {
      const was = filters[d.side];
      const want = next[d.side] ?? [];
      if (want.length !== was.length || want.some((v, i) => v !== was[i])) tl.setSizeRange(d.side, want);
    }
    for (const a of axes) {
      const want = next[a.axis];
      // Against the keys the hook holds, so a view no selection names (every
      // key hidden, a key no option offers) is still undone.
      const hide = hiddenBy(a, want);
      const held = new Set(a.hiddenRaw);
      if (hide.size === held.size && [...hide].every((k) => held.has(k))) continue;
      // Back to every key shown, then hide what the selection leaves out (the
      // hook's toggles queue on its state, so the run lands as one view).
      a.reset();
      for (const key of hide) a.toggle(key);
    }
  };
  // Size after Type, as the listings set it before Assets.
  const dims = axes.map(dimensionOf);
  const typeAt = dims.findIndex((d) => d.id === "type");
  dims.splice(typeAt + 1, 0, ...size);
  return { dimensions: dims, filters, onChange };
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
    ...(tl.sizeDims.length > 0
      ? { size: { dims: tl.sizeDims, ranges: { debt: draft.debt ?? [], coll: draft.coll ?? [] } } }
      : {}),
  };
}

/** Every axis back to showing all; the date is the caller's. */
export function clearTimelineFilters(m: TimelineFilterModel): void {
  m.onChange(resetAll(groupDimensions(m.dimensions, m.filters), m.filters));
}
