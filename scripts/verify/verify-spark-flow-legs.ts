// verify-spark-flow-legs — the web's SparkLend flow classifier against the
// fixture it shares with rails-server (rails-ops
// reference/lifetime-flows-scrubber.md, "One classifier, two repos").
// ----------------------------------------------------------------------------
// OFFLINE. `scripts/verify/fixtures/spark-flow-legs.json` is byte-identical to
// rails-server `api/src/services/fixtures/spark-flow-legs.json`. Each case is
// served timeline rows (`/api/spark/timeline`, chain balances attached) and the
// token names and decimals the index holds. The fixture states, per event, the
// legs `sparkEventLegs` gives, and the state after each active day. This test
// runs the web's transform and classifier over the rows and must give the
// fixture's answer; the server's test runs its port (the Aave V3 classifier
// under SPARK_RULES) over the same rows and must give the same.
//
//   npx tsx --test scripts/verify/verify-spark-flow-legs.ts
//   WRITE=1 FIXTURE_IN=<cases.json> npx tsx scripts/verify/verify-spark-flow-legs.ts
//     rewrites the fixture's answers from the web's classifier: only after a
//     deliberate change to it, and the file is then copied to rails-server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sparkRowsToEvents } from "@/lib/sources/api/spark-timeline";
import type { Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { sparkEventLegs, sparkFlowEvents, sparkLiquidationTxs } from "@/lib/spark/flows-timeline";
import { AAVE_V3_FLOW_BUCKETS } from "@/lib/aave-v3/flows-timeline";
import { daysFromEvents } from "@/lib/shared/flows-timeline";
import { dayStates, type DayState } from "./lib/flow-day-states";

type MvRow = Parameters<typeof sparkRowsToEvents>[0][number];

const FIXTURE = join(process.cwd(), "scripts/verify/fixtures/spark-flow-legs.json");
const SERVER_COPY = join(process.cwd(), "../rails-server-onboarding/api/src/services/fixtures/spark-flow-legs.json");

interface Leg {
  symbol: string;
  address?: string;
  leg: string | null;
  amount: number;
  price?: number;
  treasuryFee?: true;
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

function metasOf(f: Fixture): Map<string, Erc20Meta> {
  return new Map(
    Object.entries(f.tokens).map(([address, t]) => [
      address,
      { address, symbol: t.symbol, decimals: t.decimals, named: true },
    ]),
  );
}

/** Legs as JSON carries them: no undefined keys. */
const clean = (l: Leg): Leg => JSON.parse(JSON.stringify(l)) as Leg;

function answer(f: Fixture, c: Case): { legs: Record<string, Leg[]>; days?: DayState[] } {
  const { events } = sparkRowsToEvents(c.rows, c.wallet, metasOf(f));
  const liq = sparkLiquidationTxs(events);
  const legs: Record<string, Leg[]> = {};
  for (const ev of events) legs[ev.id] = sparkEventLegs(ev, liq).map((l) => clean(l as Leg));
  if (!c.whole) return { legs };
  // No today's prices: every leg in a whole case carries its block's price.
  const flows = sparkFlowEvents(events, undefined);
  assert.ok(flows, `${c.name}: every leg is priced at its block`);
  return {
    legs,
    days: dayStates(
      daysFromEvents(
        AAVE_V3_FLOW_BUCKETS.map((b) => b.key),
        flows.events,
      ),
    ),
  };
}

if (process.env.WRITE === "1") {
  const input = JSON.parse(readFileSync(process.env.FIXTURE_IN ?? FIXTURE, "utf8")) as Fixture;
  for (const c of input.cases) Object.assign(c, answer(input, c));
  input.about =
    "SparkLend flow legs, shared by rails-web scripts/verify/verify-spark-flow-legs.ts and rails-server " +
    "api/src/services/aave-v3-flow-series.test.ts. Byte-identical in both repos. Rows from victoria's " +
    "/api/spark/timeline on 2026-09-29; answers from the web's sparkEventLegs.";
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

  test("the fixture covers every leg SparkLend's rows can give", () => {
    const legs = new Set<string>();
    let fee = false;
    for (const c of fixture.cases)
      for (const ls of Object.values(c.legs ?? {}))
        for (const l of ls) {
          legs.add(String(l.leg));
          if (l.treasuryFee) fee = true;
        }
    for (const want of [
      "supplied",
      "withdrawn",
      "borrowed",
      "repaid",
      "liquidatedCollateral",
      "liquidatedDebt",
      "transferredIn",
      "transferredOut",
    ])
      assert.ok(legs.has(want), `no case yields ${want}`);
    assert.ok(fee, "no case has a treasury fee");
  });

  test(
    "the server's copy of the fixture is this file",
    { skip: !existsSync(SERVER_COPY) && "no rails-server copy of the fixture beside this checkout" },
    () => {
      assert.equal(
        createHash("sha256").update(readFileSync(SERVER_COPY)).digest("hex"),
        createHash("sha256").update(raw).digest("hex"),
        "rails-server's spark-flow-legs.json differs: copy the changed one across",
      );
    },
  );
}
