#!/usr/bin/env node
// The Aave-family reserve page (anatomy M3, rails-ops TO-DO-ui-jobs 541): its
// figures agree with the market route it reads, its curve sits where the route
// says, and the market table's row (M1, a D4 linked row) opens it.
// ----------------------------------------------------------------------------
// The expected figures are worked out here from the route's raw fields,
// separately from lib/shared/aave-market-view.ts and the page's components.
//
// Checks, per fixture reserve:
//   1. The M1 row's link is `<market page>/<asset>`, and a press on the row's
//      Available cell (not the link) lands on that page.
//   2. The page names the reserve and stays inside the viewport's width.
//   3. Vitals match the route: Supplied, Borrowed, Available (the virtual
//      balance where the Pool has one, else supplied − borrowed, GHO included),
//      Supply rate, Borrow rate, Utilization (Supply APY, Borrow APY on SparkLend); where the supply cap is one token
//      and the borrow cap real (GHO on Core), the borrow capacity line under
//      Available is cap − borrowed.
//   4. The deficit line shows exactly when the route's deficit is at least
//      0.01% of the supplied amount (DEFICIT_SHOWN_SHARE).
//   5. The curve draws: its kink at the route's kink, today's point at the
//      route's utilisation (none where nothing is supplied).
//   6. Available's receipt opens in the inspector, armed from the head's ⋮.
//   7. "A reserve of <market>" links that Pool's reserves view, and lands on
//      its table.
//   8. History (M3.4) agrees with GET /api/aave-family/reserve-history over the
//      year the page asks for: its first and last day, its point count, the
//      days with no utilisation (a gap note where there are any), the latest
//      rates and utilisation in the readout, a drawn canvas, a mark where the
//      config log has a cap, reserve factor, collateral or freeze change in the
//      span, and its borrow rate's receipt opens. Arbitrum states it is not
//      indexed.
//   9. The change log (M3.6) lists the route's rows newest first (block and
//      kind per row, the first 20, each a timeline row on the event-card
//      shell), with the held line, SparkLend's CapAutomator line on SparkLend
//      only, and the newest row opens.
//  10. The largest suppliers and borrowers (M3.7, M3.8) are the route's ten a
//      side, wallet, amount and position link per row, a holder's receipt
//      opens, and a press on a row's amount cell lands on its position. Base
//      and Seamless state "Not ranked yet on Base.", Arbitrum "Not indexed yet
//      on Arbitrum.".
//  11. Aave V4 (lib/aave-v4/reserve.tsx): the change log (M3.6) lists
//      GET /api/aave-v4/reserve/config-log's rows newest first, the first ten,
//      each with words and its side (spoke or hub), the held line under it;
//      each head states the change with its side's tag; the newest row opens
//      to its explanation, and its Figures carry the receipt naming its event;
//      the Parameters section's "?" (M3.5) opens the plain-words panel, the
//      spoke's rows then the hub's; on Main USDC the 29 Oct freeze's node is a
//      snowflake in the warning tone and the 6 Nov draw-cap raise's a gauge
//      with the up arrow. On Base the one "Not indexed yet" line of the
//      "History and changes" tile.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-aave-reserve-page.mjs
//   (V4_ONLY=1 runs check 11 alone.)

import { chromium } from "playwright";
import { armInspector } from "./lib/prov-inspector.mjs";
import { showCardTab } from "./lib/card-tabs.mjs";

/** Arm one section of the page from its ⋮ (no page-wide toggle, ui-jobs 549/550). */
// Armed from the profile menu's switch, page-wide (ui-jobs 625); an Escape
// with no receipt open puts it down, so each read arms again.
const arm = (page) => armInspector(page).catch(() => false);

/** The upstream market each fixture's reads name (lib/api/fetch-aave-reserve-reads.ts). */
const API_MARKET = {
  "/api/chain/aave-v3/market": "core",
  "/api/chain/aave-v3/market?market=prime": "prime",
  "/api/chain/spark/market": "spark",
  "/api/chain/seamless/market": "seamless",
  "/api/chain/aave-v3-base/market": "base",
  "/api/chain/aave-v3-arbitrum/market": "arbitrum",
};
const MARKED = new Set(["supply-cap", "borrow-cap", "reserve-factor", "collateral", "frozen"]);
const CHANGES_SHOWN = 20;

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const WAIT = 180000;

