// SparkLend's scaled-balance accrual on the wallet page (rails-ops
// TO-DO-infra-and-backend.md, "The spark wallet sync rewrites about 4,500 rows
// on every pass"): lib/spark/scaled-accrual.ts against rails-server's SQL to the
// wei, the two stored card shapes, the "Not read" rule for a reserve with no
// index, and the indices route read once for a page's rows
// (lib/sources/api/spark-reserve-indices.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;

const {
  rayMul,
  aaveLinearIndex,
  aaveCompoundIndex,
  accrueBalance,
  accrueReserves,
  accrueLines,
  cardIsScaled,
  indexMap,
  parseSparkReserveIndices,
} = await import(ROOT + "lib/spark/scaled-accrual.ts");
const { scaleRaw } = await import(ROOT + "lib/shared/scale-raw.ts");

// Production, read-only (psql-read, 24 Nov 2026): one wallet's open SparkLend
// reserves in one REPEATABLE READ snapshot. The scaled sums are spark_scaled_deltas'
// per axis; the indices are each reserve's latest aave_family_reserve_data row
// (market 'spark'); headTs is mv_spark_positions' head (max block_timestamp of
// spark_scaled_deltas). sqlSupply / sqlDebt are
//   ray_mul(scaled, aave_linear_index(li, lr, GREATEST(headTs - rduTs, 0)))
//   ray_mul(scaled, aave_compound_index(vbi, vbr, GREATEST(headTs - rduTs, 0)))
// the *30d figures the same at dt = 2,592,000, and mvSupply / mvDebt the
// materialized view's balances for the wallet.
const WALLET = "0x190fed8252b4f13d7af4de741ee5d2588d7f6702";
const REF = [
  {
    reserve: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    supplyScaled: "17422629",
    debtScaled: "0",
    liquidityIndex: "1000139767694397024325772894",
    liquidityRate: "170840950797993484986",
    variableBorrowIndex: "1002332951558187898625651218",
    variableBorrowRate: "84370450691674881770582",
    rduTs: 1795536827,
    headTs: 1795542611,
    sqlSupply: "17425064",
    sqlDebt: "0",
    sqlSupply30d: "17425064",
    sqlDebt30d: "0",
    mvSupply: "17425064",
    mvDebt: "0",
  },
  {
    reserve: "0x6b175474e89094c44da98b954eedeac495271d0f",
    supplyScaled: "0",
    debtScaled: "5312749853837920372922",
    liquidityIndex: "1189418477672764707746380477",
    liquidityRate: "35793726512824651183670930",
    variableBorrowIndex: "1236915774134721972704386040",
    variableBorrowRate: "49754629898979132954491168",
    rduTs: 1795538639,
    headTs: 1795542611,
    sqlSupply: "0",
    sqlDebt: "6571465279253644214457",
    sqlSupply30d: "0",
    sqlDebt30d: "6598352427500707299059",
    mvSupply: "0",
    mvDebt: "6571465279253644214457",
  },
  {
    reserve: "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
    supplyScaled: "0",
    debtScaled: "6630794089",
    liquidityIndex: "1014716519045588753041484438",
    liquidityRate: "15054819342832442273680972",
    variableBorrowIndex: "1053257439745629643971666240",
    variableBorrowRate: "40332635980706794605403706",
    rduTs: 1795523471,
    headTs: 1795542611,
    sqlSupply: "0",
    sqlDebt: "6984104167",
    sqlSupply30d: "0",
    sqlDebt30d: "7007123437",
    mvSupply: "0",
    mvDebt: "6984104167",
  },
  {
    reserve: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    supplyScaled: "5238855966239481440",
    debtScaled: "0",
    liquidityIndex: "1000041440898352202788792261",
    liquidityRate: "150701991144995",
    variableBorrowIndex: "1005148648129290629696265284",
    variableBorrowRate: "78428959443483311400",
    rduTs: 1795536203,
    headTs: 1795542611,
    sqlSupply: "5239073069137060362",
    sqlDebt: "0",
    sqlSupply30d: "5239073069137125095",
    sqlDebt30d: "0",
    mvSupply: "5239073069137060362",
    mvDebt: "0",
  },
  {
    reserve: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    supplyScaled: "7487689065270198455",
    debtScaled: "0",
    liquidityIndex: "1062488104606349647227220606",
    liquidityRate: "11864145850939412457735123",
    variableBorrowIndex: "1089215972522472667999218933",
    variableBorrowRate: "17832438558001959117036194",
    rduTs: 1795542131,
    headTs: 1795542611,
    sqlSupply: "7955581999464186596",
    sqlDebt: "0",
    sqlSupply30d: "7963338330083892053",
    sqlDebt30d: "0",
    mvSupply: "7955581999464186596",
    mvDebt: "0",
  },
  {
    reserve: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    supplyScaled: "16670427",
    debtScaled: "0",
    liquidityIndex: "1000176488884067550739812279",
    liquidityRate: "351043552330990798948948",
    variableBorrowIndex: "1002147814752230064925904584",
    variableBorrowRate: "2342019535608473792628361",
    rduTs: 1795540139,
    headTs: 1795542611,
    sqlSupply: "16673370",
    sqlDebt: "0",
    sqlSupply30d: "16673850",
    sqlDebt30d: "0",
    mvSupply: "16673370",
    mvDebt: "0",
  },
  {
    reserve: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    supplyScaled: "0",
    debtScaled: "1898070958",
    liquidityIndex: "1173164111009844328415673489",
    liquidityRate: "37807323599635110100074023",
    variableBorrowIndex: "1216240072573944828582367414",
    variableBorrowRate: "44128775184540127622365756",
    rduTs: 1795540067,
    headTs: 1795542611,
    sqlSupply: "0",
    sqlDebt: "2308518178",
    sqlSupply30d: "0",
    sqlDebt30d: "2316898176",
    mvSupply: "0",
    mvDebt: "2308518178",
  },
  {
    reserve: "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
    supplyScaled: "0",
    debtScaled: "11439598857991962147619",
    liquidityIndex: "1046921169264938575594067179",
    liquidityRate: "34419711046010113679249549",
    variableBorrowIndex: "1081716493062287331845311587",
    variableBorrowRate: "48790318412149750234536499",
    rduTs: 1795541975,
    headTs: 1795542611,
    sqlSupply: "0",
    sqlDebt: "12374414934818059443600",
    sqlSupply30d: "0",
    sqlDebt30d: "12424125739361397192935",
    mvSupply: "0",
    mvDebt: "12374414934818059443600",
  },
];
const HEAD_TS = REF[0].headTs;
const DAY30 = 86_400 * 30;

