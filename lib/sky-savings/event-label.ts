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

/** The timeline head's words (rails-ops decision 0045, TO-DO-ui-jobs 367): the
 *  past-participle kind, then at most one clause naming the other address. The
 *  spine carries the figures; the referral code stays a chip. */
export const SKY_T1 = {
  sep: "·",
  kind: {
    deposit: "Deposited",
    withdrawal: "Withdrew",
    received: "Transferred",
    sent: "Transferred",
    self: "Transferred to self",
  } satisfies Record<SkySavingsContext["eventType"], string>,
  to: "to",
  from: "from",
  by: "by",
  /** The flank's words for a transfer's sUSDS. */
  legSent: "transferred out",
  legReceived: "transferred in",
} as const;

/** The other address the head names as its clause, and the word before it: a
 *  transfer's counterparty, another address that deposited for this one, the
 *  recipient a withdrawal named. */
export function skyT1Party(c: SkySavingsContext): { lead: string; address: string } | null {
  const holder = c.holder.toLowerCase();
  const other = c.counterparty?.toLowerCase() ?? null;
  if (!other) return null;
  if (c.eventType === "received") return { lead: SKY_T1.from, address: other };
  if (c.eventType === "sent") return { lead: SKY_T1.to, address: other };
  if (c.eventType === "deposit" && other !== holder) return { lead: SKY_T1.by, address: other };
  if (c.eventType === "withdrawal" && other !== holder) return { lead: SKY_T1.to, address: other };
  return null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Deposited", "Transferred · to 0x1234…abcd". */
export function skyT1Caption(c: SkySavingsContext): string {
  const kind = SKY_T1.kind[c.eventType];
  const p = skyT1Party(c);
  return p ? `${kind} ${SKY_T1.sep} ${p.lead} ${short(p.address)}` : kind;
}
