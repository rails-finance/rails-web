// Protocol changes on the Lifetime flows panel's events row (rails-ops
// reference/lifetime-price-chart.md, ruling 10): a setting the protocol moved
// for every position (a stability fee, a minimum ratio, a vault's fee), marked
// on the day it took effect, named there with its value before and after and
// the log it was read from. Each family builds its changes from the series
// its page already reads; the panel draws those inside the position's life.
//
// Pure: no DOM, no fetch.

import type { Provenance } from "@/components/shared/provenance";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";

const DAY_S = 86_400;

export interface FlowChange {
  /** The UTC day number (unix seconds ÷ 86,400) the change took effect on. */
  day: number;
  /** Unix seconds of its block. */
  ts: number;
  block: number;
  txHash?: string;
  /** What moved, as the family's card names it ("Stability fee"). */
  name: string;
  /** The value before, printed; null where no earlier value was read. */
  from: string | null;
  /** The value after, printed. */
  to: string;
  /** A contract each side names, printed after its value and linked to the
   *  explorer ("Semi-log, 0.5–35 % (0x8a71…b6f5)"); where the text is the
   *  short address, the side is the link alone. */
  fromLink?: FlowChangeLink;
  toLink?: FlowChangeLink;
  /** The receipt for the value after. */
  prov: Provenance;
  /** The quantity a rate note in the history states, where the family draws
   *  one for this change's parameter (`noteQuantity` in
   *  lib/shared/protocol-change-note.ts): a change inside such a note's
   *  stretch takes no protocol-change row, its diamond stays (ui-jobs 449). */
  noted?: NotedQuantity;
}

/** The parameters a rate note and a protocol change both state: Maker's
 *  stability fee, Polaris's primary rate. */
export type NotedQuantity = "makerdao:stability-fee" | "polaris:primary-rate";

export interface FlowChangeLink {
  /** The short address, "0x8a71…b6f5". */
  text: string;
  href: string;
}

/** A side as words: its value, then its link's text where that adds one. */
export const sideWords = (value: string, link?: FlowChangeLink): string =>
  link && link.text !== value ? `${value} (${link.text})` : value;

/** A change at a block's time. */
export function flowChange(c: Omit<FlowChange, "day">): FlowChange {
  return { ...c, day: Math.floor(c.ts / DAY_S) };
}

/** The changes from `startDay` to `endDay` (UTC day numbers, both inclusive),
 *  one entry per day in day order, each day's changes in block order. */
export function changesByDay(
  changes: readonly FlowChange[] | undefined,
  startDay: number,
  endDay: number,
): { day: number; changes: FlowChange[] }[] {
  const byDay = new Map<number, FlowChange[]>();
  for (const c of changes ?? []) {
    if (c.day < startDay || c.day > endDay) continue;
    const list = byDay.get(c.day) ?? [];
    list.push(c);
    byDay.set(c.day, list);
  }
  return [...byDay]
    .sort((a, b) => a[0] - b[0])
    .map(([day, list]) => ({ day, changes: list.sort((a, b) => a.block - b.block) }));
}

/** "Stability fee 5.25 % → 6.00 %", or "Name set to Steakhouse USDC" where
 *  the value before was not read. */
export const changeWords = (c: Pick<FlowChange, "name" | "from" | "to" | "fromLink" | "toLink">): string => {
  const to = sideWords(c.to, c.toLink);
  return c.from != null ? `${c.name} ${sideWords(c.from, c.fromLink)} → ${to}` : `${c.name} set to ${to}`;
};

/** A fraction or a percent printed as the cards print a rate: "6.00 %". */
export const pctWords = (percent: number, digits = 2): string => `${percent.toFixed(digits)} %`;

/** A span of seconds in the largest whole unit that prints it exactly
 *  ("20 days", "36 hours", "90 seconds"). */
export function durationWords(seconds: number): string {
  const s = Math.round(seconds);
  const unit = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
  if (s > 0 && s % DAY_S === 0) return unit(s / DAY_S, "day");
  if (s > 0 && s % 3600 === 0) return unit(s / 3600, "hour");
  if (s > 0 && s % 60 === 0) return unit(s / 60, "minute");
  return unit(s, "second");
}

/** A timeline with its changes, the same object where there are none. */
export function withChanges<T extends FlowTimeline | null>(t: T, changes: FlowChange[]): T {
  return t && changes.length ? { ...t, changes } : t;
}
