// The open Aave V3 Ethereum card reads the position state around its event's
// transaction (rails-ops TO-DO-ui-jobs §19, §213): a Collateral cell (total
// collateral in USD, each collateral reserve beneath, the switched-off supplies
// under "Supplied, not collateral"), a Debt cell (total debt, each borrowed
// reserve beneath), the health factor, an LTV cell (debt ÷ collateral of the
// weighted max LTV, the liquidation threshold, what can still be borrowed)
// and eMode. A balance the block
// lists is stated there and nowhere else — the grid's cell for that reserve is
// the statement only until the read lands (§47). A reserve row under a cent is
// dust and sits behind a "N dust reserve(s) hidden" line per side, unless it is
// the reserve the event touched — that row always draws (§52).
//
// The rendered card is checked against the SAME answer the page reads —
// /api/aave-v3/timeline/position-state through this server — so no balance is
// pinned here. Each fixture pins the chain facts that make it the case it is, and
// the answer is checked for those facts before the card is.
//
// Fixtures. Core events sit at or above block 25,300,000, where Core history is
// complete; Prime at any block. A served event carries its tx hash as the third
// `:` segment of its id.
//   0xfe28…5820 core  tx 0xc2596fc8…078d (25,963,602): collateral swap, USDC → WETH
//   0x56b8…6ac1 core  tx 0xaf0a493a…21c3 (25,925,584): debt swap, USDC repaid, WETH borrowed
//   0xfa35…95fc core  tx 0xa3ac83ba…7a6d (25,925,977): repay with collateral, WBTC → USDT
//   0x52af…4c1f prime tx 0x361e9da2…3348 (24,354,939): a USDC borrow with wstETH and WETH supplied
//   0x64b8…e12b core  tx 0x89d97f9c…22ec (25,301,360): UserEModeSet category 1 and a WETH borrow, one tx
//   0x74c2…2a10 core  tx 0xe62f083a…b74b (25,302,570): liquidation, USDe debt, WBTC collateral
//   0x9ff6…0de5 core  tx 0x01c8f13b…be71c1 (26,052,226): a WETH supply against 115.998 WETH, five
//     other supplied reserves under a cent — the dust count line (§52)
//   0x9ff6…0de5 core  tx 0xa8590e9c…693cf81 (25,983,408): a collateral swap, UNI → WETH, whose sold
//     UNI ends the tx under a cent — touched and dust, so its row still draws (§52)
//   0x37bc…769b core  tx 0xc4405cd1…9b (25,902,231): a repay burns the USDT aTokens straight to
//     zero, the flag auto-flipping off — the "Collateral off" group and its "was on" flip note
//     (§54), while five untouched, unflipped reserves exercise the merged balance+flag receipt
// plus one Base card, which must never ask.
//
// Until rails-server serves the route this fails at the first check of every
// fixture, and says so. Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-aave-v3-position-state.mjs
// Against a Vercel-protected deployment (dev.rails.finance), the bypass header
// rides every request through hostFetch and the browser context (lib/host.mjs):
//   BASE=https://dev.rails.finance node scripts/verify/verify-aave-v3-position-state.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders, hostFetch } from "./lib/host.mjs";
import { armInspector } from "./lib/prov-inspector.mjs";

const ROUTE = "/api/aave-v3/timeline/position-state";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const USDE = "0x4c9edd5852cd905f086c759e8383e09bff1e68b3";
const UNI = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";