const indexOf = (r) => ({
  reserve: r.reserve,
  liquidityIndex: r.liquidityIndex,
  liquidityRate: r.liquidityRate,
  variableBorrowIndex: r.variableBorrowIndex,
  variableBorrowRate: r.variableBorrowRate,
  rduTs: r.rduTs,
});
const ROUTE = { reserves: REF.map(indexOf), block: 23_900_000, at: HEAD_TS };
const SCALED_CARD = {
  wallet: WALLET,
  reserves: REF.map((r) => ({ reserve: r.reserve, supplyScaledRaw: r.supplyScaled, debtScaledRaw: r.debtScaled })),
};

test("ray_mul rounds half up as the SQL does", () => {
  const half = BigInt("500000000000000000000000000");
  assert.equal(rayMul(BigInt(3), half), BigInt(2));
  assert.equal(rayMul(BigInt(1), half - BigInt(1)), BigInt(0));
});

test("the index functions equal the SQL to the wei, dt 0 to a year", () => {
  // aave_compound_index(DAI vbi, vbr, dt) and aave_linear_index(DAI li, lr, dt) from production.
  const vbi = BigInt("1236915774134721972704386040");
  const vbr = BigInt("49754629898979132954491168");
  const li = BigInt("1189418477672764707746380477");
  const lr = BigInt("35793726512824651183670930");
  const sql = [
    [0, "1236915774134721972704386040", "1189418477672764707746380477"],
    [1, "1236915776086215077672751017", "1189418479022768503380550110"],
    [2, "1236915778037708185720004161", "1189418480372772299014719742"],
    [3, "1236915779989201296846145472", "1189418481722776094648889375"],
    [31_536_000, "1300008464281949314132202861", "1231992197371883881281872949"],
  ];
  for (const [dt, ci, lin] of sql) {
    assert.equal(aaveCompoundIndex(vbi, vbr, BigInt(dt)).toString(), ci, `compound dt=${dt}`);
    assert.equal(aaveLinearIndex(li, lr, BigInt(dt)).toString(), lin, `linear dt=${dt}`);
  }
});

