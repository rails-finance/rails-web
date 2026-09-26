// Both the locale and the zone are pinned, and for the same reason: this page
// renders on the server, so the markup is written once by the server and once
// by the browser, and anything the runtime supplies differs between them.
//
//   locale — a server that speaks en-GB writes "7 Feb 2026" and a browser set
//     to en-US writes "Feb 7, 2026". en-GB is the house form: it is what the
//     other date call sites pin and what the prose around them writes.
//   zone — with no timeZone the format uses whatever zone the runtime sits
//     in, so a London server and a Berlin browser disagree about what day
//     23:40 UTC falls on. These are block timestamps, which are UTC instants,
//     and two readers of one event must be given one date.
//   month name — pinning the locale fixes the FIELD ORDER, but the runtime
//     still supplies the month's SPELLING from its own CLDR data, and Node
//     and the browser ship different CLDR versions. Node 22's ICU (76.1,
//     CLDR 46) renders en-GB's short September as "Sept"; every browser
//     renders it "Sep". Every other month agrees, which is why this surfaces
//     once a year. The table below removes the disagreement instead of
//     chasing it: no call here asks Intl to spell a month.
//
// Either mismatch is React error #418: it discards the server's markup for
// that subtree and repaints it.
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toDate(dateInput: string | number | Date): Date {
  if (typeof dateInput === "number") {
    // Assume timestamp in seconds if number
    return new Date(dateInput * 1000);
  }
  if (typeof dateInput === "string") {
    return new Date(dateInput);
  }
  return dateInput;
}

/** Short month name ("Sep") for a calendar-month index (0-11), read from the
 *  table above rather than asked of the runtime. Takes an index rather than a
 *  Date so a call site can hand it either `getUTCMonth()` or `getMonth()`,
 *  matching whatever zone the rest of that call site already renders in. For
 *  a call site that builds its own composite string (a time, a weekday, a
 *  two-digit year) and only needs the month piece. */
export function monthShort(monthIndex: number): string {
  return MONTH_SHORT[monthIndex];
}

/** Long month name ("September"), same reasoning as `monthShort`. */
export function monthLong(monthIndex: number): string {
  return MONTH_LONG[monthIndex];
}

/** "7 Feb 2026" — day, short month, year, en-GB field order. */
export function formatDate(dateInput: string | number | Date): string {
  const date = toDate(dateInput);
  return `${date.getUTCDate()} ${monthShort(date.getUTCMonth())} ${date.getUTCFullYear()}`;
}

/** "7 Feb" — day and short month, no year. */
export function formatDayMonth(dateInput: string | number | Date): string {
  const date = toDate(dateInput);
  return `${date.getUTCDate()} ${monthShort(date.getUTCMonth())}`;
}

/** "7 February 2026" — day, long month, year, en-GB field order. */
export function formatDateLong(dateInput: string | number | Date): string {
  const date = toDate(dateInput);
  return `${date.getUTCDate()} ${monthLong(date.getUTCMonth())} ${date.getUTCFullYear()}`;
}

/** "February 7, 2026" — month-first (en-US) field order, long month. For the
 *  handful of prose call sites that already read month-first. */
export function formatMonthDayYear(dateInput: string | number | Date): string {
  const date = toDate(dateInput);
  return `${monthLong(date.getUTCMonth())} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** "Feb 7" — month-first (en-US) field order, short month, no year. */
export function formatMonthDay(dateInput: string | number | Date): string {
  const date = toDate(dateInput);
  return `${monthShort(date.getUTCMonth())} ${date.getUTCDate()}`;
}

/** "February 2026" — long month and year, no day; for grouping a list of
 *  events by calendar month. */
export function formatMonthYear(dateInput: string | number | Date): string {
  const date = toDate(dateInput);
  return `${monthLong(date.getUTCMonth())} ${date.getUTCFullYear()}`;
}

export function formatDuration(startDate: string | number | Date, endDate: string | number | Date): string {
  const startDateObj = toDate(startDate);
  const endDateObj = toDate(endDate);

  const durationMs = endDateObj.getTime() - startDateObj.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 24) {
    if (hours === 0) {
      const minutes = Math.floor(durationMs / (1000 * 60));
      if (minutes === 0) {
        return "less than a minute";
      }
      return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    }
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }

  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function formatDateRange(startDate: string | number | Date, endDate: string | number | Date): string {
  const startDateObj = toDate(startDate);
  const endDateObj = toDate(endDate);

  const startYear = startDateObj.getUTCFullYear();
  const endYear = endDateObj.getUTCFullYear();

  // For consistency, use a simple format that works well internationally
  // This will produce: "30 Jul 2025 - 20 Aug 2025" or "30 Jul - 20 Aug 2025"

  if (startYear === endYear) {
    // Same year: show abbreviated format
    const startFormatted = formatDayMonth(startDateObj);
    const endFormatted = formatDate(endDateObj);
    return `${startFormatted} - ${endFormatted}`;
  }

  // Different years: show full dates
  const startFormatted = formatDate(startDateObj);
  const endFormatted = formatDate(endDateObj);
  return `${startFormatted} - ${endFormatted}`;
}
