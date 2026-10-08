"use client";

// The one disclosure control (ui-jobs 304): what a control that opens and
// closes a panel carries, whatever element draws it. A real <button> takes
// the first form; a header that holds links of its own (an event card's T1, a
// note row's head) cannot be a <button>, so it takes `role="button"` with the
// keyboard a button has.

import type { KeyboardEvent, MouseEvent } from "react";

export function disclosureProps<E extends HTMLElement>(
  open: boolean,
  panelId: string,
  toggle: (el: E) => void,
  as: "button" | "role" = "button",
) {
  const base = {
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
    onClick: (e: MouseEvent<E>) => toggle(e.currentTarget),
  };
  if (as === "button") return { type: "button" as const, ...base };
  return {
    ...base,
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<E>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(e.currentTarget);
      }
    },
  };
}