const FIXTURES = [
  {
    label: "core 0xfe28 collateral swap",
    wallet: "0xfe28854b855ab09a47adbd893a5f580cdffc5820",
    market: "core",
    block: 25963602,
    tx: "0xc2596fc8ac8593338c4bffea88b2db2826f25a1609c5851dce12c0d5f86f078d",
    cardText: "Collateral swap",
    // aUSDC given, aWETH received: both supplied balances moved.
    moved: [
      { reserve: USDC, side: "supply", sign: -1 },
      { reserve: WETH, side: "supply", sign: 1 },
    ],
    // §54: USDC ends the swap under a cent, touched — the position's sole
    // dust reserve, so the dust line must not draw at all (the bug it fixed).
    checkFlagProv: true,
  },
  {
    label: "core 0x56b8 debt swap",
    wallet: "0x56b8a8dfae36edd33df91606fe4ece49e4d76ac1",
    market: "core",
    block: 25925584,
    tx: "0xaf0a493a61933ba1c6db6cbd02ad848eda4a9aa6b08e7a418f37f592755d21c3",
    cardText: "Debt swap",
    moved: [
      { reserve: USDC, side: "debt", sign: -1 },
      { reserve: WETH, side: "debt", sign: 1 },
    ],
  },
  {
    label: "core 0xfa35 repay with collateral",
    wallet: "0xfa356e93d17a5d80dc1d64e3d181009e594295fc",
    market: "core",
    block: 25925977,
    tx: "0xa3ac83ba56f6ce4846f8eaab4bd36494c462851d2d4f2a9ee81a86ea7f2f7a6d",
    cardText: "Repay with collateral",
    moved: [
      { reserve: WBTC, side: "supply", sign: -1 },
      { reserve: USDT, side: "debt", sign: -1 },
    ],
  },
  {
    label: "prime 0x52af multi-reserve borrow",
    wallet: "0x52af93c9534acbaea864d09b8d6443daa2fe4c1f",
    market: "prime",
    block: 24354939,
    tx: "0x361e9da204ea9c3a389a27477530cad15b94fca280af07c177dd8d164b1d3348",
    idPrefix: "borrow:",
    moved: [{ reserve: USDC, side: "debt", sign: 1 }],
    minSupplied: 2,
    minBorrowed: 1,
    // The USD toggle and the receipts are driven on this small page.
    deep: true,
  },
  {
    label: "core 0x64b8 eMode set and borrow in one tx",
    wallet: "0x64b8f28b9276aaee3fe61b12c4b2c2f38923e12b",
    market: "core",
    block: 25301360,
    tx: "0x89d97f9c535ce77c322b5c1929296fa655c350379404a03a76ff5a29b5e022ec",
    idPrefix: "borrow:",
    moved: [{ reserve: WETH, side: "debt", sign: 1 }],
    emode: { before: 0, after: 1 },
  },
  {
    label: "core 0x74c2 liquidation",
    wallet: "0x74c229c733244676cc81f4a7d5bcdbfe98c02a10",
    market: "core",
    block: 25302570,
    tx: "0xe62f083a016e22bd04f36326d86266ad6b51e2fca8b61262c5ab69928b0eb74b",
    idPrefix: "liquidation:",
    moved: [
      { reserve: WBTC, side: "supply", sign: -1 },
      { reserve: USDE, side: "debt", sign: -1 },
    ],
  },
  {
    // rails-ops TO-DO-ui-jobs §52: 115.998 WETH plus five sub-cent reserves
    // (UNI, LINK, XAUt, AAVE, BTC.b), the Miles screenshot's fixture.
    label: "core 0x9ff6 large WETH supply, five dust reserves",
    wallet: "0x9ff679ef5e663a223c5ef07fd191e9e7eda90de5",
    market: "core",
    block: 26052226,
    tx: "0x01c8f13bf4c6ab034b4bf01c9508545f3d34163ca6d2e9d3aeec6497a3be71c1",
    idPrefix: "supply:",
    moved: [{ reserve: WETH, side: "supply", sign: 1 }],
    dust: true,
  },
  {
    // Same wallet, a collateral swap that sells its UNI down to under a cent
    // in the same transaction: the touched reserve draws its row dust or not.
    label: "core 0x9ff6 collateral swap, sold UNI ends dust and touched",
    wallet: "0x9ff679ef5e663a223c5ef07fd191e9e7eda90de5",
    market: "core",
    block: 25983408,
    tx: "0xa8590e9c7325641a59840a897d3d57f5681b46ce353efa373136edf3a693cf81",
    cardText: "Collateral swap",
    moved: [
      { reserve: UNI, side: "supply", sign: -1 },
      { reserve: WETH, side: "supply", sign: 1 },
    ],
    dust: true,
  },
  {
    // rails-ops TO-DO-ui-jobs §54: repayWithATokens burns the USDT aTokens
    // straight to zero; Aave auto-flips the collateral switch off once the
    // balance is gone. USDT is untouched (a plain repay's own axis is the
    // debt side) and the position's sole dust reserve, so it sits under
    // "Supplied, not collateral" with a "was on" flip note; WBTC, AAVE, sUSDe,
    // WETH and cbBTC stay put, unflipped, under the Collateral total.
    label: "core 0x37bc repay burns USDT collateral to zero, flag flips off",
    wallet: "0x37bcd52b5319cbb7e62b9947a34774cee513db4b",
    market: "core",
    block: 25902231,
    tx: "0xc4405cd15a649755199d0754d72f566d01cb3557c1d192acc6ab64da62a1769b",
    idPrefix: "repay:",
    moved: [{ reserve: USDT, side: "debt", sign: -1 }],
    dust: true,
    checkFlagProv: true,
  },
];

