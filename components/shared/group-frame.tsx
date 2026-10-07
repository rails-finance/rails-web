"use client";

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240):
// a closed group is a row on the spine, its legs summed as nodes, and its
// button is the number in the row's column: the newest member's, on the
// stacked pill. Open, the members draw as rows with their plain numbers, and
// a chevron up under the first and the last member's number collapses them.
// A bracket frame marks the group closed and open; the tone sits on the
// nodes, the T1 word and the dotted segment.

/** The event numbers a client-grouped folder holds, lowest and highest, for
 *  its node (`renderRunFolders` provides it). */
export const GroupNumbersContext = createContext<[number, number] | null>(null);

/** The closed group's pill: its newest member's number, else the count. */
export function groupPillText(range: [number, number] | null, count: number): string {
  return range ? String(Math.max(range[0], range[1])) : `×${count.toLocaleString("en-US")}`;
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
      className="group/gp -m-2 flex min-h-8 min-w-8 items-center justify-center rounded-full p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-sm:min-h-11 max-sm:min-w-11"
    >
      <span className="num-pill num-pill-stacked group-hover/gp:text-foreground" aria-hidden>
        {text}
      </span>
    </button>
  );
}

/** The open group's collapse control (`group-chevron`), under the first and
 *  the last member's number: the same button as the closed pill. */
export function GroupChevron({
  label,
  onToggle,
  controls,
}: {
  label: string;
  onToggle: () => void;
  controls?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded
      aria-controls={controls}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      data-group-button=""
      className="group-chevron"
    >
      <ChevronUp size={14} strokeWidth={2} aria-hidden />
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
 *  row the summed nodes held, with the collapse chevron under the first and
 *  the last member's number. */
export function GroupFrame({
  open,
  chevron,
  closed,
  members,
  membersId,
}: {
  open: boolean;
  chevron: ReactNode;
  closed: ReactNode;
  members: ReactNode;
  membersId?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<{ x: number; y: number }[]>([]);
  useLayoutEffect(() => {
    if (!open) return setMarks([]);
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const pills = [...frame.querySelectorAll<HTMLElement>("[data-number-column] [data-event-number]")].filter(
        (p) => p.offsetParent != null,
      );
      if (pills.length === 0) return setMarks([]);
      const f = frame.getBoundingClientRect();
      const at = (p: HTMLElement) => {
        const r = p.getBoundingClientRect();
        return { x: r.left + r.width / 2 - f.left, y: r.bottom - f.top };
      };
      const first = at(pills[0]);
      const last = at(pills[pills.length - 1]);
      setMarks(pills.length > 1 ? [first, last] : [first]);
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
          <div id={membersId} className="flex flex-col gap-2">
            {members}
          </div>
          {marks.map((m, i) => (
            <div
              key={i}
              className="absolute z-30 -translate-x-1/2"
              style={{ left: m.x, top: m.y }}
              data-group-chevron={i === 0 ? "first" : "last"}
            >
              {chevron}
            </div>
          ))}
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
