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
//   wbtc-484   — a 279,215.683 fxUSD debt cut by seven pool-wide rebalances;
//                a borrow on 6 Feb 2026 filled from a limit order the holder
//                signed (tx 0x901105d7…, sent by 0xaf13…dc06).
//   wsteth-154 — its last 287.88 fxUSD written off by a pool-wide Liquidate on
//                19 Mar 2025 (block 22,081,083; mig 369 on the server).
//   wsteth-177 — redemptions in March 2025 took 17,745.93 fxUSD of its debt.
//   wsteth-243 — liquidated three times on 3 Feb 2025, the last a call that
//                took nothing (block 21,763,933); 87 rebalance and 3
//                redemption blocks whose collateral, at the min price of the
//                block before each, was worth $6,070.49 for 5,923.998 fxUSD
//                (scripts/verify-fx-chain.mjs, round 3).

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
  ).test(p249.text) &&
    /88% if the min price falls to \$[\d,]+ \(−\d+\.\d%\), 95% at \$[\d,]+ \(−\d+\.\d%\)/.test(p249.text),
);
check(
  "249: the USD figure and the ratio name their prices",
  /at the min price \$[\d,]+/.test(p249.text) && /at the anchor price \$[\d,]+ per stETH/.test(p249.text),
);
check(
  "249: the debt line splits rebalances from other positions' bad debt",
  /moved by the pool: 1,713\.04\d? fxUSD cleared by rebalances \(3 Feb 2025\) and \+5\.7\d+ fxUSD of other positions' bad debt/.test(
    p249.text,
  ),
);
check("249: 'socialized' is gone from the card and rows", !/socializ/i.test(p249.text.split("LIFETIME FLOWS")[0]));
check(
  "249: the open row states the wstETH→stETH rate (1.467 × 1.192 = 1.748)",
  /1\.467 wstETH deposited is 1\.748 stETH at this block’s rate of 1\.1920/.test(p249.text),
);
check("249: a 2026 deposit states the router's 0.3% fee", /0\.3% of the deposit \(0\.001 wstETH\)/.test(p249.text));

// ── round 2: one price on the card, the position's own figures first ────────
const p484 = await openAndRead("/ethereum/fx/wbtc-484");
check("484: no page errors", p484.errors.length === 0, p484.errors.slice(0, 2).join(" | "));
{
  const m = p484.text.match(/([\d.]+) WBTC\n\$([\d,]+) at the anchor price/);
  const a = p484.text.match(/at the anchor price \$([\d,]+) per WBTC · settled @/);
  const usd = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const anchor = a ? Number(a[1].replace(/,/g, "")) : NaN;
  check(
    "484: the collateral's USD is at the settled block's anchor price, the ratio's price",
    m != null && a != null && near(usd / anchor, Number(m[1]), 0.001),
    `${m?.[2]} ÷ ${a?.[1]} vs ${m?.[1]}`,
  );
}
check(
  "484: the min price is named where the lines are judged",
  /[\d.]+% at the min price \$[\d,]+, the price the pool's lines are judged at/.test(p484.text),
);
check(
  "484: the rebalance and liquidation prices with their falls",
  /88% if the min price falls to \$[\d,]+ \(−\d+\.\d%\), 95% at \$[\d,]+ \(−\d+\.\d%\)/.test(p484.text),
);
check(
  "484: funding apart from the rebalances",
  /rebalances took 3\.545 WBTC and funding took 0\.2\d+ WBTC/.test(p484.text),
);
check(
  "484: yearly funding in the card's explanation",
  /takes about [\d.]+ WBTC a year from this collateral/.test(p484.text),
);
check(
  "484: the run header states this position's total",
  /7 pool-wide rebalances\nThis position lost\n3\.54\d*\nDebt repaid\n279K/.test(p484.text),
);
check(
  "484: the 6 Feb borrow names the limit order and who held the NFT",
  /0xaf13…dc06 sent this transaction to fill a limit order the holder \(0x860e…e5c5\) had signed/.test(p484.text),
);
check(
  "484: a router row names its schedule and the default",
  /0x3363…c708\), on the schedule the pool sets for that caller: 0\.3% of the deposit/.test(p484.text) &&
    /The pool’s default at this block charges 0\.8% of a borrow and 0\.2% of a repayment/.test(p484.text),
);
check(
  "484: the owner's own repay is on the default schedule",
  /the owner's address \(0x860e…e5c5\), which sent the transaction, on the pool's default schedule: 0\.2% of the repayment/.test(
    p484.text,
  ),
);
check(
  "484: a rebalance row states the min-price judgement",
  /The pool judged the tick at the oracle’s min price, \$79,675 at the block before/.test(p484.text),
);

