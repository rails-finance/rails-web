export interface ExpandChevronProps {
  isOpen: boolean;
  /** Tailwind group prefix the chevron lives inside, e.g. "evt", "card", "proto".
   *  On group hover the chevron STROKE goes from muted rb-500 to foreground —
   *  expand/collapse is a disclosure (it reveals more of this card), so it takes
   *  foreground: not blue (navigation), not teal (in-place utility, i.e. controls
   *  that change the view).
   *  No background pill: the icon itself is the hover affordance (see globals.css). */
  group: string;
  size?: number;
  className?: string;
}

/** Finder-style disclosure chevron for a folder: points RIGHT while the folder
 *  is closed and turns to point DOWN when it opens, sitting to the LEFT of the
 *  folder glyph — the register a file browser's outline uses, so a reader
 *  already knows what it does before the first click (Miles, 2026-09-02). It
 *  draws in `currentColor`, so it lights with whatever text colour its
 *  parent takes on hover, rather than carrying a hover rule of its own; the
 *  folder row it belongs to is the click target, not the chevron. Replaces
 *  the trailing ▾ ExpandChevron on folder rows — one disclosure mark per
 *  folder, at the left where the outline grammar puts it. */
export function DisclosureChevron({
  isOpen,
  size = 12,
  className,
}: {
  isOpen: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""} ${className ?? ""}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ExpandChevron({ isOpen, group, size = 12, className }: ExpandChevronProps) {
  // `group` is unused as a className here but names the group-hover scope the
  // globals.css stroke rule keys off (.group/evt, .group/card, .group/proto).
  void group;
  return (
    <span className={`expand-chev inline-flex items-center justify-center p-1 transition-colors ${className ?? ""}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-rb-500)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