test("TO THE WEI: each reserve's balance equals ray_mul(scaled, index) from the SQL", () => {
  for (const r of REF) {
    const x = indexOf(r);
    assert.equal(accrueBalance(BigInt(r.supplyScaled), x, "supply", HEAD_TS).toString(), r.sqlSupply, r.reserve);
    assert.equal(accrueBalance(BigInt(r.debtScaled), x, "debt", HEAD_TS).toString(), r.sqlDebt, r.reserve);
    const later = r.rduTs + DAY30;
    assert.equal(accrueBalance(BigInt(r.supplyScaled), x, "supply", later).toString(), r.sqlSupply30d, r.reserve);
    assert.equal(accrueBalance(BigInt(r.debtScaled), x, "debt", later).toString(), r.sqlDebt30d, r.reserve);
  }
});

test("a time before the index's update accrues nothing (GREATEST(t - rduTs, 0))", () => {
  const r = REF.find((x) => x.debtScaled !== "0");
  const x = indexOf(r);
  const atUpdate = accrueBalance(BigInt(r.debtScaled), x, "debt", r.rduTs);
  assert.equal(accrueBalance(BigInt(r.debtScaled), x, "debt", r.rduTs - 3_600), atUpdate);
});

test("a card with scaled reserves and the route's indices accrues to the MV's balance", () => {
  assert.equal(cardIsScaled(SCALED_CARD), true);
  const route = parseSparkReserveIndices(JSON.parse(JSON.stringify(ROUTE)));
  const got = accrueReserves(SCALED_CARD.reserves, indexMap(route), route.at);
  assert.deepEqual(
    got.map((r) => [r.reserve, r.supplyBalanceRaw, r.debtBalanceRaw]),
    REF.map((r) => [r.reserve, r.mvSupply, r.mvDebt]),
  );
  assert.ok(got.every((r) => !r.supplyUnread && !r.debtUnread));
});

test("a card's drawn lines accrue to the head read's time, ranked by amount", () => {
  const debts = REF.filter((r) => r.debtScaled !== "0");
  const lines = debts.map((r) => ({
    symbol: r.reserve.slice(0, 6),
    address: r.reserve,
    decimals: 18,
    amount: 0,
    amountUnread: true,
    amountRaw: "0",
  }));
  const got = accrueLines(lines, SCALED_CARD.reserves, indexMap(ROUTE), "debt", HEAD_TS, scaleRaw);
  const want = [...debts].sort((a, b) => (BigInt(b.mvDebt) > BigInt(a.mvDebt) ? 1 : -1));
  assert.deepEqual(
    got.map((l) => [l.address, l.amountRaw]),
    want.map((r) => [r.reserve, r.mvDebt]),
  );
  assert.ok(got.every((l) => !("amountUnread" in l)));
  assert.equal(got.find((l) => l.address === want[0].reserve).amount, scaleRaw(BigInt(want[0].mvDebt), 18));
});

test("a card stored as balances is used as it is", () => {
  const card = {
    wallet: WALLET,
    reserves: REF.map((r) => ({ reserve: r.reserve, supplyBalanceRaw: r.mvSupply, debtBalanceRaw: r.mvDebt })),
  };
  assert.equal(cardIsScaled(card), false);
  const got = accrueReserves(card.reserves, indexMap(ROUTE), HEAD_TS + 86_400);
  got.forEach((r, i) => assert.equal(r, card.reserves[i]));
  const lines = [{ address: REF[1].reserve, decimals: 18, amount: 6571.46, amountRaw: REF[1].mvDebt }];
  assert.deepEqual(accrueLines(lines, card.reserves, indexMap(ROUTE), "debt", HEAD_TS + 86_400, scaleRaw), lines);
});

