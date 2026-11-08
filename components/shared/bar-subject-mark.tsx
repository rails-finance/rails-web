"use client";

// A bar subject's mark (rails-ops TO-DO-ui-jobs 439, 438): the product's glyph,
// its `public/icons/protocols/` image, or the `route` placeholder for a route
// with neither. The timeline's side bar draws it at the head of the product's
// stretch (`section-sidebar.tsx`), and the event page's head chip draws it on
// the same ground as a tile the bar's width (`BarSubjectTile`).

import type { CSSProperties } from "react";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import type { BarSubject } from "@/lib/shared/known-infrastructure";

/** The subject's hue on the bar's `--brand-zone-*` tokens; grey where the
 *  mark has none. */
export function barSubjectHue(subject: BarSubject): CSSProperties {
  return {
    "--brand-hue": subject.hue ?? 0,
    "--brand-strength": subject.hue == null ? 0 : 1,
  } as CSSProperties;
}

export function BarSubjectMark({ subject, className = "" }: { subject: BarSubject; className?: string }) {
  return (
    <ProtocolIcon
      id={subject.icon}
      fallback={subject.shared ? "route" : undefined}
      className={`h-4 w-4 text-brand-mark [&:is(img)]:grayscale ${className}`}
    />
  );
}

/** The bar's head as a tile: 40 px, the stretch's ground, the mark centred. */
export function BarSubjectTile({ subject }: { subject: BarSubject }) {
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-zone"
      style={barSubjectHue(subject)}
      data-bar-tile={subject.name}
    >
      <BarSubjectMark subject={subject} />
    </span>
  );
}
