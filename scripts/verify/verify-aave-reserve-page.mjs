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
//      Supply rate, Borrow rate, Utilisation; where the supply cap is one token
//      and the borrow cap real (GHO on Core), the borrow capacity line under
//      Available is cap − borrowed.
//   4. The deficit line shows exactly when the route's deficit is at least
//      0.01% of the supplied amount (DEFICIT_SHOWN_SHARE).
//   5. The curve draws: its kink at the route's kink, today's point at the
//      route's utilisation (none where nothing is supplied).
//   6. Available's receipt opens in the inspector.
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
//      kind per row, the first 20), with the held line, and SparkLend's
//      CapAutomator line on SparkLend only.
//  10. The largest suppliers and borrowers (M3.7, M3.8) are the route's ten a
//      side, wallet, amount and position link per row, a holder's receipt
//      opens, and a press on a row's amount cell lands on its position. Base
//      and Seamless state "Not ranked yet on Base.", Arbitrum "Not indexed yet
//      on Arbitrum.".
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-aave-reserve-page.mjs

import { chromium } from "playwright";
import { armInspector } from "./lib/prov-inspector.mjs";

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
    market: "/ethereum/aave-v3/market?market=core",
    base: "/ethereum/aave-v3/market",
    query: "",
    api: "/api/chain/aave-v3/market",
    symbol: "WETH",
  },
  {
    market: "/ethereum/aave-v3/market?market=core",
    base: "/ethereum/aave-v3/market",
    query: "",
    api: "/api/chain/aave-v3/market",
    symbol: "USDC",
  },
  {
    market: "/ethereum/aave-v3/market?market=core",
    base: "/ethereum/aave-v3/market",
    query: "",
    api: "/api/chain/aave-v3/market",
    symbol: "GHO",
  },
  {
    market: "/ethereum/aave-v3/market?market=prime",
    base: "/ethereum/aave-v3/market",
    query: "?market=prime",
    api: "/api/chain/aave-v3/market?market=prime",
    symbol: "WETH",
  },
  { market: "/ethereum/spark/market", api: "/api/chain/spark/market", symbol: "DAI" },
  { market: "/base/seamless/market", api: "/api/chain/seamless/market", symbol: "USDC" },
  { market: "/base/aave-v3/market", api: "/api/chain/aave-v3-base/market", symbol: "cbBTC" },
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
for (const f of FIXTURES) {
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
  const rateOk = (text, apr) => {
    const p = apr * 100;
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
      `${tag} 3f Utilisation`,
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
  if (await armInspector(page)) {
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
      rows: [...document.querySelectorAll("tr[data-change-row]")].map((tr) => ({
        block: Number(tr.getAttribute("data-change-block")),
        kind: tr.getAttribute("data-change-kind"),
        words: tr.querySelector("[data-change-words]")?.textContent ?? "",
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
    if (await armInspector(page)) {
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
    if (await armInspector(page)) {
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
      .locator(`[data-holders="suppliers"] tr[data-holder-row="${holders.suppliers[0].wallet}"] td`)
      .last();
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

await browser.close();
if (checks === 0) {
  console.log("\nCRASH: no checks ran");
  process.exit(2);
}
console.log(failures === 0 ? `\nALL PASS (${checks})` : `\n${failures} FAILURE(S) of ${checks}`);
process.exit(failures === 0 ? 0 : 1);
