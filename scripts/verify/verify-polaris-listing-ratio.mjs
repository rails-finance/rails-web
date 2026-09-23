// Polaris — the collateral ratio on the listing card, its tooltip, the ≈, the
// share-card stat and the position page's price strip.
// ---------------------------------------------------------------------------
// Scaffold of verify-polaris-equity.mjs. Checks:
//
//   1. First page of /sepolia/polaris: every open card carrying debt states a
//      ratio marked ≈ and equal to the RESTATED formula within 0.05 pp, a
//      "min …%" footnote, and a liquidation price in the market's own unit
//      (never "$"). A zero-debt card shows the dash and no ≈.
//   2. Hovering one ratio reveals the tooltip sentence.
//   3. No card anywhere says "from the live figures" (the retired caption).
//   4. The ?q=<owner of usdp/8> view: the usdp/8 card's ratio matches.
//   5. The OG image route returns 200 + image/png; the share-card MODEL is
//      asserted directly in a node child (a PNG cannot be read for text) with
//      a stubbed overlay — present, stale, and absent.
//   6. /sepolia/polaris/usdp/8's price strip lists pETH and USDp.
//   7. Fail-first: with /api/chain/polaris/markets aborted, every ratio slot
//      is a dash — no ≈, no liquidation price, no rate line.
//
// THE EXPECTED VALUES ARE RESTATED HERE, never imported and never read off the
// page: icrPct = coll × pethInDebt ÷ debt × 100 and liqPrice = debt × (
// defensiveMode ? defensiveMcr : mcr) ÷ coll, both on the row's own market,
// from the same two responses the page reads — /api/polaris/positions and
// /api/chain/polaris/markets — fetched by this script itself. Neither the
// rows nor the price legs are pinned: the roster gains CDPs every few blocks
// and the feed ticks every block, so a pinned figure would be stale by the
// time it ran. Tolerance 0.05 pp (the page may have read the board a block
// either side).
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-polaris-listing-ratio.mjs

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

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

// ── the restated formulas ──────────────────────────────────────────────────
const mcrInForce = (m) => (m.defensiveMode ? m.defensiveMcr : m.mcr);
const expectedIcrPct = (row, m) => ((row.coll * m.price.pethInDebt) / row.debt) * 100;
const expectedLiqPrice = (row, m) => (row.debt * mcrInForce(m)) / row.coll;

/** The card's own liquidation-price formatting, restated (magnitude-aware,
 *  no currency sign — the unit is USDp or a troy ounce of gold). */
