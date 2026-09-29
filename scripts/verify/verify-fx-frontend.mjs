// Live wire + browser verification of the f(x) explorer against a dev server
// pointed at the real backend, with the chain reads the page makes.
//   BASE=http://localhost:3903 node scripts/verify/verify-fx-frontend.mjs
//
// Fixtures are positions whose history is fixed (every block below is years
// old); the head figures they check are read at run time, never pinned.
//   wsteth-249 — six rebalance hits on 3 Feb 2025, one of them (block
//                21,763,643) in a block where two transactions share log
//                indexes; per-hit figures read back from chain on 2026-09-29.
//   wsteth-137 — closed 18 Jan 2025, funded again 20 Jan, liquidated 3 Feb.
//   wbtc-484   — a 279,215.683 fxUSD debt cut by seven pool-wide rebalances.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3903";
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path);
    if (r.ok) return r.json();
    await wait(2500 * (i + 1));
  }
  throw new Error(`${path} did not answer`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const W = (s) => Number(s) / 1e18;

// ── X2(a): six rebalance rows on wsteth-249, the 21,763,643 hit included ────
const tl249 = await json("/api/fx/position/wsteth/249/timeline");
const reb249 = tl249.events.filter((e) => e.context.data.eventType === "tickRebalance");
check(
  "wsteth-249 carries six rebalance rows",
  reb249.length === 6,
  `${reb249.length} rows at ${reb249.map((e) => e.blockNumber).join(", ")}`,
);
check(
  "the hit at block 21,763,643 (tick 5135) is on the timeline",
  reb249.some((e) => e.blockNumber === 21763643 && e.context.data.rebalancedTick === 5135),
);

// ── X3 / X8: per-hit figures against the chain reads of 2026-09-29 ──────────
// block: [coll before, coll after, debt before, debt after, ratio before, ratio after]
const KEY = {
  21763346: [1.747836, 1.304819, 3955.557, 2873.818, 0.904, 0.88],
  21763553: [1.304819, 1.285516, 2875.835, 2828.744, null, null],
  21763643: [1.285516, 1.169791, 2828.759, 2549.175, null, 0.88],
  21763673: [1.169791, 1.105043, 2549.175, 2393.729, null, 0.879],
  21763679: [1.105043, 1.077919, 2393.729, 2328.764, null, 0.877],
  21763753: [1.077919, 1.042631, 2328.764, 2244.544, null, 0.879],
};
let sumDebt = 0;
for (const [block, k] of Object.entries(KEY)) {
  const st = await json(`/api/chain/fx/event-state?pool=wsteth&id=249&blocks=${block}`);
  const b = st.reads[String(Number(block) - 1)];
  const a = st.reads[block];
  const ok =
    near(W(b.colls), k[0], 0.00001) &&
    near(W(a.colls), k[1], 0.00001) &&
    near(W(b.debts), k[2], 0.01) &&
    near(W(a.debts), k[3], 0.01) &&
    (k[4] == null || near(W(b.ratio), k[4], 0.001)) &&
    (k[5] == null || near(W(a.ratio), k[5], 0.001));
  sumDebt += W(b.debts) - W(a.debts);
  check(
    `rebalance at ${block}: before → after matches the chain read`,
    ok,
    `${W(b.colls).toFixed(6)} → ${W(a.colls).toFixed(6)} stETH, ${W(b.debts).toFixed(3)} → ${W(a.debts).toFixed(3)} fxUSD, ratio ${(W(b.ratio) * 100).toFixed(1)}% → ${(W(a.ratio) * 100).toFixed(1)}%`,
  );
  await wait(300);
}
check("the six hits cleared 1,713.04 fxUSD", near(sumDebt, 1713.044, 0.01), sumDebt.toFixed(3));

// ── X2(b): wbtc-484's pool-wide rebalances add up to its whole debt gap ────
const tl484 = await json("/api/fx/position/wbtc/484/timeline");
const reb484 = tl484.events.filter((e) => e.context.data.eventType === "tickRebalance");
check(
  "wbtc-484 carries its pool-wide rebalance rows",
  reb484.length === 7 && reb484.every((e) => e.context.data.poolWide === true),
  `${reb484.length} rows`,
);
check(
  "WBTC rebalance collateral is in 8-decimal WBTC",
  reb484.every((e) => Number(e.context.data.tickRebColls) > 0.01 && Number(e.context.data.tickRebColls) < 100),
  reb484.map((e) => e.context.data.tickRebColls).join(", "),
);
const blocks484 = [...new Set(reb484.map((e) => e.blockNumber))];
const st484 = await json(`/api/chain/fx/event-state?pool=wbtc&id=484&blocks=${blocks484.join(",")}`);
const cut484 = blocks484.reduce((s, b) => s + W(st484.reads[String(b - 1)].debts) - W(st484.reads[String(b)].debts), 0);
check("the pool-wide hits cleared 279,215.683 fxUSD", near(cut484, 279215.683, 0.01), cut484.toFixed(3));

// ── X1: wsteth-137's liquidation, in wstETH, adds up ────────────────────────
const tl137 = await json("/api/fx/position/wsteth/137/timeline");
const liq = tl137.events.find((e) => e.context.data.eventType === "liquidation");
const flow = liq.flows.find((f) => f.direction === "out");
check("the liquidation flow names wstETH", flow?.tokenSymbol === "wstETH", flow?.tokenSymbol);
const st137 = await json(`/api/chain/fx/event-state?pool=wsteth&id=137&blocks=${liq.blockNumber}`);
const rate = W(st137.reads[String(liq.blockNumber)].rate);
const lost = W(st137.reads[String(liq.blockNumber - 1)].colls) - W(st137.reads[String(liq.blockNumber)].colls);
const sent = Number(liq.context.data.liqColls) * rate;
const kept = lost - sent;
// The keeper's bonus is at most 4% of what it took; the protocol keeps 10% of it.
check(
  "0.1268 wstETH to the liquidator plus the protocol's share is the 0.1518 stETH the position lost",
  near(lost, 0.151773, 0.000001) && near(sent, 0.15119, 0.00001) && kept > 0 && kept <= lost * 0.04 * 0.1 * 1.01,
  `lost ${lost.toFixed(6)}, to the liquidator ${sent.toFixed(6)} stETH, kept ${kept.toFixed(6)} stETH, expense ${st137.expenseRatio}`,
);
const loans = tl137.events.filter((e) => e.context.data.reopens);
check("the 20 Jan 2025 deposit opens loan 2", loans.length === 1 && loans[0].context.data.loanNumber === 2);

// ── the pool's terms (X4 lines, X11 gate) ───────────────────────────────────
const terms = await json("/api/chain/fx/terms?pool=wsteth");

// ── browser ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
async function openAndRead(path) {
  const pg = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e)));
  await pg.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await pg.waitForTimeout(9000);
  for (let round = 0; round < 3; round++) {
    for (const h of await pg.$$('[role="button"]:not([data-v])')) {
      try {
        const cls = (await h.getAttribute("class")) ?? "";
        if (!/group\/evt|cursor-pointer/.test(cls)) continue;
        await h.evaluate((el) => el.setAttribute("data-v", "1"));
        await h.click({ timeout: 800 });
        await pg.waitForTimeout(200);
      } catch {}
    }
    for (const b of await pg.$$('button[aria-expanded="false"]:not([data-v])')) {
      try {
        await b.evaluate((el) => el.setAttribute("data-v", "1"));
        await b.click({ timeout: 800 });
        await pg.waitForTimeout(120);
      } catch {}
    }
    await pg.waitForTimeout(4000);
  }
  await pg.waitForTimeout(5000);
  const text = await pg.evaluate(() => document.body.innerText);
  await pg.close();
  return { text, errors };
}