// ── Y10: the pool-wide Liquidate names twelve positions ─────────────────────
{
  const named = [154, 308, 302, 215, 116, 294, 159, 143, 174, 169, 209, 136];
  const got = [];
  for (const id of named) {
    const tl = await json(`/api/fx/position/wsteth/${id}/timeline`);
    const rows = tl.events.filter((e) => e.context.data.eventType === "liquidation" && e.context.data.poolWide);
    if (rows.length === 1 && rows[0].context.data.emptiesPosition) got.push(id);
  }
  check("the pool-wide Liquidate is a row on its twelve positions", got.length === 12, got.join(","));
}
const p154 = await openAndRead("/ethereum/fx/wsteth-154");
check("154: no page errors", p154.errors.length === 0, p154.errors.slice(0, 2).join(" | "));
check(
  "154: the 19 Mar 2025 pool-wide liquidation wrote off 287.882 fxUSD",
  /Pool-wide liquidation · liquidated this position's tick/.test(p154.text) &&
    /debt went from 287\.882 to 0 fxUSD/.test(p154.text),
);
check("154: counted among its liquidations; the call that took nothing is not", /Liquidated 3 times/.test(p154.text));
check(
  "154 r3: the pool-wide row says the debt was written off onto the debt index",
  /debt written off/.test(p154.text) &&
    /Its keeper repaid 0\.028 fxUSD across the whole pool, and this position’s debt fell by 287\.882 fxUSD[\s\S]{0,160}through its debt index/.test(
      p154.text,
    ),
);
check(
  "154 r3: the card names each part moved by the pool",
  /22,667\.08\d fxUSD cleared by rebalances \(2 Feb 2025 – 3 Feb 2025\), 287\.882 fxUSD by a pool-wide liquidation that repaid 0\.028 fxUSD across the pool and wrote off the rest \(19 Mar 2025\) and \+1\.88\d fxUSD of other positions' bad debt/.test(
    p154.text,
  ),
);
check(
  "154 r3: the empty liquidation keeps its row and says so",
  /reached position #154 with nothing left to take/.test(p154.text) &&
    /Its debt of 287\.882 fxUSD stayed/.test(p154.text),
);
check("154 r3: dust after the first liquidation reads 'dust left'", /dust left/.test(p154.text));

// ── round 3: wsteth-243 ─────────────────────────────────────────────────────
const p243 = await openAndRead("/ethereum/fx/wsteth-243");
check("243: no page errors", p243.errors.length === 0, p243.errors.slice(0, 2).join(" | "));
check(
  "243 r3: two liquidations counted, the rule in the tip",
  /Liquidated 2 times\. Counts the liquidations that took collateral or repaid debt/.test(p243.text),
);
check(
  "243 r3: the 05:36 call is a row that found nothing",
  /reached position #243 with nothing left to take/.test(p243.text),
);
check(
  "243 r3: the card's debt line names each part",
  /moved by the pool: 5,568\.94\d fxUSD cleared by rebalances \(3 Feb 2025 – 22 Jun 2025\), 355\.05\d fxUSD by redemptions \(28 Mar 2025\), 5\.54\d fxUSD written off at this position's liquidation and \+0\.16\d fxUSD of other positions' bad debt/.test(
    p243.text,
  ),
);
check(
  "243 r3: the bonus the owner paid (chain: $6,070.49 − 5,923.998 = $146.49, 2.41%)",
  /Rebalances and redemptions took 3\.06\d stETH of collateral for 5,923\.99\d fxUSD of debt[\s\S]{0,200}worth \$6,070: \$146 more[\s\S]{0,160}2\.4% of the collateral taken/.test(
    p243.text,
  ),
);
check("243 r3: the flows segment has the card's name", /Moved by the pool\n/.test(p243.text));
check(
  "243 r3: same-block rebalances state the change once",
  /both rebalances in this block/.test(p243.text) && /included above/.test(p243.text),
);
check("243 r3: dust after liquidation 1", /dust left/.test(p243.text));
check("243 r3: the card names the position's tick", /in tick #\d+ · find it on the pools page/.test(p243.text));
check("243 r3: pool figures carry their scope word", /Pool cleared/.test(p243.text) && /Tick cleared/.test(p243.text));

// ── round 3: listing price, path, pools highlight ───────────────────────────
const pList = await openAndRead("/ethereum/fx");
check(
  "listing r3: rows value collateral at the anchor price, block named",
  /at the anchor price \$[\d,]+ · oracle @/.test(pList.text) && /stETH \$[\d,]+ anchor @ [\d,]+/.test(pList.text),
);
{
  const r = await fetch(BASE + "/ethereum/fx/positions/wsteth-243", { redirect: "manual" });
  check(
    "r3: /ethereum/fx/positions/<slug> redirects to the position",
    r.status >= 300 && r.status < 400 && /\/ethereum\/fx\/wsteth-243$/.test(r.headers.get("location") ?? ""),
    `${r.status} ${r.headers.get("location")}`,
  );
}
{
  const tl = await json("/api/fx/position/wsteth/177/timeline");
  const red = tl.events.filter((e) => e.context.data.redemption);
  check("177: the March 2025 redemptions are rows", red.length === 3, `${red.length}`);
}

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
{
  const pg = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await pg.goto(BASE + "/ethereum/fx/pools?pool=wsteth&tick=4718", { waitUntil: "networkidle", timeout: 120000 });
  await pg.waitForTimeout(3000);
  const t = await pg
    .locator("#tick-wsteth-4718")
    .innerText()
    .catch(() => "");
  check("pools r3: a linked tick is marked", /the position’s tick/.test(t), t.split("\n").join(" "));
  await pg.close();
}
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
