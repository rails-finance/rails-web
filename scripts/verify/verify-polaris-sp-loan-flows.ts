// verify-polaris-sp-loan-flows — a Polaris stability-pool deposit's and a
// reserve loan's Lifetime flows (lib/polaris/sp-loan-flow-timelines.ts).
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 17 Nov 2026 through the page's proxies:
//
//   polaris-sp-deposit-35.json  USDp deposit #35, every row oldest first
//                               (/api/polaris/stability-pool/timeline)
//   polaris-loan-63.json        reserve loan 63's touches and the deployment's
//                               daily floor (/reserve-loans/timeline,
//                               /reserve-loans/floor/daily)
//
// Held: a deposit drawn from day rows (the vault-held deposits' path) states
// what the same deposit drawn from its rows does, day by day: the running
// figure of every line, the side each day moved, the balances it left, and the
// live figures; a loan's line takes the daily closing floor where it was
// read, a touch day included, and carries the touches' floors, dotted, where
// it was not; the shared fills draw a debt's green as they did before pages
// could set the second side's hue.
//
//   npx tsx --test scripts/verify/verify-polaris-sp-loan-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { depositFlows, depositFlowsFromDays, loanFlows } from "@/lib/polaris/sp-loan-flow-timelines";
import type { DepositNow } from "@/lib/polaris/sp-loan-math";
import type {
  PolarisDepositDay,
  PolarisDepositEventRow,
  PolarisLoanEventRow,
} from "@/lib/sources/api/polaris-sp-loans";
import { DEFAULT_HUES, fillStyle, sumSwatch } from "@/components/shared/lifetime-flows-tip";
import { lifetimeFlowsBarsContent } from "@/lib/shared/learn-more-content";

const FIX = join(process.cwd(), "scripts/verify/fixtures");
const deposit = JSON.parse(readFileSync(join(FIX, "polaris-sp-deposit-35.json"), "utf8")) as {
  rows: PolarisDepositEventRow[];
};
const loan = JSON.parse(readFileSync(join(FIX, "polaris-loan-63.json"), "utf8")) as {
  rows: PolarisLoanEventRow[];
  floorDays: { day: number; floor_price_raw: string; block_number: string }[];
};

const B = (v: string | null) => BigInt(v ?? "0");

/** The rows as /stability-pool/flows/daily serves them: each UTC day's last
 *  operation (block, then log index) with its running sums, and the day's
 *  counts and flags (rails-server api/src/routes/polaris-deposits-loans.ts). */
function dayRows(rows: PolarisDepositEventRow[]): PolarisDepositDay[] {
  const byDay = new Map<number, PolarisDepositEventRow[]>();
  for (const r of rows.filter((x) => x.event_type === "deposit_operation")) {
    const d = Math.floor(Number(r.block_timestamp) / 86_400);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, rs]) => {
      const last = [...rs].sort((a, b) => Number(a.block_number) - Number(b.block_number) || a.log_index - b.log_index)[
        rs.length - 1
      ];
      return {
        day,
        events: rs.length,
        txs: new Set(rs.map((r) => r.tx_hash)).size,
        did_deposit: rs.some((r) => B(r.top_up_or_withdrawal) > BigInt(0)),
        did_withdraw: rs.some((r) => B(r.top_up_or_withdrawal) < BigInt(0)),
        did_burn: rs.some((r) => B(r.deposit_loss) > BigInt(0)),
        did_pay_peth: rs.some((r) => B(r.bc_gain_since) > BigInt(0)),
        did_claim: rs.some((r) => B(r.stable_gain_claimed) > BigInt(0) || B(r.bc_gain_claimed) > BigInt(0)),
        last_block: last.block_number,
        last_timestamp: last.block_timestamp,
        deposited: last.deposited_to_here,
        withdrawn: last.withdrawn_to_here,
        burned: last.burned_to_here,
        yield_in: last.stable_gain_to_here,
        yield_claimed: last.stable_claimed_to_here,
        peth_in: last.bc_gain_to_here,
        peth_claimed: last.bc_claimed_to_here,
        deposit: last.new_deposit ?? "0",
        stash: last.stashed_bc_tokens ?? "0",
      };
    });
}

const near = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9), `${what}: ${a} vs ${b}`);

test("a deposit from its day rows states what it does from its rows, day by day", () => {
  // A pending figure on each line the live stop adds to.
  const now: DepositNow = {
    now: BigInt("4100000000000000000"),
    pendingLoss: BigInt("80000000000000000"),
    pendingPeth: BigInt("1000000000000"),
    bcSinceTouch: BigInt("1000000000000"),
    pendingStable: BigInt("2000000000000000"),
  };
  const o = { open: true, now, nowSec: 20_774 * 86_400 + 3_600 };
  const fromRows = depositFlows("usdp", deposit.rows, o)!;
  const fromDays = depositFlowsFromDays("usdp", dayRows(deposit.rows), o)!;
  const a = fromRows.timeline;
  const b = fromDays.timeline;
  assert.equal(b.days.length, a.days.length);
  assert.deepEqual(b.sideUnits, a.sideUnits);
  a.days.forEach((da, i) => {
    const db = b.days[i];
    assert.equal(db.day, da.day);
    assert.equal(db.events, da.events, `events through day ${da.day}`);
    assert.equal(db.tick, da.tick, `the side day ${da.day} moved`);
    for (const k of Object.keys(da.cum)) near(db.cum[k] ?? 0, da.cum[k], `${k} on day ${da.day}`);
  });
  const lastA = a.days[a.days.length - 1].balances;
  const lastB = b.days[b.days.length - 1].balances;
  for (const side of ["collateral", "debt"] as const)
    near(lastB.find((x) => x.side === side)!.amount, lastA.find((x) => x.side === side)!.amount, `${side} left`);
  assert.deepEqual(b.live.pending, a.live.pending);
  near(b.live.collateralUsd, a.live.collateralUsd, "the deposit today");
  near(b.live.debtUsd, a.live.debtUsd, "the pETH today");
});

