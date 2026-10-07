"use client";

import { createContext, useEffect, useRef, type ReactNode } from "react";
import { GroupHideContext } from "@/components/shared/event-card-menu";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240):
// a closed group is a row on the spine, its legs summed as nodes, its range of
// event numbers in the row's column, and its ⋮ offering "Show 48 grouped
// events", the one way to open it. Open, the members draw as rows and each
// member's ⋮ offers "Hide", the one way to close it.
// A bracket frame marks the group closed and open; the tone sits on the
// nodes, the T1 word and the dotted segment.

/** The event numbers a client-grouped folder holds, lowest and highest, for
 *  its node (`renderRunFolders` provides it). */
export const GroupNumbersContext = createContext<[number, number] | null>(null);

/** "#139–147", or "#139" for one. */
export function groupRangeText(range: [number, number] | null): string | null {
  if (!range) return null;
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return lo === hi ? `#${lo}` : `#${lo}–${hi}`;
}

/** A closed group's number: its range on two lines, the newest member's
 *  number over the oldest ("144" over "97"), in the plain number style, so
 *  the column stays as narrow as one number. Plain text: the group opens
 *  from its row's ⋮ (ui-jobs 250, third revision). */
export function GroupRange({ range }: { range: [number, number] | null }) {
  if (!range) return null;
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return (
    <span
      className="num-pill flex-col gap-0.5"
      data-group-range=""
      data-prov-exempt=""
      aria-label={`Events ${lo} to ${hi}`}
    >
      <span>{hi}</span>
      {lo !== hi && <span>{lo}</span>}
    </span>
  );
}

/** The menu rows that open and close a group: the closed row's ⋮ shows it,
 *  every member's ⋮ hides it, one handler behind both. */
export function groupMenuWords(count: number, range: string | null) {
  const n = `${count.toLocaleString("en-US")} grouped ${count === 1 ? "event" : "events"}`;
  return {
    show: { title: `Show ${n}`, subtitle: range ? `Expand the group, ${range}` : "Expand the group" },
    hide: { title: `Hide ${n}`, subtitle: range ? `Collapse the group, ${range}` : "Collapse the group" },
  };
}

/** The bracket frame around a group: a left border with bracket ends, in the
 *  muted border colour (`border-rb-300`, `dark:border-rb-500`). Closed it
 *  holds the group's row, its range in the number column and its ⋮ offering
 *  "Show"; open, the members alone, the first on the row the summed nodes
 *  held, every member's ⋮ offering "Hide". A `group-open` event on the frame
 *  opens it (the timeline's rewind). */
export function GroupFrame({
  open,
  show,
  hide,
  closed,
  members,
  membersId,
}: {
  open: boolean;
  show: () => void;
  /** The members' ⋮ entry: the group's collapse. */
  hide: { title: string; subtitle: string; hide: () => void };
  closed: ReactNode;
  members: ReactNode;
  membersId?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onOpen = () => showRef.current();
    frame.addEventListener("group-open", onOpen);
    return () => frame.removeEventListener("group-open", onOpen);
  }, []);
  return (
    <div ref={frameRef} data-group-frame={open ? "open" : "closed"} className="relative flex flex-col gap-2 rounded-xl">
      <div
        aria-hidden
        data-group-bracket=""
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 rounded-l-xl border-y border-l border-rb-300 dark:border-rb-500"
      />
      {open ? (
        <GroupHideContext.Provider value={hide}>
          <div id={membersId} className="flex flex-col gap-2">
            {members}
          </div>
        </GroupHideContext.Provider>
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
