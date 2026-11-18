"use client";

// The projection toggle (ui-jobs 733): the control that shows or hides the
// timeline's projection row (components/shared/projection-row.tsx). Off by
// default; a viewer's choice is held in this browser under one key. It is no
// filter: clearing the filters leaves it, the URL and `?at=` links never carry
// it, and the event count never moves with it.
//
// Drawn in the row's register — a dashed outline, muted ink, the row's
// calendar-plus mark — so the button and the row read as a pair. The control
// takes its words from the family and its state from its caller, so it can
// stand in any toolbar.

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { CTRL_GHOST, CTRL_ON, CTRL_ON_HOVER } from "@/lib/shared/ui-grammar";

/** The browser's memory of the choice: "1" while on, absent while off. */
export const PROJECTION_STORAGE_KEY = "rails:timeline-projection";

export interface ProjectionToggleWords {
  /** The button's words: "Projection". */
  label: string;
  /** The button's accessible name. */
  ariaLabel: string;
}

export function ProjectionToggle({
  pressed,
  onChange,
  words,
}: {
  pressed: boolean;
  onChange: (next: boolean) => void;
  words: ProjectionToggleWords;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={words.ariaLabel}
      title={words.ariaLabel}
      onClick={() => onChange(!pressed)}
      data-timeline-projection-toggle={pressed ? "on" : "off"}
      className={`${CTRL_GHOST} h-7 gap-2 rounded-md border border-dashed px-1.5 text-xs sm:px-2.5 ${
        pressed
          ? `border-rb-500 dark:border-rb-400 ${CTRL_ON} ${CTRL_ON_HOVER}`
          : "border-rb-400 text-rb-500 hover:text-foreground dark:border-rb-500/60"
      }`}
    >
      <CalendarPlus size={16} strokeWidth={1.5} aria-hidden />
      <span className="hidden sm:inline">{words.label}</span>
    </button>
  );
}

/** The viewer's choice: off on the server and on the first paint, then what
 *  this browser holds, read after mount. A storage that throws or is empty
 *  reads off. */
export function useProjectionShown(): [boolean, (next: boolean) => void] {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(PROJECTION_STORAGE_KEY) === "1") setShown(true);
    } catch {}
  }, []);
  const set = useCallback((next: boolean) => {
    setShown(next);
    try {
      if (next) localStorage.setItem(PROJECTION_STORAGE_KEY, "1");
      else localStorage.removeItem(PROJECTION_STORAGE_KEY);
    } catch {}
  }, []);
  return [shown, set];
}
