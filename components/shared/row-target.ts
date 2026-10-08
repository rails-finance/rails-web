"use client";

// The whole row as the card's click target (ui-jobs 304, Miles 8 Oct 2026):
// a click anywhere on a timeline row — the number column, the spine cell, the
// T1 row, the space between — opens or closes its card. The row's control
// (`data-row-control`: the desktop header, the phone segment's button) stays
// the one focusable element and keeps the keyboard; this hook takes the
// pointer for the whole row.
//
// A click is left alone when it lands on another interactive element (the ⋮
// menu, the hash link, a link in T1), inside the open body, outside the row's
// DOM (a portal: the menu's sheet), after the pointer moved (a drag) or while
// text inside the row is selected, so copying an amount does not toggle.

import { useRef, type MouseEvent, type PointerEvent } from "react";

const INTERACTIVE =
  'a, button, input, select, textarea, summary, label, [role="button"], [role="menuitem"], [role="menu"], [role="dialog"], [role="link"]';
/** How far the pointer may move between press and release for a click. */
const DRAG_PX = 4;

export function useRowTarget(toggle: (() => void) | null) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      down.current = { x: e.clientX, y: e.clientY };
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (!toggle) return;
      const row = e.currentTarget;
      const target = e.target as Element;
      if (!row.contains(target)) return;
      const hit = target.closest(INTERACTIVE);
      if (hit && row.contains(hit) && !hit.hasAttribute("data-row-control")) return;
      if (hit && !row.contains(hit)) return;
      if (target.closest('[data-anatomy="T2"], [data-row-body]')) return;
      const d = down.current;
      down.current = null;
      if (d && e.detail > 0 && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return;
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.anchorNode && row.contains(sel.anchorNode)) return;
      toggle();
    },
  };
}
