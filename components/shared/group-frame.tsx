"use client";

import { createContext, type ReactNode } from "react";
import { Layers } from "lucide-react";
import { useTimelineScale } from "@/components/shared/activity-timeline";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240):
// a closed group is a row on the spine. Its control is a node on the line:
// the range of event numbers it holds ("#139–147") over the layers glyph, one
// button; under it, the group's legs summed as nodes. Open, the members draw
// as rows and the same node repeats as the group's bottom node. A bracket
// frame marks the group closed and open; the tone sits on the nodes, the T1
// word and the dotted segment.

/** The event numbers a client-grouped folder holds, lowest and highest, for
 *  its node (`renderRunFolders` provides it). */
export const GroupNumbersContext = createContext<[number, number] | null>(null);

/** "#139–147", or "#139" for one. */
export function groupRangeText(range: [number, number] | null): string | null {
  if (!range) return null;
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return lo === hi ? `#${lo}` : `#${lo}–${hi}`;
}

/** The group's one control, on the spine: the range in the time slot's small
 *  muted type over the layers glyph. The verb lives in the accessible name
 *  and the native title ("Show 9 grouped events"); the row shows none. */
export function GroupNode({
  range,
  label,
  open,
  onToggle,
  controls,
}: {
  range: string | null;
  label: string;
  /** Unset where the node opens no list (the boundary's card). */
  open?: boolean;
  onToggle: () => void;
  controls?: string;
}) {
  const scale = useTimelineScale();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      data-group-button=""
      // The glyph is the node; the padding, cancelled by the margin, takes
      // the target to 44px without moving the stack.
      className="group/gn relative -m-1.5 flex items-center justify-center rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      {range && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap px-1 text-xs leading-4 tabular-nums text-rb-500 transition-colors group-hover/gn:text-foreground"
          style={{ backgroundColor: "var(--background)" }}
          data-group-range=""
        >
          {range}
        </span>
      )}
      <Layers
        size={scale.tokenSize}
        strokeWidth={1.25}
        absoluteStrokeWidth
        aria-hidden
        className="text-rb-500 transition-colors group-hover/gn:text-foreground"
      />
    </button>
  );
}

/** The phone spine view's group node: the segment below it is a button of its
 *  own, so the node stands on the line above it, centred on the spine. */
export function PhoneGroupNode(props: Parameters<typeof GroupNode>[0]) {
  return (
    <div className="relative flex justify-center pt-5 pb-1">
      {/* The line runs on into the node of the segment below. */}
      <div aria-hidden className="absolute left-1/2 top-0 -bottom-6 w-px -translate-x-1/2 bg-rb-500" />
      <div
        className="relative"
        style={{ backgroundColor: "var(--background)", boxShadow: "0 0 0 4px var(--background)" }}
      >
        <GroupNode {...props} />
      </div>
    </div>
  );
}

/** The bracket frame around a group: a left border with bracket ends, in the
 *  muted border colour (`border-rb-300`, `dark:border-rb-500`). Closed it
 *  holds the group's row; open, the top node row, the members and the bottom
 *  node row. */
export function GroupFrame({
  open,
  closed,
  top,
  members,
  bottom,
  membersId,
}: {
  open: boolean;
  closed: ReactNode;
  top: ReactNode;
  members: ReactNode;
  bottom: ReactNode;
  membersId?: string;
}) {
  return (
    <div data-group-frame={open ? "open" : "closed"} className="relative flex flex-col gap-2 rounded-xl">
      <div
        aria-hidden
        data-group-bracket=""
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 rounded-l-xl border-y border-l border-rb-300 dark:border-rb-500"
      />
      {open ? (
        <>
          {top}
          <div id={membersId} className="flex flex-col gap-2">
            {members}
          </div>
          {bottom}
        </>
      ) : (
        // The dotted segment runs on below the legs inside the frame, and its
        // overshoot still reaches the next row's node.
        <div className="pb-6" style={{ "--mspine-extra": "24px" } as React.CSSProperties}>
          {closed}
        </div>
      )}
    </div>
  );
}