// A Base card: the same component, with no market, so no read. A wallet whose
// history paints cards (a large one opens behind an "earlier events" control).
const BASE_PAGE = process.env.BASE_V3_WALLET_PATH || "/base/aave-v3/0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8";

// ── The card's own rules, restated (lib/aave-v3/position-state.ts,
// components/shared/position-row.tsx, lib/aave-v4/format.ts) ──────────────

const big = (s) => BigInt(String(s ?? "0").split(".")[0] || "0");
const pow10 = (n) => BigInt(10) ** BigInt(Math.max(0, n));
const humanOf = (raw, decimals) => {
  let s = String(raw).split(".")[0].replace(/^0+/, "") || "0";
  if (decimals <= 0) return s;
  if (s.length <= decimals) s = "0".repeat(decimals - s.length + 1) + s;
  const cut = s.length - decimals;
  const out = (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
  return out || "0";
};
const fmtAmount = (v) => {
  const n = parseFloat(v);
  if (!n || !isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.min(8, Math.ceil(-Math.log10(abs)) + 2) });
};
const fmtUsd = (v) =>
  v < 0.01 ? "< $0.01" : v < 1 ? `$${v.toFixed(2)}` : "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const rawToUsd = (raw, priceBase, decimals) => Number((big(raw) * big(priceBase)) / pow10(decimals + 4)) / 1e4;
const baseToUsd = (base) => Number(big(base) / pow10(4)) / 1e4;
// hfLabelV3 (lib/aave-v3/position-state.ts): four decimals below 1.1, rounded
// down under 1, ">100" from 100.
const hfLabel = (wad) => {
  if (wad == null) return "∞";
  const n = Number(big(wad) / pow10(14)) / 1e4;
  if (n >= 100) return ">100";
  if (n < 1) return (Math.floor(n * 1e4 + 1e-9) / 1e4).toFixed(4);
  return n < 1.1 ? n.toFixed(4) : n.toFixed(2);
};
const bpsPct = (bps) => `${(bps / 100).toFixed(2)}%`;
const emodeName = (state, id) => (id === 0 ? "None" : state.emode?.categories?.[String(id)]?.label || `Category ${id}`);
const held = (leg) => big(leg?.before) > BigInt(0) || big(leg?.after) > BigInt(0);
// §52: under a cent, priced, whatever the collateral flag. A row with no price
// (priceBase null) is held, not dust.
const isDustRow = (r, side) => {
  if (r.priceBase == null || r.decimals == null) return false;
  const leg = side === "supply" ? r.supply : r.debt;
  return rawToUsd(leg.after, r.priceBase, r.decimals) < 0.01;
};

let pass = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function readState(fx) {
  const qs = new URLSearchParams({ wallet: fx.wallet, market: fx.market, block: String(fx.block), tx: fx.tx });
  for (let i = 0; i < 4; i++) {
    const res = await hostFetch(`${BASE}${ROUTE}?${qs}`).catch((e) => ({ ok: false, status: 0, e }));
    if (res.status === 429 || res.status === 0) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      continue;
    }
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* an HTML 404: the route is not there */
    }
    return { status: res.status, body };
  }
  return { status: 0, body: null };
}

// The toolbar's count line (components/shared/timeline-toolbar.tsx): "1,729
// events" on a page that lists everything, "Showing 1,000 of 1,729 events" on
// a served window, "Showing 980 rows of at least 1,729 events" where the index
// grouped rows. The debt-swap fixture is the second shape.
const COUNT_LINE = /^(Showing [\d,]+ (rows )?of (at least )?)?[\d,]+ events?$/;

