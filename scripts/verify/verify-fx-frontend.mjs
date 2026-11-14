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
import { openPositionCards } from "./lib/position-card.mjs";
import { openGroup } from "./lib/group-rows.mjs";
import { openCardOnFigures } from "./lib/card-tabs.mjs";

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
// The keeper's bounty is at most 4% of what it took; the protocol keeps 10% of it.
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
// A page as a reader opens it: the card open, its "Collateral moved by the
// pool" tip read first (ui-jobs 381), then every run group opened (ui-jobs 372:
// a closed group draws no member rows) and every row opened. `closed` is the
// text before the groups open (a run's header); `text` is the visible text and
// then the whole text, so a card's Explanation reads while its Figures tab
// shows. With `figures`, the Liquidated rows switch to Figures, whose ratio
// cell reads "dust left".
async function openAndRead(path, { figures = false } = {}) {
  const pg = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e)));
  await pg.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForTimeout(9000);
  // The position card draws closed (ui-jobs 209): open it first.
  await openPositionCards(pg);
  // "Collateral moved by the pool" states one figure; the parts behind it are
  // the sentence in the row's tip (ui-jobs 381), read by opening it.
  const moved = { total: null, parts: "" };
  const row = pg.locator('[data-panel-row="collateral-moved"]').first();
  if (await row.count()) {
    moved.total = ((await row.locator("dd").textContent()) ?? "").trim();
    for (let i = 0; i < 4 && !moved.parts; i++) {
      try {
        await row.locator("[data-heading-tip]").first().click({ timeout: 3000 });
        await pg.waitForSelector("[data-collateral-moved-parts]", { timeout: 3000 });
        moved.parts = ((await pg.locator("[data-collateral-moved-parts]").first().textContent()) ?? "")
          .replace(/\s+/g, " ")
          .trim();
      } catch {
        await pg.waitForTimeout(1500);
      }
    }
    await pg.keyboard.press("Escape");
  }
  const closed = await pg.evaluate(() => document.body.innerText);
  for (let i = 0; i < 40; i++) {
    const frame = pg.locator('[data-group-frame="closed"]').first();
    if (!(await frame.count()) || !(await openGroup(pg, frame))) break;
  }
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
  // The whole text without the scripts: the page's data payload names fields
  // ("socializedDebt") that no reader sees.
  const whole = () =>
    pg.evaluate(() => {
      const body = document.body.cloneNode(true);
      for (const s of body.querySelectorAll("script, style")) s.remove();
      return body.textContent;
    });
  let text = `${await pg.evaluate(() => document.body.innerText)}\n${await whole()}`;
  await pg.close();
  // On a page whose rows were all pressed open, a card's tab strip no longer
  // takes a press ("stuck"), so the Figures read is a fresh page's.
  const figs = [];
  if (figures) {
    const fp = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await fp.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 180000 });
    await fp.waitForTimeout(9000);
    const rows = fp.locator("[data-event-id]").filter({ hasText: "Liquidated" });
    for (let i = 0; i < (await rows.count()); i++) {
      figs.push(await openCardOnFigures(rows.nth(i)));
      text += `\n${(await rows.nth(i).textContent()) ?? ""}`;
    }
    await fp.close();
  }
  return { text, closed, errors, moved, figs };
}

const p249 = await openAndRead("/ethereum/fx/wsteth-249");
check("249: no page errors", p249.errors.length === 0, p249.errors.slice(0, 2).join(" | "));
check("249: the run row says what it holds", /6 tick rebalances/.test(p249.closed));
// Each member row's Explanation states this position's own change.
const own249 =
  p249.text.match(/This position’s debt went from [\d,.]+ to [\d,.]+ fxUSD and its collateral from/g) ?? [];
check("249: rebalance rows state this position's change", new Set(own249).size === 6, `${new Set(own249).size}`);
check(
  "249: the first hit's prose states 3,955.557 → 2,873.818 fxUSD and 90.4% → 88.0%",
  /debt went\s+from 3,955\.557 to 2,873\.818 fxUSD[\s\S]{0,120}90\.4% to 88\.0%/.test(p249.text),
);
// The lines and the prices they trigger at, in the card's Explanation.
const linesRe = (re, li) =>
  new RegExp(
    `Rebalancing starts at ${re}% and liquidation at ${li}%\\. With today’s collateral and debt the position reaches ${re}% if the min price falls to \\$[\\d,]+, \\d+\\.\\d% below now, and ${li}% at \\$[\\d,]+, \\d+\\.\\d% below`,
  );
