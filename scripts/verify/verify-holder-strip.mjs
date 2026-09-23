#!/usr/bin/env node
// The holder strip — a wallet search states the wallet's positions at a glance
// above its own cards (Polaris + Liquity V2).
// ---------------------------------------------------------------------------
// One section per explorer, each asserting the same seven things in that
// explorer's own units:
//
//   a  the bare directory draws NO strip — it is not about a wallet;
//   b  a position-id search draws no strip either — one position is a card;
//   c  the wallet view: the counts line's own numbers equal the API's statuses;
//      the exact leg (Polaris pETH, V2 BOLD) matches the RESTATED sum to the
//      character; the priced leg matches the restated Σ legs × feed within $1
//      and wears the ≈; the nearest-floor line names the restated position, its
//      ratio within 0.05 pp, and links to it;
//   d  hovering an ≈ figure reveals a sentence;
//   e  a wallet holding more than one page states the count only — no legs, no
//      nearest-floor line, and a footnote saying why (proved by rewriting the
//      wallet response's `pagination.total` to 21 on the wire);
//   f  a wallet holding nothing draws no strip at all;
//   g  the receipts: the adapters are called directly in a node child with
//      stubbed inputs, and each leg's kind / class / summary is asserted
//      against arithmetic this script restates from the stub.
//
// THE EXPECTED VALUES ARE RESTATED HERE, never imported and never read off the
// page: Σ coll over the wallet's open rows, Σ debt × the market's own unit
// price, ratio = coll × price ÷ debt, and "nearest" = the smallest ratio ÷ its
// own minimum. All from the same two responses each page reads — the wallet
// route and the price read — fetched by this script itself. Nothing is pinned:
// the feeds tick every block and the roster moves by the minute.
//
// The price read is taken BEFORE and AFTER the page is read, and a valued
// figure passes against either: the page read the feed at its own block, which
// may sit a block or two either side of this script's.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-holder-strip.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-10 ──────────────────────────────────────────
//   `lib/polaris/holder-strip.ts` had the priced debt leg doubled (`usd += 2 *
//   amount * unitUsd`) → P5a went red on the page ("≈ $338,095.31" against the
//   restated $169,047.66) and G1b went red at the adapter ("$100,000.00"
//   against the stub's restated $50,000.00). Reverted; the 38/38 run is the
//   reverted tree.

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

// The two wallets the plan pins as SHAPES, not as figures: Polaris's sample
// holds CDPs in both markets and has a closed and a liquidated one; V2's holds
// one trove on each of the three branches. Every number about them is read at
// run time.
const POLARIS_WALLET = "0xedb7cca3ba468055b0062d2cd033dfe6c6632959";
const V2_WALLET = "0x8b0afadfde6fa271325305ff24a016b4fb6e3846";
// An address no protocol has ever seen — the "nothing to summarise" case.
const EMPTY_WALLET = "0x00000000000000000000000000000000000dead0";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);

async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}

// ── the app's own number grammar, restated ─────────────────────────────────
/** formatNumber: en-US decimal, three fraction digits at most. */
const fmtNum = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
/** formatUsdValue: "$" + en-US, exactly two fraction digits. */
const fmtUsd = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseNum = (s) =>
  Number(
    String(s ?? "")
      .replace(/[$,]/g, "")
      .replace(/−/g, "-"),
  );

/** Read the strip off the page — its counts sentence, its legs, its
 *  nearest-floor line and its footnote. Null when no strip is drawn. */
async function readStrip(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-holder-strip]");
    if (!el) return null;
    const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
    const legs = {};
    for (const l of el.querySelectorAll("[data-holder-leg]")) {
      const kids = [...l.children];
      legs[l.getAttribute("data-holder-leg")] = {
        label: norm(kids[0]?.textContent),
        value: norm(l.querySelector('[data-figure^="holder-"]')?.textContent),
        footnote: norm(kids[2]?.textContent),
      };
    }
    const nearestEl = el.querySelector("[data-holder-nearest]");
    const noteEl = el.querySelector("[data-holder-note]");
    return {
      counts: norm(el.querySelector("[data-holder-counts]")?.textContent),
      attrs: {
        open: Number(el.getAttribute("data-holder-open")),
        closed: Number(el.getAttribute("data-holder-closed")),
        liquidated: Number(el.getAttribute("data-holder-liquidated")),
      },
      legs,
      nearest: nearestEl
        ? { text: norm(nearestEl.textContent), href: nearestEl.querySelector("a")?.getAttribute("href") ?? null }
        : null,
      note: noteEl ? norm(noteEl.textContent) : null,
    };
  });
}