/** Open the wallet's page and the fixture's card; returns the card locator. */
async function openCard(page, fx) {
  await page.goto(`${BASE}/ethereum/aave-v3/${fx.wallet}?market=${fx.market}`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await page
    .getByText(COUNT_LINE)
    .first()
    // A wallet with thousands of events paints its count late on a cold route.
    .waitFor({ state: "visible", timeout: 240000 });
  // Display's "USD for stablecoins" is off by default; the lines below are
  // held to their USD figure on every reserve, so it goes on (the rule for a
  // pegged stablecoin is verify-usd-display.ts).
  await setDisplayFlag(page, "USD for stablecoins", true);
  let card = null;
  for (let i = 0; i < 25 && !card; i++) {
    const hits = page.locator(`[data-event-id*="${fx.tx}"]`);
    const n = await hits.count();
    for (let j = 0; j < n && !card; j++) {
      const h = hits.nth(j);
      const id = (await h.getAttribute("data-event-id")) ?? "";
      if (fx.idPrefix && !id.startsWith(fx.idPrefix)) continue;
      if (fx.cardText && !((await h.innerText()) || "").includes(fx.cardText)) continue;
      card = h;
    }
    if (card) break;
    const more = page.getByRole("button", { name: /^Show \d+ more$/ });
    if ((await more.count()) === 0) break;
    await more.click();
    await page.waitForTimeout(300);
  }
  return card;
}

// The header's own toggle: a token chip is a `role="button"` too, and clicking it
// filters the timeline instead of opening the card.
const toggleCard = (card) => card.locator('[role="button"]:not([title^="Filter by"])').first().click();

/** Open a card and wait for its detail to start answering. A click that lands
 *  before React has attached the handler is swallowed, so it is retried. */
async function openDetail(card) {
  const started = card.locator("[data-position-state]").first();
  for (let attempt = 0; attempt < 8; attempt++) {
    await toggleCard(card);
    if (
      await started
        .waitFor({ timeout: 10000 })
        .then(() => true)
        .catch(() => false)
    )
      return;
  }
}

async function waitForAnswer(card) {
  await card
    .locator('[data-position-state="ready"], [data-position-state="unavailable"]')
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  if (await card.locator('[data-position-state="ready"]').count()) return "ready";
  if (await card.locator('[data-position-state="unavailable"]').count()) return "unavailable";
  return "none";
}

/** The Display menu's toggle (verify-historic-usd-pills' own driver). */
async function setDisplayFlag(page, label, wantOn) {
  const countSpan = page.getByText(COUNT_LINE).first();
  const row = countSpan.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
  );
  const trigger = row.locator("div.relative.inline-flex.items-center > button").last();
  const item = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
  let opened = false;
  for (let attempt = 0; attempt < 6 && !opened; attempt += 1) {
    await trigger.click();
    opened = await item
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!opened) await page.waitForTimeout(700);
  }
  if (!opened) throw new Error(`Display menu never offered "${label}"`);
  const isOn = await item
    .locator("span")
    .first()
    .evaluate((el) => el.className.includes("bg-rb-500"))
    .catch(() => false);
  if (isOn !== wantOn) await item.click();
  await countSpan.click();
}

/** The receipt behind a card value, through the page's inspector. */
async function receiptText(page, scope, valueText) {
  // The toggle rides in the Tools menu on a position view and in the dock on
  // a Market-type page; armInspector reads either, and is a no-op once armed
  // (the tool is STICKY — a blind second click would put it down).
  if (!(await armInspector(page))) return null;
  // A string finds the figure by its text; a locator is the figure (an
  // asset's icon, which carries its balance's receipt).
  const target =
    typeof valueText === "string"
      ? scope.locator("span.prov-locate-box").filter({ hasText: valueText }).first()
      : valueText;
  if ((await target.count()) === 0) return null;
  await target.scrollIntoViewIfNeeded();
  await target.click();
  const pop = page.locator(".prov-inspect-pop");
  await pop.waitFor({ state: "visible", timeout: 10000 });
  const text = await pop.innerText();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  return text;
}

