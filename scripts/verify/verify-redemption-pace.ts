// verify-redemption-pace — a Liquity V2 Trove chart's pace lane: BOLD redeemed
// on the Trove's branch per UTC day (lib/liquity-v2/redemption-pace.ts,
// lib/shared/flows-pace.ts; rails-ops reference/lifetime-price-chart.md,
// ruling 11).
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 28 Oct 2026 from rails-server's
// /api/liquity-v2/redemption-pace on victoria, through the web's proxy
// (scripts/verify/fixtures/liquity-v2-redemption-pace.json):
//
//   WETH    1–27 Oct 2026: every day with redemptions, 2,337,476.07 BOLD in
//           1,190; the largest 18 Oct (139,619.81 in 81)
//   rETH    31 Aug 2025 – 5 Jun 2026 (Trove 1939…5964's life, liquidated):
//           118 days with redemptions, 161 without, 2,498,904.87 BOLD in 707
//   wstETH  9 May – 27 Oct 2026 (Trove 3686…3822's life, never redeemed):
//           100 days with redemptions, the first on 14 May
//
// Held: the branch is the collateral's (WETH, wstETH, rETH, any case; a
// fork's none); the range read is the life, its newest 1,100 days at most;
// every day of the range is a figure, zero where the answer lists none, and
// no day outside it; the days add up to the answer's; the tip's words read
// the day's BOLD whole and its count, "no redemptions" on a zero day; the
// receipt names the branch, the log and the fee; a malformed answer is no
// lane.
//
//   npx tsx --test scripts/verify/verify-redemption-pace.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  branchRedemptionPace,
  dayOfIso,
  forkPaceSource,
  isoDay,
  PACE_MAX_DAYS,
  paceBranch,
  paceRange,
  redemptionPace,
  type RedemptionPaceAnswer,
} from "@/lib/liquity-v2/redemption-pace";
import { paceAt, paceFilled, paceMax, paceWords } from "@/lib/shared/flows-pace";

const all = JSON.parse(readFileSync(join(__dirname, "fixtures", "liquity-v2-redemption-pace.json"), "utf8")) as Record<
  string,
  RedemptionPaceAnswer
>;
const WETH = all["WETH:2026-10-01:2026-10-27"];
const RETH = all["rETH:2025-08-31:2026-06-05"];
const WSTETH = all["wstETH:2026-05-09:2026-10-27"];
const day = (iso: string) => dayOfIso(iso)!;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("the branch is the Trove's collateral; a fork's has none", () => {
  assert.equal(paceBranch("WETH"), "WETH");
  assert.equal(paceBranch("weth"), "WETH");
  assert.equal(paceBranch("wstETH"), "wstETH");
  assert.equal(paceBranch("WSTETH"), "wstETH");
  assert.equal(paceBranch("rETH"), "rETH");
  for (const s of ["ETH", "weETH", "WBTC", "scrvUSD", "", null, undefined]) assert.equal(paceBranch(s), null);
});

test("the range read is the life, its newest 1,100 days at most", () => {
  assert.deepEqual(paceRange(day("2026-05-09"), day("2026-10-28")), {
    from: day("2026-05-09"),
    to: day("2026-10-28"),
  });
  const long = paceRange(day("2020-01-01"), day("2026-10-28"));
  assert.equal(long.to - long.from + 1, PACE_MAX_DAYS);
  assert.equal(long.to, day("2026-10-28"));
  // A one-day life reads its day.
  assert.deepEqual(paceRange(20000, 20000), { from: 20000, to: 20000 });
  assert.equal(isoDay(day("2026-10-28")), "2026-10-28");
});

test("WETH, October 2026: every day a figure, adding up to the answer", () => {
  const p = redemptionPace("WETH", WETH)!;
  assert.ok(p);
  assert.equal(p.from, day("2026-10-01"));
  assert.equal(p.to, day("2026-10-27"));
  const filled = paceFilled(p, p.from, p.to);
  assert.equal(filled.length, 27);
  assert.equal(filled.filter((d) => d.count === 0).length, 0);
  assert.equal(sum(filled.map((d) => d.count)), 1190);
  assert.equal(sum(filled.map((d) => d.amount)).toFixed(2), "2337476.07");
  assert.equal(paceMax(p, p.from, p.to).toFixed(2), "139619.81");
  const top = paceAt(p, day("2026-10-18"))!;
  assert.equal(top.count, 81);
  assert.equal(paceWords(p, top), "139,620 BOLD · 81 redemptions");
  assert.equal(paceWords(p, paceAt(p, day("2026-10-03"))!), "10,030 BOLD · 6 redemptions");
  // Outside the range read: no figure, never a zero.
  assert.equal(paceAt(p, day("2026-09-30")), null);
  assert.equal(paceAt(p, day("2026-10-28")), null);
});

