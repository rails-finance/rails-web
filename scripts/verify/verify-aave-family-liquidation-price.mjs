// The Aave V3 / SparkLend liquidation price note, on the page.
// ---------------------------------------------------------------------------
// The note (rails-ops TO-DO-ui-jobs §32) states how far the SEIZED asset's
// oracle price moved between this position's last row that touched that asset
// and the liquidation that seized it. The rule, restated here from the item and
// NOT imported from lib/aave-v3/liquidation-price-notes.ts:
//
//   - one note per liquidation row B, per seized asset per block;
//   - the earlier end A is the newest block BEFORE B's in which this position
//     touched the seized reserve (a row's own reserve; a liquidation's
//     collateral and covered debt; a swap's received leg), and the last row
//     there that states the seized reserve's price;
//   - A may be an earlier liquidation;
//   - no note where A states no price for it, where B states none, where a
//     served folder spanning [A, B] moved the seized asset (it may hold the
//     true A), or where the two prices are equal.
//
// Every expected note is recomputed from the grouped timeline route the page
// reads (/api/{aave-v3,spark}/timeline?group=1), then held to PINS written from
// that route on 2026-09-21. These liquidations are years or months old and the
// prices are the oracle's at fixed blocks, so the pins describe a settled past:
// a pin that stops matching is a data change to investigate, not noise.
//
// Checks 1c–1e prove the pins test the rule rather than the plumbing: each
// breaks one clause of the restated rule and shows the pinned set move.
//
// No chain call is made: the routes and the page are the only inputs.
//
// Run:  BASE=https://preview.rails.finance node scripts/verify/verify-aave-family-liquidation-price.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

/** Fixture pages. `notes` is the pinned set — id, earlier row kind, the two
 *  prices as the route states them. `withheld` counts the liquidations the
 *  rule leaves without a note, by reason. */
const FIXTURES = [
  {
    name: "F1 Aave V3 Core, WBTC supply → liquidation, three USDT rows between",
    proto: "aave-v3",
    market: "core",
    wallet: "0x8727aeb7d755ad9b23033e140516d5fb81f60c9a",
    notes: [
      {
        id: "price-gap:aave-v3-core-wbtc:16644833-16792431",
        fromKind: "supply",
        priceA: 23547.70686247,
        priceB: 21347.44321786,
      },
    ],
    withheld: { folder: 0, tie: 0 },
    symbol: "WBTC",
  },
  {
    name: "F2 SparkLend, cbBTC withdrawal → liquidation, nothing between",
    proto: "spark",
    wallet: "0x9925b4e53b658a4d097af2bf97e036311116d56c",
    notes: [
      {
        id: "price-gap:spark-cbbtc:25892043-25972109",
        fromKind: "withdraw",
        priceA: 77199.95816363,
        priceB: 76388.616,
      },
    ],
    withheld: { folder: 0, tie: 0 },
    symbol: "cbBTC",
  },
  {
    name: "F3 SparkLend, four WETH liquidations, two behind a served folder",
    proto: "spark",
    wallet: "0x4830ac2e0901cb76b2a7b7b82d8540e6bdfa697c",
    notes: [
      {
        id: "price-gap:spark-weth:22835321-22844477",
        fromKind: "withdraw",
        priceA: 2571.29299605,
        priceB: 2544.069063,
      },
      {
        id: "price-gap:spark-weth:23179082-23743624",
        fromKind: "liquidation",
        priceA: 4065.5823702,
        priceB: 3303.23255075,
      },
    ],
    withheld: { folder: 2, tie: 0 },
    symbol: "WETH",
  },
  {
    name: "F4 Aave V3 Prime, one wstETH liquidation, its earlier end inside a served folder",
    proto: "aave-v3",
    market: "prime",
    wallet: "0x8a7ea8bf5d72037b151df18dbe180b345917e2ed",
    notes: [],
    withheld: { folder: 1, tie: 0 },
    symbol: "wstETH",
  },
  {
    name: "F5 Aave V3 Core, AAVE liquidations: a run, a rise, two at an unmoved price",
    proto: "aave-v3",
    market: "core",
    wallet: "0xa189fea7d8be09e7a644d0e5ca19c548524894d7",
    notes: [
      {
        id: "price-gap:aave-v3-core-aave:23488789-23549957",
        fromKind: "supply",
        priceA: 285.93344,
        priceB: 217.6818,
      },
      {
        id: "price-gap:aave-v3-core-aave:23549957-23549977",
        fromKind: "liquidation",
        priceA: 217.6818,
        priceB: 118.01837104,
      },
      {
        id: "price-gap:aave-v3-core-aave:23549985-23550175",
        fromKind: "liquidation",
        priceA: 118.01837104,
        priceB: 218.54544,
      },
    ],
    withheld: { folder: 0, tie: 2 },
    symbol: "AAVE",
  },
];

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail && !cond ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// ── The rule, restated ─────────────────────────────────────────────────────