const only = process.env.FIXTURES ? new RegExp(process.env.FIXTURES) : null;
const browser = await chromium.launch();

for (const fx of FIXTURES) {
  if (only && !only.test(fx.label)) continue;
  console.log(`\n=== ${fx.label} ===`);

  // ── 1. The answer, and the chain facts that make this fixture what it is ──
  const { status, body: state } = await readState(fx);
  const served = status === 200 && state && Array.isArray(state.reserves);
  check(
    `${fx.label}: ${ROUTE} answers 200 with reserves`,
    served,
    served ? `${state.reserves.length} reserve(s)` : `status ${status}${state?.code ? ` · ${state.code}` : ""}`,
  );
  if (!served) continue;
  check(`${fx.label}: the answer is complete (settings and the at-block read present)`, state.complete === true);
  check(
    `${fx.label}: every listed reserve has a symbol and decimals`,
    state.reserves.every((r) => r.symbol && r.decimals != null),
  );
  for (const m of fx.moved) {
    const r = state.reserves.find((x) => x.reserve === m.reserve);
    const leg = r?.[m.side];
    const diff = leg ? big(leg.after) - big(leg.before) : BigInt(0);
    check(
      `${fx.label}: ${r?.symbol ?? m.reserve.slice(0, 8)} ${m.side} ${m.sign > 0 ? "grows" : "shrinks"} across the tx`,
      !!leg && (m.sign > 0 ? diff > BigInt(0) : diff < BigInt(0)),
      leg ? `${leg.before} → ${leg.after}` : "reserve not listed",
    );
  }
  const supplied = state.reserves.filter((r) => held(r.supply));
  const borrowed = state.reserves.filter((r) => held(r.debt));
  if (fx.minSupplied)
    check(`${fx.label}: ≥${fx.minSupplied} reserves supplied`, supplied.length >= fx.minSupplied, `${supplied.length}`);
  if (fx.minBorrowed)
    check(`${fx.label}: ≥${fx.minBorrowed} reserve borrowed`, borrowed.length >= fx.minBorrowed, `${borrowed.length}`);
  if (fx.emode)
    check(
      `${fx.label}: eMode ${fx.emode.before} → ${fx.emode.after} across the tx`,
      state.emode?.before === fx.emode.before && state.emode?.after === fx.emode.after,
      JSON.stringify({ before: state.emode?.before, after: state.emode?.after }),
    );

  // ── 2. The card ─────────────────────────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: bypassHeaders() });
  const asks = [];
  // A key asked again after a refusal that can change (a 409, a 5xx, a
  // network failure) is the hook's one retry, not a second read.
  const retried = new Set();
  page.on("request", (r) => {
    if (r.url().includes(ROUTE)) asks.push(r.url());
  });
  page.on("response", (r) => {
    if (r.url().includes(ROUTE) && !r.ok() && r.status() !== 400 && r.status() !== 404) retried.add(r.url());
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes(ROUTE)) retried.add(r.url());
  });
  try {
    const card = await openCard(page, fx);
    check(`${fx.label}: the card is on the page`, !!card);
    if (!card) continue;
    await openDetail(card);
    const answer = await waitForAnswer(card);
    check(`${fx.label}: the open card shows its position state`, answer === "ready", answer);
    if (answer !== "ready") continue;
    const block = card.locator('[data-position-state="ready"]');
    const text = (s) => s.innerText().then((t) => t.replace(/\s+/g, " ").trim());

    // One statement of a balance (rails-ops TO-DO-ui-jobs §47). A reserve the
    // block lists is stated by its row alone: the grid draws no cell for it, and
    // a full-figure title (the grid's own, `[title="<exact> <symbol>"]`) is the
    // sign that it did. A reserve the block leaves out keeps its grid cell,
    // carrying the exact after-balance.
    for (const m of fx.moved) {
      const r = state.reserves.find((x) => x.reserve === m.reserve);
      if (!r?.decimals && r?.decimals !== 0) continue;
      const exact = humanOf(r[m.side].after, r.decimals);
      const grouped = `${BigInt(exact.split(".")[0]).toLocaleString("en-US")}${exact.includes(".") ? `.${exact.split(".")[1]}` : ""}`;
      const titled = await card.locator(`[title^="${grouped} "]`).count();
      if (held(r[m.side]))
        check(
          `${fx.label}: ${r.symbol} ${m.side} is stated once — the row, not the grid`,
          titled === 0,
          `${titled} grid cell(s) reading ${grouped}`,
        );
      else
        check(`${fx.label}: the grid's ${r.symbol} ${m.side} stat is the exact after-balance ${grouped}`, titled > 0);
    }

    // The closed Collateral and Debt cells (rails-ops reference/
    // lifetime-flows-scrubber.md, "The event card's sum"): a side holding one
    // reserve states its tokens after the event; a side holding several states
    // its dollars and one icon per reserve it holds after the event, whose
    // title reads its balance. A reserve under a cent is dust and draws no
    // icon, unless the event touched it (§52). A supply whose collateral flag
    // flipped carries "enabled/disabled as collateral here" (§54), its receipt
    // the collateral-flag one; a steady flag rides on the balance's receipt.
    for (const [side, rows] of [
      ["supply", supplied],
      ["debt", borrowed],
    ]) {
      const touched = new Set(fx.moved.filter((m) => m.side === side).map((m) => m.reserve));
      const scope = block.locator(`[data-receipt-total="${side}"]`);
      const scopeText = await text(scope);
      if (rows.length === 1) {
        const r = rows[0];
        const amount = fmtAmount(humanOf(r[side].after, r.decimals));
        check(`${fx.label}: the ${side} cell states ${r.symbol}'s ${amount}`, scopeText.includes(amount), scopeText);
      } else {
        const want = rows.filter(
          (r) => big(r[side].after) > BigInt(0) && (touched.has(r.reserve) || !isDustRow(r, side)),
        );
        const icons = scope.locator("[data-closed-assets] span[title]");
        const titles = [];
        for (let k = 0; k < (await icons.count()); k++) titles.push(await icons.nth(k).getAttribute("title"));
        check(
          `${fx.label}: the ${side} cell draws ${want.length} asset icon(s)`,
          titles.length === want.length,
          titles.join(" | "),
        );
        for (const r of want) {
          const amount = fmtAmount(humanOf(r[side].after, r.decimals));
          check(
            `${fx.label}: ${r.symbol}'s icon reads ${amount} ${r.symbol}`,
            titles.includes(`${amount} ${r.symbol}`),
            titles.join(" | "),
          );
        }
      }
      if (side === "supply") {
        for (const r of rows.filter((x) => x.collateral)) {
          const flipped = r.collateral.before !== r.collateral.after;
          const flipEl = scope.locator("[data-collateral-flip]").filter({ hasText: rows.length > 1 ? r.symbol : "" });
          const n = await flipEl.count();
          if (flipped) {
            const now = r.collateral.after ? "enabled" : "disabled";
            const flipText = n ? await text(flipEl.first()) : "";
            check(
              `${fx.label}: ${r.symbol} carries "${now} as collateral here" — its flag flipped this transaction`,
              n === 1 && flipText.endsWith(`${now} as collateral here`),
              flipText,
            );
          } else if (rows.length > 1)
            check(`${fx.label}: ${r.symbol} carries no flip text — its flag did not change`, n === 0);
        }
        if (fx.checkFlagProv) {
          const flippedR = rows.find((r) => r.collateral && r.collateral.before !== r.collateral.after);
          if (flippedR) {
            const now = flippedR.collateral.after ? "on" : "off";
            const receipt = await receiptText(
              page,
              scope,
              `${now === "on" ? "enabled" : "disabled"} as collateral here`,
            );
            check(
              `${fx.label}: ${flippedR.symbol}'s flip note opens the collateral-flag receipt`,
              !!receipt && receipt.includes("collateral switch"),
              receipt,
            );
          }
          const steadyR =
            rows.length === 1 ? rows.find((r) => r.collateral && r.collateral.before === r.collateral.after) : null;
          if (steadyR) {
            const amount = fmtAmount(humanOf(steadyR.supply.after, steadyR.decimals));
            const receipt = await receiptText(page, scope, amount);
            check(
              `${fx.label}: ${steadyR.symbol}'s balance receipt also states its collateral flag`,
              !!receipt && receipt.includes("collateral switch"),
              receipt,
            );
          }
        }
      }
    }

    // Account figures (§213): the totals head the Collateral and Debt cells;
    // the LTV cell states the max LTV and the liquidation threshold, and what
    // can still be borrowed.
    const cardText = async (key) => text(block.locator(`[data-position-card="${key}"]`));
    const a = state.account;
    if (a) {
      // A cell holding several reserves states the Pool's total (every
      // supplied balance where a supply's switch is off, which this skips).
      const total = async (what) => text(block.locator(`[data-account-total="${what}"]`));
      const offSupply = supplied.some((r) => r.collateral && !r.collateral.after);
      if (supplied.length !== 1 && !offSupply)
        check(
          `${fx.label}: the Collateral cell states total collateral ${fmtUsd(baseToUsd(a.after.totalCollateralBase))}`,
          (await total("collateral")).endsWith(
            big(a.after.totalCollateralBase) === BigInt(0) ? "$0" : fmtUsd(baseToUsd(a.after.totalCollateralBase)),
          ),
        );
      if (borrowed.length !== 1)
        check(
          `${fx.label}: the Debt cell states total debt ${fmtUsd(baseToUsd(a.after.totalDebtBase))}`,
          (await total("debt")).endsWith(
            big(a.after.totalDebtBase) === BigInt(0) ? "$0" : fmtUsd(baseToUsd(a.after.totalDebtBase)),
          ),
        );
      check(
        `${fx.label}: no Supplied, Borrowed, Total or Max LTV cells`,
        (await block
          .locator(
            '[data-position-card="supplied"], [data-position-card="borrowed"], [data-position-card="total-collateral"], [data-position-card="total-debt"], [data-position-card="liquidation-threshold"]',
          )
          .count()) === 0,
      );
      const hf = await cardText("health-factor");
      check(
        `${fx.label}: health factor reads ${hfLabel(a.after.healthFactor)}`,
        hf.endsWith(hfLabel(a.after.healthFactor)),
        hf,
      );
      if (big(a.before.totalCollateralBase) > BigInt(0) || big(a.after.totalCollateralBase) > BigInt(0)) {
        const limits = await text(block.locator("[data-ltv-limits]"));
        check(
          `${fx.label}: LTV cell reads "${bpsPct(a.after.ltvBps)} maximum; liquidation at ${bpsPct(a.after.liquidationThresholdBps)}"`,
          limits.includes(`${bpsPct(a.after.ltvBps)} maximum; liquidation at`) &&
            limits.endsWith(bpsPct(a.after.liquidationThresholdBps)),
          limits,
        );
        // availableBorrowsBase: collateral × max LTV (percentMul, half up) − debt, floored at zero.
        const roomBase =
          (big(a.after.totalCollateralBase) * BigInt(a.after.ltvBps) + BigInt(5000)) / BigInt(10000) -
          big(a.after.totalDebtBase);
        const room = roomBase > BigInt(0) ? fmtUsd(baseToUsd(roomBase.toString())) : "$0";
        const borrowable = await text(block.locator("[data-ltv-borrowable]"));
        check(`${fx.label}: the row reads "Still borrowable" ${room}`, borrowable === room, borrowable);
      }
    }
    // The eMode card draws only where a category is in use on either side.
    if (state.emode && (state.emode.before !== 0 || state.emode.after !== 0)) {
      const em = await cardText("emode");
      check(
        `${fx.label}: eMode reads ${emodeName(state, state.emode.after)}`,
        em.endsWith(emodeName(state, state.emode.after)),
        em,
      );
    } else if (state.emode) {
      check(
        `${fx.label}: no eMode card with no category in use`,
        (await block.locator('[data-position-card="emode"]').count()) === 0,
      );
    }

    // No second read: close and reopen, and the answer is drawn from memory.
    // The page also reads the previous transaction's state and prefetches on
    // hover, so the rule is per key: this card's transaction asked once, and
    // no key twice.
    await toggleCard(card);
    await page.waitForTimeout(300);
    await toggleCard(card);
    const again = await waitForAnswer(card);
    const own = asks.filter((u) => u.toLowerCase().includes(`tx=${fx.tx.toLowerCase()}`)).length;
    check(
      `${fx.label}: reopening draws the kept answer without a second request`,
      again === "ready" &&
        own === 1 &&
        asks.filter((u) => !retried.has(u)).length === new Set(asks.filter((u) => !retried.has(u))).size,
      `${own} request(s) for this transaction, ${asks.length} in all, ${new Set(asks).size} distinct, ${retried.size} retried after a refusal that can change`,
    );

    if (fx.deep) {
      // The closed cells' dollars (a side holding one reserve) follow
      // Display's two USD switches.
      const chipSel = '[data-position-state="ready"] [data-ledger-closed-usd]';
      await setDisplayFlag(page, "USD for stablecoins", true);
      await setDisplayFlag(page, "USD for other tokens", true);
      check(
        `${fx.label}: USD shows in the closed cells with both USD switches on`,
        (await card.locator(chipSel).count()) > 0,
      );
      await setDisplayFlag(page, "USD for stablecoins", false);
      await setDisplayFlag(page, "USD for other tokens", false);
      check(`${fx.label}: USD leaves when both USD switches are off`, (await card.locator(chipSel).count()) === 0);
      await setDisplayFlag(page, "USD for stablecoins", true);
      await setDisplayFlag(page, "USD for other tokens", true);
      if (a) {
        const hfReceipt = await receiptText(
          page,
          block.locator('[data-position-card="health-factor"]'),
          hfLabel(a.after.healthFactor),
        );
        check(
          `${fx.label}: the health factor's receipt states collateral × threshold ÷ debt`,
          !!hfReceipt && hfReceipt.includes("collateral × threshold ÷ debt"),
        );
      }
      const r0 = supplied[0];
      if (r0) {
        const amount = fmtAmount(humanOf(r0.supply.after, r0.decimals));
        const cell = block.locator('[data-receipt-total="supply"]');
        const balReceipt = await receiptText(
          page,
          cell,
          supplied.length === 1
            ? amount
            : cell.locator(`[data-closed-assets] span.prov-locate-box:has([title^="${amount} "])`).first(),
        );
        check(
          `${fx.label}: a supplied balance's receipt states scaled × index accrued to block time`,
          !!balReceipt && balReceipt.includes("scaled × index accrued to block time"),
        );
      }
      check(
        `${fx.label}: the card has no "Untraced input" caution`,
        !(await card.innerText()).includes("Untraced input"),
      );
    }
  } catch (err) {
    check(`${fx.label}: ran without throwing`, false, err && err.message);
  } finally {
    await page.close();
  }
}

