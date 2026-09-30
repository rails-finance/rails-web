"use client";

// Minimal placeholder for tokens with no resolvable icon.
//
// Just enough for the universal event-card flow: a neutral circle with the
// symbol's first character. Token coverage here (Liquity V2 only) means this
// is rarely if ever rendered.

import type { MouseEvent } from "react";

export interface UnknownTokenSvgProps {
  size?: number;
  symbol?: string;
  clickProps?: {
    onClick?: (e: MouseEvent) => void;
    role?: "button";
    title?: string;
  };
  clickClass?: string;
  /** The symbol is printed beside it: hidden from assistive tech, and the
   *  letter does not copy. */
  decorative?: boolean;
}

export function UnknownTokenSvg({ size = 16, symbol, clickProps, clickClass, decorative }: UnknownTokenSvgProps) {
  // A principal token's symbol always begins "PT-", so its first letter says
  // nothing; it draws "PT". Everything else draws its first character.
  const initial = /^PT-/i.test(symbol ?? "") ? "PT" : (symbol ?? "?").slice(0, 1).toUpperCase();
  const label = symbol ?? "Unknown token";
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-marker text-rb-500 font-semibold leading-none ${decorative ? "select-none" : ""} ${clickClass ?? ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(initial.length > 1 ? 7 : 8, size * (initial.length > 1 ? 0.42 : 0.55)),
      }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label, title: label })}
      {...(clickProps ?? {})}
    >
      {initial}
    </span>
  );
}