test("rETH, a liquidated Trove's life: the days the answer leaves out are zero", () => {
  const p = redemptionPace("rETH", RETH)!;
  const filled = paceFilled(p, p.from, p.to);
  assert.equal(filled.length, p.to - p.from + 1);
  assert.equal(filled.filter((d) => d.count > 0).length, 118);
  assert.equal(filled.filter((d) => d.count === 0).length, 161);
  assert.equal(sum(filled.map((d) => d.count)), 707);
  assert.equal(sum(filled.map((d) => d.amount)).toFixed(2), "2498904.87");
  const zero = paceAt(p, day("2025-09-04"))!;
  assert.deepEqual(zero, { day: day("2025-09-04"), amount: 0, count: 0 });
  assert.equal(paceWords(p, zero), "0 BOLD · no redemptions");
  const one = paceAt(p, day("2025-09-06"))!;
  assert.equal(paceWords(p, one), "1,254 BOLD · 1 redemption");
  assert.match(
    p.prov(one, "6 Sep '25").summary,
    /rETH branch .* the 1 TroveManager Redemption log's _actualBoldAmount, the BOLD burned before the redemption fee/,
  );
  assert.match(p.prov(zero, "4 Sep '25").summary, /No redemption reached the rETH branch on 4 Sep '25/);
  // A window inside the range clips to it.
  assert.equal(paceFilled(p, day("2025-08-01"), day("2025-09-06")).length, 7);
});

test("wstETH, a Trove never redeemed: the branch's days before the first redemption are zero", () => {
  const p = redemptionPace("wstETH", WSTETH)!;
  const filled = paceFilled(p, p.from, p.to);
  assert.equal(filled.filter((d) => d.count > 0).length, 100);
  assert.deepEqual(
    filled.slice(0, 6).map((d) => d.count > 0),
    [false, false, false, false, false, true],
  );
  assert.equal(paceMax(p, p.from, p.to).toFixed(2), "686030.38");
});

test("the lane's words: branch-wide, this Trove included; no contrast tail", () => {
  const p = redemptionPace("WETH", WETH)!;
  assert.equal(`${p.scope} · ${p.measure}`, "Whole WETH branch · BOLD redeemed a day");
  assert.match(p.help, /on the WETH branch each day, every Trove on the branch, this one included/);
  assert.match(p.help, /lowest interest rates first/);
  assert.doesNotMatch(p.help, /, not |\bfold|footgun|honest|itself|\bown\b|exactly|actually/);
});

test("a malformed answer is no lane", () => {
  assert.equal(redemptionPace("WETH", null), null);
  assert.equal(redemptionPace("WETH", { error: "x" }), null);
  assert.equal(redemptionPace("WETH", { ...WETH, from: "Oct 1" }), null);
  assert.equal(redemptionPace("WETH", { ...WETH, days: [{ day: "2026-10-01", bold: "x", count: 1 }] }), null);
  // An answer with no redemption is a lane of zeros.
  const none = redemptionPace("WETH", { ...WETH, days: [] })!;
  assert.equal(paceFilled(none, none.from, none.to).length, 27);
  assert.equal(paceMax(none, none.from, none.to), 0);
});

// The forks: the same series in their own stable, from rails-server's
// /api/{ebisu,asymmetry,basedollar}/redemption-pace on victoria, 30 Oct 2026
// (fixtures/liquity-fork-redemption-pace.json).
const forks = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "liquity-fork-redemption-pace.json"), "utf8"),
) as Record<string, RedemptionPaceAnswer>;

test("a fork's branch: its stable in the title, its route and table in the receipt", () => {
  const ysy = branchRedemptionPace(
    forkPaceSource("asymmetry", "ysyBOLD", "USDaf"),
    forks["asymmetry:ysyBOLD:2026-10-20:2026-10-29"],
  )!;
  assert.equal(`${ysy.scope} · ${ysy.measure}`, "Whole ysyBOLD branch · USDaf redeemed a day");
  const filled = paceFilled(ysy, ysy.from, ysy.to);
  assert.equal(filled.length, 10);
  assert.equal(paceAt(ysy, day("2026-10-27"))!.count, 0);
  assert.equal(sum(filled.map((d) => d.count)), 47);
  assert.equal(paceWords(ysy, paceAt(ysy, day("2026-10-29"))!), "1,508 USDaf · 7 redemptions");
  const at = ysy.prov(paceAt(ysy, day("2026-10-29"))!, "29 Oct 2026");
  assert.match(String(at.via), /asymmetry_redemption_ysybold · \/api\/asymmetry\/redemption-pace\?branch=ysyBOLD/);
  assert.match(at.summary, /USDaf burned before the redemption fee/);
  assert.doesNotMatch(ysy.help, /BOLD redeemed|, not |\bfold|footgun|honest/);

  const bd = branchRedemptionPace(
    forkPaceSource("basedollar", "wstETH", "BD"),
    forks["basedollar:wstETH:2026-10-20:2026-10-29"],
  )!;
  assert.equal(`${bd.scope} · ${bd.measure}`, "Whole wstETH branch · BD redeemed a day");
  assert.equal(sum(bd.days.map((d) => d.count)), 203);
});

test("Ebisu: the branch managers' redemptions, zeros between", () => {
  const eb = branchRedemptionPace(
    forkPaceSource("ebisu", "sUSDe", "ebUSD"),
    forks["ebisu:sUSDe:2026-09-28:2026-10-07"],
  )!;
  assert.equal(`${eb.scope} · ${eb.measure}`, "Whole sUSDe branch · ebUSD redeemed a day");
  assert.equal(paceFilled(eb, eb.from, eb.to).length, 10);
  assert.equal(paceWords(eb, paceAt(eb, day("2026-10-01"))!), "0 ebUSD · no redemptions");
  assert.equal(paceWords(eb, paceAt(eb, day("2026-10-07"))!), "6,922 ebUSD · 1 redemption");
  assert.match(String(eb.prov(paceAt(eb, day("2026-10-07"))!, "7 Oct 2026").via), /ebisu_all_redemption_susde/);
});