// `market` is the page with the Pool's reserves table; `base` the route a
// reserve page sits under, `query` what it carries (Aave V3 on Ethereum's
// three Pools share one route and are chosen with `?market=`).
const FIXTURES = [
  {
    market: "/ethereum/aave-v3/markets?market=core",
    base: "/ethereum/aave-v3/markets",
    query: "",
    api: "/api/chain/aave-v3/market",
    symbol: "WETH",
  },
  {
    market: "/ethereum/aave-v3/markets?market=core",
    base: "/ethereum/aave-v3/markets",
    query: "",
    api: "/api/chain/aave-v3/market",
    symbol: "USDC",
  },
  {
    market: "/ethereum/aave-v3/markets?market=core",
    base: "/ethereum/aave-v3/markets",
    query: "",
    api: "/api/chain/aave-v3/market",
    symbol: "GHO",
  },
  {
    market: "/ethereum/aave-v3/markets?market=prime",
    base: "/ethereum/aave-v3/markets",
    query: "?market=prime",
    api: "/api/chain/aave-v3/market?market=prime",
    symbol: "WETH",
  },
  { market: "/ethereum/spark/markets", api: "/api/chain/spark/market", symbol: "DAI" },
  { market: "/base/seamless/markets", api: "/api/chain/seamless/market", symbol: "USDC" },
  { market: "/base/aave-v3/markets", api: "/api/chain/aave-v3-base/market", symbol: "cbBTC" },
  { market: "/arbitrum/aave-v3/markets", api: "/api/chain/aave-v3-arbitrum/market", symbol: "WETH" },
];

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
/** "$4.7B" → 4.7e9; "1.2K WETH" → 1200. */
function parseAmount(t) {
  const m = /\$?([\d.,]+)\s*([KMB]?)/.exec(t ?? "");
  return m ? Number(m[1].replace(/,/g, "")) * { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]] : NaN;
}
/** Within the compact figure's rounding: three significant digits, or a cent. */
const near = (got, want) => Math.abs(got - want) <= Math.max(Math.abs(want) * 0.03, 0.01);
const pctOf = (t) => {
  const m = /([\d.]+)%/.exec(t ?? "");
  return m ? Number(m[1]) : NaN;
};

