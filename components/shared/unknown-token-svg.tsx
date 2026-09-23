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
}

export function UnknownTokenSvg({ size = 16, symbol, clickProps, clickClass }: UnknownTokenSvgProps) {
  const initial = (symbol ?? "?").slice(0, 1).toUpperCase();
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-marker text-rb-500 font-semibold ${clickClass ?? ""}`}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.55) }}
      {...(clickProps ?? {})}
    >
      {initial}
    </span>
  );
}
