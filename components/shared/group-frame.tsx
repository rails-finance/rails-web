"use client";

import { createContext, type ReactNode } from "react";
import { Layers } from "lucide-react";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240):
// a closed group is a row on the spine, its legs summed as nodes. Its control
// stands in the number column, left of the spine, where a member's number
// would: the layers glyph and the count. Open, the members draw as rows with
// their numbers and the control repeats at the group's bottom row. A
// bracket frame marks the group closed and open; the tone sits on the nodes,
// the T1 word and the dotted segment.

/** The event numbers a client-grouped folder holds, lowest and highest, for
 *  its node (`renderRunFolders` provides it). */
export const GroupNumbersContext = createContext<[number, number] | null>(null);

/** "#139–147", or "#139" for one. */
export function groupRangeText(range: [number, number] | null): string | null {
  if (!range) return null;
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return lo === hi ? `#${lo}` : `#${lo}–${hi}`;
}

/** The group's one control, in the number column where a member's number
 *  would stand: the layers glyph with the count under it ("× 45") in the
 *  muted small type. The verb and the range live in the accessible name and
 *  the native title ("Show 45 grouped events, #7–51"); the row shows neither. */
export function GroupCount({
  count,
  label,
  open,
  onToggle,
  controls,
  inline,
}: {
  /** Unset where the count is not known (the boundary before the index
   *  has counted): the glyph alone. */
  count?: number;
  label: string;
  /** Unset where the control opens no list (the boundary's card). */
  open?: boolean;
  onToggle: () => void;
  controls?: string;
  /** The phone's caption row: glyph and count side by side. */
  inline?: boolean;
}) {
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
      // The padding, cancelled by the margin, takes the target to 44px.
      className={`group/gc relative -m-2 flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg p-2 text-xs tabular-nums text-rb-500 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${inline ? "flex-row" : "flex-col"}`}
    >
      <Layers
        size={18}
        strokeWidth={1.5}
        absoluteStrokeWidth
        aria-hidden
        className="text-teal-600 dark:text-teal-500"
      />
      {count != null && <span aria-hidden>&times; {count.toLocaleString("en-US")}</span>}
    </button>
  );
}

/** "Show 45 grouped events, #7–51" / "Hide …". */
export function groupLabel(count: number, open: boolean, range: string | null): string {
  return `${open ? "Hide" : "Show"} ${count.toLocaleString("en-US")} grouped ${count === 1 ? "event" : "events"}${range ? `, ${range}` : ""}`;
}

/** The phone spine view's caption row for a group: the control first, then
 *  the kind and the span ("[layers] × 45 Redemptions · 1 Oct '25 – 12 Oct
 *  '25"), on the line. The segment above is a button of its own, so the
 *  control stands in this row, outside it. */
export function GroupCaptionRow({ control, children }: { control: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative flex justify-center py-1" data-group-caption="">
      <div aria-hidden className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-rb-500" />
      <span
        className="relative inline-flex max-w-full items-center gap-2 px-2 text-xs leading-5 text-rb-500"
        style={{ backgroundColor: "var(--background)" }}
      >
        {control}
        {children && <span className="truncate">{children}</span>}
      </span>
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
