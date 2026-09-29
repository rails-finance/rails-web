// verify-aave-v4-flow-legs — the web's Aave V4 flow classifier against the
// fixture it shares with rails-server (rails-ops
// reference/lifetime-flows-scrubber.md, "One classifier, two repos").
// ----------------------------------------------------------------------------
// OFFLINE. `scripts/verify/fixtures/aave-v4-flow-legs.json` is byte-identical
// to rails-server `api/src/services/fixtures/aave-v4-flow-legs.json`. Each case
// is one wallet's events as `/api/aave-v4/timeline` serves them and the spoke
// of the position. The fixture states, per event, the legs `aaveV4EventLegs`
// gives, and the position's state after each active day. This test runs the
// web's classifier and reduction over the events and must give the fixture's
// answer; the server's test runs its port over the same events.
//
//   npx tsx --test scripts/verify/verify-aave-v4-flow-legs.ts
//   WRITE=1 FIXTURE_IN=<cases.json> npx tsx scripts/verify/verify-aave-v4-flow-legs.ts
//     rewrites the fixture's answers from the web's classifier: only after a
//     deliberate change to it, and the file is then copied to rails-server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { aaveV4EventLegs, aaveV4FlowTimeline, type AaveV4EventLeg } from "@/lib/aave-v4/flows-timeline";
import { dayStates, type DayState } from "./lib/flow-day-states";

const FIXTURE = join(process.cwd(), "scripts/verify/fixtures/aave-v4-flow-legs.json");
const SERVER_COPY = join(process.cwd(), "../rails-server-onboarding/api/src/services/fixtures/aave-v4-flow-legs.json");

interface Case {
  name: string;
  about: string;
  wallet: string;
  /** The spoke's display name. */
  spoke: string;
  events: BaseActivityEvent[];
  legs?: Record<string, AaveV4EventLeg[]>;
  days?: DayState[];
}
interface Fixture {
  about?: string;
  cases: Case[];
}

const NO_LIVE = { collateralUsd: 0, debtUsd: 0 };

function answer(c: Case): { legs: Record<string, AaveV4EventLeg[]>; days: DayState[] } {
  const legs: Record<string, AaveV4EventLeg[]> = {};
  for (const ev of c.events) legs[ev.id] = aaveV4EventLegs(ev);
  // No today's prices: every leg in a case carries its block's price.
  const t = aaveV4FlowTimeline(c.events, c.wallet, c.spoke, NO_LIVE, undefined);
  assert.ok(t, `${c.name}: every leg is priced at its block`);
  return { legs: JSON.parse(JSON.stringify(legs)) as Record<string, AaveV4EventLeg[]>, days: dayStates(t.days) };
}

if (process.env.WRITE === "1") {
  const input = JSON.parse(readFileSync(process.env.FIXTURE_IN ?? FIXTURE, "utf8")) as Fixture;
  for (const c of input.cases) Object.assign(c, answer(c));
  input.about =
    "Aave V4 flow legs, shared by rails-web scripts/verify/verify-aave-v4-flow-legs.ts and rails-server " +
    "api/src/services/aave-v4-flow-series.test.ts. Byte-identical in both repos. Events from victoria's " +
    "/api/aave-v4/timeline on 2026-09-29; answers from the web's aaveV4EventLegs and aaveV4FlowEvent.";
  writeFileSync(FIXTURE, JSON.stringify(input, null, 1) + "\n");
  console.log(`wrote ${FIXTURE}: ${createHash("sha256").update(readFileSync(FIXTURE)).digest("hex")}`);
} else {
  const raw = readFileSync(FIXTURE);
  const fixture = JSON.parse(raw.toString("utf8")) as Fixture;

  for (const c of fixture.cases) {
    test(`legs and days: ${c.name} (${c.about})`, () => {
      const got = answer(c);
      assert.deepEqual(got.legs, c.legs);
      assert.deepEqual(got.days, c.days);
    });
  }

  test("the fixture covers every leg V4's events can give", () => {
    const legs = new Set<string>();
    for (const c of fixture.cases) for (const ls of Object.values(c.legs ?? {})) for (const l of ls) legs.add(l.leg);
    for (const want of ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedCollateral", "liquidatedDebt"])
      assert.ok(legs.has(want), `no case yields ${want}`);
  });

  test("two reserves of one token in a spoke are summed into one balance", () => {
    const c = fixture.cases.find((x) => x.about.includes("two hubs"))!;
    const last = c.days![c.days!.length - 1];
    const usdc = c.events
      .map((e) => (e.context?.protocol === "aave-v4" ? e.context.data.allDebts : undefined))
      .filter(Boolean)
      .pop()!
      .filter((i) => i.symbol === "USDC");
    assert.ok(usdc.length === 2, "the case holds USDC from two hubs");
    assert.ok(
      Math.abs(last.held["debt:usdc"] - usdc.reduce((s, i) => s + Number(i.amount), 0)) < 1e-9,
      "the day states their sum",
    );
  });

  test(
    "the server's copy of the fixture is this file",
    { skip: !existsSync(SERVER_COPY) && "no rails-server copy of the fixture beside this checkout" },
    () => {
      assert.equal(
        createHash("sha256").update(readFileSync(SERVER_COPY)).digest("hex"),
        createHash("sha256").update(raw).digest("hex"),
        "rails-server's aave-v4-flow-legs.json differs: copy the changed one across",
      );
    },
  );
}
