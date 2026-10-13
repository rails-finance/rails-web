// The word T1 states for a Maple row, which the event page's h1 and its
// browser title repeat. Server-safe: the event page's metadata reads it.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";

/** A share transfer's verb, kept before the amount (the custody row's label). */
export const TRANSFER_LABEL = { transfer_in: "Shares received", transfer_out: "Shares sent" } as const;

/** The row's word: a transfer names the direction, any other row says its action label. */
export function mapleRowLabel(event: BaseActivityEvent): string {
  if (!isMapleEvent(event)) return event.actionLabel;
  const kind = event.context.data.eventType;
  return kind === "transfer_in" || kind === "transfer_out" ? TRANSFER_LABEL[kind] : event.actionLabel;
}