const fmtLiq = (p) => {
  if (p < 0.01) return "<0.01";
  if (p < 1) return p.toFixed(3);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
const parseNum = (s) => Number(String(s).replace(/,/g, "").replace(/−/g, "-"));

/** Read every listing card on the page: its (market, cdpId), the ratio slot's
 *  text, whether that slot is a pulse skeleton, and the ratio column's
 *  footnote text. */
async function readCards(page) {
  return page.evaluate(() => {
    const out = [];
    for (const card of document.querySelectorAll('[data-skel-section="listing-row"]')) {
      const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
      // The row's identity comes from its own <Link href>, not the card text:
      // the id runs straight into the meta cluster ("CDP #16711 minute ago"),
      // so a text regex silently swallows a digit.
      const href = card.closest("a")?.getAttribute("href") ?? "";
      const idm = /\/sepolia\/polaris\/(usdp|goldp)\/(\d+)(?:[?#]|$)/.exec(href);
      // The ratio column: the label div, then its parent holds value + footnote.
      let col = null;
      for (const el of card.querySelectorAll("div")) {
        if (el.children.length === 0 && el.textContent?.trim() === "Collateral ratio") {
          col = el.parentElement;
          break;
        }
      }
      const valueEl = col?.querySelector('[data-figure="collateral-ratio"]') ?? null;
      const valueText = (valueEl?.textContent ?? "").replace(/\s+/g, " ").trim();
      const dash = col ? /—/.test(col.textContent ?? "") && valueEl == null : false;
      const pulse = col ? col.querySelector(".animate-pulse") != null : false;
      let footnote = "";
      if (col) {
        const parts = [];
        for (const kid of col.children) {
          const t = (kid.textContent ?? "").replace(/\s+/g, " ").trim();
          if (t === "Collateral ratio" || (valueEl && kid.contains(valueEl))) continue;
          if (t) parts.push(t);
        }
        footnote = parts.join(" ");
      }
      out.push({
        market: idm ? idm[1] : null,
        cdpId: idm ? idm[2] : null,
        valueText,
        dash,
        pulse,
        footnote,
        cardText: text,
      });
    }
    return out;
  });
}

async function openListing(context, url, { stubMarkets = false } = {}) {
  const page = await context.newPage();
  if (stubMarkets) await page.route("**/api/chain/polaris/markets", (route) => route.abort());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator('[data-skel-section="listing-row"]').first().waitFor({ state: "visible", timeout: 120000 });
  // The board side-fetch lands after first paint; the cards re-render with it.
  await page.waitForTimeout(3000);
  return page;
}

console.log("Polaris — the listing's approximate collateral ratio\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });

// ── the two responses the page itself reads ────────────────────────────────
const board = await api("/api/chain/polaris/markets");
const byMarket = Object.fromEntries((board.markets ?? []).map((m) => [m.market, m]));
check("0a. the market board answers and is not stale", board.chainStale === false && board.markets?.length === 2);
console.log(
  `(info) board @ block ${board.blockNumber}: ` +
    (board.markets ?? [])
      .map((m) => `${m.market} price ${m.price.pethInDebt} mcr ${mcrInForce(m)} rate ${m.interestRate}`)
      .join(" | "),
);

// The rows the page reads: open CDPs, recent first (POLARIS_LIST_DEFAULTS). The
// page shows the top 20; this asks for the top 100 and asks TWICE — before and
// after the page is read — because a campaign is minting CDPs every few blocks
// and the top of "recent" rotates mid-run. The union is what the page's own
// first page must be a subset of.
const LISTING_Q = "/api/polaris/positions?status=open&sortBy=recent&sortOrder=desc&limit=100&offset=0";
const listing = await api(LISTING_Q);
const rows = Object.fromEntries((listing.data ?? []).map((r) => [`${r.market}:${r.cdpId}`, r]));
check(
  "0b. the listing route answers with a first page",
  (listing.data ?? []).length > 0,
  `${listing.data?.length} rows`,
);

// ── 1. the first page of the listing ───────────────────────────────────────
const page1 = await openListing(context, `${BASE}/sepolia/polaris`);
const cards = await readCards(page1);
for (const r of (await api(LISTING_Q)).data ?? []) rows[`${r.market}:${r.cdpId}`] ??= r;
check("1a. the first page renders listing cards", cards.length > 0, `${cards.length} cards`);

let matched = 0;
let zeroDebtSeen = 0;
const ratioBad = [];
const footnoteBad = [];
const dashBad = [];
for (const c of cards) {
  const row = c.market && c.cdpId ? rows[`${c.market}:${c.cdpId}`] : null;
  if (!row) continue; // the roster moved between the two reads — not this card's fault
  const m = byMarket[row.market];
  matched++;
  if (row.debt > 0 && row.coll > 0) {
    const want = expectedIcrPct(row, m);
    const got = parseNum((c.valueText.match(/([\d,]+\.\d+)%/) ?? [])[1]);
    if (!c.valueText.includes("≈") || !Number.isFinite(got) || Math.abs(got - want) > 0.05) {
      ratioBad.push(`${row.market}/${row.cdpId}: shown "${c.valueText}" vs expected ≈ ${want.toFixed(1)}%`);
    }
    const wantLiq = `${fmtLiq(expectedLiqPrice(row, m))} ${row.stableSymbol}`;
    const wantMin = `min ${(mcrInForce(m) * 100).toFixed(1)}%`;
    if (!c.footnote.includes(wantMin) || !c.footnote.includes(`Liquidates at`) || !c.footnote.includes(wantLiq)) {
      footnoteBad.push(`${row.market}/${row.cdpId}: footnote "${c.footnote}" wanted "${wantMin}" + "${wantLiq}"`);
    }
  } else {
    zeroDebtSeen++;
    if (c.valueText.includes("≈") || !c.dash) {
      dashBad.push(`${row.market}/${row.cdpId} (debt ${row.debt}): "${c.valueText}" dash=${c.dash}`);
    }
  }
}
check(
  "1b. cards on the page matched rows in the listing response",
  matched > 0,
  `${matched} of ${cards.length} matched`,
);
check(
  "1c. every open card with debt shows ≈ and the restated ratio (0.05 pp)",
  ratioBad.length === 0,
  ratioBad.join(" ; "),
);
check(
  "1d. …and a min-MCR footnote with the liquidation price in the market's own unit",
  footnoteBad.length === 0,
  footnoteBad.join(" ; "),
);
check(
  "1e. a zero-debt card shows the dash and no ≈",
  dashBad.length === 0,
  dashBad.length
    ? dashBad.join(" ; ")
    : zeroDebtSeen === 0
      ? "(no zero-debt row on this page — vacuously true)"
      : `${zeroDebtSeen} checked`,
);
check(
  "1f. no listing card states a liquidation price in dollars",
  !cards.some((c) => /Liquidates at[^·]*\$/.test(c.footnote)),
);
check(
  "1g. the rate line renders on the debt column from the board's own rate",
  cards
    .filter((c) => c.market)
    .every((c) => {
      const m = byMarket[c.market];
      return !m || c.cardText.includes(`${(m.interestRate * 100).toFixed(2)}% per year, set by the market`);
    }),
  `usdp ${(byMarket.usdp.interestRate * 100).toFixed(2)}% / goldp ${(byMarket.goldp.interestRate * 100).toFixed(2)}%`,
);

// ── 2. the tooltip ─────────────────────────────────────────────────────────
const TIP_FRAGMENT = "Interest since the last touch and any PSM share are not in it";
// Hover the figure ITSELF, not the stat column: the column is full-width and
// its centre lands beside the inline value, where RevealTip never fires.
await page1
  .getByText(/≈\s*[\d,]+\.\d+%/)
  .first()
  .hover();
await page1.waitForTimeout(400);
const tipText = await page1
  .locator('[role="tooltip"]')
  .first()
  .innerText()
  .catch(() => "");
check(
  "2. hovering a ratio reveals the tooltip sentence",
  tipText.replace(/\s+/g, " ").includes(TIP_FRAGMENT),
  tipText.slice(0, 160),
);

// ── 3. the retired caption ─────────────────────────────────────────────────
const bodyText = (await page1.locator("body").innerText()).replace(/\s+/g, " ");
check('3. no card says "from the live figures"', !/from the live figures/i.test(bodyText));
await page1.close();

// ── 4. the wallet view: usdp/8 ─────────────────────────────────────────────
const one = await api("/api/polaris/positions?market=usdp&id=8&status=open,closed,liquidated&limit=1");
const row8 = one.data?.[0]?.cdpId === "8" ? one.data[0] : null;
if (!row8) {
  check("4a. usdp/8's row is readable (precondition)", false, "the route did not answer with cdpId 8");
} else {
  const page4 = await openListing(context, `${BASE}/sepolia/polaris?q=${row8.owner}`);
  const cards4 = await readCards(page4);
  const c8 = cards4.find((c) => c.market === "usdp" && c.cdpId === "8");
  check("4a. the ?q=<holder> view lists usdp/8", c8 != null, `${cards4.length} cards for ${row8.owner}`);
  if (c8) {
    const want = expectedIcrPct(row8, byMarket.usdp);
    const got = parseNum((c8.valueText.match(/([\d,]+\.\d+)%/) ?? [])[1]);
    check(
      "4b. usdp/8's card ratio matches the restated formula (0.05 pp)",
      c8.valueText.includes("≈") && Number.isFinite(got) && Math.abs(got - want) <= 0.05,
      `shown "${c8.valueText}" vs expected ≈ ${want.toFixed(1)}%`,
    );
  }
  await page4.close();
}

// ── 5. the share card ──────────────────────────────────────────────────────
// The OG route's URL carries a generated suffix in dev
// (…/opengraph-image-<hash>?<id>), so it is read off the page's own og:image
// meta rather than guessed.
const pageHtml = await (await fetch(`${BASE}/sepolia/polaris/usdp/8`)).text();
const ogUrl = (/og:image" content="([^"]+)"/.exec(pageHtml)?.[1] ?? "").replace(/&amp;/g, "&");
const og = ogUrl ? await fetch(ogUrl) : null;
check(
  "5a. the OG image route returns 200 image/png",
  og?.status === 200 && (og.headers.get("content-type") ?? "").includes("image/png"),
  `${ogUrl || "no og:image meta"} → ${og?.status} ${og?.headers.get("content-type")}`,
);

// The PNG carries no readable text, so the MODEL is asserted directly: a node
// child strips the types and calls polarisShareCardModel with a stubbed board.
const MODEL_PROBE = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = pathToFileURL(${JSON.stringify(REPO)} + "/").href;
const hook = \`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = \${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  // Both alias and RELATIVE specifiers: the model's import graph reaches
  // modules that import their neighbours as "./x", and an extensionless
  // relative specifier is a hard resolve error under type stripping.
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
const { polarisShareCardModel } = await import(ROOT + "lib/polaris/share-card.ts");
const row = { market: "usdp", stableSymbol: "USDp", cdpId: "8", status: "open", coll: 100, debt: 200000, peakColl: 100, peakDebt: 200000 };
const live = { blockNumber: 1, chainStale: false, markets: [{ market: "usdp", price: { pethInDebt: 6000 } }] };
const stale = { blockNumber: 1, chainStale: true, markets: [] };
console.log("RESULT " + JSON.stringify({
  withBoard: polarisShareCardModel(row, live).stats,
  stale: polarisShareCardModel(row, stale).stats,
  absent: polarisShareCardModel(row).stats,
}));
`;
const probe = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--input-type=module", "--eval", MODEL_PROBE],
  {
    cwd: REPO,
    encoding: "utf8",
    timeout: 120000,
  },
);
const probeLine = /RESULT (\{.*\})/.exec(probe.stdout ?? "");
if (!probeLine) {
  check("5b. the share-card model probe runs", false, (probe.stderr ?? "").slice(-500));
} else {
  const got = JSON.parse(probeLine[1]);
  // 100 pETH at 6,000 USDp against 200,000 USDp of debt = 300.0%, restated here.
  const want = ((100 * 6000) / 200000) * 100;
  const stat = got.withBoard.find((s) => s.label === "Collateral ratio");
  check(
    "5b. the share card carries the ≈ ratio stat when the board is present",
    stat != null && stat.value === `≈ ${want.toFixed(1)}%`,
    JSON.stringify(got.withBoard),
  );
  check(
    "5c. a stale or absent board drops the stat, and the card still renders",
    got.stale.every((s) => s.label !== "Collateral ratio") &&
      got.absent.every((s) => s.label !== "Collateral ratio") &&
      got.stale.length === 2 &&
      got.absent.length === 2,
    JSON.stringify({ stale: got.stale, absent: got.absent }),
  );
}

// ── 6. the position page's price strip ─────────────────────────────────────
const page6 = await context.newPage();
await page6.goto(`${BASE}/sepolia/polaris/usdp/8`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page6.waitForTimeout(6000);
const strip = await page6.evaluate(() => {
  const pills = [...document.querySelectorAll("span[title]")]
    .filter((el) => el.className.includes("tabular-nums") && el.className.includes("cursor-default"))
    .map((el) => ({ symbol: el.getAttribute("title"), text: (el.textContent ?? "").trim() }));
  return pills;
});
check(
  "6. usdp/8's price strip lists pETH and USDp",
  strip.some((p) => p.symbol === "pETH") && strip.some((p) => p.symbol === "USDp"),
  JSON.stringify(strip),
);
await page6.close();

// ── 7. fail-first: the board never answers ─────────────────────────────────
const page7 = await openListing(context, `${BASE}/sepolia/polaris`, { stubMarkets: true });
const cards7 = await readCards(page7);
check(
  "7. with the board aborted every ratio slot is a dash — no ≈, no liquidation price, no rate line",
  cards7.length > 0 &&
    cards7.every((c) => !c.valueText.includes("≈") && !c.pulse && !/Liquidates at/.test(c.footnote)) &&
    !cards7.some((c) => /per year, set by the market/.test(c.cardText)),
  `${cards7.length} cards; first slot "${cards7[0]?.valueText}" footnote "${cards7[0]?.footnote}"`,
);
await page7.close();

// ── 8. the ratio sort (server 71a0e40): within one market the ratio order is
//       the coll ÷ debt order, so the index sorts it with no price. Ascending
//       surfaces the CDPs nearest the floor; a zero-debt CDP has no ratio and
//       goes last either way. Expected order restated here from the listing
//       response's own coll and debt, never from the page. ──────────────────
{
  const asc = await api("/api/polaris/positions?market=usdp&status=open&sortBy=ratio&sortOrder=asc&limit=100&offset=0");
  const rowsAsc = asc.items ?? asc.positions ?? asc.data ?? [];
  const quot = (r) => (Number(r.debt) > 0 ? Number(r.coll) / Number(r.debt) : null);
  const qs = rowsAsc.map(quot);
  const monotone = qs.every((q, i) => i === 0 || q == null || (qs[i - 1] != null && qs[i - 1] <= q + 1e-12));
  check(
    "8a. the index answers sortBy=ratio ascending in coll ÷ debt order (100 rows, no zero-debt row ahead of a priced one)",
    rowsAsc.length === 100 && monotone && qs[0] != null,
    `first ${rowsAsc[0]?.cdpId} at ${qs[0]?.toFixed(6)}, last ${rowsAsc[99]?.cdpId} at ${qs[99]?.toFixed(6)}`,
  );
  const total = asc.pagination?.total ?? 0;
  const tail = await api(
    `/api/polaris/positions?market=usdp&status=open&sortBy=ratio&sortOrder=asc&limit=3&offset=${Math.max(total - 3, 0)}`,
  );
  const tailRows = tail.items ?? tail.positions ?? tail.data ?? [];
  check(
    "8b. the tail of the ascending order is the zero-debt CDPs (no ratio sorts last)",
    tailRows.length === 3 && tailRows.every((r) => Number(r.debt) === 0),
    tailRows.map((r) => `${r.cdpId}: debt ${r.debt}`).join(", "),
  );

  const page8 = await openListing(context, `${BASE}/sepolia/polaris?market=usdp&sortBy=ratio&sortOrder=asc`);
  // The sort dropdown sits beside the order button (aria-label "Sort
  // ascending/descending — click to flip") inside the sort control; other
  // aria-expanded buttons on the page (the chain switcher, the Debt facet)
  // read like sort labels, so find it by that structure.
  const readSortLabel = (page) =>
    page.evaluate(() => {
      const order = document.querySelector('button[aria-label^="Sort "]');
      const dropdown = order?.parentElement?.querySelector("button[aria-expanded]");
      return dropdown?.textContent?.trim() ?? "";
    });
  const sortLabel = await readSortLabel(page8);
  check("8c. the sort control reads Ratio with a market chosen", sortLabel === "Ratio", `"${sortLabel}"`);
  const cards8 = await readCards(page8);
  const shown = cards8.map((c) => {
    const m = /≈\s*([\d.,]+)%/.exec(c.valueText);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  });
  const usdp = byMarket.usdp;
  const wantFirst = qs[0] * Number(usdp.price.pethInDebt) * 100;
  check(
    "8d. the first card is the index's lowest-ratio CDP, and its ≈ ratio is that quotient at the board's price",
    cards8[0]?.cdpId === String(rowsAsc[0]?.cdpId) && shown[0] != null && Math.abs(shown[0] - wantFirst) <= 0.05,
    `card ${cards8[0]?.market}/${cards8[0]?.cdpId} "${cards8[0]?.valueText}" vs usdp/${rowsAsc[0]?.cdpId} ≈ ${wantFirst.toFixed(1)}%`,
  );
  check(
    "8e. the page's ≈ ratios run ascending, nearest the floor first",
    shown.length > 1 && shown.every((v, i) => i === 0 || v == null || shown[i - 1] == null || shown[i - 1] <= v + 0.05),
    shown.slice(0, 6).join(" ≤ "),
  );
  await page8.close();

  const page8b = await openListing(context, `${BASE}/sepolia/polaris?sortBy=ratio&sortOrder=asc`);
  const bareLabel = await readSortLabel(page8b);
  check(
    "8f. with no market chosen the ratio sort is not offered (the two markets' quotients are not comparable)",
    bareLabel !== "Ratio",
    `sort control reads "${bareLabel}"`,
  );
  await page8b.close();
}

// ── 9. the Debt facet is the Borrowing / Collateral-only pair, and there is no
//       History facet (server 53dbf65 + web: "ever liquidated" is the Status
//       bucket on Polaris — the NFT is burned, the id never reused). ─────────
{
  const all = await api("/api/polaris/positions?status=open&limit=1");
  const borrowing = await api("/api/polaris/positions?status=open&hasDebt=1&limit=1");
  const collOnly = await api("/api/polaris/positions?status=open&hasDebt=0&limit=100");
  const nAll = all.pagination?.total ?? -1;
  const nB = borrowing.pagination?.total ?? -1;
  const nC = collOnly.pagination?.total ?? -1;
  check(
    "9a. the web route forwards both debt values, and the two sets partition the open CDPs",
    nAll > 0 && nB > 0 && nC > 0 && nB + nC === nAll,
    `open ${nAll} = borrowing ${nB} + collateral-only ${nC}`,
  );
  const rowsC = collOnly.items ?? collOnly.positions ?? collOnly.data ?? [];
  check(
    "9b. every collateral-only row the index answers has zero debt and some collateral",
    rowsC.length > 0 && rowsC.every((r) => Number(r.debt) === 0 && Number(r.coll) > 0),
    `${rowsC.length} rows; first ${rowsC[0]?.cdpId} coll ${rowsC[0]?.coll} debt ${rowsC[0]?.debt}`,
  );

  const page9 = await openListing(context, `${BASE}/sepolia/polaris?debt=collateral-only`);
  const cards9 = await readCards(page9);
  check(
    "9c. the Collateral-only view renders only dash cards — no ≈, no liquidation price",
    cards9.length > 0 && cards9.every((c) => c.dash && !c.valueText.includes("≈") && !/Liquidates at/.test(c.footnote)),
    `${cards9.length} cards; first "${cards9[0]?.valueText}" footnote "${cards9[0]?.footnote}"`,
  );
  const chrome9 = await page9.evaluate(() => {
    const text = (document.body.innerText ?? "").replace(/\s+/g, " ");
    const facetButtons = [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
    return {
      chip: /Collateral only/.test(text),
      history: facetButtons.some((t) => /^History\b/.test(t)) || /Liquidated before/.test(text),
      hasDebtLabel: /\bHas debt\b/.test(text),
    };
  });
  check("9d. the view draws its Collateral only chip", chrome9.chip, JSON.stringify(chrome9));
  check(
    '9e. no History facet and no "Liquidated before" anywhere on the listing; the old "Has debt" label is gone',
    !chrome9.history && !chrome9.hasDebtLabel,
    JSON.stringify(chrome9),
  );
  await page9.close();
}

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the listing states an approximate ratio and says so`,
);
process.exit(failures ? 1 : 0);