// ── 3. A Base card asks its own route, never the Ethereum index's ───────────
// Base draws the position state at the block (ec0a255): the card reads
// /api/chain/aave-v3-base/position-state. The Ethereum route is the index's
// and a Base card must not call it.
const BASE_ROUTE = "/api/chain/aave-v3-base/position-state";
if (!only || only.test("base")) {
  console.log(`\n=== Base ===`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: bypassHeaders() });
  const asks = [];
  const baseAsks = [];
  page.on("request", (r) => {
    if (r.url().includes(ROUTE)) asks.push(r.url());
    if (r.url().includes(BASE_ROUTE)) baseAsks.push(r.url());
  });
  try {
    await page.goto(`${BASE}${BASE_PAGE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const first = page.locator("[data-event-id]").first();
    // Base reads its history by a live sweep of the chain's logs, which is slow on a cold route.
    await first.waitFor({ timeout: 300000 });
    await first.locator('[role="button"]').first().click();
    await first
      .locator('[data-position-state="ready"]')
      .waitFor({ timeout: 60000 })
      .catch(() => {});
    check(
      "base: an open Aave V3 Base card makes no request to the Ethereum index's position-state route",
      asks.length === 0,
      `${asks.length}`,
    );
    check("base: and asks the Base position-state route", baseAsks.length > 0, `${baseAsks.length}`);
    check(
      "base: an open Aave V3 Base card draws its position-state block",
      (await first.locator('[data-position-state="ready"]').count()) === 1,
    );
  } catch (err) {
    check("base: ran without throwing", false, err && err.message);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (pass + fail === 0) {
  console.log("No checks ran — a verdict over zero checks is not a pass.");
  process.exit(1);
}
process.exit(fail === 0 ? 0 : 1);
