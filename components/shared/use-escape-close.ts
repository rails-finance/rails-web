"use client";

// Escape closes the most recently opened (i) panel, on every card that draws
// one through the shared disclosures (info-disclosure.tsx: position cards via
// PositionCardShell, event cards, market notes), and focus returns to that
// panel's (i) button. One press closes one panel; the next press closes the
// one opened before it.
//
// One listener on `window` in the capture phase serves every panel, so the
// order panels opened in is the order Escape closes them. It stands aside when
// something above the panels owns Escape: a modal, menu or listbox that does
// not contain the panel (a Learn more modal opened from the panel closes
// first), or the armed provenance inspector. A press it handles is marked
// `defaultPrevented`, which the phone card sheet (mobile-sheet.tsx) reads so a
// panel inside the sheet closes without the sheet closing with it.

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { provInspector } from "@/components/shared/provenance";

interface Entry {
  close: () => void;
  focusTarget: () => HTMLElement | null;
}

const stack: Entry[] = [];
let listening = false;

const LAYER = '[aria-modal="true"], [role="dialog"], [role="menu"], [role="listbox"]';

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  if (provInspector.getArmed()) return;
  const target = top.focusTarget();
  for (const layer of document.querySelectorAll(LAYER)) {
    if (!target || !layer.contains(target)) return;
  }
  e.preventDefault();
  stack.pop();
  top.close();
  target?.focus();
}

/** Registers an open panel with the Escape stack while `open` holds.
 *  `close` and `focusTarget` are read at the moment Escape is pressed. */
export function useEscapeClose(
  open: boolean,
  close: () => void,
  focusTarget: RefObject<HTMLElement | null> | (() => HTMLElement | null),
) {
  const latest = useRef({ close, focusTarget });
  useLayoutEffect(() => {
    latest.current = { close, focusTarget };
  });
  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    const entry: Entry = {
      close: () => latest.current.close(),
      focusTarget: () => {
        const f = latest.current.focusTarget;
        return typeof f === "function" ? f() : f.current;
      },
    };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [open]);
}
