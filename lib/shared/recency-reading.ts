// H6's readings (components/shared/recency-stamp.tsx, components/wallet/read-stamp.tsx):
// the age behind the block-and-clock icon, the block behind the cube, and the
// block's UTC time behind the calendar-clock (ui-jobs 602). A press steps to the
// next; the choice holds across pages for the browser, shared by both stamps.

import { readTimeText } from "@/lib/shared/position-read";

export type Reading = "age" | "block" | "time";

const READING_KEY = "rails.recency-reading";
const ORDER: readonly Reading[] = ["age", "block", "time"];

export function storedReading(): Reading {
  try {
    const v = localStorage.getItem(READING_KEY);
    return v === "block" || v === "time" ? v : "age";
  } catch {
    return "age";
  }
}

export function storeReading(r: Reading): void {
  try {
    localStorage.setItem(READING_KEY, r);
  } catch {}
}

/** The reading after `r`, skipping any the stamp cannot show. */
export function nextReading(r: Reading, can: (r: Reading) => boolean): Reading {
  for (let i = 1; i <= ORDER.length; i++) {
    const n = ORDER[(ORDER.indexOf(r) + i) % ORDER.length];
    if (can(n)) return n;
  }
  return r;
}

/** "12 Nov 10:52 UTC": the stamp's time, the year left to the accessible name. */
export function stampTime(at: number): string {
  return readTimeText(at).replace(/ \d{4} /, " ");
}
