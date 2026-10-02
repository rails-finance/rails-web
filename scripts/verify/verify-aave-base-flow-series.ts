// verify-aave-base-flow-series — the Aave V3 Base and Seamless flows summary,
// the web's replay against the fixture it shares with rails-server (rails-ops
// reference/lifetime-flows-scrubber.md, "Aave V3 on Base and Seamless").
// ----------------------------------------------------------------------------
// OFFLINE. `scripts/verify/fixtures/aave-base-flow-series.json` is
// byte-identical to rails-server
// `api/src/services/fixtures/aave-base-flow-series.json`. Each case is one
// wallet's rows as victoria's `/api/{aave-v3-base,seamless}/timeline` serves
// them (indexes and at-block prices on), with each lane's reserves, its daily
// store prices and the oracle's latest. The fixture states what the web's
// replay gives from those rows: the summary the panel draws
// (`aaveBaseSummary`), the newest events' legs and the Explanation's counts.
// This test runs the web's decode (`prepareAaveV3Index`), row replay
// (`replayAaveV3Rows`) and flows replay (`aaveBaseReplay`) and must give the
// fixture's answer; the server's test runs its port
// (services/aave-base-flow-series.ts) over the same rows, a few blocks at a
// time, and must give the same.
//
//   npx tsx --test scripts/verify/verify-aave-base-flow-series.ts
//   WRITE=1 FIXTURE_IN=<cases.json> npx tsx scripts/verify/verify-aave-base-flow-series.ts
//     rewrites the fixture's answers from the web's replay: only after a
//     deliberate change to it, and the file is then copied to rails-server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareAaveV3Index, type AaveV3IndexResponse } from "@/lib/sources/api/aave-v3-base-timeline";
import { replayAaveV3Rows } from "@/lib/sources/chain/aave-v3-events";
import type { V3TokenMeta } from "@/lib/sources/chain/aave-v3-tokens";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { aaveBaseFocusEvents, aaveBaseReplay, aaveBaseSummary, isAaveBaseInterest } from "@/lib/aave-v3-base/flows";
import { AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK } from "@/lib/aave-v3-base/write-off-gap";

const FIXTURE = join(process.cwd(), "scripts/verify/fixtures/aave-base-flow-series.json");
const SERVER_COPY = join(
  process.cwd(),
  "../rails-server-onboarding/api/src/services/fixtures/aave-base-flow-series.json",
);

interface Lane {
  halfUpThrough: [number, number] | null;
  deployBlock: number;
  metas: Record<string, { symbol: string; decimals: number }>;
  store: Record<string, [number, number][]>;
  todayPrices: Record<string, number>;
}
interface Answer {
  summary: unknown;
  events: unknown;
  facts: unknown;
}
interface Case {
  name: string;
  about: string;
  lane: "aave-v3-base" | "seamless";
  wallet: string;
  coverage: AaveV3IndexResponse["coverage"];
  rows?: AaveV3IndexResponse["rows"];
  /** Another case's rows, and what this case takes away: the store's prices
   *  (every reserve's, for `"*"`) and the rows' at-block prices of some
   *  reserves, so the legs fall to the nearest row and to today's price. */
  rowsOf?: string;
  dropStore?: string[];
  dropRowPrices?: string[];
  answer?: Answer;
}
interface Fixture {
  about?: string;
  readAt: number;
  keepEvents: number;
  lanes: Record<string, Lane>;
  cases: Case[];
}

const DAY = 86_400;

