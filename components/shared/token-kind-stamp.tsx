// The stamp naming a market token's kind (PT, YT, LP, SY) in the top-right
// corner of its icon: the top-left is the spine's actor badge and the
// bottom-right holds check / cross / send / swap, so this corner is free on
// every node. PT and YT take Pendle's PT green and YT blue
// (`--color-pendle-*`, app/globals.css), the colours the Pendle app uses to
// tell the two apart; LP and SY keep the neutral rb greys.

export type TokenKindStamp = "PT" | "YT" | "LP" | "SY";

const STAMP_CLASS: Record<TokenKindStamp, string> = {
  PT: "bg-pendle-pt text-slate-950 ring-pendle-pt-ink dark:ring-pendle-pt",
  YT: "bg-pendle-yt text-slate-950 ring-pendle-yt-ink dark:ring-pendle-yt",
  LP: "bg-background text-rb-600 ring-rb-300 dark:text-rb-300 dark:ring-rb-600",
  SY: "bg-background text-rb-600 ring-rb-300 dark:text-rb-300 dark:ring-rb-600",
};

/** The flank unit's text in the stamp's hue: the -ink shade in light mode,
 *  the hue itself in dark. LP and SY keep the spine's muted unit. */
export const STAMP_UNIT_CLASS: Partial<Record<TokenKindStamp, string>> = {
  PT: "text-pendle-pt-ink dark:text-pendle-pt",
  YT: "text-pendle-yt-ink dark:text-pendle-yt",
};

/** The stamp over an icon of `size` px, absolutely placed: the parent is the
 *  icon's relative box. */
export function KindStamp({ stamp, size }: { stamp: TokenKindStamp; size: number }) {
  return (
    <span
      className={`absolute -top-px -right-px inline-flex items-center justify-center rounded-[3px] font-semibold leading-none ring-1 ${STAMP_CLASS[stamp]}`}
      style={{
        height: Math.round(size * 0.44),
        paddingInline: Math.max(1, Math.round(size * 0.07)),
        fontSize: Math.round(size * 0.3),
      }}
      data-anatomy="L3.1"
      data-kind-stamp={stamp}
      aria-hidden
    >
      {stamp}
    </span>
  );
}
