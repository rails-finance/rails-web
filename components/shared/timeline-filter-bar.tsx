"use client";

// The timeline's filters on the listings' pills (N1.10, ui-jobs 735, 801): one
// pill per axis that is set (Type, Asset, Version, Address), each with its
// editor, and the Filters button with its sheet, over the model in
// timeline-filter-model.ts. The toolbar draws the Date.

import { useRef, useState } from "react";
import { FilterPill } from "@/components/shared/filter-bar/filter-pill";
import { FilterSheet } from "@/components/shared/filter-bar/filter-sheet";
import { GroupEditor } from "@/components/shared/filter-bar/pill-editor";
import { groupDimensions, pillFor, resetGroup, type PillModel } from "@/components/shared/filter-bar/pill-model";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  AXIS_ANATOMY,
  timelineFilterModel as model,
  type Axis,
  type TimelineFilterModel,
  type TimelineFilters,
} from "@/components/shared/timeline-filter-model";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";

export {
  clearTimelineFilters,
  draftAxesView,
  type TimelineFilterModel,
  type TimelineFilters,
} from "@/components/shared/timeline-filter-model";

/** The model with the asset options' token chips. */
export const timelineFilterModel = (tl: TimelineEventsState): TimelineFilterModel =>
  model(tl, (symbol) => <TokenChipIcon symbol={symbol} size={16} filterable={false} />);

/** The pills of the axes, in registry order, each with its editor. */
type DraftCount = (draft: TimelineFilters) => number | Promise<number>;

export function TimelineAxisPills({
  model,
  count,
  countFor,
  inert = false,
}: {
  /** True while the Filters panel is open in the page: the pills stand back. */
  inert?: boolean;
  model: TimelineFilterModel;
  count?: { total: number; noun: string };
  countFor?: DraftCount;
}) {
  const [openName, setOpen] = useState<string | null>(null);
  const open = inert ? null : openName;
  const groups = groupDimensions(model.dimensions, model.filters);
  return (
    <>
      {groups.map((g) => {
        const pill = pillFor(g, model.filters);
        // An unset axis has no pill: the Filters button reaches it.
        if (pill.state === "unset") return null;
        return (
          <AxisPill
            key={pill.name}
            pill={pill}
            open={open === pill.name}
            setOpen={(o) => setOpen(o ? pill.name : null)}
            model={model}
            count={count}
            countFor={countFor}
            inert={inert}
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
  inert,
}: {
  inert: boolean;
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
    <div ref={anchorRef} className="contents" data-timeline-axis={pill.dims[0].id} inert={inert}>
      <FilterPill
        name={pill.name}
        anatomy={AXIS_ANATOMY[pill.dims[0].id as Axis]}
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

/** The Filters button and its sheet. */
export function TimelineFilterSheet({
  model,
  count,
  countFor,
  slot,
  onPanelOpenChange,
}: {
  onPanelOpenChange?: (open: boolean) => void;
  model: TimelineFilterModel;
  count?: { total: number; noun: string };
  countFor?: DraftCount;
  /** Where the filters open from sm (FilterSheet `slot`). */
  slot?: HTMLElement | null;
}) {
  if (model.dimensions.length === 0) return null;
  return (
    <FilterSheet
      dimensions={model.dimensions}
      filters={model.filters}
      onChange={model.onChange}
      count={count}
      countFor={countFor}
      slot={slot}
      onPanelOpenChange={onPanelOpenChange}
    />
  );
}