const browser = await chromium.launch();
const routes = new Map();
for (const f of process.env.V4_ONLY ? [] : FIXTURES) {
  if (!routes.has(f.api)) routes.set(f.api, await (await fetch(`${BASE}${f.api}`)).json());
  const data = routes.get(f.api);
  const r = data.reserves?.find((x) => x.symbol === f.symbol);
  const tag = `${f.market} ${f.symbol}`;
  if (!r) {
    check(`${tag} 0  the route carries the reserve`, false);
    continue;
  }
  const base = f.base ?? f.market;
  const want = `${base}/${r.address}`;
  const wantHref = `${want}${f.query ?? ""}`;

  // ── 1. The M1 row links to the page ──────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${BASE}${f.market}`, NAV);
  const row = page.locator(`tr[data-reserve-row="${r.address}"]`);
  await row.waitFor({ timeout: WAIT });
  const href = await row.locator(`[data-reserve-link="${r.address}"]`).getAttribute("href");
  check(`${tag} 1a M1 row link`, href === wantHref, `${href} vs ${wantHref}`);
  await row.locator("[data-available]").click({ position: { x: 4, y: 4 } });
  await page.waitForURL((u) => u.pathname === want, { timeout: 60000 }).catch(() => {});
  check(`${tag} 1b a press on the row opens the page`, new URL(page.url()).pathname === want, page.url());

  // ── 2–6. The page ────────────────────────────────────────────────────────
  if (new URL(page.url()).pathname !== want) await page.goto(`${BASE}${wantHref}`, NAV);
  await page.locator("[data-reserve-vitals]").waitFor({ timeout: WAIT });
  await page.waitForTimeout(500);
  const got = await page.evaluate(() => {
    const t = (k) => document.querySelector(`[data-vital="${k}"]`)?.textContent ?? null;
    const curve = document.querySelector("[data-rate-curve]");
    return {
      symbol: document.querySelector("[data-reserve-symbol]")?.textContent,
      sw: document.scrollingElement.scrollWidth,
      cw: document.scrollingElement.clientWidth,
      supplied: t("supplied"),
      borrowed: t("borrowed"),
      available: t("available"),
      capacity: document.querySelector("[data-reserve-capacity]")?.textContent ?? null,
      supplyRate: t("supply-rate"),
      borrowRate: t("borrow-rate"),
      util: t("utilisation"),
      deficit: document.querySelector("[data-reserve-deficit]")?.textContent ?? null,
      kink: curve ? Number(curve.getAttribute("data-kink")) : null,
      nowU: curve?.getAttribute("data-now-u") ?? null,
      nowDots: document.querySelectorAll("[data-now-borrow], [data-now-supply]").length,
      kinkLine: Boolean(document.querySelector("[data-kink-line]")),
    };
  });
  check(`${tag} 2  names the reserve, no sideways scroll`, got.symbol === r.symbol && got.sw <= got.cw + 1);

  const price = r.priceUsd ?? 0;
  check(
    `${tag} 3a Supplied`,
    near(parseAmount(got.supplied), r.supplied * price),
    `${norm(got.supplied)} vs $${(r.supplied * price).toFixed(0)}`,
  );
  if (r.borrowed > 0)
    check(
      `${tag} 3b Borrowed`,
      near(parseAmount(got.borrowed), r.borrowed * price),
      `${norm(got.borrowed)} vs $${(r.borrowed * price).toFixed(0)}`,
    );
  {
    const tokens = r.virtualBalance ?? Math.max(0, r.supplied - r.borrowed);
    check(
      `${tag} 3c Available (${r.virtualBalance != null ? "virtual balance" : "supplied − borrowed"})`,
      near(parseAmount(got.available), tokens * price),
      `${norm(got.available)} vs $${(tokens * price).toFixed(0)}`,
    );
  }
  {
    const sCap = r.supplyCapMax ?? r.supplyCap;
    const bCap = r.borrowCapMax ?? r.borrowCap;
    const closedSupply = sCap === 1 && r.borrowEnabled && bCap != null && bCap > 1 && bCap < 2 ** 36 - 1;
    if (closedSupply) {
      const room = Math.max(0, bCap - r.borrowed) * price;
      check(
        `${tag} 3g borrow capacity under Available is cap − borrowed`,
        near(parseAmount((got.capacity ?? "").replace(/borrow capacity/, "")), room),
        `${norm(got.capacity)} vs $${room.toFixed(0)}`,
      );
    } else check(`${tag} 3g no borrow capacity line (supply side open)`, got.capacity == null, norm(got.capacity));
  }
  // SparkLend states each rate as an APY: the Pool's rate compounded each
  // second for a year (lib/aave-family/apy.ts, restated; ui-jobs 611).
  const inForm = (apr) => (API_MARKET[f.api] === "spark" ? Math.expm1(31_536_000 * Math.log1p(apr / 31_536_000)) : apr);
  const rateOk = (text, apr) => {
    const p = inForm(apr) * 100;
    if (p === 0) return /0\.00%/.test(text);
    if (p < 0.0001) return /<0\.0001%/.test(text);
    // Two decimals from 0.01%, one significant digit below (lib/shared/rate-percent.ts).
    const step = p >= 0.01 ? 0.01 : 10 ** Math.floor(Math.log10(p));
    return Math.abs(pctOf(text) - p) <= step * 0.51;
  };
  if (r.supplied > 0)
    check(
      `${tag} 3d Supply rate`,
      rateOk(got.supplyRate, r.supplyApr),
      `${norm(got.supplyRate)} vs ${(r.supplyApr * 100).toFixed(4)}%`,
    );
  if (r.borrowed > 0)
    check(
      `${tag} 3e Borrow rate`,
      rateOk(got.borrowRate, r.borrowApr),
      `${norm(got.borrowRate)} vs ${(r.borrowApr * 100).toFixed(4)}%`,
    );
  if (r.utilization != null && r.supplied > 0)
    check(
      `${tag} 3f Utilization`,
      Math.abs(pctOf(got.util) - Math.round(r.utilization * 100)) <= 1,
      `${norm(got.util)} vs ${(r.utilization * 100).toFixed(1)}%`,
    );

  {
    const shows = (r.deficit ?? 0) > 0 && r.deficit >= 0.0001 * r.supplied;
    check(
      `${tag} 4  deficit line ${shows ? "shown" : "absent"} (${r.deficit ?? "no read"} vs 0.01% of ${r.supplied.toFixed(2)})`,
      shows ? got.deficit != null && /deficit/.test(got.deficit) : got.deficit == null,
      norm(got.deficit),
    );
  }

  check(
    `${tag} 5a curve draws with its kink`,
    got.kinkLine && got.kink != null && r.kink != null && Math.abs(got.kink - r.kink) < 1e-6,
    `kink ${got.kink} vs ${r.kink}`,
  );
  if (r.supplied > 0 && r.utilization != null)
    check(
      `${tag} 5b today's point at the route's utilisation`,
      got.nowDots === 2 && Math.abs(Number(got.nowU) - Math.min(1, r.utilization)) < 1e-6,
      `u ${got.nowU} vs ${r.utilization}`,
    );

  let pop = "";
  if (await arm(page)) {
    await page.locator(`[data-vital="available"] [data-prov-pickable]`).first().click();
    await page.waitForSelector(".prov-inspect-pop", { timeout: 10000 }).catch(() => {});
    pop = norm(
      await page
        .locator(".prov-inspect-pop")
        .first()
        .innerText()
        .catch(() => ""),
    );
  }
  check(`${tag} 6  Available's receipt opens`, pop.length > 0, pop.slice(0, 100));
  // ── 8–10. The indexed reads ──────────────────────────────────────────────
  await page.keyboard.press("Escape");
  const q = `market=${API_MARKET[f.api]}&reserve=${r.address}`;
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const read = async (path) => {
    const res = await fetch(`${BASE}/api/aave-family/${path}`);
    return res.ok ? res.json() : { error: res.status };
  };
  const [hist, cfg, holders] = await Promise.all([
    read(`reserve-history?${q}&from=${from}`),
    read(`reserve-config-log?${q}`),
    read(`reserve-holders?${q}`),
  ]);
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          '[data-anatomy~="M3.4"] .animate-pulse, [data-anatomy~="M3.6"] .animate-pulse, [data-anatomy~="M3.7"] .animate-pulse',
        ),
      null,
      { timeout: WAIT },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
  const ix = await page.evaluate(() => {
    const h = document.querySelector("[data-reserve-history]");
    const canvas = document.querySelector("[data-history-canvas] canvas");
    const t = (sel) => document.querySelector(sel)?.textContent ?? null;
    return {
      notIndexed: t("[data-reserve-not-indexed]"),
      notHeld: [...document.querySelectorAll("[data-reserve-not-held]")].map((e) => e.textContent),
      failed: document.querySelectorAll("[data-reserve-read-failed]").length,
      hist: h ? { ...h.dataset } : null,
      canvas: canvas ? canvas.width * canvas.height : 0,
      marks: Number(document.querySelector("[data-history-marks]")?.getAttribute("data-history-marks") ?? 0),
      gapNotes: document.querySelectorAll("[data-history-gap-note]").length,
      borrow: t("[data-history-borrow]"),
      supply: t("[data-history-supply]"),
      util: t("[data-history-utilisation]"),
      rows: [...document.querySelectorAll("[data-change-row]")].map((tr) => ({
        block: Number(tr.getAttribute("data-change-block")),
        kind: tr.getAttribute("data-change-kind"),
        words: tr.getAttribute("data-change-words") ?? "",
      })),
      held: t("[data-change-log-held]"),
      automator: Boolean(document.querySelector("[data-change-log-automator]")),
      holders: Object.fromEntries(
        ["suppliers", "borrowers"].map((side) => [
          side,
          [...document.querySelectorAll(`[data-holders="${side}"] tr[data-holder-row]`)].map((tr) => ({
            wallet: tr.getAttribute("data-holder-row"),
            href: tr.querySelector("[data-row-link]")?.getAttribute("href"),
            amount: tr.querySelector("[data-holder-amount]")?.getAttribute("data-holder-amount"),
          })),
        ]),
      ),
      refreshed: document.querySelectorAll("[data-holders-refreshed]").length,
    };
  });
  check(`${tag} 8  no indexed read failed on the page`, ix.failed === 0, `${ix.failed} failed`);
  if (hist.status === "not-indexed") {
    check(
      `${tag} 8a history, changes and holders state "Not indexed yet"`,
      /Not indexed yet on Arbitrum\./.test(ix.notIndexed ?? ""),
      norm(ix.notIndexed),
    );
  } else if (!hist.points) {
    check(`${tag} 8a the history route answers`, false, JSON.stringify(hist).slice(0, 120));
  } else {
    const pts = hist.points;
    const last = pts[pts.length - 1];
    const gaps = pts.filter((p) => p.utilisation == null).length;
    check(
      `${tag} 8a history spans the route's year`,
      ix.hist &&
        Number(ix.hist.historyPoints) === pts.length &&
        ix.hist.historyFrom === pts[0]?.date &&
        ix.hist.historyTo === last?.date,
      `${ix.hist?.historyPoints} points ${ix.hist?.historyFrom}…${ix.hist?.historyTo} vs ${pts.length} ${pts[0]?.date}…${last?.date}`,
    );
    check(`${tag} 8b the chart draws`, ix.canvas > 0 && pts.length > 1, `canvas ${ix.canvas}px²`);
    check(
      `${tag} 8c utilisation gaps match the route, with a note where there are any`,
      Number(ix.hist?.historyGaps) === gaps && (gaps === 0 ? ix.gapNotes === 0 : ix.gapNotes > 0),
      `${ix.hist?.historyGaps} gaps, ${ix.gapNotes} notes vs ${gaps} null days`,
    );
    if (last) {
      check(
        `${tag} 8d latest rates in the readout`,
        rateOk(ix.borrow, last.borrowApr) && rateOk(ix.supply, last.supplyApr),
        `${norm(ix.borrow)} / ${norm(ix.supply)} vs ${(last.borrowApr * 100).toFixed(4)}% / ${(last.supplyApr * 100).toFixed(4)}%`,
      );
      check(
        `${tag} 8e latest utilisation in the readout`,
        last.utilisation == null
          ? /not drawn/.test(ix.util ?? "")
          : Math.abs(pctOf(ix.util) - last.utilisation * 100) <= 0.06,
        `${norm(ix.util)} vs ${last.utilisation == null ? "null" : (last.utilisation * 100).toFixed(2)}`,
      );
    }
    const firstTs = pts.length ? Date.parse(`${pts[0].date}T00:00:00Z`) / 1000 : Infinity;
    const marked = (cfg.logs ?? []).filter((l) => MARKED.has(l.kind) && l.timestamp >= firstTs).length;
    check(
      `${tag} 8f a mark where the span holds a marked change`,
      marked === 0 ? ix.marks === 0 : ix.marks > 0,
      `${ix.marks} marks for ${marked} changes`,
    );
    let hpop = "";
    await page.keyboard.press("Escape");
    if (await arm(page)) {
      await page.locator("[data-history-borrow]").first().click();
      await page.waitForSelector(".prov-inspect-pop", { timeout: 10000 }).catch(() => {});
      hpop = norm(
        await page
          .locator(".prov-inspect-pop")
          .first()
          .innerText()
          .catch(() => ""),
      );
      await page.keyboard.press("Escape");
    }
    check(
      `${tag} 8g the history's borrow rate receipt opens`,
      /ReserveDataUpdated|reserve-history/.test(hpop),
      hpop.slice(0, 100),
    );
  }

  if (cfg.logs && cfg.status !== "not-indexed") {
    const want = [...cfg.logs].reverse().slice(0, CHANGES_SHOWN);
    check(
      `${tag} 9a change log rows match the route, newest first`,
      ix.rows.length === want.length &&
        want.every((l, i) => ix.rows[i]?.block === l.block && ix.rows[i]?.kind === l.kind && ix.rows[i]?.words),
      `${ix.rows.length} rows vs ${want.length}; first ${ix.rows[0]?.block} ${ix.rows[0]?.kind} "${ix.rows[0]?.words}" vs ${want[0]?.block} ${want[0]?.kind}`,
    );
    check(`${tag} 9b the held line`, /held from/.test(ix.held ?? ""), norm(ix.held));
    check(
      `${tag} 9c CapAutomator line on SparkLend only`,
      ix.automator === (API_MARKET[f.api] === "spark"),
      String(ix.automator),
    );
    // The newest row opens: its Explanation where its kind has one, else its Figures.
    const row = page.locator('[data-anatomy~="M3.6"] [data-change-row]').first();
    let opened = "";
    if (ix.rows.length) {
      await row.locator('[data-anatomy="T1"] [aria-expanded]').first().click();
      await row
        .locator('[data-anatomy="T2"]')
        .waitFor({ timeout: 10000 })
        .catch(() => {});
      opened = norm(
        await row
          .locator('[data-anatomy="T2"]')
          .innerText()
          .catch(() => ""),
      );
    }
    check(`${tag} 9d the newest row opens`, opened.length > 10, opened.slice(0, 100));
  }

  if (holders.status === "not-ranked" || holders.status === "not-indexed") {
    if (holders.status === "not-ranked")
      check(
        `${tag} 10a holders state "Not ranked yet on Base."`,
        ix.notHeld.some((t) => /Not ranked yet on Base\./.test(t)) &&
          ix.holders.suppliers.length + ix.holders.borrowers.length === 0,
        ix.notHeld.join(" | "),
      );
  } else if (holders.suppliers) {
    for (const side of ["suppliers", "borrowers"]) {
      const want = holders[side];
      const got = ix.holders[side];
      check(
        `${tag} 10a ${side}: the route's ${want.length}, wallet, amount and link per row`,
        got.length === want.length &&
          want.every(
            (w, i) => got[i]?.wallet === w.wallet && got[i]?.amount === w.amount && got[i]?.href === w.positionPath,
          ),
        `${got.length} rows vs ${want.length}; first ${got[0]?.wallet} ${got[0]?.href}`,
      );
    }
    check(`${tag} 10b refresh line under each table`, ix.refreshed === 2, String(ix.refreshed));
    let opop = "";
    await page.keyboard.press("Escape");
    if (await arm(page)) {
      await page.locator('[data-holders="suppliers"] [data-holder-amount] [data-prov-pickable]').first().click();
      await page.waitForSelector(".prov-inspect-pop", { timeout: 10000 }).catch(() => {});
      opop = norm(
        await page
          .locator(".prov-inspect-pop")
          .first()
          .innerText()
          .catch(() => ""),
      );
      await page.keyboard.press("Escape");
    }
    check(`${tag} 10c a holder's receipt opens, naming the view`, /mv_|refreshed/i.test(opop), opop.slice(0, 100));
  }

  // ── 7. The market link lands on the reserves view ──────────────────────────
  await page.keyboard.press("Escape");
  const marketLink = await page.locator("[data-reserve-market-link]").getAttribute("href");
  check(`${tag} 7a "A reserve of" links the reserves view`, marketLink === f.market, `${marketLink} vs ${f.market}`);
  await page.locator("[data-reserve-market-link]").click();
  await page.waitForURL((u) => `${u.pathname}${u.search}` === f.market, { timeout: 60000 }).catch(() => {});
  const landed = new URL(page.url());
  const table = await page
    .locator("tr[data-reserve-row]")
    .first()
    .waitFor({ timeout: WAIT })
    .then(() => true)
    .catch(() => false);
  check(
    `${tag} 7b it lands on the reserves table`,
    `${landed.pathname}${landed.search}` === f.market && table,
    page.url(),
  );
  if (holders.suppliers?.length) {
    const target = holders.suppliers[0].positionPath;
    await page.goto(`${BASE}${wantHref}`, NAV);
    const cell = page
      .locator(
        `[data-holders="suppliers"] tr[data-holder-row="${holders.suppliers[0].wallet}"] td:has([data-holder-amount])`,
      )
      .first();
    await cell.waitFor({ timeout: WAIT });
    await cell.click({ position: { x: 4, y: 4 } });
    // A path carries its Pool's `?market=` on Prime and EtherFi.
    const t = new URL(target, BASE);
    const at = (u) => u.pathname === t.pathname && [...t.searchParams].every(([k, v]) => u.searchParams.get(k) === v);
    await page.waitForURL(at, { timeout: 120000 }).catch(() => {});
    check(`${tag} 10d a press on a holder row lands on its position`, at(new URL(page.url())), page.url());
  }
  await page.close();
}