/** Open a listing URL and wait for its rows + its one price side-fetch. */
async function openListing(context, url, { route } = {}) {
  const page = await context.newPage();
  if (route) await page.route(route.url, route.handler);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .locator('[data-skel-section="listing-row"]')
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  // The price read lands after first paint; the strip appears with it.
  await page.waitForTimeout(3500);
  return page;
}

/** Type a wallet into the listing's search box — the path a reader takes, and
 *  the only one that makes the browser fetch the wallet's rows itself (a
 *  wallet URL opened cold is answered by SSR, which no page.route can reach).
 *  That is what lets the truncation case rewrite `pagination.total` on the
 *  wire. */
async function searchWallet(page, placeholder, wallet) {
  const box = page.getByPlaceholder(placeholder);
  await box.click();
  await box.fill(wallet);
  // 300ms debounce, then the fetch, then the re-render.
  await page.waitForTimeout(4000);
}

/** Rewrite a listing response's `pagination.total` on the wire, leaving every
 *  row untouched — a wallet that holds more than one page, without needing one
 *  to exist. */
const inflateTotal = (matcher, total) => ({
  url: matcher,
  handler: async (route) => {
    const res = await route.fetch();
    const json = await res.json().catch(() => null);
    if (!json?.pagination) return route.fulfill({ response: res });
    json.pagination.total = total;
    return route.fulfill({ response: res, body: JSON.stringify(json) });
  },
});

