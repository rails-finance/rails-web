"use client";

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/** The group's one control: the layers glyph alone, on the frame's corner.
 *  The verb, the count and the range live in the accessible name and the
 *  native title ("Show 45 grouped events, #7–51"). */
export function GroupCount({
  label,
  open,
  onToggle,
  controls,
}: {
  label: string;
  /** Unset where the control opens no list (the boundary's card). */
  open?: boolean;
  onToggle: () => void;
  controls?: string;
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
      // A 32px target around the 14px glyph, 44px on phones.
      className="flex size-8 max-sm:size-11 items-center justify-center rounded-full text-teal-600 transition-colors hover:text-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] dark:text-teal-500 dark:hover:text-teal-400"
    >
      <span className="rounded-full p-1" style={{ backgroundColor: "var(--background)" }}>
        <Layers size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
      </span>
    </button>
  );
}

/** "Show 45 grouped events, #7–51" / "Hide …". */
export function groupLabel(count: number, open: boolean, range: string | null): string {
  return `${open ? "Hide" : "Show"} ${count.toLocaleString("en-US")} grouped ${count === 1 ? "event" : "events"}${range ? `, ${range}` : ""}`;
}

/** The centre of a row's number pill below the row's top: the card's 4px
 *  padding, the column's 16px offset, half the pill. */
const PILL_CENTRE = 29;

/** The bracket frame around a group: a left border with bracket ends, in the
 *  muted border colour (`border-rb-300`, `dark:border-rb-500`). The group's
 *  control straddles the frame's top-left corner, centred on the border, and
 *  open, the bottom-left corner too, so a long group closes from below. Closed
 *  the frame holds the group's row; open, the members alone, the first on the
 *  row the summed nodes held. */
export function GroupFrame({
  open,
  control,
  closed,
  members,
  membersId,
}: {
  open: boolean;
  control: ReactNode;
  closed: ReactNode;
  members: ReactNode;
  membersId?: string;
}) {
  // The glyph sits on the bracket's border, level with the row's number pill
  // (the closed row's, or the first and last members' open), so the
  // bracket's ends read whole above and below it. On phones, where rows
  // carry no pill, it sits at the same height under the top end.
  const frameRef = useRef<HTMLDivElement>(null);
  const [bottomAt, setBottomAt] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const pills = frame.querySelectorAll<HTMLElement>("[data-number-column] [data-event-number]");
      const last = pills[pills.length - 1];
      if (!last || last.offsetParent == null) return setBottomAt(null);
      const f = frame.getBoundingClientRect();
      const r = last.getBoundingClientRect();
      setBottomAt(r.top + r.height / 2 - f.top);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [open]);
  const corner = (where: "top" | "bottom") => (
    <div
      className="absolute left-px z-30 -translate-x-1/2 -translate-y-1/2"
      style={
        where === "top"
          ? { top: PILL_CENTRE }
          : bottomAt != null
            ? { top: bottomAt }
            : { bottom: PILL_CENTRE, transform: "translate(-50%, 50%)" }
      }
      data-group-corner={where}
    >
      <div className="rounded-full" style={{ backgroundColor: "var(--background)" }}>
        {control}
      </div>
    </div>
  );
  return (
    <div
      ref={frameRef}
      data-group-frame={open ? "open" : "closed"}
      className="relative flex flex-col gap-2 rounded-xl max-sm:ml-2"
    >
      <div
        aria-hidden
        data-group-bracket=""
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 rounded-l-xl border-y border-l border-rb-300 dark:border-rb-500"
      />
      {corner("top")}
      {open ? (
        <>
          <div id={membersId} className="flex flex-col gap-2">
            {members}
          </div>
          {corner("bottom")}
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