const lc = (s) => (s ?? "").toLowerCase();
const logIndex = (id) => {
  const n = Number(id.slice(id.lastIndexOf(":") + 1));
  return Number.isFinite(n) ? n : -1;
};
const usd = (p) => (p && p.usd > 0 ? p.usd : 0);

/** Every reserve a row touched and the price the row states for it. */
function touched(e) {
  const d = e.context?.data;
  if (!d) return [];
  if (d.eventType === "liquidation") {
    return [
      { reserve: lc(d.collateralAsset), price: usd(d.collateralPrice) },
      { reserve: lc(d.reserve) || lc(e.flows?.[1]?.token), price: usd(d.debtPrice) },
    ].filter((t) => t.reserve);
  }
  const out = [{ reserve: lc(d.reserve) || lc(e.flows?.[0]?.token), price: usd(d.price) }];
  if (d.eventType === "swap" && d.swap) {
    out.push({ reserve: lc(d.swap.receivedAsset) || lc(e.flows?.[1]?.token), price: usd(d.swap.receivedPrice) });
  }
  return out.filter((t) => t.reserve);
}

/** `breaks`: { folder: drop the folder guard, tie: state equal prices,
 *  noLiquidationA: refuse an earlier liquidation as A (Aave V4's rule). */
function expectedNotes(fx, events, folders, breaks = {}) {
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
  const scope = fx.proto === "spark" ? "spark" : `aave-v3-${fx.market}`;
  const notes = [];
  const withheld = { folder: 0, tie: 0, other: 0 };
  const seen = new Set();
  for (const b of rows) {
    const d = b.context?.data;
    if (d?.eventType !== "liquidation") continue;
    const seized = lc(d.collateralAsset);
    const key = `${seized}@${b.blockNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const priceB = usd(d.collateralPrice);
    let aBlock = -1;
    for (const r of rows) {
      if (r.blockNumber < b.blockNumber && touched(r).some((t) => t.reserve === seized)) {
        aBlock = Math.max(aBlock, r.blockNumber);
      }
    }
    let a = null;
    for (const r of rows) {
      if (r.blockNumber !== aBlock) continue;
      const hit = touched(r).find((t) => t.reserve === seized && t.price > 0);
      if (hit) a = { row: r, price: hit.price };
    }
    if (!(priceB > 0) || !a) {
      withheld.other++;
      continue;
    }
    if (breaks.noLiquidationA && a.row.context.data.eventType === "liquidation") {
      withheld.other++;
      continue;
    }
    if (
      !breaks.folder &&
      folders.some(
        (f) => f.lastBlock >= aBlock && f.firstBlock <= b.blockNumber && f.legs.some((l) => lc(l.asset) === seized),
      )
    ) {
      withheld.folder++;
      continue;
    }
    if (!breaks.tie && a.price === priceB) {
      withheld.tie++;
      continue;
    }
    const symbol = d.collateralSymbol;
    notes.push({
      id: `price-gap:${scope}-${symbol.toLowerCase()}:${aBlock}-${b.blockNumber}`,
      fromKind: a.row.context.data.eventType,
      priceA: a.price,
      priceB,
      toBlock: b.blockNumber,
    });
  }
  return { notes, withheld };
}

// ── The routes ─────────────────────────────────────────────────────────────

async function readRoute(fx) {
  const qs = fx.proto === "spark" ? `wallet=${fx.wallet}&group=1` : `wallet=${fx.wallet}&market=${fx.market}&group=1`;
  const res = await fetch(`${BASE}/api/${fx.proto}/timeline?${qs}`);
  if (!res.ok) return { ok: false, status: res.status, events: [], folders: [] };
  const body = await res.json();
  const folders = (body.rowPlan ?? []).filter((r) => r.kind === "folder").map((r) => r.folder);
  return { ok: Array.isArray(body.events), status: res.status, events: body.events ?? [], folders };
}

const pageUrl = (fx) =>
  fx.proto === "spark" ? `/ethereum/spark/${fx.wallet}` : `/ethereum/aave-v3/${fx.wallet}?market=${fx.market}`;

/** The pair's grain, as lib/shared/market-note.ts states it (restated): the
 *  fewest decimals from 2 to 6 at which the two render differently. */
const fixed = (n, d) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
function pair(a, b) {
  let d = 2;
  if (a !== b) {
    while (d < 6 && fixed(a, d) === fixed(b, d)) d++;
  }
  return [fixed(a, d), fixed(b, d)];
}

// ── The page ───────────────────────────────────────────────────────────────

const PRICE_ROWS = '[data-market-note^="price-gap:"]';

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.locator("[data-event-id]").first().waitFor({ state: "attached", timeout: 180000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 40; i++) {
    const more = page.getByRole("button", { name: /show \d+ more|show more/i });
    if ((await more.count()) === 0) break;
    await more
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(500);
  }
  return page;
}

async function openNote(row) {
  // An absent row is a failed check below, never a crash that hides the rest.
  if ((await row.count()) === 0) return "";
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { expanded: false }).first().click();
  await row.page().waitForTimeout(250);
  const trig = row.getByRole("button", { name: /how this note was derived/i });
  if (await trig.count()) await trig.click();
  await row.page().waitForTimeout(200);
  return (await row.innerText()).replace(/\s+/g, " ");
}

/** The ids of the event rows and note rows, in document order. */
const domOrder = (page) =>
  page
    .locator("[data-event-id], [data-market-note]")
    .evaluateAll((els) =>
      els.map((e) =>
        e.hasAttribute("data-market-note")
          ? { note: e.getAttribute("data-market-note") }
          : { event: e.getAttribute("data-event-id") },
      ),
    );

console.log("Aave V3 + SparkLend liquidation price notes — the rule and the page\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
let sawAnyRow = false;

for (const fx of FIXTURES) {
  console.log(`\n── ${fx.name}\n   ${BASE}${pageUrl(fx)}`);
  const route = await readRoute(fx);
  check(
    `0. ${fx.wallet.slice(0, 10)}… the grouped timeline answers with rows`,
    route.ok && route.events.length > 0,
    `status ${route.status}, ${route.events.length} rows`,
  );
  if (!route.ok) continue;

  // 1. The restated rule over the route equals the pin.
  const exp = expectedNotes(fx, route.events, route.folders);
  const pinIds = fx.notes.map((n) => n.id).sort();
  check(
    `1a. the rule over the route gives the pinned ${pinIds.length} note(s)`,
    JSON.stringify(exp.notes.map((n) => n.id).sort()) === JSON.stringify(pinIds),
    `got ${exp.notes.map((n) => n.id).join(", ") || "(none)"}`,
  );
  for (const pin of fx.notes) {
    const got = exp.notes.find((n) => n.id === pin.id);
    check(
      `1b. ${pin.id} — from a ${pin.fromKind}, ${pin.priceA} → ${pin.priceB}`,
      got != null && got.fromKind === pin.fromKind && got.priceA === pin.priceA && got.priceB === pin.priceB,
      JSON.stringify(got),
    );
  }
  check(
    `1b. withheld: ${fx.withheld.folder} behind a folder, ${fx.withheld.tie} at an unmoved price`,
    exp.withheld.folder === fx.withheld.folder && exp.withheld.tie === fx.withheld.tie,
    JSON.stringify(exp.withheld),
  );
  // 1c–1e. Each clause of the rule moves the pinned set when broken, so the
  // pins test it. Only asserted where the fixture exercises that clause.
  if (fx.withheld.folder > 0) {
    const broken = expectedNotes(fx, route.events, route.folders, { folder: true });
    check(
      `1c. dropping the folder guard adds ${fx.withheld.folder} note(s) the pin does not hold`,
      broken.notes.length === fx.notes.length + fx.withheld.folder,
      `${broken.notes.length}`,
    );
  }
  if (fx.withheld.tie > 0) {
    const broken = expectedNotes(fx, route.events, route.folders, { tie: true });
    check(
      `1d. stating equal prices adds ${fx.withheld.tie} note(s) the pin does not hold`,
      broken.notes.length === fx.notes.length + fx.withheld.tie,
      `${broken.notes.length}`,
    );
  }
  const fromLiq = fx.notes.filter((n) => n.fromKind === "liquidation").length;
  if (fromLiq > 0) {
    const broken = expectedNotes(fx, route.events, route.folders, { noLiquidationA: true });
    check(
      `1e. refusing an earlier liquidation as the earlier end drops ${fromLiq} pinned note(s)`,
      broken.notes.length === fx.notes.length - fromLiq,
      `${broken.notes.length}`,
    );
  }

  // 2. The page draws exactly the pinned notes.
  const page = await open(context, pageUrl(fx));
  const rowsOnPage = await page.locator("[data-event-id]").count();
  if (rowsOnPage > 0) sawAnyRow = true;
  check(`2a. the page drew its event rows`, rowsOnPage > 0, `${rowsOnPage}`);
  const ids = await page.locator(PRICE_ROWS).evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  check(
    `2b. the page draws exactly the pinned price note(s)`,
    JSON.stringify([...ids].sort()) === JSON.stringify(pinIds),
    `page ${ids.join(", ") || "(none)"}`,
  );

  // 3. Each note sits between its liquidation and the rows before it.
  const blockOf = new Map(route.events.map((e) => [e.id, e.blockNumber]));
  const order = await domOrder(page);
  for (const pin of fx.notes) {
    const at = order.findIndex((o) => o.note === pin.id);
    const toBlock = Number(pin.id.split("-").pop());
    let above = null;
    for (let i = at - 1; i >= 0; i--) if (order[i].event) ((above = order[i].event), (i = -1));
    let below = null;
    for (let i = at + 1; i < order.length; i++) if (order[i].event) ((below = order[i].event), (i = order.length));
    check(
      `3. ${pin.id} sits below a row at or after block ${toBlock} and above an older one`,
      at >= 0 && above != null && blockOf.get(above) >= toBlock && (below == null || blockOf.get(below) < toBlock),
      `above ${above} (${blockOf.get(above)}), below ${below} (${blockOf.get(below)})`,
    );
  }

  // 4. The first note's panel: the pinned prices, no health factor, and the
  // two sentences the rule turns on.
  const first = fx.notes[0];
  if (first) {
    const text = await openNote(page.locator(`[data-market-note="${first.id}"]`).first());
    const [a, b] = pair(first.priceA, first.priceB);
    check(
      `4a. ${first.id} states ${a} → ${b}`,
      new RegExp(
        `Oracle price \\(USD per ${fx.symbol}\\)\\s*${a.replace(/\./g, "\\.")}\\s*→\\s*${b.replace(/\./g, "\\.")}`,
      ).test(text),
      text.slice(0, 240),
    );
    check(
      "4b. and draws no health-factor card, saying why",
      // The stat card V4 draws; the derivation says in words that none is stated.
      text.length > 0 && !/Health factor at each price/i.test(text) && /No health factor is stated/.test(text),
      text ? "" : "no row to read",
    );
    check(
      `4c. its derivation says the position did not touch ${fx.symbol} between the ends`,
      text.includes(`This position did not touch ${fx.symbol} between them`),
      text.slice(0, 400),
    );
    check(
      "4d. and that it does not say the move caused the seizure",
      text.includes("It does not say the move caused the seizure"),
    );
    const move = Math.abs((first.priceB / first.priceA - 1) * 100);
    const headline = move >= 0.1 ? `${move.toFixed(1)}%` : null;
    if (headline) {
      check(`4e. the header states the move, ${headline}`, text.includes(headline), text.slice(0, 120));
    }
  }

  // 5. Putting notes away removes the rows and leaves every event row.
  if (fx.notes.length > 0) {
    const pill = page.getByRole("button", { name: /^Market notes/i }).first();
    const events = await page.locator("[data-event-id]").count();
    if (await pill.count()) {
      const before = await page.locator(PRICE_ROWS).count();
      await pill.click();
      await page.waitForTimeout(400);
      const after = await page.locator(PRICE_ROWS).count();
      const eventsAfter = await page.locator("[data-event-id]").count();
      check(
        "5. hiding notes removes the price rows and no event row",
        before > 0 && after === 0 && eventsAfter === events,
        `${before} → ${after} price rows, ${events} → ${eventsAfter} event rows`,
      );
      await pill.click();
    } else {
      check("5. the page offers the Market notes pill", false, "no pill");
    }
  }
  await page.close();
}

// An absence is only evidence where the same selector finds rows elsewhere.
check("6. positive control: at least one fixture page drew event rows", sawAnyRow);

await browser.close();
console.log(`\n${checked - failures}/${checked} passed`);
if (checked === 0) process.exit(2);
process.exit(failures ? 1 : 0);
