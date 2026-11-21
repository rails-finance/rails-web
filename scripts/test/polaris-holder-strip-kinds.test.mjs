// The Polaris holder strip with the wallet's Stability Pool deposits and
// reserve loans (rails-ops TO-DO-stability-pool-deposits §1b): counted across
// kinds, each its own leg in its own token and never summed with a CDP's debt,
// and the share card's status word naming them. The adapter imports through
// `@/`, resolved here as holder-strip-moved.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
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
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { polarisHolderStrip } = await import(ROOT + "lib/polaris/holder-strip.ts");
const { polarisHolderCardModel } = await import(ROOT + "lib/polaris/share-card.ts");

const E18 = "000000000000000000";
const cdp = (cdpId, status) => ({
  market: "usdp",
  cdpId,
  status,
  coll: status === "open" ? 1 : 0,
  debt: status === "open" ? 1000 : 0,
  stableSymbol: "USDp",
  collRaw: null,
  debtRaw: null,
  peakColl: 1,
  peakDebt: 1000,
  owner: "0x1",
  liquidated: status === "liquidated",
  eventCount: 1,
  liqCount: 0,
  transferCount: 0,
  lastTs: 0,
  lastBlock: 0,
});
const board = {
  blockNumber: 1,
  chainStale: false,
  markets: [
    {
      market: "usdp",
      mcr: 1.15,
      defensiveMcr: 1.5,
      defensiveMode: false,
      interestRate: 0.03,
      price: { pethInDebt: 6000, pethUsd: 6000, curve: 2, ethUsd: 3000, xauUsd: null },
    },
  ],
};
const deposit = (market, id, status, amount) => ({
  market,
  token_id: id,
  status,
  deposit_raw: status === "open" ? `${amount}${E18}` : "0",
});
const loan = (id, status, weth) => ({
  loan_id: id,
  status,
  debt_at_index_raw: status === "open" ? `${weth}${E18}` : "0",
});

test("deposits and loans are counted beside the CDPs, each on its own leg", () => {
  const s = polarisHolderStrip([cdp("1", "open"), cdp("2", "closed")], 2, board, 20, 0, "0x1", {
    deposits: { rows: [deposit("usdp", "4", "open", 300), deposit("usdp", "5", "closed")], total: 2 },
    loans: { rows: [loan("9", "open", 2)], total: 1 },
  });
  assert.equal(
    s.countsLine,
    "This wallet holds 1 open position in the USDp market and has closed 1. It has 1 Stability Pool deposit and 1 reserve loan. It has closed 1 Stability Pool deposit.",
  );
  assert.deepEqual(
    s.legs.map((l) => [l.id, l.value]),
    [
      ["collateral", "1 pETH"],
      ["debt", "1,000 USDp"],
      ["deposit", "300 USDp"],
      ["loan-debt", "2 WETH"],
    ],
  );
  assert.deepEqual(s.kinds, [
    { id: "deposit", noun: ["deposit", "deposits"], open: 1, closed: 1 },
    { id: "loan", noun: ["loan", "loans"], open: 1, closed: 0 },
  ]);
  assert.equal(s.positions, 5);
});

test("two pools' deposits stand side by side with no total", () => {
  const s = polarisHolderStrip([], 0, board, 20, 0, "0x1", {
    deposits: { rows: [deposit("usdp", "4", "open", 300), deposit("goldp", "4", "open", 2)], total: 2 },
  });
  const leg = s.legs.find((l) => l.id === "deposit");
  assert.equal(leg.value, "300 USDp · 2 GOLDp");
  assert.equal(leg.figure, undefined);
  // No CDPs: the other kinds open the band.
  assert.equal(s.countsLine, "This wallet has 2 Stability Pool deposits.");
});

test("a kind past one page states its count and no leg", () => {
  const rows = Array.from({ length: 20 }, (_, i) => loan(String(i), "open", 1));
  const s = polarisHolderStrip([cdp("1", "open")], 1, board, 20, 0, "0x1", { loans: { rows, total: 25 } });
  assert.match(s.countsLine, /It has 25 reserve loans\.$/);
  assert.equal(
    s.legs.find((l) => l.id === "loan-debt"),
    undefined,
  );
  assert.equal(s.positions, 26);
});

test("the share card's status word names the deposits and loans", () => {
  const m = polarisHolderCardModel([cdp("1", "open"), cdp("2", "open")], 2, board, 20, "0x1…", {
    deposits: { rows: [deposit("usdp", "4", "open", 300)], total: 1 },
    loans: { rows: [loan("9", "closed")], total: 1 },
  });
  assert.equal(m.status, "2 open · 1 open deposit · 1 closed loan");
  assert.deepEqual(
    m.stats.map((x) => x.label),
    ["Total collateral", "Total debt", "Stability Pool deposit"],
  );
});