test("a reserve the route answers with no index row reads Not read; the others accrue", () => {
  const missing = REF.find((r) => r.debtScaled !== "0").reserve;
  const route = { ...ROUTE, reserves: ROUTE.reserves.filter((x) => x.reserve !== missing) };
  const got = accrueReserves(SCALED_CARD.reserves, indexMap(route), route.at);
  const lost = got.find((r) => r.reserve === missing);
  assert.equal(lost.debtUnread, true);
  assert.equal(lost.debtBalanceRaw, "0");
  for (const r of got.filter((x) => x.reserve !== missing)) {
    const ref = REF.find((x) => x.reserve === r.reserve);
    assert.deepEqual([r.supplyBalanceRaw, r.debtBalanceRaw, r.debtUnread], [ref.mvSupply, ref.mvDebt, undefined]);
  }
  // The drawn line: no amount, ranked after the read ones.
  const lines = REF.filter((r) => r.debtScaled !== "0").map((r) => ({
    address: r.reserve,
    decimals: 18,
    amount: 0,
    amountRaw: "0",
  }));
  const drawn = accrueLines(lines, SCALED_CARD.reserves, indexMap(route), "debt", route.at, scaleRaw);
  assert.deepEqual(drawn.at(-1), { address: missing, decimals: 18, amount: 0, amountRaw: "0", amountUnread: true });
  assert.ok(drawn.slice(0, -1).every((l) => !l.amountUnread && BigInt(l.amountRaw) > BigInt(0)));
});

test("a route that does not answer reads Not read for every scaled reserve", () => {
  const got = accrueReserves(SCALED_CARD.reserves, indexMap(null), 0);
  for (const [i, r] of got.entries()) {
    assert.equal(r.supplyUnread === true, REF[i].supplyScaled !== "0", r.reserve);
    assert.equal(r.debtUnread === true, REF[i].debtScaled !== "0", r.reserve);
    assert.deepEqual([r.supplyBalanceRaw, r.debtBalanceRaw], ["0", "0"]);
  }
  for (const body of [null, "x", {}, { reserves: [] }, { reserves: "no", at: 1 }])
    assert.equal(parseSparkReserveIndices(body), null);
  // A row with an unreadable figure is left out, so its reserve reads Not read.
  const bad = parseSparkReserveIndices({ ...ROUTE, reserves: [{ ...ROUTE.reserves[0], liquidityIndex: 1.5 }] });
  assert.deepEqual(bad.reserves, []);
});

// ── The route client, through the route gate ────────────────────────────────

const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const API = "https://api.example";
process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = API;
const { sparkReserveIndicesFor } = await import(ROOT + "lib/sources/api/spark-reserve-indices.ts");

const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
test.beforeEach(() => {
  skew += 120_000; // past the route gate's 30 s down window
});
test.afterEach(() => test.mock.restoreAll());

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the route is read once for a page's many rows", async () => {
  const seen = [];
  test.mock.method(globalThis, "fetch", async (url) => {
    seen.push(String(url));
    return json(ROUTE);
  });
  const rows = Array.from({ length: 40 }, (_, i) => ({ positionId: `p${i}`, card: SCALED_CARD }));
  // shape, then head, each asking for every row.
  const answers = await Promise.all(rows.map(() => sparkReserveIndicesFor(rows)));
  for (let i = 0; i < rows.length; i++) answers.push(await sparkReserveIndicesFor(rows));
  assert.equal(seen.length, 1);
  assert.equal(seen[0], `${API}/api/spark/reserve-indices`);
  assert.ok(answers.every((a) => a === answers[0] && a.at === HEAD_TS && a.reserves.length === REF.length));
  // Another page's read asks again.
  await sparkReserveIndicesFor([...rows]);
  assert.equal(seen.length, 2);
});

test("a route that fails gives null, so the scaled reserves read Not read", async () => {
  test.mock.method(globalThis, "fetch", async () => json({ error: "proxy_error" }, 502));
  const answer = await sparkReserveIndicesFor([{ positionId: "p" }]);
  assert.equal(answer, null);
  assert.ok(accrueReserves(SCALED_CARD.reserves, indexMap(answer), 0).some((r) => r.debtUnread));
});
