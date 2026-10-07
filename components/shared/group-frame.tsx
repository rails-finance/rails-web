"use client";

import type { ReactNode } from "react";
import { Layers } from "lucide-react";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240):
// a closed group is a row on the spine with its sums as nodes, and a text
// button with the layers glyph above them shows or hides its members. Open,
// the button repeats as the group's bottom row. A bracket frame marks the
// group closed and open; it says "a group" and nothing about tone (the band,
// `bg-raised`, is the caution and critical surface and is passed separately).

/** The words of the group button: "Show 45 events" closed, "Group 45 events"
 *  open. */
export function groupButtonWords(count: number, open: boolean): string {
  return `${open ? "Group" : "Show"} ${count.toLocaleString("en-US")} ${count === 1 ? "event" : "events"}`;
}

/** The group's one control: the layers glyph and its words. The boundary
 *  card draws the same form with its own words. */
export function GroupButton({
  children,
  open,
  onClick,
  controls,
}: {
  children: ReactNode;
  /** Unset where the button opens no list (the boundary's card). */
  open?: boolean;
  onClick: () => void;
  controls?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-group-button=""
      className="inline-flex min-h-8 items-center gap-2 rounded-md px-1 text-sm text-rb-500 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <Layers
        size={18}
        strokeWidth={1.5}
        absoluteStrokeWidth
        aria-hidden
        className="text-teal-600 dark:text-teal-500"
      />
      {children}
    </button>
  );
}

/** The bracket frame around a group: a left border with bracket ends, in the
 *  muted border colour (`border-rb-300`, `dark:border-rb-500`). Closed it
 *  holds the button and the summed row; open, the button, the members and
 *  the button again. `banded` puts the caution and critical surface under it
 *  (a group of redemptions or liquidations). */
export function GroupFrame({
  open,
  banded,
  button,
  closed,
  members,
  membersId,
}: {
  open: boolean;
  banded: boolean;
  button: ReactNode;
  closed: ReactNode;
  members: ReactNode;
  membersId?: string;
}) {
  return (
    <div
      data-group-frame={open ? "open" : "closed"}
      // The ground hides the line above reaching into the frame: a group's
      // spine starts at its nodes.
      className={`relative rounded-xl ${banded ? "bg-raised" : "bg-background"}`}
      // The spine's masks, halos and captions inside take the frame's ground.
      style={banded ? ({ "--spine-ground": "var(--surface-raised)" } as React.CSSProperties) : undefined}
    >
      <div
        aria-hidden
        data-group-bracket=""
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 rounded-l-xl border-y border-l border-rb-300 dark:border-rb-500"
      />
      <div className="pl-6 pt-2">{button}</div>
      {open ? (
        <>
          <div id={membersId} className="flex flex-col gap-2 pt-1">
            {members}
          </div>
          <div className="pl-6 pt-1 pb-2">{button}</div>
        </>
      ) : (
        // The undrawn segment runs on below the nodes inside the frame, and
        // its overshoot still reaches the next row's node.
        <div className="pb-8" style={{ "--mspine-extra": "32px" } as React.CSSProperties}>
          {closed}
        </div>
      )}
    </div>
  );
}