const LINES = linesRe(Math.round(terms.rebalanceRatio * 100), Math.round(terms.liquidateRatio * 100));
check("249: the card names the lines and the trigger price", LINES.test(p249.text));
check(
  "249: the USD figure and the ratio name their prices",
  /The pool judges its lines at the oracle’s min price, \$[\d,]+/.test(p249.text) &&
    /At the oracle’s anchor price, \$[\d,]+ per stETH/.test(p249.text),
);
check(
  "249: the debt line splits rebalances from other positions' bad debt",
  /1\.7K\s*cleared by rebalances \(3 Feb 2025\) and\s*\+5\.7\d*\s*of other positions' bad debt/.test(p249.text) &&
    /rebalances cleared 1,713\.04\d? fxUSD and other positions’ bad debt added 5\.7\d+/.test(p249.text),
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
  // The card's collateral (full figure, then USD) against the Explanation's
  // anchor price.
  const m = p484.text.match(/\n([\d.]+) WBTC\n\$([\d,.]+)\n/);
  const a = p484.text.match(/At the oracle’s anchor price, \$([\d,]+) per WBTC/);
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
  /The pool judges its lines at the oracle’s min price, \$[\d,]+, where the ratio is [\d.]+%/.test(p484.text),
);
check("484: the rebalance and liquidation prices with their falls", LINES.test(p484.text));
check(
  "484: funding apart from the rebalances, in the collateral row's tip",
  /Rebalances took 3\.5\d* WBTC and funding took 0\.\d+ WBTC/.test(p484.moved.parts),
  p484.moved.parts,
);
{
  // The Explanation states the yearly funding only while the pool charges it
  // (`terms.fundingRatio`, 0 on both pools on 6 Nov 2026).
  const wbtc = await json("/api/chain/fx/terms?pool=wbtc");
  const said = /takes about [\d.]+ WBTC a year from this collateral/.test(p484.text);
  check(
    "484: yearly funding in the card's explanation while the pool charges it",
    wbtc.fundingRatio > 0 ? said : !said,
    `fundingRatio ${wbtc.fundingRatio}, stated ${said}`,
  );
}
check(
  "484: the run header states this position's total",
  /279K\n3\.54\d*\n7 pool-wide rebalances/.test(p484.closed),
  (p484.closed.match(/.*\n.*\n7 pool-wide rebalances/) ?? [""])[0].replace(/\n/g, " | "),
);
check(
  "484: the 6 Feb borrow names the limit order and who held the NFT",
  /0xaf13…dc06 sent this transaction to fill a limit order the holder at the time \(0x860e…e5c5\) had signed/.test(
    p484.text,
  ),
);
check(
  "484: a router row names its schedule and the default",
  /the f\(x\) router \(0x3363…c708\)[^.]*, on the schedule the pool sets for that caller \(0\.3% of a deposit[^)]*\): 0\.3% of the deposit/.test(
    p484.text,
  ) &&
    /The pool’s default at this block charges 0\.\d% of a borrow, 0\.2% of a repayment and nothing on a deposit or a withdrawal/.test(
      p484.text,
    ),
);
check(
  "484: the owner's own repay is on the default schedule",
  /the holder at the time \(0x860e…e5c5\), who sent the transaction, on the pool's default schedule \([^)]*\): 0\.2% of the repayment/.test(
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
const p154 = await openAndRead("/ethereum/fx/wsteth-154", { figures: true });
check("154: no page errors", p154.errors.length === 0, p154.errors.slice(0, 2).join(" | "));
check(
  "154: the 19 Mar 2025 pool-wide liquidation wrote off 287.882 fxUSD",
  /Liquidated · Debt written off, 19 Mar 2025/.test(p154.text) &&
    /ran a liquidation of the wstETH pool from its top tick down, including tick #\d+ where this position’s shares sat/.test(
      p154.text,
    ) &&
    /debt went from 287\.882 to 0 fxUSD/.test(p154.text),
);
check("154: counted among its liquidations; the call that took nothing is not", /Liquidated 3 times/.test(p154.text));
check(
  "154 r3: the pool-wide row says the debt was written off onto the debt index",
  /debt written off/i.test(p154.text) &&
    /Its keeper repaid 0\.028 fxUSD across the whole pool, and this position’s debt fell by 287\.882 fxUSD[\s\S]{0,160}through its debt index/.test(
      p154.text,
    ),
);
check(
  "154 r3: the card names each part moved by the pool",
  /22\.7K cleared by rebalances \(2 Feb 2025 – 3 Feb 2025\), 287\.88 by a pool-wide liquidation that repaid 0\.03\s*across the pool and wrote off the rest \(19 Mar 2025\) and \+1\.88 of other positions' bad debt/.test(
    p154.text,
  ) &&
    /rebalances cleared 22,667\.08\d fxUSD, a pool-wide liquidation 287\.882, of which its keeper repaid at most 0\.028 across the pool and the rest was written off and other positions’ bad debt added 1\.88\d/.test(
      p154.text,
    ),
);
check(
  "154 r3: the empty liquidation keeps its row and says so",
  /reached position #154 with nothing left to take/.test(p154.text) &&
    /Its debt of 287\.882 fxUSD stayed/.test(p154.text),
);
check("154 r3: dust after the first liquidation reads 'dust left'", /dust left/.test(p154.text), p154.figs.join(","));

