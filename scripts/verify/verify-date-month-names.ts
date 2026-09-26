// verify-date-month-names — lib/date.ts spells a month name from its own
// table, never from Intl.
// ----------------------------------------------------------------------------
// Node's ICU (22.x ships 76.1 / CLDR 46) renders en-GB's short September as
// "Sept"; every browser renders it "Sep". Locale and timeZone pin the FIELD
// ORDER and the calendar day identically on the server and the client, but
// the month's SPELLING still came from whichever runtime's CLDR data answered
// the call — until lib/date.ts stopped asking Intl for it. Measured directly:
//
//   node -e 'const o={timeZone:"UTC",month:"short"};console.log(Array.from(
//     {length:12},(_,m)=>new Date(Date.UTC(2026,m,1)).toLocaleDateString(
//     "en-GB",o)).join(" "))'
//   → Jan Feb Mar Apr May Jun Jul Aug Sept Oct Nov Dec
//
// September is the only month where Node and the browser disagree, which is
// why this surfaces once a year and nowhere else. This test pins the case
// that would have caught it: if MONTH_SHORT in lib/date.ts were ever swapped
// back for an Intl call, September is where it would go wrong again.
//
// OFFLINE. lib/date.ts has no chain, network or filesystem dependency, so
// this is a plain assertion script — no fixture, no mock.
//
//   npx tsx --test scripts/verify/verify-date-month-names.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatDateLong,
  formatDateRange,
  formatDayMonth,
  formatMonthDay,
  formatMonthDayYear,
  formatMonthYear,
  monthLong,
  monthShort,
} from "@/lib/date";

const SEPT_25_2026 = Date.UTC(2026, 8, 25) / 1000; // a unix (seconds) timestamp

test("monthShort spells September as the browser does, not Node's CLDR form", () => {
  assert.equal(monthShort(8), "Sep");
  assert.notEqual(monthShort(8), "Sept");
});

test("monthLong spells September in full", () => {
  assert.equal(monthLong(8), "September");
});

test("every month is a three-letter short form and the right long form", () => {
  const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const long = [
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
  for (let m = 0; m < 12; m += 1) {
    assert.equal(monthShort(m), short[m]);
    assert.equal(monthLong(m), long[m]);
  }
});

test("formatDate — D Mon YYYY — reads '25 Sep 2026', not '25 Sept 2026'", () => {
  assert.equal(formatDate(SEPT_25_2026), "25 Sep 2026");
});

test("formatDayMonth — D Mon", () => {
  assert.equal(formatDayMonth(SEPT_25_2026), "25 Sep");
});

test("formatDateLong — D Month YYYY", () => {
  assert.equal(formatDateLong(SEPT_25_2026), "25 September 2026");
});

test("formatMonthDayYear — Month D, YYYY", () => {
  assert.equal(formatMonthDayYear(SEPT_25_2026), "September 25, 2026");
});

test("formatMonthDay — Mon D", () => {
  assert.equal(formatMonthDay(SEPT_25_2026), "Sep 25");
});

test("formatMonthYear — Month YYYY", () => {
  assert.equal(formatMonthYear(SEPT_25_2026), "September 2026");
});

test("formatDateRange — same-year range keeps the short start, dated end", () => {
  const start = Date.UTC(2026, 8, 20) / 1000;
  const end = Date.UTC(2026, 8, 25) / 1000;
  assert.equal(formatDateRange(start, end), "20 Sep - 25 Sep 2026");
});

test("formatDateRange — cross-year range dates both ends", () => {
  const start = Date.UTC(2025, 11, 30) / 1000;
  const end = Date.UTC(2026, 0, 5) / 1000;
  assert.equal(formatDateRange(start, end), "30 Dec 2025 - 5 Jan 2026");
});
