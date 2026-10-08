"use client";

export interface EventCardFooterProps {
  /** The Learn-More "?" trigger, at the right end. */
  learnMore?: React.ReactNode;
}

/** T6, the foot of the open explanation: the "?" at the bottom right, as C4
 *  sits at the foot of C3 (rails-ops TO-DO-ui-jobs 281). The event menu
 *  stands at the header's right end (ui-jobs 295). */
export function EventCardFooter({ learnMore }: EventCardFooterProps) {
  if (learnMore == null) return null;
  return (
    <div className="flex items-center justify-end gap-3 px-4 pb-2 pt-1" data-anatomy="T6">
      {learnMore}
    </div>
  );
}
