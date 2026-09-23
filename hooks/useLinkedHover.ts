"use client";

import { useCallback, useState } from "react";
import type { PointerEvent } from "react";

/**
 * Linked hover — several pointer surfaces that are ONE control light up
 * together. A timeline folder row has two: the folder node in the spine's
 * left flank and the run header to its right, each rendered in its own
 * subtree of the shared EventCard (`iconColumn` and `header` props), so no
 * CSS group can span them. This hook holds the union: hovering either
 * surface lights both, and both dim only when the pointer has left both.
 *
 * Touch pointers are ignored — a tap has no hover, and pointerenter from a
 * tap would otherwise leave the row lit until the next tap elsewhere.
 */
export interface LinkedHoverHandlers {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
}

export function useLinkedHover<K extends string>(): {
  /** True while the pointer is over any bound surface. */
  lit: boolean;
  /** Handlers for one surface — spread onto its element. */
  bind: (key: K) => LinkedHoverHandlers;
} {
  const [over, setOver] = useState<Partial<Record<K, boolean>>>({});

  const bind = useCallback(
    (key: K): LinkedHoverHandlers => ({
      onPointerEnter: (e) => {
        if (e.pointerType === "touch") return;
        setOver((h) => (h[key] ? h : { ...h, [key]: true }));
      },
      onPointerLeave: (e) => {
        if (e.pointerType === "touch") return;
        setOver((h) => (h[key] ? { ...h, [key]: false } : h));
      },
    }),
    [],
  );

  return { lit: Object.values(over).some(Boolean), bind };
}
