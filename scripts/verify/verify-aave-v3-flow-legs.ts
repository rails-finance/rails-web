// verify-aave-v3-flow-legs — the web's Aave V3 flow classifier against the
// fixture it shares with rails-server (rails-ops
// reference/lifetime-flows-scrubber.md, "One classifier, two repos").
// ----------------------------------------------------------------------------
// OFFLINE. `scripts/verify/fixtures/aave-v3-flow-legs.json` is byte-identical
// to rails-server `api/src/services/fixtures/aave-v3-flow-legs.json`. Each case
// is served timeline rows (`/api/aave-v3/timeline?swaps=1`, swaps merged, chain
// balances attached) and the token names and decimals the index holds. The
// fixture states, per event, the legs `aaveV3EventLegs` gives, and for a whole
// history the state after each active day. This test runs the web's own
// transform and classifier over the rows and must give the fixture's answer;
// the server's test runs its port over the same rows and must give the same.
//
//   npx tsx --test scripts/verify/verify-aave-v3-flow-legs.ts
//   WRITE=1 FIXTURE_IN=<cases.json> npx tsx scripts/verify/verify-aave-v3-flow-legs.ts
//     rewrites the fixture's answers from the web's classifier: only after a
//     deliberate change to it, and the file is then copied to rails-server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aaveV3RowsToEvents, type MvRow } from "@/lib/sources/api/aave-v3-timeline";
import type { V3TokenMeta } from "@/lib/sources/chain/aave-v3-tokens";
import { aaveV3EventLegs, aaveV3LiquidationTxs } from "@/lib/aave-v3/chain-truth-tower";
import { aaveV3FlowEvents, AAVE_V3_FLOW_BUCKETS } from "@/lib/aave-v3/flows-timeline";
import { daysFromEvents } from "@/lib/shared/flows-timeline";

const FIXTURE = join(process.cwd(), "scripts/verify/fixtures/aave-v3-flow-legs.json");
const SERVER_COPY = join(process.cwd(), "../rails-server-onboarding/api/src/services/fixtures/aave-v3-flow-legs.json");

interface Leg {
  symbol: string;
  address?: string;
  leg: string | null;
  amount: number;
  price?: number;
  fromCollateral?: true;
  treasuryFee?: true;
}
interface DayState {
  day: number;
  events: number;
  tick: string;
  cum: Record<string, number>;
  /** Every balance stated so far, `${side}:${asset}` → amount. */
  held: Record<string, number>;
  /** Each asset's last at-block price so far: [usd, unix seconds]. */
  prices: Record<string, [number, number]>;
}
interface Case {
  name: string;
  about: string;
  wallet: string;
  whole: boolean;
  rows: MvRow[];
  legs?: Record<string, Leg[]>;
  days?: DayState[];
}
interface Fixture {
  about?: string;
  tokens: Record<string, { symbol: string; decimals: number }>;
  cases: Case[];
}

function metasOf(f: Fixture): Map<string, V3TokenMeta> {
  return new Map(
    Object.entries(f.tokens).map(([address, t]) => [
      address,
      { address, symbol: t.symbol, decimals: t.decimals, lt: null },
    ]),
  );
}

/** Legs as JSON carries them: no undefined keys. */
const clean = (l: Leg): Leg => JSON.parse(JSON.stringify(l)) as Leg;

function answer(f: Fixture, c: Case): { legs: Record<string, Leg[]>; days?: DayState[] } {
  const { events } = aaveV3RowsToEvents(c.rows, c.wallet, metasOf(f));
  const liq = aaveV3LiquidationTxs(events);
  const legs: Record<string, Leg[]> = {};
  for (const ev of events) legs[ev.id] = aaveV3EventLegs(ev, liq).map((l) => clean(l as Leg));
  if (!c.whole) return { legs };
  // No today's prices: every leg in a whole case carries its block's price.
  const flows = aaveV3FlowEvents(events, undefined);
  assert.ok(flows, `${c.name}: every leg is priced at its block`);
  const held: Record<string, number> = {};
  const prices: Record<string, [number, number]> = {};
  const days = daysFromEvents(
    AAVE_V3_FLOW_BUCKETS.map((b) => b.key),
    flows.events,
  ).map((d) => {
    for (const b of d.balances) held[`${b.side}:${b.asset}`] = b.amount;
    for (const p of d.prices) prices[p.asset] = [p.usd, p.ts];
    const cum = Object.fromEntries(Object.entries(d.cum).filter(([, v]) => v !== 0));
    return { day: d.day, events: d.events, tick: d.tick, cum, held: { ...held }, prices: { ...prices } };
  });
  return { legs, days };
}

if (process.env.WRITE === "1") {
  const input = JSON.parse(readFileSync(process.env.FIXTURE_IN ?? FIXTURE, "utf8")) as Fixture;
  for (const c of input.cases) Object.assign(c, answer(input, c));
  input.about =
    "Aave V3 flow legs, shared by rails-web scripts/verify/verify-aave-v3-flow-legs.ts and rails-server " +
    "api/src/services/aave-v3-flow-series.test.ts. Byte-identical in both repos. Rows from victoria's " +
    "/api/aave-v3/timeline?swaps=1 on 2026-09-29; answers from the web's aaveV3EventLegs.";
  writeFileSync(FIXTURE, JSON.stringify(input, null, 1) + "\n");
  console.log(`wrote ${FIXTURE}: ${createHash("sha256").update(readFileSync(FIXTURE)).digest("hex")}`);
} else {
  const raw = readFileSync(FIXTURE);
  const fixture = JSON.parse(raw.toString("utf8")) as Fixture;

  for (const c of fixture.cases) {
    test(`legs: ${c.name} (${c.about})`, () => {
      const got = answer(fixture, c);
      assert.deepEqual(got.legs, c.legs);
      if (c.whole) assert.deepEqual(got.days, c.days);
    });
  }

  test("the fixture covers every leg and every bucket the classifier has", () => {
    const legs = new Set<string>();
    for (const c of fixture.cases)
      for (const ls of Object.values(c.legs ?? {})) for (const l of ls) legs.add(String(l.leg));
    for (const want of [
      "supplied",
      "withdrawn",
      "borrowed",
      "repaid",
      "liquidatedCollateral",
      "liquidatedDebt",
      "writtenOff",
      "soldToRepay",
      "withdrawnSwapped",
      "swappedOut",
      "transferredIn",
      "transferredOut",
      "swappedIn",
      "repaidBySwap",
    ])
      assert.ok(legs.has(want), `no case yields ${want}`);
  });

  test(
    "the server's copy of the fixture is this file",
    { skip: !existsSync(SERVER_COPY) && "no rails-server copy of the fixture beside this checkout" },
    () => {
      assert.equal(
        createHash("sha256").update(readFileSync(SERVER_COPY)).digest("hex"),
        createHash("sha256").update(raw).digest("hex"),
        "rails-server's aave-v3-flow-legs.json differs: copy the changed one across",
      );
    },
  );
}
