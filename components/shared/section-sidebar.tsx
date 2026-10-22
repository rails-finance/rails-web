"use client";

// The position card's sidebar carried through a detail page's sections (rails-ops
// TO-DO-position-card 427; anatomy P2.1, P3.1): from md a bar the card's width
// (40px) in the protocol's brand hue at the section's left, bare (no mark, name
// or glyph); below md the 6px border the card takes. The section keeps its box
// and content; from md it stands beside the bar, and below md the bare
// timeline steps 6px in beside its border as the boxes' content does. Off the explorers (no roster
// entry for the page) it draws nothing and adds no wrapper.
//
// The timeline's bar (`data-card-sidebar="timeline"`) is a positioned element
// spanning the section's height, with the section's rows inside the same
// positioned frame (`data-card-sidebar-frame`), so a row's top measured against
// the bar's places anything hung on the bar beside that row.

import type { CSSProperties, ReactNode } from "react";
import { usePositionCardIdentity } from "@/components/shared/position-card-edge";

export type SectionSidebarKind = "flows" | "timeline";

const ANATOMY: Record<SectionSidebarKind, string> = { flows: "P2.1", timeline: "P3.1" };

/** The 6px border below md: the section's rounded shape clipped to its left edge. */
const EDGE = "rounded-2xl bg-brand-edge [clip-path:inset(0_calc(100%_-_6px)_0_0)]";

export function SectionSidebar({
  section,
  hidden,
  children,
}: {
  /** `flows` wraps a boxed section (its tint runs under the box's corners, as
   *  the card's does); `timeline` wraps the bare timeline (the bar's inner edge
   *  is straight, the edge a later per-row tab stands from). */
  section: SectionSidebarKind;
  hidden?: boolean;
  children: ReactNode;
}) {
  const identity = usePositionCardIdentity();
  if (!identity) return <>{children}</>;
  const style = {
    "--brand-hue": identity.hue ?? 0,
    ...(identity.hue == null ? { "--brand-strength": 0 } : {}),
  } as CSSProperties;
  const boxed = section === "flows";
  return (
    <div
      className={`relative md:pl-10 ${boxed ? "" : "max-md:pl-1.5"}`}
      style={style}
      data-card-sidebar-frame={section}
      hidden={hidden}
    >
      {boxed ? (
        <>
          {/* From md the bar meets the box as the card's does: the tint shows
              in the box's rounded corners (`mask-sidebar-corners`). */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-14 rounded-2xl bg-brand-zone mask-sidebar-corners md:block"
            data-anatomy={ANATOMY[section]}
            data-card-sidebar={section}
          />
          {children}
          {/* Below md over the box's left edge, as the card's border. */}
          <span aria-hidden="true" className={`pointer-events-none absolute inset-0 md:hidden ${EDGE}`} />
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 w-full ${EDGE} md:w-10 md:rounded-r-none md:bg-brand-zone md:[clip-path:none]`}
            data-anatomy={ANATOMY[section]}
            data-card-sidebar={section}
          />
          {children}
        </>
      )}
    </div>
  );
}