// ── round 3: wsteth-243 ─────────────────────────────────────────────────────
const p243 = await openAndRead("/ethereum/fx/wsteth-243", { figures: true });
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
  /rebalances cleared 5,568\.94\d fxUSD, redemptions 355\.05\d, 5\.54\d was written off at its liquidation and other positions’ bad debt added 0\.16\d/.test(
    p243.text,
  ),
);
check(
  "243 r3: what the owner paid (chain: $6,070.49 − 5,923.998 = $146.49), the 2.5% bounty over the rebalanced debt named apart",
  /Rebalances and redemptions took 3\.06\d stETH of collateral for 5,923\.99\d fxUSD of debt[\s\S]{0,200}worth \$6,070: \$146 more[\s\S]{0,160}The pool’s 2\.5% bounty over the debt repaid comes to \$\d+/.test(
    p243.text,
  ),
);
// The Lifetime flows panel names each part the card's debt line names; its
// how-to-read carries the segment names.
check(
  "243 r3: the flows segments have the card's names",
  /cleared debt \(Cleared by rebalances\)/.test(p243.text) && /cleared debt \(Cleared by redemptions\)/.test(p243.text),
);
check(
  "243 r3: same-block rebalances state the change once",
  /both in this block/.test(p243.text) && /included above/.test(p243.text),
);
check("243 r3: dust after liquidation 1", /dust left/.test(p243.text), p243.figs.join(","));
check("243 r3: the card names the position's tick", /Tick #\d+ · find it on the pool page/.test(p243.text));
// The head is words (decision 0045): a tick's or the pool's totals are in the
// Explanation, none on the row.
check(
  "243 r3: rebalance rows read Rebalanced, no tick or pool total in the head",
  /Rebalanced/.test(p243.text) && !/Pool cleared|Tick cleared/.test(p243.text),
);

// ── round 3: listing price, path, pools highlight ───────────────────────────
const pList = await openAndRead("/ethereum/fx");
{
  // The pool header names its anchor price and block; a row's USD is its
  // collateral at that price.
  const anchors = Object.fromEntries(
    [...pList.text.matchAll(/(stETH|WBTC) \$([\d,]+) anchor @ [\d,]+/g)].map((m) => [
      m[1],
      Number(m[2].replace(/,/g, "")),
    ]),
  );
  const rows = [...pList.text.matchAll(/\n([\d.]+) (WBTC|stETH)\n\$([\d,.]+)\n/g)].slice(0, 6);
  const off = rows.filter((m) => {
    const px = anchors[m[2]];
    const usd = Number(m[3].replace(/,/g, ""));
    return !(px > 0) || Math.abs(Number(m[1]) * px - usd) > Math.max(0.01, usd * 0.0005);
  });
  check(
    "listing r3: rows value collateral at the anchor price, block named",
    anchors.stETH > 0 && anchors.WBTC > 0 && rows.length > 0 && off.length === 0,
    `anchors ${JSON.stringify(anchors)}; ${rows.length} rows, off: ${off.map((m) => `${m[1]} ${m[2]} $${m[3]}`).join("; ")}`,
  );
}
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
    /The protocol kept 0\.000583 stETH, its 10% share of the liquidation bounty/.test(p137.text),
);
check("137: the unpaid 1.234 fxUSD is named", /did not cover the last 1\.234 fxUSD of debt/.test(p137.text));
check("137: the reopened row says so", /Reopened position/.test(p137.text) && /Loan 2 of 2/.test(p137.text));
check("137: 'seizure is quoted' copy is gone", !/quoted in the pool/.test(p137.text));

