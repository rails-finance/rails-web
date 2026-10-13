// T1's word for a Sky Savings event. The row, the card's caption and the event
// page's heading and metadata read it; it carries no client code, so the
// route's metadata reads it on the server.

import type { SkySavingsContext } from "@/lib/shared/types/event-shape";

export const SKY_EVENT_LABEL: Record<SkySavingsContext["eventType"], string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  received: "Received",
  sent: "Sent",
  self: "Transfer to self",
};