/** A case's rows and store, its variant applied. */
export function caseInput(
  f: Fixture,
  c: Case,
): { rows: NonNullable<Case["rows"]>; store: Record<string, [number, number][]> } {
  const src = c.rowsOf ? f.cases.find((x) => x.name === c.rowsOf)! : c;
  const drop = new Set(c.dropRowPrices ?? []);
  const rows = src.rows!.map((r) => {
    if (drop.size === 0) return r;
    const out = { ...r };
    if (drop.has(r.reserve)) {
      out.price_usd = null;
      out.debt_price_usd = null;
    }
    if (r.collateral_asset && drop.has(r.collateral_asset)) out.collateral_price_usd = null;
    return out;
  });
  const all = c.dropStore?.includes("*");
  const store = Object.fromEntries(
    Object.entries(f.lanes[c.lane].store).filter(([a]) => !all && !(c.dropStore ?? []).includes(a)),
  );
  return { rows, store };
}
/** As JSON carries it: no undefined keys. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function webAnswer(f: Fixture, c: Case): Answer {
  const lane = f.lanes[c.lane];
  const { rows: caseRows, store } = caseInput(f, c);
  const metas = new Map<string, V3TokenMeta>(
    Object.entries(lane.metas).map(([address, m]) => [
      address,
      { address, symbol: m.symbol, decimals: m.decimals, lt: null },
    ]),
  );
  const prepared = prepareAaveV3Index(
    { wallet: c.wallet, rows: caseRows, totalEvents: caseRows.length, transfersCaptured: true, coverage: c.coverage },
    metas,
    { wallet: c.wallet, chainId: 8453, apiPrefix: `/api/${c.lane}`, deployBlock: lane.deployBlock },
  );
  assert.ok(prepared.whole, `${c.name}: the index vouches for the whole history (${prepared.reason})`);
  const result = replayAaveV3Rows({ ...prepared.input, maxRendered: caseRows.length + 1 });
  const events = result.events.filter(isAaveV3Event);
  // The hook reads the store from the history's first day.
  const from = Math.floor(Math.min(...events.map((e) => e.timestamp)) / DAY);
  const dailyPrices: Record<string, [number, number][]> = {};
  for (const [a, obs] of Object.entries(store)) {
    const kept = obs.filter(([d]) => d >= from);
    if (kept.length > 0) dailyPrices[a] = kept;
  }
  const o = {
    now: f.readAt,
    live: null,
    todayPrices: lane.todayPrices,
    brand: c.lane === "seamless" ? "Seamless" : "Aave",
    writeOffFrom: c.lane === "seamless" ? null : AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK,
    ...(Object.keys(dailyPrices).length > 0 ? { dailyPrices } : {}),
  };
  const rp = aaveBaseReplay(events, o);
  const priced = { block: 0, day: 0, nearest: 0, today: 0 };
  for (const r of rp.replayed)
    for (const l of r.legs) {
      if (isAaveBaseInterest(l.bucket)) continue;
      if (l.basis === "block") priced.block++;
      else if (l.basis === "day") priced.day++;
      else if (l.basis === "nearest") priced.nearest++;
      else priced.today++;
    }
  const rows = (k: string) => rp.replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
  return json({
    summary: aaveBaseSummary(rp, o),
    events: aaveBaseFocusEvents(rp).slice(-f.keepEvents),
    facts: {
      priced,
      liquidations: rp.replayed.filter((r) => r.ev.context.data.eventType === "liquidation").length,
      aTokenSeizures: new Set(rp.replayed.filter((r) => r.seizureTransfer).map((r) => r.tx)).size,
      treasuryFees: rp.replayed.filter((r) => r.treasuryFee).length,
      transfersIn: rows("received"),
      transfersOut: rows("sent"),
      interestRows: rp.replayed.filter((r) => r.legs.some((l) => isAaveBaseInterest(l.bucket))).length,
    },
  });
}

if (process.env.WRITE === "1") {
  const input = JSON.parse(readFileSync(process.env.FIXTURE_IN ?? FIXTURE, "utf8")) as Fixture;
  for (const c of input.cases) c.answer = webAnswer(input, c);
  input.about =
    "Aave V3 Base and Seamless flows summaries, shared by rails-web scripts/verify/verify-aave-base-flow-series.ts " +
    "and rails-server api/src/services/aave-base-flow-series.test.ts. Byte-identical in both repos. Rows from " +
    "victoria's /api/{aave-v3-base,seamless}/timeline and daily prices from /api/prices/daily on 2026-10-02; " +
    "answers from the web's replay.";
  const { about, ...rest } = input;
  writeFileSync(FIXTURE, JSON.stringify({ about, ...rest }) + "\n");
  console.log(`wrote ${FIXTURE}: ${createHash("sha256").update(readFileSync(FIXTURE)).digest("hex")}`);
} else {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

  for (const c of fixture.cases) {
    test(`summary: ${c.name} (${c.about})`, () => {
      assert.deepEqual(webAnswer(fixture, c), c.answer);
    });
  }

  test("the fixture prices legs at their block, their day and the nearest row, and pairs swaps", () => {
    const sum = { block: 0, day: 0, nearest: 0, today: 0 };
    let liquidations = 0;
    for (const c of fixture.cases) {
      const f = (c.answer as { facts: { priced: typeof sum; liquidations: number } }).facts;
      sum.block += f.priced.block;
      sum.day += f.priced.day;
      sum.nearest += f.priced.nearest;
      sum.today += f.priced.today;
      liquidations += f.liquidations;
    }
    assert.ok(sum.block > 0 && sum.day > 0 && sum.nearest > 0 && sum.today > 0, JSON.stringify(sum));
    assert.ok(liquidations > 0);
    const buckets = new Set(
      fixture.cases.flatMap((c) => (c.answer as { summary: { buckets: string[] } }).summary.buckets),
    );
    for (const k of ["swappedIn", "swappedOut", "repaidBySwap", "soldToRepay", "repaidWithCollateral", "usedToRepay"])
      assert.ok(buckets.has(k), `no case fills ${k}`);
  });

  test(
    "the server's copy of the fixture is this file",
    { skip: !existsSync(SERVER_COPY) && "no rails-server copy of the fixture beside this checkout" },
    () => {
      assert.equal(
        createHash("sha256").update(readFileSync(SERVER_COPY)).digest("hex"),
        createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"),
      );
    },
  );
}
