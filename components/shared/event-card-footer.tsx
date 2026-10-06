"use client";

export interface EventCardFooterProps {
  /** Content before the "?" (a family's gas where its card has no price row
   *  in T2). */
  extra?: React.ReactNode;
  /** The event menu, where the card's T2 has no price row to hold it. */
  menu?: React.ReactNode;
  /** The Learn-More "?" trigger, at the right end. */
  learnMore?: React.ReactNode;
}

/** T6, the foot of the open explanation: the "?" at the bottom right, as C4
 *  sits at the foot of C3 (rails-ops TO-DO-ui-jobs 281), with the event menu
 *  left of it on a card whose T2 draws no price row. The transaction hash is
 *  on T3's row. */
export function EventCardFooter({ extra, menu, learnMore }: EventCardFooterProps) {
  if (extra == null && menu == null && learnMore == null) return null;
  return (
    <div className="flex items-center justify-end gap-3 px-4 pb-2 pt-1" data-anatomy="T6">
      {extra}
      {menu}
      {learnMore}
    </div>
  );
}