console.log("The holder strip — a wallet search states its own positions at a glance\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });

// ═══ POLARIS ═══════════════════════════════════════════════════════════════
console.log("── Polaris ──────────────────────────────────────────────────────");

const boardBefore = await api("/api/chain/polaris/markets");
const wallet = await api(`/api/polaris/positions?wallet=${POLARIS_WALLET}&limit=50`);
const pRows = wallet.data ?? [];
const pTotal = wallet.pagination?.total ?? 0;
check(
  "P0. the wallet route answers and the board is not stale",
  pRows.length > 0 && pTotal === pRows.length && boardBefore.chainStale === false,
  `${pRows.length} rows, total ${pTotal}, board @ ${boardBefore.blockNumber}`,
);

// ── the restated facts ─────────────────────────────────────────────────────
const pCounts = {
  open: pRows.filter((r) => r.status === "open").length,
  closed: pRows.filter((r) => r.status === "closed").length,
  liquidated: pRows.filter((r) => r.status === "liquidated").length,
};
const pOpen = pRows.filter((r) => r.status === "open");
const pColl = pOpen.reduce((s, r) => s + r.coll, 0);
const pDebtByMarket = new Map();
for (const r of pOpen) if (r.debt > 0) pDebtByMarket.set(r.market, (pDebtByMarket.get(r.market) ?? 0) + r.debt);

const boardOf = (board, m) => (board.markets ?? []).find((b) => b.market === m);
/** USDp is a dollar; GOLDp is a troy ounce of gold at the market's own feed. */
const unitUsd = (board, m) => (m === "usdp" ? 1 : (boardOf(board, m)?.price.xauUsd ?? null));
const pDebtUsd = (board) => [...pDebtByMarket].reduce((s, [m, amt]) => s + amt * unitUsd(board, m), 0);
const pCollUsd = (board) => pColl * (boardOf(board, "usdp")?.price.pethUsd ?? 0);
/** Nearest its floor: the smallest ratio ÷ its own market's minimum. */
const pNearest = (board) => {
  let best = null;
  for (const r of pOpen) {
    const b = boardOf(board, r.market);
    if (!b || !(r.debt > 0) || !(r.coll > 0)) continue;
    const min = b.defensiveMode ? b.defensiveMcr : b.mcr;
    const ratio = (r.coll * b.price.pethInDebt) / r.debt;
    if (!best || ratio / min < best.headroom) {
      best = {
        label: `${r.market}/${r.cdpId}`,
        ratioPct: ratio * 100,
        minPct: min * 100,
        headroom: ratio / min,
        row: r,
      };
    }
  }
  return best;
};
info(
  "P0 restated",
  `${pCounts.open} open / ${pCounts.closed} closed / ${pCounts.liquidated} liquidated; coll ${fmtNum(pColl)} pETH; debt ${fmtUsd(pDebtUsd(boardBefore))}; nearest ${pNearest(boardBefore)?.label} at ${pNearest(boardBefore)?.ratioPct.toFixed(1)}%`,
);

// ── a. the bare directory ──────────────────────────────────────────────────
{
  const page = await openListing(context, `${BASE}/sepolia/polaris`);
  check("P1a. the bare directory draws no holder strip", (await readStrip(page)) === null);
  await page.close();
}

// ── b. an id search ────────────────────────────────────────────────────────
{
  const someId = pOpen[0]?.cdpId;
  const page = await openListing(context, `${BASE}/sepolia/polaris?q=${someId}`);
  check("P1b. a CDP-number search draws no holder strip", (await readStrip(page)) === null, `q=${someId}`);
  await page.close();
}

// ── c + d. the wallet view ─────────────────────────────────────────────────
{
  const page = await openListing(context, `${BASE}/sepolia/polaris?q=${POLARIS_WALLET}`);
  const strip = await readStrip(page);
  const boardAfter = await api("/api/chain/polaris/markets");
  const near = [pNearest(boardBefore), pNearest(boardAfter)];

  if (!check("P2. the wallet view draws the strip", strip != null, JSON.stringify(strip))) {
    await page.close();
  } else {
    // The counts sentence's OWN numbers, against the API's statuses.
    const said = {
      open: Number(
        /holds ([\d,]+) open CDPs?/.exec(strip.counts)?.[1]?.replace(/,/g, "") ??
          (/holds no open CDPs/.test(strip.counts) ? 0 : NaN),
      ),
      closed: Number(/has closed ([\d,]+)/.exec(strip.counts)?.[1]?.replace(/,/g, "") ?? 0),
      liquidated: Number(/([\d,]+) (?:was|were) liquidated/.exec(strip.counts)?.[1]?.replace(/,/g, "") ?? 0),
    };
    check(
      "P3a. the counts line states the API's own statuses",
      said.open === pCounts.open && said.closed === pCounts.closed && said.liquidated === pCounts.liquidated,
      `"${strip.counts}" vs API ${pCounts.open}/${pCounts.closed}/${pCounts.liquidated}`,
    );
    check(
      "P3b. …and the band carries the same counts as figures",
      strip.attrs.open === pCounts.open &&
        strip.attrs.closed === pCounts.closed &&
        strip.attrs.liquidated === pCounts.liquidated,
      JSON.stringify(strip.attrs),
    );

    // The collateral: one token, so exact — character for character.
    check(
      "P4a. the total collateral is the restated Σ coll over the open rows, exact and unmarked",
      strip.legs.collateral?.value === `${fmtNum(pColl)} pETH`,
      `shown "${strip.legs.collateral?.value}" vs restated "${fmtNum(pColl)} pETH"`,
    );
    const collUsdShown = parseNum(/\$[\d,.]+/.exec(strip.legs.collateral?.footnote ?? "")?.[0]);
    check(
      "P4b. …with its value at the protocol's own feed beneath it, in the card's own words",
      [boardBefore, boardAfter].some((b) => Math.abs(collUsdShown - pCollUsd(b)) <= 1) &&
        /by the protocol's feed · testnet/.test(strip.legs.collateral?.footnote ?? ""),
      `"${strip.legs.collateral?.footnote}" vs restated ${fmtUsd(pCollUsd(boardBefore))}`,
    );

    // The debt: two units, so a valuation — marked ≈, legs named beneath.
    const debtShown = parseNum(/\$[\d,.]+/.exec(strip.legs.debt?.value ?? "")?.[0]);
    check(
      "P5a. the total debt is the restated Σ legs at the markets' own units, within $1, and wears the ≈",
      /≈/.test(strip.legs.debt?.value ?? "") &&
        [boardBefore, boardAfter].some((b) => Math.abs(debtShown - pDebtUsd(b)) <= 1),
      `shown "${strip.legs.debt?.value}" vs restated ${fmtUsd(pDebtUsd(boardBefore))}`,
    );
    const wantLegs = [...pDebtByMarket].map(
      ([m, amt]) => `${fmtNum(amt)} ${pOpen.find((r) => r.market === m).stableSymbol}`,
    );
    check(
      "P5b. …and names its legs in their own tokens beneath",
      wantLegs.every((l) => (strip.legs.debt?.footnote ?? "").includes(l)),
      `"${strip.legs.debt?.footnote}" wanted ${wantLegs.join(" + ")}`,
    );

    // Nearest its floor.
    check(
      "P6a. the nearest-floor line names the restated CDP and links to it",
      strip.nearest?.text.includes(near[0].label) &&
        strip.nearest?.href === `/sepolia/polaris/${near[0].row.market}/${near[0].row.cdpId}`,
      `"${strip.nearest?.text}" → ${strip.nearest?.href} vs restated ${near[0].label}`,
    );
    const shownRatio = parseNum(/≈\s*([\d,.]+)%/.exec(strip.nearest?.text ?? "")?.[1]);
    check(
      "P6b. …states its ratio within 0.05 pp and its market's own minimum",
      near.some((n) => Math.abs(shownRatio - n.ratioPct) <= 0.05) &&
        new RegExp(`minimum ${near[0].minPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`).test(
          strip.nearest?.text ?? "",
        ),
      `"${strip.nearest?.text}" vs restated ≈ ${near[0].ratioPct.toFixed(1)}% / minimum ${near[0].minPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`,
    );
    check(
      "P6c. the strip states no wallet-wide collateral ratio",
      !/wallet.{0,40}(collateral ratio|ratio of [\d.]+)/i.test(strip.counts + " " + JSON.stringify(strip.legs)),
    );

    // d. the ≈ opens a sentence.
    // Hover the inline figure itself, not the stat column: the column is
    // full-width and its centre lands beside the value, where RevealTip never
    // fires (the listing-ratio verifier learned this first).
    await page.locator('[data-figure="holder-debt"]').getByText(/≈/).first().hover();
    await page.waitForTimeout(500);
    const tip = await page
      .locator('[role="tooltip"]')
      .first()
      .innerText()
      .catch(() => "");
    check(
      "P7. hovering the ≈ debt figure reveals a sentence saying what it is not",
      tip.replace(/\s+/g, " ").length > 40 && /not in it|estimate/i.test(tip),
      tip.replace(/\s+/g, " ").slice(0, 120),
    );
    await page.close();
  }
}

// ── e. a wallet that does not fit one page ─────────────────────────────────
{
  const page = await openListing(context, `${BASE}/sepolia/polaris`, {
    route: inflateTotal("**/api/polaris/positions**", 21),
  });
  await searchWallet(page, "Address, ENS, or CDP number", POLARIS_WALLET);
  const strip = await readStrip(page);
  check(
    "P8. a wallet stated as holding 21 positions states the count only — no legs, no nearest-floor line, and says why",
    strip != null &&
      Object.keys(strip.legs).length === 0 &&
      strip.nearest === null &&
      /21/.test(strip.counts) &&
      /up to 20 positions; this one holds 21/.test(strip.note ?? ""),
    JSON.stringify(strip),
  );
  await page.close();
}

// ── f. a wallet holding nothing ────────────────────────────────────────────
{
  const page = await context.newPage();
  await page.goto(`${BASE}/sepolia/polaris?q=${EMPTY_WALLET}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(5000);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check(
    "P9. a wallet holding nothing draws no strip — the empty state stands alone",
    (await readStrip(page)) === null && /No CDPs match/i.test(body),
    body.slice(0, 120),
  );
  await page.close();
}

// ═══ LIQUITY V2 ════════════════════════════════════════════════════════════
console.log("\n── Liquity V2 ───────────────────────────────────────────────────");

const oracleBefore = (await api("/api/oracle/liquity-v2")).data;
const troves = await api(`/api/troves?ownerAddress=${V2_WALLET}&limit=50`);
const vRows = troves.data ?? [];
const vTotal = troves.pagination?.total ?? 0;
check(
  "V0. the wallet route and the branch oracle both answer",
  vRows.length > 0 && vTotal === vRows.length && oracleBefore?.weth > 0,
  `${vRows.length} troves, total ${vTotal}, weth ${oracleBefore?.weth}`,
);

const vOpen = vRows.filter((t) => t.status === "open");
const vCounts = {
  open: vOpen.length,
  closed: vRows.filter((t) => t.status === "closed").length,
  liquidated: vRows.filter((t) => t.status === "liquidated").length,
};
const vDebt = vOpen.reduce((s, t) => s + t.debt.current, 0);
const vByBranch = new Map();
for (const t of vOpen) vByBranch.set(t.collateralType, (vByBranch.get(t.collateralType) ?? 0) + t.collateral.amount);
const priceOf = (oracle, ct) => oracle?.[ct.toLowerCase()] ?? null;
const vCollUsd = (oracle) => [...vByBranch].reduce((s, [ct, amt]) => s + amt * priceOf(oracle, ct), 0);
/** The branch minimums are the protocol's own constants, restated here rather
 *  than read from the code under test: WETH 110%, the LSTs 120%. */
const branchMin = (ct) => (ct === "WETH" || ct === "ETH" ? 110 : 120);
const vNearest = (oracle) => {
  let best = null;
  for (const t of vOpen) {
    const price = priceOf(oracle, t.collateralType);
    if (!price || !(t.debt.current > 0) || !(t.collateral.amount > 0)) continue;
    const ratioPct = ((t.collateral.amount * price) / t.debt.current) * 100;
    const minPct = branchMin(t.collateralType);
    if (!best || ratioPct / minPct < best.headroom) {
      best = { trove: t, ratioPct, minPct, headroom: ratioPct / minPct };
    }
  }
  return best;
};
info(
  "V0 restated",
  `${vCounts.open} open / ${vCounts.closed} closed / ${vCounts.liquidated} liquidated; coll ${fmtUsd(vCollUsd(oracleBefore))}; debt ${fmtNum(vDebt)} BOLD; nearest ${vNearest(oracleBefore)?.trove.collateralType} at ${vNearest(oracleBefore)?.ratioPct.toFixed(1)}%`,
);

// ── a + b ──────────────────────────────────────────────────────────────────
{
  const page = await openListing(context, `${BASE}/ethereum/liquity-v2`);
  check("V1a. the bare directory draws no holder strip", (await readStrip(page)) === null);
  await page.close();
}
{
  const id = vOpen[0]?.id;
  const page = await openListing(context, `${BASE}/ethereum/liquity-v2?q=${id}`);
  check("V1b. a trove-id search draws no holder strip", (await readStrip(page)) === null, `q=${id}`);
  await page.close();
}

// ── c + d ──────────────────────────────────────────────────────────────────
{
  const page = await openListing(context, `${BASE}/ethereum/liquity-v2?q=${V2_WALLET}`);
  const strip = await readStrip(page);
  const oracleAfter = (await api("/api/oracle/liquity-v2")).data;
  const near = [vNearest(oracleBefore), vNearest(oracleAfter)];

  if (!check("V2. the wallet view draws the strip", strip != null, JSON.stringify(strip))) {
    await page.close();
  } else {
    const said = {
      open: Number(/holds ([\d,]+) open troves?/.exec(strip.counts)?.[1]?.replace(/,/g, "") ?? NaN),
      closed: Number(/has closed ([\d,]+)/.exec(strip.counts)?.[1]?.replace(/,/g, "") ?? 0),
      liquidated: Number(/([\d,]+) (?:was|were) liquidated/.exec(strip.counts)?.[1]?.replace(/,/g, "") ?? 0),
    };
    check(
      "V3. the counts line states the API's own statuses",
      said.open === vCounts.open && said.closed === vCounts.closed && said.liquidated === vCounts.liquidated,
      `"${strip.counts}" vs API ${vCounts.open}/${vCounts.closed}/${vCounts.liquidated}`,
    );

    // The debt: one token on every branch, so exact.
    check(
      "V4. the total debt is the restated Σ debt over the open troves, exact and unmarked",
      strip.legs.debt?.value === `${fmtNum(vDebt)} BOLD`,
      `shown "${strip.legs.debt?.value}" vs restated "${fmtNum(vDebt)} BOLD"`,
    );

    // The collateral: three tokens, so a valuation — marked ≈.
    const collShown = parseNum(/\$[\d,.]+/.exec(strip.legs.collateral?.value ?? "")?.[0]);
    check(
      "V5a. the total collateral is the restated Σ branch × its own feed, within $1, and wears the ≈",
      /≈/.test(strip.legs.collateral?.value ?? "") &&
        [oracleBefore, oracleAfter].some((o) => Math.abs(collShown - vCollUsd(o)) <= 1),
      `shown "${strip.legs.collateral?.value}" vs restated ${fmtUsd(vCollUsd(oracleBefore))}`,
    );
    const wantBranches = [...vByBranch].map(([ct, amt]) => `${fmtNum(amt)} ${ct}`);
    check(
      "V5b. …and names each branch's own amount beneath",
      wantBranches.every((l) => (strip.legs.collateral?.footnote ?? "").includes(l)),
      `"${strip.legs.collateral?.footnote}" wanted ${wantBranches.join(" + ")}`,
    );

    check(
      "V6a. the nearest-floor line names the restated trove and links to it",
      strip.nearest?.href === `/ethereum/liquity-v2/trove/${near[0].trove.collateralType}/${near[0].trove.id}`,
      `"${strip.nearest?.text}" → ${strip.nearest?.href} vs restated ${near[0].trove.collateralType} ${near[0].trove.id}`,
    );
    const shownRatio = parseNum(/≈\s*([\d,.]+)%/.exec(strip.nearest?.text ?? "")?.[1]);
    check(
      "V6b. …states its ratio within 0.05 pp and its branch's own minimum",
      near.some((n) => Math.abs(shownRatio - n.ratioPct) <= 0.05) &&
        new RegExp(`minimum ${near[0].minPct}%`).test(strip.nearest?.text ?? ""),
      `"${strip.nearest?.text}" vs restated ≈ ${near[0].ratioPct.toFixed(1)}% / minimum ${near[0].minPct}%`,
    );

    await page.locator('[data-figure="holder-collateral"]').getByText(/≈/).first().hover();
    await page.waitForTimeout(500);
    const tip = await page
      .locator('[role="tooltip"]')
      .first()
      .innerText()
      .catch(() => "");
    check(
      "V7. hovering the ≈ collateral figure reveals a sentence saying what it is",
      tip.replace(/\s+/g, " ").length > 40 && /estimate|valuation/i.test(tip),
      tip.replace(/\s+/g, " ").slice(0, 120),
    );
    await page.close();
  }
}

// ── e + f ──────────────────────────────────────────────────────────────────
{
  const page = await openListing(context, `${BASE}/ethereum/liquity-v2`, {
    route: inflateTotal("**/api/troves**", 21),
  });
  await searchWallet(page, "Address, ENS, or ID", V2_WALLET);
  const strip = await readStrip(page);
  check(
    "V8. a wallet stated as holding 21 troves states the count only — no legs, no nearest-floor line, and says why",
    strip != null &&
      Object.keys(strip.legs).length === 0 &&
      strip.nearest === null &&
      /21/.test(strip.counts) &&
      /up to 20 positions; this one holds 21/.test(strip.note ?? ""),
    JSON.stringify(strip),
  );
  await page.close();
}
{
  const page = await context.newPage();
  await page.goto(`${BASE}/ethereum/liquity-v2?q=${EMPTY_WALLET}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(5000);
  check("V9. a wallet holding nothing draws no strip", (await readStrip(page)) === null);
  await page.close();
}

await context.close();
await browser.close();

// ═══ g. the receipts ═══════════════════════════════════════════════════════
// A listing card's <Prov> is inert content (no inspector arms on a listing), so
// the receipts are asserted where they are BUILT: a node child strips the types,
// calls each adapter with a stubbed board / oracle, and this script restates the
// arithmetic from that same stub.
const PROBE = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = pathToFileURL(${JSON.stringify(REPO)} + "/").href;
const hook = \`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = \${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
\`;
register("data:text/javascript," + encodeURIComponent(hook));
const { polarisHolderStrip } = await import(ROOT + "lib/polaris/holder-strip.ts");
const { liquityV2HolderStrip } = await import(ROOT + "lib/liquity-v2/holder-strip.ts");

const row = (market, cdpId, status, coll, debt) => ({
  market, cdpId, status, coll, debt,
  stableSymbol: market === "usdp" ? "USDp" : "GOLDp",
  collRaw: null, debtRaw: null, peakColl: coll, peakDebt: debt,
  owner: "0x1", liquidated: status === "liquidated", eventCount: 1, liqCount: 0, transferCount: 0,
  lastTs: 0, lastBlock: 0,
});
const board = {
  blockNumber: 1, chainStale: false,
  markets: [
    { market: "usdp", mcr: 1.15, defensiveMcr: 1.5, defensiveMode: false, interestRate: 0.03,
      price: { pethInDebt: 6000, pethUsd: 6000, xauUsd: null } },
    { market: "goldp", mcr: 1.15, defensiveMcr: 1.5, defensiveMode: false, interestRate: 0.02,
      price: { pethInDebt: 1.5, pethUsd: 6000, xauUsd: 4000 } },
  ],
};
const pRows = [row("usdp", "1", "open", 10, 30000), row("goldp", "2", "open", 2, 5), row("usdp", "3", "closed", 0, 0)];
const polaris = polarisHolderStrip(pRows, 3, board, 20);
const polarisTruncated = polarisHolderStrip(pRows, 21, board, 20);

const trove = (id, ct, coll, debt) => ({
  id, collateralType: ct, status: "open", isZombie: false,
  collateral: { amount: coll, amountRaw: "0", valueUsd: 0, symbol: ct, peakAmount: coll, peakAmountRaw: "0" },
  debt: { current: debt, currentRaw: "0", peak: debt, peakRaw: "0" },
  metrics: { collateralRatio: 0, interestRate: 5 },
  activity: { createdAt: 0, lastActivityAt: 0, lifetimeDays: 0, transactionCount: 1, redemptionCount: 0 },
  batch: { isMember: false, manager: null, managementFee: 0 },
  owner: "0x1", lastOwner: null, ownerEns: null,
});
const prices = { weth: 2000, wsteth: 2400, reth: 2200 };
const v2 = liquityV2HolderStrip([trove("0xaaaabbbbcccc", "WETH", 100, 100000), trove("0xddddeeeeffff", "rETH", 50, 50000)], 2, prices, 20);

const shape = (s) => ({
  countsLine: s.countsLine, counts: s.counts, truncated: s.truncated, note: s.note ?? null,
  legs: s.legs.map((l) => ({ id: l.id, value: l.value, approx: l.approx, tip: l.tip ?? null,
    footnote: l.footnote?.text ?? null, kind: l.prov.kind, pclass: l.prov.pclass, summary: l.prov.summary })),
  nearest: s.nearest ? { label: s.nearest.label, href: s.nearest.href, ratioPct: s.nearest.ratioPct,
    minPct: s.nearest.minPct, kind: s.nearest.prov.kind, pclass: s.nearest.prov.pclass } : null,
});
console.log("RESULT " + JSON.stringify({ polaris: shape(polaris), polarisTruncated: shape(polarisTruncated), v2: shape(v2) }));
`;
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", PROBE], {
  cwd: REPO,
  encoding: "utf8",
  timeout: 120000,
});
const probeLine = /RESULT (\{.*\})/.exec(probe.stdout ?? "");
console.log("\n── the receipts, at the adapters ────────────────────────────────");
if (!probeLine) {
  check("G0. the adapter probe runs", false, (probe.stderr ?? "").slice(-600));
} else {
  const got = JSON.parse(probeLine[1]);
  const leg = (s, id) => s.legs.find((l) => l.id === id);

  // Restated from the stub: 10 + 2 = 12 pETH; 30,000 USDp at $1 plus 5 GOLDp at
  // $4,000 = $50,000; ratios 10 × 6000 ÷ 30000 = 200% (÷1.15 = 1.739) and
  // 2 × 1.5 ÷ 5 = 60% (÷1.15 = 0.522) → the goldp CDP is nearest its floor.
  check(
    "G1a. Polaris: the exact collateral leg is the emitted sum, unmarked, and its receipt is a chain fact",
    leg(got.polaris, "collateral").value === "12 pETH" &&
      leg(got.polaris, "collateral").approx === false &&
      leg(got.polaris, "collateral").kind === "chain" &&
      leg(got.polaris, "collateral").pclass === "emitted",
    JSON.stringify(leg(got.polaris, "collateral")),
  );
  check(
    "G1b. Polaris: the priced debt leg is the restated $50,000, marked ≈, on an oracle receipt naming both units",
    leg(got.polaris, "debt").value === "$50,000.00" &&
      leg(got.polaris, "debt").approx === true &&
      leg(got.polaris, "debt").kind === "chain-derived" &&
      leg(got.polaris, "debt").pclass === "oracle" &&
      /USDp/.test(leg(got.polaris, "debt").summary) &&
      /GOLDp|gold/.test(leg(got.polaris, "debt").summary) &&
      /feed|price/.test(leg(got.polaris, "debt").summary),
    JSON.stringify(leg(got.polaris, "debt")).slice(0, 260),
  );
  check(
    "G1c. Polaris: nearest its floor is the restated goldp CDP at 60% against 115%",
    got.polaris.nearest?.label === "goldp/2" &&
      Math.abs(got.polaris.nearest.ratioPct - 60) < 1e-9 &&
      Math.abs(got.polaris.nearest.minPct - 115) < 1e-9 &&
      got.polaris.nearest.href === "/sepolia/polaris/goldp/2",
    JSON.stringify(got.polaris.nearest),
  );
  check(
    "G1d. Polaris: a wallet past one page states the count only, with no legs and no receipt to give",
    got.polarisTruncated.truncated === true &&
      got.polarisTruncated.legs.length === 0 &&
      got.polarisTruncated.nearest === null &&
      /21/.test(got.polarisTruncated.countsLine) &&
      /up to 20 positions/.test(got.polarisTruncated.note ?? ""),
    JSON.stringify(got.polarisTruncated).slice(0, 200),
  );
  check(
    "G1e. Polaris: the counts sentence names the markets it actually spans",
    /2 open CDPs across both markets/.test(got.polaris.countsLine) && /has closed 1/.test(got.polaris.countsLine),
    got.polaris.countsLine,
  );

  // Restated from the stub: 100 × 2000 + 50 × 2200 = $310,000; debt 150,000
  // BOLD; ratios 200% ÷ 110 = 1.818 (WETH) and 220% ÷ 120 = 1.833 (rETH) → the
  // WETH trove is nearest its floor even though its ratio is the lower one.
  check(
    "G2a. Liquity V2: the exact debt leg is the BOLD sum, unmarked, on a chain receipt",
    leg(got.v2, "debt").value === "150,000 BOLD" &&
      leg(got.v2, "debt").approx === false &&
      leg(got.v2, "debt").kind === "chain",
    JSON.stringify(leg(got.v2, "debt")).slice(0, 200),
  );
  check(
    "G2b. Liquity V2: the priced collateral leg is the restated $310,000, marked ≈, on an oracle receipt naming the branch feeds",
    leg(got.v2, "collateral").value === "$310,000.00" &&
      leg(got.v2, "collateral").approx === true &&
      leg(got.v2, "collateral").kind === "chain-derived" &&
      leg(got.v2, "collateral").pclass === "oracle" &&
      /PriceFeed/.test(leg(got.v2, "collateral").summary),
    JSON.stringify(leg(got.v2, "collateral")).slice(0, 260),
  );
  check(
    "G2c. Liquity V2: nearest its floor ranks by ratio ÷ the branch's own minimum, so WETH at 200%/110% beats rETH at 220%/120%",
    got.v2.nearest?.label.startsWith("WETH ") && Math.abs(got.v2.nearest.minPct - 110) < 1e-9,
    JSON.stringify(got.v2.nearest),
  );
  check(
    "G2d. Liquity V2: the branch legs are named largest first",
    leg(got.v2, "collateral").footnote === "100 WETH · 50 rETH",
    leg(got.v2, "collateral").footnote,
  );
}

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — a wallet search states its own positions, and says what it never states`,
);
process.exit(failures ? 1 : 0);
