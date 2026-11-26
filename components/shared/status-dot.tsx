// The lifecycle as a filled dot (Miles, 26 Nov 2026, ui-jobs 856): the
// trail's position crumb, the positions menu, and the listing card's status
// in place of the OPEN/CLOSED pill. 7px, centred on the text beside it.

/** The dot's tone: "open", or the pill's tone for a status word. */
export type DotTone = "open" | "muted" | "danger" | "caution";

const DOT_TONE: Record<DotTone, string> = {
  open: "bg-positive",
  muted: "bg-rb-500",
  danger: "bg-red-500",
  caution: "bg-caution-500",
};

export function StatusDot({ tone }: { tone: DotTone }) {
  return <span className={`block size-[7px] shrink-0 rounded-full ${DOT_TONE[tone]}`} aria-hidden="true" />;
}
