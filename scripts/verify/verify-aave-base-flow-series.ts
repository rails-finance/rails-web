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
import { centsOf, shownPrice, shownUsd } from "@/lib/shared/shown-usd";

const FIXTURE = join(process.cwd(), "scripts/verify/fixtures/aave-base-flow-series.json");
const SERVER_COPY = join(
  process.env.SERVER_REPO ?? join(process.cwd(), "../rails-server"),
  "api/src/services/fixtures/aave-base-flow-series.json",
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
/** The web's answer against the fixture's (ui-jobs 743). The fixture is the
 *  server's shape, shared byte for byte, so it stays as it is and the web is
 *  read against it:
 *  - every field the fixture has compares equal, except
 *  - a leg's `usd`, which is its cents: centsOf(the fixture's usd);
 *  - a day's running sums (`cum`, `cumAsset[].usd`), sums of those cents:
 *    within half a cent per leg the case holds;
 *  - a day's `unsure`: the day's close is the decided basis and lists no
 *    reason, a close carried from an earlier day lists one where the fixture
 *    lists the day's close, and the nearest read is named so;
 *  - the leg's parts the server does not emit yet (`price`, `block`,
 *    `priceNote`, `basis`; a day's `legs` and price blocks) are not compared,
 *    except that a leg's price is one of the case's price inputs (a row's
 *    at-block price, a store close or today's) where it has any for the token.
 *  The server item that emits the parts: rails-ops TO-DO-infra-and-backend,
 *  "Aave Base flow series: the server emits each leg's price, block and cents". */
function assertSharedAnswer(f: Fixture, c: Case, got: Answer, want: Answer): void {
  const lane = f.lanes[c.lane];
  const { rows, store } = caseInput(f, c);
  const symbolOf = (a: string | null | undefined) => (a ? lane.metas[a.toLowerCase()]?.symbol : undefined);
  const inputs = new Map<string, number[]>();
  // The rows' at-block prices by token and block: a leg at a row's block
  // takes that row's price.
  const atBlock = new Map<string, number[]>();
  const put = (a: string | null | undefined, v: unknown, block?: number) => {
    const sym = symbolOf(a);
    const n = Number(v);
    if (!(sym && v != null && Number.isFinite(n) && n > 0)) return;
    inputs.set(sym, [...(inputs.get(sym) ?? []), n]);
    if (block != null) atBlock.set(`${sym}@${block}`, [...(atBlock.get(`${sym}@${block}`) ?? []), n]);
  };
  for (const r of rows) {
    const b = Number(r.block_number);
    put(r.reserve, r.price_usd, b);
    put(r.reserve, r.debt_price_usd, b);
    put(r.collateral_asset, r.collateral_price_usd, b);
  }
  for (const [a, obs] of Object.entries(store)) for (const [, v] of obs) put(a, v);
  for (const [a, v] of Object.entries(lane.todayPrices)) put(a, v);
  const g = got as { summary: Record<string, unknown>; events: Record<string, unknown>[]; facts: unknown };
  const w = want as { summary: Record<string, unknown>; events: Record<string, unknown>[]; facts: unknown };
  assert.deepEqual(g.facts, w.facts, `${c.name}: facts`);
  // The events' legs.
  assert.equal(g.events.length, w.events.length, `${c.name}: events`);
  g.events.forEach((ge, i) => {
    const we = w.events[i];
    const { legs: gl, ...gRest } = ge as { legs: Record<string, unknown>[] };
    const { legs: wl, ...wRest } = we as { legs: Record<string, unknown>[] };
    assert.deepEqual(gRest, wRest, `${c.name} event ${i}`);
    assert.equal(gl.length, wl.length, `${c.name} event ${i}: legs`);
    gl.forEach((l, j) => {
      const want = wl[j];
      for (const [k, v] of Object.entries(want))
        if (k === "usd" && v != null && typeof l.price === "number") {
          // The leg is its shown product, and it meets the fixture's figure
          // to the cent, less what the shown price and amount round away.
          assert.equal(l.usd, shownUsd(l.amount as number, l.price), `${c.name} ${i}.${j}: usd is the shown product`);
          const slack = 0.01 + Math.abs(l.amount as number) * 5e-7 * Math.max(1, l.price) + 5e-7 * l.price;
          assert.ok(
            Math.abs((l.usd as number) - centsOf(v as number)) <= slack,
            `${c.name} ${i}.${j}: ${l.usd} against ${centsOf(v as number)}`,
          );
        } else if (k === "usd") assert.equal(l.usd, v == null ? v : centsOf(v as number), `${c.name} ${i}.${j}: usd`);
        else assert.deepEqual(l[k], v, `${c.name} ${i}.${j}: ${k}`);
      // A leg at a block the rows price is pinned to that row's price; any
      // other to a price the case's inputs carry.
      const pinned = typeof l.block === "number" ? atBlock.get(`${l.symbol}@${l.block}`) : undefined;
      const known = pinned?.length ? pinned : inputs.get(l.symbol as string);
      if (typeof l.price === "number" && known?.length)
        assert.ok(
          known.some((p) => p === l.price || shownPrice(p) === l.price),
          `${c.name} ${i}.${j}: ${l.symbol} at ${l.price}, ${pinned?.length ? `the row's price at block ${l.block}` : "a price the inputs carry"}`,
        );
    });
  });
  // The summary: the days compared with cents, the rest equal.
  const { days: gd, ...gs } = g.summary as { days: Record<string, unknown>[] };
  const { days: wd, ...ws } = w.summary as { days: Record<string, unknown>[] };
  assert.deepEqual(gs, ws, `${c.name}: summary`);
  assert.equal(gd.length, wd.length, `${c.name}: days`);
  // Each leg's cents differ from its raw figure by half a cent and what the
  // shown amount and price round away: a running sum's slack is that, summed
  // over the legs in its bucket (and token) through the day.
  const legSlack = (l: { amount?: number; price?: number | null }) =>
    0.005 +
    (typeof l.price === "number"
      ? Math.abs(l.amount ?? 0) * 5e-7 * Math.max(1, l.price) + 5e-7 * l.price
      : 1e-6 * Math.abs(l.amount ?? 0));
  const slack = new Map<string, number>();
  const near = (a: unknown, b: unknown, key: string, what: string) =>
    assert.ok(
      Math.abs((a as number) - (b as number)) <= (slack.get(key) ?? 0) + 1e-9,
      `${c.name} ${what}: ${a} against ${b} (slack ${slack.get(key) ?? 0})`,
    );
  const reasons = (us: { side: string; why: string; symbol?: string }[] | undefined, web: boolean) =>
    (us ?? [])
      .filter((u) => !u.why.startsWith("priced at the day's close"))
      .map((u) => ({
        ...u,
        why: web ? u.why : u.why.replace("priced at the nearest priced row:", "priced at the nearest read:"),
      }))
      .filter((u) => !(web && u.why.startsWith("priced at the last stored close before its day")));
  // The legs' cents through each day, by bucket and by bucket and token:
  // the web's running sums are exactly these.
  const run = new Map<string, number>();
  gd.forEach((day, i) => {
    const want = wd[i];
    for (const l of (day.legs as {
      bucket: string;
      symbol?: string;
      amount?: number;
      price?: number | null;
      usd?: number | null;
    }[]) ?? []) {
      for (const key of [l.bucket, `${l.bucket}|${l.symbol}`]) {
        slack.set(key, (slack.get(key) ?? 0) + legSlack(l));
        run.set(key, centsOf((run.get(key) ?? 0) + (l.usd ?? 0)));
      }
    }
    for (const [b, x] of Object.entries((day.cum as Record<string, number>) ?? {}))
      assert.equal(x, run.get(b) ?? 0, `${c.name} day ${i} cum.${b}: the legs' cents through the day`);
    for (const x of (day.cumAsset as { bucket: string; symbol: string; usd: number }[]) ?? [])
      assert.equal(
        x.usd,
        run.get(`${x.bucket}|${x.symbol}`) ?? 0,
        `${c.name} day ${i} cumAsset ${x.symbol} ${x.bucket}: the legs' cents through the day`,
      );
    // A carried close stands only where the fixture names the day's close.
    const gotU = day.unsure as { side: string; why: string; symbol?: string }[] | undefined;
    const wantU = (want.unsure as typeof gotU) ?? [];
    for (const u of gotU ?? [])
      if (u.why.startsWith("priced at the last stored close before its day"))
        assert.ok(
          wantU.some(
            (x) => x.side === u.side && x.symbol === u.symbol && x.why.startsWith("priced at the day's close"),
          ),
          `day ${i}: a carried close where the fixture has the day's close`,
        );
    for (const [k, v] of Object.entries(want)) {
      if (k === "cum")
        for (const [b, x] of Object.entries(v as Record<string, number>))
          near((day.cum as Record<string, number>)[b], x, b, `day ${i} cum.${b}`);
      else if (k === "cumAsset")
        (v as { bucket: string; symbol: string; usd: number }[]).forEach((x, j) => {
          const y = (day.cumAsset as (typeof x)[])[j];
          assert.equal(y.bucket, x.bucket);
          assert.equal(y.symbol, x.symbol);
          near(y.usd, x.usd, `${x.bucket}|${x.symbol}`, `day ${i} cumAsset ${x.symbol} ${x.bucket}`);
        });
      else if (k === "unsure")
        assert.deepEqual(reasons(gotU, true), reasons(v as typeof gotU, false), `day ${i} unsure`);
      else if (k === "prices")
        (v as Record<string, unknown>[]).forEach((x, j) => {
          const { block: _b, ...y } = (day.prices as Record<string, unknown>[])[j];
          void _b;
          assert.deepEqual(y, x, `day ${i} prices ${j}`);
        });
      else assert.deepEqual(day[k], v, `day ${i} ${k}`);
    }
    if (!("unsure" in want)) assert.deepEqual(reasons(gotU, true), [], `day ${i} unsure`);
  });
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
      // A close carried from an earlier day is a store price, as the server counts it.
      else if (l.basis === "day" || l.basis === "carried") priced.day++;
      else if (l.basis === "nearest") priced.nearest++;
      else priced.today++;
    }
  const rows = (k: string) => rp.replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
  return json({
    summary: aaveBaseSummary(rp, o),
    events: aaveBaseFocusEvents(rp, o.brand ?? "Aave").slice(-f.keepEvents),
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
      assertSharedAnswer(fixture, c, webAnswer(fixture, c), c.answer!);
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