const CHAIN = {
  collRaw: "1200000000000000000",
  sharesRaw: "1510977534844989209",
  debtRaw: "1516324653726002190",
  floorPriceRaw: "2018524449911335826",
};
const NOW = 20_774 * 86_400 + 3_600;
const dayOf = (r: PolarisLoanEventRow) => Math.floor(Number(r.block_timestamp) / 86_400);

test("a loan's line takes each day's closing floor where it was read, a touch day included", () => {
  const f = loanFlows(loan.rows, { open: true, chain: CHAIN, nowSec: NOW, floorDays: loan.floorDays })!;
  const t = f.timeline;
  assert.equal(t.carriedWhy, undefined);
  const obs = new Map(t.dailyPrices!.a.map((o) => [o[0], o]));
  const G = 10 ** t.unit!.scale;
  // A day between touches has its own floor, and its block.
  const between = loan.floorDays.find((d) => d.day > dayOf(loan.rows[2]) && d.day < dayOf(loan.rows[3]))!;
  const o = obs.get(between.day)!;
  near(o[1], (Number(BigInt(between.floor_price_raw)) / 1e18) * G, "a day between touches");
  assert.equal(o[2], Number(between.block_number));
  // A touch day closes at that day's floor, over the touch's own.
  const touchDay = dayOf(loan.rows[3]);
  const close = loan.floorDays.find((d) => d.day === touchDay)!;
  near(obs.get(touchDay)![1], (Number(BigInt(close.floor_price_raw)) / 1e18) * G, "a touch day's close");
});

test("an unread or empty daily floor carries the touches' floors, dotted", () => {
  for (const floorDays of [null, []]) {
    const t = loanFlows(loan.rows, { open: true, chain: CHAIN, nowSec: NOW, floorDays })!.timeline;
    assert.ok(t.carriedWhy?.a, `carriedWhy with floorDays ${JSON.stringify(floorDays)}`);
    const days = t.dailyPrices!.a.map((o) => o[0]);
    const between = loan.floorDays.find((d) => d.day > dayOf(loan.rows[2]) && d.day < dayOf(loan.rows[3]))!;
    assert.ok(!days.includes(between.day), "no floor of its own between touches");
  }
});

test("the default hues draw a debt's green as the literals did", () => {
  const held = fillStyle("debt", { fill: "held" });
  assert.deepEqual(held, { background: "var(--color-green-400)" });
  assert.deepEqual(fillStyle("debt", { fill: "in" }), { background: "rgba(74, 222, 128, 0.35)" });
  const inHatched = fillStyle("debt", { fill: "in", hatch: "dashes" });
  assert.equal(inHatched.backgroundColor, "rgba(74, 222, 128, 0.35)");
  assert.match(
    String(inHatched.backgroundImage),
    new RegExp(encodeURIComponent("rgba(74, 222, 128, 0.9)").replace(/[()]/g, "\\$&")),
  );
  const out = fillStyle("debt", { fill: "out" });
  assert.equal(out.boxShadow, "inset 0 0 0 1px rgba(74, 222, 128, 0.9)");
  assert.match(
    String(out.backgroundImage),
    new RegExp(encodeURIComponent("rgba(74, 222, 128, 0.7)").replace(/[()]/g, "\\$&")),
  );
  assert.deepEqual(fillStyle("collateral", { fill: "held" }), { background: "var(--color-blue-500)" });
  assert.deepEqual(sumSwatch("debt")({ fill: "out" } as never), fillStyle("debt", { fill: "out" }, DEFAULT_HUES));
});

test("the bars' how-to-read names each bar by its hue and its own label", () => {
  const t = depositFlows("usdp", deposit.rows, { open: false, now: null, nowSec: 20_774 * 86_400 })!.timeline;
  const words = lifetimeFlowsBarsContent({
    collateral: { hue: "Blue", label: t.labels!.collateral },
    debt: { hue: "Violet", label: t.labels!.debt },
  });
  assert.ok(words.intro!.startsWith("Blue is the USDp deposit, violet the pETH paid in. "), words.intro);
  assert.ok(lifetimeFlowsBarsContent().intro!.startsWith("Blue is the collateral, green the debt. "));
  // A grain is a unit factor: no block on the deposit's series.
  assert.ok(t.dailyPrices!.a.every((o) => o.length === 2));
});
