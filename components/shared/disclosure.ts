"use client";

// The one disclosure control (ui-jobs 304): what a control that opens and
// closes a panel carries, whatever element draws it. The pointer is the row's
// (row-target.ts: a click anywhere on the row toggles it), so the control
// carries the state, its name's anchor (`data-row-control`) and the keyboard.
// A real <button> clicks itself on Enter and Space, and that click reaches the
// row; a header that holds links (an event card's T1, a note row's
// head) cannot be a <button>, so it takes `role="button"` with the keyboard a
// button has.

import type { KeyboardEvent } from "react";

export function disclosureProps<E extends HTMLElement>(
  open: boolean,
  panelId: string,
  toggle: () => void,
  as: "button" | "role" = "button",
) {
  const base = {
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
    "data-row-control": "",
  };
  if (as === "button") return { type: "button" as const, ...base };
  return {
    ...base,
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<E>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
  };
}
