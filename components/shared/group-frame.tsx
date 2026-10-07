"use client";

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GroupHideContext } from "@/components/shared/event-card-menu";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240):
// a closed group is a row on the spine, its legs summed as nodes, and its
// button is the number in the row's column: the newest member's, on the
// stacked pill. Open, the members draw as rows; the first member's number is
// the same stacked pill, which collapses them, and each member's ⋮ offers
// "Hide" too.
// A bracket frame marks the group closed and open; the tone sits on the
// nodes, the T1 word and the dotted segment.

/** The event numbers a client-grouped folder holds, lowest and highest, for
 *  its node (`renderRunFolders` provides it). */
export const GroupNumbersContext = createContext<[number, number] | null>(null);

/** The group's pill: its newest member's number, or a dash where the page
 *  does not know it. */
export function groupPillText(range: [number, number] | null): string {
  return range ? String(Math.max(range[0], range[1])) : "–";
}

/** "#139–147", or "#139" for one. */
export function groupRangeText(range: [number, number] | null): string | null {
  if (!range) return null;
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return lo === hi ? `#${lo}` : `#${lo}–${hi}`;
}

/** The group's one control while closed, in the number column: its newest
 *  member's number on the stacked pill (`num-pill-stacked`). The verb, the
 *  count and the range live in the accessible name and the native title
 *  ("Show 48 grouped events, #97–144"). The boundary draws the same pill with
 *  its count ("+52"). The target is 32px, 44px on phones. */
export function GroupPill({
  text,
  label,
  open,
  onToggle,
  controls,
}: {
  text: string;
  label: string;
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
      // The margin centres the taller phone target on the number's line, so
      // the pill stands where the plain number does, closed and open.
      className="group/gp -m-2 flex min-h-8 min-w-8 items-center justify-center rounded-full p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-sm:-my-[13px] max-sm:min-h-11 max-sm:min-w-11"
    >
      <span className="num-pill num-pill-stacked group-hover/gp:text-foreground" aria-hidden>
        {text}
      </span>
    </button>
  );
}

/** "Show 45 grouped events, #7–51" / "Hide …". */
export function groupLabel(count: number, open: boolean, range: string | null): string {
  return `${open ? "Hide" : "Show"} ${count.toLocaleString("en-US")} grouped ${count === 1 ? "event" : "events"}${range ? `, ${range}` : ""}`;
}

/** The bracket frame around a group: a left border with bracket ends, in the
 *  muted border colour (`border-rb-300`, `dark:border-rb-500`, the stacked
 *  pill's `--group-edge`). Closed it holds the group's row, whose number
 *  column carries the stacked pill; open, the members alone, the first on the
 *  row the summed nodes held, its number drawn on the same stacked pill (the
 *  one toggle, in the same place), and every member's ⋮ offering "Hide". */
export function GroupFrame({
  open,
  openPill,
  hide,
  closed,
  members,
  membersId,
}: {
  open: boolean;
  /** The stacked pill that collapses the open group, laid over the first
   *  member's number. */
  openPill: ReactNode;
  /** The members' ⋮ entry: the same collapse. */
  hide: { title: string; subtitle: string; hide: () => void };
  closed: ReactNode;
  members: ReactNode;
  membersId?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return setAt(null);
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const pill = [...frame.querySelectorAll<HTMLElement>("[data-number-column] [data-event-number]")].find(
        (p) => p.offsetParent != null,
      );
      if (!pill) return setAt(null);
      const f = frame.getBoundingClientRect();
      const r = pill.getBoundingClientRect();
      setAt({ x: r.left + r.width / 2 - f.left, y: r.top + r.height / 2 - f.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div ref={frameRef} data-group-frame={open ? "open" : "closed"} className="relative flex flex-col gap-2 rounded-xl">
      <div
        aria-hidden
        data-group-bracket=""
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 rounded-l-xl border-y border-l border-rb-300 dark:border-rb-500"
      />
      {open ? (
        <>
          <GroupHideContext.Provider value={hide}>
            <div id={membersId} className="flex flex-col gap-2">
              {members}
            </div>
          </GroupHideContext.Provider>
          {at && (
            <div
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left: at.x, top: at.y }}
              data-group-open-pill=""
            >
              {openPill}
            </div>
          )}
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
