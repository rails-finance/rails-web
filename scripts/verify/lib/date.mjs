// A verifier's expected date string, spelled the way lib/date.ts spells it.
// ----------------------------------------------------------------------------
// lib/date.ts builds every page date against its own month table, because
// Node's CLDR spells en-GB's short September "Sept" and every browser spells
// it "Sep". A verifier that asks Intl for the month prints "Sept" under Node
// and misreads a correct page every September. This formats with Intl for the
// field order and takes the short month from the same table as the page.
//
//   import { enGb } from "./lib/date.mjs";
//   enGb(new Date(ms), { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })

/** lib/date.ts MONTH_SHORT. */
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `date.toLocaleString("en-GB", opts)`, with a short month from MONTH_SHORT. */
export function enGb(date, opts) {
  const month = opts.timeZone === "UTC" ? date.getUTCMonth() : date.getMonth();
  return new Intl.DateTimeFormat("en-GB", opts)
    .formatToParts(date)
    .map((p) => (p.type === "month" && opts.month === "short" ? MONTH_SHORT[month] : p.value))
    .join("");
}