const p249 = await openAndRead("/ethereum/fx/wsteth-249");
check("249: no page errors", p249.errors.length === 0, p249.errors.slice(0, 2).join(" | "));
check("249: the run row says what it holds", /6 tick rebalances/.test(p249.text));
check(
  "249: rebalance rows state this position's change",
  (p249.text.match(/This position · debt\n/g) ?? []).length === 6,
  `${(p249.text.match(/This position · debt\n/g) ?? []).length}`,
);
check(
  "249: the first hit's prose states 3,955.557 → 2,873.818 fxUSD and 90.4% → 88.0%",
  /debt went\s+from 3,955\.557 to 2,873\.818 fxUSD[\s\S]{0,120}90\.4% to 88\.0%/.test(p249.text),
);
check(
  "249: the card names the lines and the trigger price",
  new RegExp(
    `rebalancing from ${Math.round(terms.rebalanceRatio * 100)}%, liquidation from ${Math.round(terms.liquidateRatio * 100)}%`,
  ).test(p249.text) && /reaches 88% if the anchor price falls to \$[\d,]+ \(−\d+\.\d%\)/.test(p249.text),
);
check(
  "249: the USD figure and the ratio name their prices",
  /at the min price \$[\d,]+/.test(p249.text) && /at the anchor price \$[\d,]+ per stETH/.test(p249.text),
);
check(
  "249: the debt line splits rebalances from other positions' bad debt",
  /1,713\.04\d? fxUSD cleared by rebalances without the owner's transaction \(3 Feb 2025\) · \+5\.7\d+ fxUSD of other positions' bad debt/.test(
    p249.text,
  ),
);
check("249: 'socialized' is gone from the card and rows", !/socializ/i.test(p249.text.split("LIFETIME FLOWS")[0]));
check(
  "249: the open row states the wstETH→stETH rate (1.467 × 1.192 = 1.748)",
  /1\.467 wstETH deposited is 1\.748 stETH at this block’s rate of 1\.1920/.test(p249.text),
);
check("249: a 2026 deposit states the router's 0.3% fee", /0\.3% of the deposit \(0\.001 wstETH\)/.test(p249.text));

const p137 = await openAndRead("/ethereum/fx/wsteth-137");
check("137: no page errors", p137.errors.length === 0, p137.errors.slice(0, 2).join(" | "));
check(
  "137: the liquidation says wstETH to the keeper, its stETH worth and the protocol's share",
  /received 0\.127 wstETH \(0\.151 stETH at this block’s rate\)/.test(p137.text) &&
    /The protocol kept 0\.000583 stETH, its 10% share of the liquidation bonus/.test(p137.text),
);
check("137: the unpaid 1.234 fxUSD is named", /did not cover the last 1\.234 fxUSD of debt/.test(p137.text));
check("137: the reopened row says so", /Opened again/.test(p137.text) && /Loan 2 of 2/.test(p137.text));
check("137: 'seizure is quoted' copy is gone", !/quoted in the pool/.test(p137.text));

const pPools = await openAndRead("/ethereum/fx/pools");
check(
  "pools: redemption state follows isRedeemAllowed",
  terms.redeemAllowed
    ? /redemption open/.test(pPools.text)
    : /redemption closed: it opens only while fxUSD trades below its peg/.test(pPools.text),
);
check("pools: shorts are named as not covered", /short positions sit on a separate manager/.test(pPools.text));
check(
  "pools: default fees are stated",
  pPools.text.includes(
    `borrow ${(terms.fees.borrow * 100).toFixed(1)}% · repay ${(terms.fees.repay * 100).toFixed(1)}%`,
  ),
);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (pass === 0) process.exit(2);
process.exit(fail ? 1 : 0);