// The pools roster (A1) and a pool's page (A2), ui-jobs 549/550.
const pPools = await openAndRead("/ethereum/fx/pools");
const pPool = await openAndRead("/ethereum/fx/pools/wsteth");
check(
  "pools: redemption state follows isRedeemAllowed, on the roster and the pool page",
  [pPools.text, pPool.text].every((t) =>
    terms.redeemAllowed
      ? /Redemption open/.test(t)
      : /Redemption closed: it opens only while fxUSD trades below its peg/.test(t),
  ),
);
check(
  "pools: each head opens its pool's page",
  /View wstETH pool/.test(pPools.text) && /View WBTC pool/.test(pPools.text),
);
check(
  "pool page: the reconcile card says it in words, the raw share totals in its receipt",
  /Reconciles: every debt share sits in one tick\./.test(pPool.text) && !/\d{20,}/.test(pPool.text),
);
check(
  "pool page: no contract or feed names on the surface",
  !/Chainlink|AaveFundingPool|getPrice|tickBitmap/.test(pPool.text),
);
{
  // wsteth-243's tick as its card states it today; a rebalance of the tick
  // moves the position to another one.
  const tick243 = p243.text.match(/Tick #(\d+) · find it on the pool page/)?.[1];
  check("pools r3: wsteth-243's card names its tick", tick243 != null);
  const pg = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await pg.goto(BASE + `/ethereum/fx/pools/wsteth?tick=${tick243}`, { waitUntil: "networkidle", timeout: 120000 });
  await pg.waitForTimeout(3000);
  const t = await pg
    .locator(`#tick-wsteth-${tick243}`)
    .innerText()
    .catch(() => "");
  check("pools r3: a linked tick is marked", /the position’s tick/.test(t), t.split("\n").join(" "));
  // A link from before the pool pages opens the pool's page at the tick.
  await pg.goto(BASE + `/ethereum/fx/pools?pool=wsteth&tick=${tick243}`, { waitUntil: "networkidle", timeout: 120000 });
  await pg.waitForTimeout(3000);
  check(
    "pools r3: an old ?pool=&tick= link opens the pool's page",
    new URL(pg.url()).pathname === "/ethereum/fx/pools/wsteth",
    pg.url(),
  );
  await pg.close();
}
{
  const info = await openAndRead("/ethereum/fx/info");
  check("info: shorts are named as not covered", /short positions live in a separate part/.test(info.text));
  check(
    "info: How Rails reads it names the pools and the oracle",
    /How Rails reads it/.test(info.text) && /Each pool’s price oracle|Each pool's price oracle/.test(info.text),
  );
}
check(
  "pool page: default fees are stated",
  pPool.text.includes(
    `borrow ${(terms.fees.borrow * 100).toFixed(1)}% · repay ${(terms.fees.repay * 100).toFixed(1)}%`,
  ),
);

// ── round 4: wsteth-1801 (ownership transfer) and wsteth-1 (closed twice) ───
{
  const tl = await json("/api/fx/position/wsteth/1801/timeline");
  const ops = tl.events.filter((e) => e.context.data.eventType === "operate");
  const opBlocks = ops.map((e) => e.blockNumber);
  const st = await json(`/api/chain/fx/event-state?pool=wsteth&id=1801&blocks=${opBlocks.join(",")}`);
  let inTx = 0;
  let deposited = 0;
  for (const e of ops) {
    const b = st.reads[String(e.blockNumber - 1)];
    const a = st.reads[String(e.blockNumber)];
    const rate = W(a.rate);
    const moved = Number(e.context.data.collDelta) * rate;
    deposited += moved;
    inTx += W(b.colls) - W(a.colls) + moved;
  }
  const drift = await json("/api/fx/position/wsteth/1801/drift");
  const between = -drift.intervals.reduce((t, iv) => t + iv.collsDrift, 0);
  const settled = tl.position.settled.colls;
  check(
    "1801 r4 P1: funding inside the transactions plus the stretches is the whole collateral gap (chain, block − 1 reads)",
    near(deposited - settled, between + inTx, 1e-6) && near(inTx, 0.0153, 0.0002),
    `deposited-net ${deposited.toFixed(6)} − settled ${settled.toFixed(6)} = ${(deposited - settled).toFixed(6)}; between ${between.toFixed(6)} + inside ${inTx.toFixed(6)}`,
  );
  // The 21 Sep borrow, block 26,025,274 (the position closed at 26,204,855).
  const last = ops.find((e) => e.blockNumber === 26025274);
  const sb = st.reads[String(last.blockNumber - 1)];
  const sa = st.reads[String(last.blockNumber)];
  check(
    "1801 r4 P1: the 21 Sep borrow moves collateral 99.815 → 99.808 (funding booked in the transaction)",
    near(W(sb.colls), 99.8148, 0.0002) && near(W(sa.colls), 99.8075, 0.0002),
    `${W(sb.colls).toFixed(4)} → ${W(sa.colls).toFixed(4)}`,
  );
  const fee = await json(
    `/api/chain/fx/event-state?pool=wsteth&id=1801&blocks=${last.blockNumber}&tx=${last.id.split(":")[0]}`,
  );
  check(
    "1801 r4 P3: the caller is 0xb753…067e on the pool's default schedule (0 on a deposit)",
    fee.fees?.caller === "0xb753366082466c4b5984312f0c4bb97554be067e" &&
      fee.fees.custom === false &&
      fee.fees.supply === 0 &&
      near(fee.fees.borrow, 0.005, 1e-9),
    JSON.stringify(fee.fees),
  );
  // The position closed at block 26,204,855: its tick is read at the block before.
  const tk = await json(`/api/chain/fx/event-state?pool=wsteth&id=1801&blocks=26204854&prices=1&tick=1`);
  const rd = tk.reads["26204854"];
  check(
    "1801 r4 P7: tick 4748 with 80 debt ticks above it at the block before the close",
    rd.tick === 4748 && rd.ticksAbove === 80,
    `${rd.tick}, ${rd.ticksAbove} above`,
  );

  const p = await openAndRead("/ethereum/fx/wsteth-1801");
  check("1801 r4: no page errors", p.errors.length === 0, p.errors.slice(0, 2).join(" | "));
  // Funding keeps taking collateral between transactions, so the gap grows
  // with the days: the card's one figure is checked as the sum of the parts
  // its tip states (between the transactions and inside them), and the
  // table's total against the tip's.
  const parts = /\((\d+\.\d+) stETH between the transactions and (\d+\.\d+) stETH inside \d+ of them\)/.exec(
    p.moved.parts,
  );
  const gap = parts ? [null, (p.moved.total ?? "").replace(/[^\d.]/g, ""), parts[1], parts[2]] : null;
  check(
    "1801 r4 P1: the card states the whole gap, its tip the between and inside parts",
    gap != null && Math.abs(Number(gap[1]) - Number(gap[2]) - Number(gap[3])) < 0.015,
    gap ? `${gap[1]} = ${gap[2]} + ${gap[3]}` : `absent: ${p.moved.total} | ${p.moved.parts}`,
  );
  check(
    "1801 r4 P1: the stretch table hides the empty stretches and totals the rest (the drift's between)",
    /12 stretches with no change\./.test(p.text) &&
      new RegExp(`Total between the transactions\\t−${between.toFixed(3).replace(".", "\\.")} stETH`).test(p.text),
    `between ${between.toFixed(3)}`,
  );
  check("1801 r4 P6: the table header no longer says the owner's", !/Between the owner’s transactions/.test(p.text));
  check(
    "1801 r4 P2: the card names the holder once",
    /Held by 0xc32b…5fa3 since 4 Aug 2026; opened by 0xc563…b9cd\./.test(p.text),
  );
  // The position closed on 16 Oct 2026 (block 26,204,855): its card is the
  // closed card, which states the holder line and the row counts, and none of
  // the redemption line; the transfer row names both holders.
  check(
    "1801 r4 P2: the ownership row names the previous holder and the new one",
    /Position #1801 changed hands: it moved from 0xc563…b9cd to 0xc32b…5fa3\./.test(p.text),
  );
  check(
    "1801 r4 P3: rows name the caller as the f(x) router and the holder who called it",
    /the f\(x\) router \(0xb753…067e\), which the holder at the time \(0xc563…b9cd\) called, on the pool's default schedule \(0\.5% of a borrow, 0\.2% of a repayment and nothing on a deposit or a withdrawal\)/.test(
      p.text,
    ),
  );
  check(
    "1801 r4 P4: the borrow and repay equations",
    /The debt rose by 40,000 fxUSD, the whole amount borrowed; the 200 fxUSD fee came out of the fxUSD minted, so the caller received 39,800\./.test(
      p.text,
    ) &&
      /The debt fell by 60,882\.095 fxUSD, the amount repaid; the 121\.764 fxUSD fee was paid on top, so the caller paid 61,003\.859\./.test(
        p.text,
      ),
  );
  {
    const rows = 1 + ops.length;
    check(
      "1801 r4 P5: row counts by kind",
      new RegExp(`carries ${rows} rows: ${ops.length} transactions and 1 ownership transfer\\.`).test(p.text),
      `${ops.length} operate rows`,
    );
  }
  check("1801 r4 P7: a closed card states no redemption line", !/highest-ratio ticks first/.test(p.text));
  check(
    "1801 r4 P9: one name for the transfer",
    /Transferred\s*·\s*to\s*0x/.test(p.text) && !/Ownership Transfer/.test(p.text),
  );
  // The flows panel's how-to-read: funding is the pool's one move here.
  check(
    "1801 r4 P9: the flows key names funding and no rebalance or redemption",
    /Funding, the collateral the pool takes as its funding charge/.test(p.text) &&
      !/Taken by rebalances|Taken by redemptions/.test(p.text),
  );

  const t1 = await json("/api/fx/position/wsteth/1/timeline");
  const ops1 = t1.events.filter((e) => e.context.data.eventType === "operate");
  const st1 = await json(
    `/api/chain/fx/event-state?pool=wsteth&id=1&blocks=${ops1.map((e) => e.blockNumber).join(",")}`,
  );
  let in1 = 0;
  for (const e of ops1) {
    const b = st1.reads[String(e.blockNumber - 1)];
    const a = st1.reads[String(e.blockNumber)];
    if (!b?.colls || !a?.colls || Number(b.colls) === 0) continue;
    const d = e.context.data;
    // The old manager emitted a withdrawal net of the fee it kept (protocolFees, wstETH).
    const cd = Number(d.collDelta) - (Number(d.collDelta) < 0 ? Number(d.protocolFees ?? 0) : 0);
    in1 += W(b.colls) - W(a.colls) + cd * W(a.rate);
  }
  const d1 = await json("/api/fx/position/wsteth/1/drift");
  const between1 = -d1.intervals.reduce((t, iv) => t + iv.collsDrift, 0);
  check(
    "wsteth-1 r4 P1: funding between and inside the transactions is 0.0077 stETH (the reader's 0.0071 summed rounded cells)",
    near(between1 + in1, 0.0077, 0.0002),
    `between ${between1.toFixed(6)} + inside ${in1.toFixed(6)} = ${(between1 + in1).toFixed(6)}`,
  );
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (pass === 0) process.exit(2);
process.exit(fail ? 1 : 0);