// ── 11. Aave V4's change log (M3.6) ────────────────────────────────────────────
const V4_FIXTURES = [
  {
    path: "/ethereum/aave-v4/markets/main/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    q: "spoke=main&asset=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48&hub=core",
  },
  {
    path: "/ethereum/aave-v4/markets/usdg-paxg/0xe343167631d89b6ffc58b88d6b7fb0228795491d",
    q: "spoke=usdg_paxg&asset=0xe343167631d89b6ffc58b88d6b7fb0228795491d",
  },
  {
    path: "/ethereum/aave-v4/markets/bluechip/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48?hub=core",
    q: "spoke=bluechip&asset=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48&hub=core",
  },
  { path: "/base/aave-v4/markets/mag7/0xb200000000000000000000c2e324d24d7eecd1fb", q: null },
];
const V4_SHOWN = 10;
const V4_HUB_KINDS = new Set(["asset-config", "credit-line", "rate-curve"]);
for (const f of V4_FIXTURES) {
  const tag = `V4 ${f.path}`;
  const cfg = f.q ? await (await fetch(`${BASE}/api/aave-v4/reserve/config-log?${f.q}`)).json() : null;
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${BASE}${f.path}`, NAV);
  // The section draws before its read settles: wait for rows, the empty line or a stated gap.
  await page
    .waitForSelector(
      '[data-anatomy~="M3.6"] :is([data-change-row], [data-change-log-empty], [data-reserve-not-indexed], [data-reserve-read-failed])',
      { timeout: WAIT },
    )
    .catch(() => {});
  const got = await page.evaluate(() => {
    const s = document.querySelector('[data-anatomy~="M3.6"]');
    return {
      rows: [...(s?.querySelectorAll("[data-change-row]") ?? [])].map((tr) => ({
        block: Number(tr.getAttribute("data-change-block")),
        kind: tr.getAttribute("data-change-kind"),
        side: tr.getAttribute("data-change-side"),
        words: tr.getAttribute("data-change-words") ?? "",
      })),
      held: s?.querySelector("[data-change-log-held]")?.textContent ?? null,
      empty: Boolean(s?.querySelector("[data-change-log-empty]")),
      notIndexed: s?.querySelector("[data-reserve-not-indexed]")?.textContent ?? null,
    };
  });
  if (!cfg) {
    check(
      `${tag} 11a Base states the one line`,
      /Not indexed yet on Base/.test(got.notIndexed ?? "") && got.rows.length === 0,
      norm(got.notIndexed),
    );
    await page.close();
    continue;
  }
  const want = [...(cfg.logs ?? [])].reverse().slice(0, V4_SHOWN);
  check(
    `${tag} 11a rows match the route, newest first, each with words and its side`,
    (cfg.logs?.length ?? 0) === 0
      ? got.empty
      : got.rows.length === want.length &&
          want.every(
            (l, i) =>
              got.rows[i]?.block === l.block &&
              got.rows[i]?.kind === l.kind &&
              got.rows[i]?.side === (V4_HUB_KINDS.has(l.kind) ? "hub" : "spoke") &&
              got.rows[i]?.words,
          ),
    `${got.rows.length} rows vs ${want.length}; first ${got.rows[0]?.block} ${got.rows[0]?.kind} "${got.rows[0]?.words}"`,
  );
  check(`${tag} 11b the held line`, /held from|not held/.test(got.held ?? ""), norm(got.held));
  // The head (T1): plain words, and the side's tag in the time slot.
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll('[data-anatomy~="M3.6"] [data-change-row]')].map((r) => ({
      side: r.getAttribute("data-change-side"),
      words: r.querySelector('[data-anatomy="T1"]')?.textContent ?? "",
      tag: r.querySelector("[data-head-tag]")?.getAttribute("data-head-tag") ?? null,
    })),
  );
  check(
    `${tag} 11d each row's head states the change and the side it was set on`,
    heads.length === got.rows.length &&
      heads.every((h) => /[A-Za-z]{4}/.test(h.words) && h.tag === h.side && /(spoke|hub)/.test(h.words)),
    heads[0] ? `${norm(heads[0].words)} [${heads[0].tag}]` : "no rows",
  );
  // The node's mark (Main USDC): the 29 Oct freeze a snowflake in the warning
  // tone, the 6 Nov draw-cap raise a gauge with the up arrow.
  if (f.path.includes("/main/0xa0b8")) {
    const marks = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-anatomy~="M3.6"] [data-change-row]')].map((r) => [
          `${r.getAttribute("data-change-block")}:${r.getAttribute("data-change-kind")}`,
          [
            r.getAttribute("data-change-glyph"),
            r.getAttribute("data-change-direction"),
            r.getAttribute("data-change-tone"),
            Boolean(r.querySelector(`[data-spine-change-glyph="${r.getAttribute("data-change-glyph")}"]`)),
          ].join("|"),
        ]),
      ),
    );
    check(
      `${tag} 11g the freeze's node is a snowflake in the warning tone, the draw-cap raise a gauge going up`,
      marks["26301157:reserve-config"] === "snowflake||caution|true" &&
        marks["26355192:credit-line"] === "gauge|up||true",
      `${marks["26301157:reserve-config"]} / ${marks["26355192:credit-line"]}`,
    );
  }
  // Opened (T2, T3): the Explanation first, then the Figures with the receipt.
  const first = page.locator('[data-anatomy~="M3.6"] [data-change-row]').first();
  let bullets = 0;
  let pop = "";
  if (got.rows.length) {
    await first.locator('[data-anatomy="T1"] [aria-expanded]').first().click();
    await first
      .locator("[data-change-explain] li")
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    bullets = await first.locator("[data-change-explain] li").count();
    // Armed from the profile menu's switch; the card turned to its Figures.
    if (await arm(page)) {
      await showCardTab(first, "figures").catch(() => {});
      await first.locator('[data-figure="config-change"] [data-prov-pickable]').first().click();
      await page.waitForSelector(".prov-inspect-pop", { timeout: 10000 }).catch(() => {});
      pop = norm(
        await page
          .locator(".prov-inspect-pop")
          .first()
          .innerText()
          .catch(() => ""),
      );
      await page.keyboard.press("Escape");
    }
  }
  check(`${tag} 11e the newest row opens to its explanation`, bullets >= 1, `${bullets} bullets`);
  check(`${tag} 11c a row's receipt names its event`, /event at block/.test(pop), pop.slice(0, 120));
  // M3.5's "?": the parameters in plain words, by the side that sets them.
  const help = page.locator('[data-anatomy~="M3.5"] button[aria-label="Parameters, learn more"]');
  let groups = [];
  if (await help.count()) {
    await page.keyboard.press("Escape");
    await help.click();
    const dialog = page.locator('[role="dialog"][aria-label="What the parameters mean"]');
    await dialog.waitFor({ timeout: 10000 }).catch(() => {});
    groups = await dialog
      .locator("[data-learn-more-group]")
      .evaluateAll((gs) => gs.map((g) => [g.getAttribute("data-learn-more-group"), g.querySelectorAll("li").length]));
    await page.keyboard.press("Escape");
  }
  check(
    `${tag} 11f M3.5's explanation opens, a bullet a row, spoke then hub`,
    groups.length === 2 && /spoke$/.test(groups[0][0]) && /hub$/.test(groups[1][0]) && groups.every((g) => g[1] >= 4),
    JSON.stringify(groups),
  );
  await page.close();
}

await browser.close();
if (checks === 0) {
  console.log("\nCRASH: no checks ran");
  process.exit(2);
}
console.log(failures === 0 ? `\nALL PASS (${checks})` : `\n${failures} FAILURE(S) of ${checks}`);
process.exit(failures === 0 ? 0 : 1);
