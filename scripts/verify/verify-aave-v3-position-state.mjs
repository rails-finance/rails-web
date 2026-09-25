// The open Aave V3 Ethereum card reads the position state around its event's
// transaction (rails-ops TO-DO-ui-jobs §19): every supplied and borrowed reserve
// with its exact before → after (USD, collateral on/off), total collateral, total
// debt, health factor, LTV, liquidation threshold and eMode. A balance the block
// lists is stated there and nowhere else — the grid's cell for that reserve is
// the statement only until the read lands (§47).
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
// plus one Base card, which must never ask.
//
// Until rails-server serves the route this fails at the first check of every
// fixture, and says so. Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-aave-v3-position-state.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const ROUTE = "/api/aave-v3/timeline/position-state";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const USDE = "0x4c9edd5852cd905f086c759e8383e09bff1e68b3";

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
const hfLabel = (wad) => {
  if (wad == null) return "∞";
  const n = Number(big(wad) / pow10(14)) / 1e4;
  return n >= 100 ? "∞" : n.toFixed(2);
};
const bpsPct = (bps) => `${(bps / 100).toFixed(2)}%`;
const emodeName = (state, id) => (id === 0 ? "None" : state.emode?.categories?.[String(id)]?.label || `Category ${id}`);
const held = (leg) => big(leg?.before) > BigInt(0) || big(leg?.after) > BigInt(0);

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
    const res = await fetch(`${BASE}${ROUTE}?${qs}`).catch((e) => ({ ok: false, status: 0, e }));
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
  const toggle = page.locator("button.prov-inspect-toggle").first();
  if ((await toggle.count()) === 0) return null;
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
    await page.waitForTimeout(300);
  }
  const target = scope.locator("span.prov-locate-box").filter({ hasText: valueText }).first();
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const asks = [];
  page.on("request", (r) => {
    if (r.url().includes(ROUTE)) asks.push(r.url());
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

    // Supplied and borrowed lists: one line per held reserve, amount, USD and
    // the collateral switch.
    for (const [side, rows] of [
      ["supply", supplied],
      ["debt", borrowed],
    ]) {
      const lines = block.locator(`[data-position-reserves="${side}"] > span`);
      const n = await lines.count();
      check(`${fx.label}: ${side} list has ${rows.length} line(s)`, n === rows.length, `${n} drawn`);
      const texts = [];
      for (let i = 0; i < n; i++) texts.push(await text(lines.nth(i)));
      for (const r of rows) {
        const leg = r[side];
        const amount = fmtAmount(humanOf(leg.after, r.decimals));
        const usd =
          r.priceBase && big(leg.after) > BigInt(0) ? fmtUsd(rawToUsd(leg.after, r.priceBase, r.decimals)) : null;
        const line = texts.find((t) => t.includes(amount) && (!usd || t.includes(usd)));
        check(
          `${fx.label}: ${side} line for ${r.symbol} reads ${amount}${usd ? ` and ${usd}` : ""}`,
          !!line,
          texts.join(" | "),
        );
        if (side === "supply" && r.collateral && line)
          check(
            `${fx.label}: ${r.symbol} collateral reads ${r.collateral.after ? "on" : "off"}`,
            new RegExp(`Collateral.*${r.collateral.after ? "on" : "off"}$`).test(line),
            line,
          );
      }
    }

    // Account figures.
    const cardText = async (key) => text(block.locator(`[data-position-card="${key}"]`));
    const a = state.account;
    if (a) {
      check(
        `${fx.label}: total collateral reads ${fmtUsd(baseToUsd(a.after.totalCollateralBase))}`,
        (await cardText("total-collateral")).includes(
          big(a.after.totalCollateralBase) === BigInt(0) ? "$0" : fmtUsd(baseToUsd(a.after.totalCollateralBase)),
        ),
      );
      check(
        `${fx.label}: total debt reads ${fmtUsd(baseToUsd(a.after.totalDebtBase))}`,
        (await cardText("total-debt")).includes(
          big(a.after.totalDebtBase) === BigInt(0) ? "$0" : fmtUsd(baseToUsd(a.after.totalDebtBase)),
        ),
      );
      const hf = await cardText("health-factor");
      check(
        `${fx.label}: health factor reads ${hfLabel(a.after.healthFactor)}`,
        hf.endsWith(hfLabel(a.after.healthFactor)),
        hf,
      );
      check(
        `${fx.label}: LTV reads ${bpsPct(a.after.ltvBps)}`,
        (await cardText("ltv")).endsWith(bpsPct(a.after.ltvBps)),
      );
      check(
        `${fx.label}: liquidation threshold reads ${bpsPct(a.after.liquidationThresholdBps)}`,
        (await cardText("liquidation-threshold")).endsWith(bpsPct(a.after.liquidationThresholdBps)),
      );
    }
    if (state.emode) {
      const em = await cardText("emode");
      check(
        `${fx.label}: eMode reads ${emodeName(state, state.emode.after)}`,
        em.endsWith(emodeName(state, state.emode.after)),
        em,
      );
    }

    // No second read: close and reopen, and the answer is drawn from memory.
    await toggleCard(card);
    await page.waitForTimeout(300);
    await toggleCard(card);
    const again = await waitForAnswer(card);
    check(
      `${fx.label}: reopening draws the kept answer without a second request`,
      again === "ready" && asks.length === 1,
      `${asks.length} request(s)`,
    );

    if (fx.deep) {
      const chipSel = '[data-position-state="ready"] span.border-l-2.border-r-2.border-rb-500';
      check(`${fx.label}: USD chips render in the position block`, (await card.locator(chipSel).count()) > 0);
      await setDisplayFlag(page, "USD Values", false);
      check(`${fx.label}: USD chips leave when USD values are off`, (await card.locator(chipSel).count()) === 0);
      await setDisplayFlag(page, "USD Values", true);
      check(`${fx.label}: USD chips return when USD values are on`, (await card.locator(chipSel).count()) > 0);
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
        const balReceipt = await receiptText(page, block.locator('[data-position-reserves="supply"]'), amount);
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

// ── 3. A Base card never asks ───────────────────────────────────────────────
if (!only || only.test("base")) {
  console.log(`\n=== Base ===`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const asks = [];
  page.on("request", (r) => {
    if (r.url().includes(ROUTE)) asks.push(r.url());
  });
  try {
    await page.goto(`${BASE}${BASE_PAGE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const first = page.locator("[data-event-id]").first();
    // Base reads its history by a live sweep of the chain's logs, which is slow on a cold route.
    await first.waitFor({ timeout: 300000 });
    await first.locator('[role="button"]').first().click();
    await page.waitForTimeout(4000);
    check("base: an open Aave V3 Base card makes no position-state request", asks.length === 0, `${asks.length}`);
    check(
      "base: an open Aave V3 Base card draws no position-state block",
      (await first.locator("[data-position-state]").count()) === 0,
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
