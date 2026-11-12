#!/usr/bin/env node
// Caps, closed reserves, rates and the narrow layout on the five Aave-V3-family
// market pages (rails-ops TO-DO-ui-jobs §9, 541) — a cap shows on its row only
// near binding (90% or more in use) or closed by a cap of one token, a
// SparkLend cap at the field's largest value never shows, and no page quotes a
// share in the millions.
// ----------------------------------------------------------------------------
// The modelled-on check is verify-moonwell-cap-sentinel.mjs. The Aave cap field
// holds whole tokens; governance closes a side with a cap of 1 (30 supply and
// 44 borrow caps on Aave V3 Core, 2026-09-22), and dividing use by it printed
// GHO at 135,101,535×. SparkLend writes 2^36 − 1 for no cap, and its
// CapAutomator's maximum is the ceiling use is measured against.
//
// The fixture is whatever each market route says at head. The expected figures
// here are worked out from the route's raw fields by this script, separately
// from lib/shared/aave-market-view.ts.
//
// Checks, per page (Core, Base, Arbitrum, SparkLend, Seamless):
//   0. The route is live.
//   1. No exponent notation on the page.
//   2. No cap share over 1000%.
//   3. Every reserve's cap pills (`[data-caps="supply"|"borrow"]`) match this
//      script's reading of the route: "cap N%" at 90% or more in use, "cap
//      closed" at a cap of one token, "borrowing off" where borrowing is off
//      and borrows remain, and no pill otherwise.
//   4. The summary's closed count equals this script's count.
//   5. At 390px the page does not scroll sideways, and every reserve is a card
//      (the table's row, stacked: D6).
// And once each:
//   6. Core carries a cap-1 side (it reads "cap closed", check 3); SparkLend
//      carries a field-max cap (no pill) and an automator maximum.
//   7. Seamless: every row carries the frozen tag.
//   8. A reserve with LTV 0 and no eMode loan-to-value reads "Not collateral"
//      in its Collateral cell; one with an eMode loan-to-value reads "E-Mode
//      only"; one with an LTV reads "LTV% / LT%".
//   9. No non-zero rate reads 0.00% (each page).
//  11. /ethereum/aave-v3/markets is the overview of Core, Prime and EtherFi:
//      three panels, each linking its reserves view (`?market=`), and no
//      reserves table.
//  10. Available's receipt names the formula that applies (each page): every
//      row's basis (`data-available-basis`) is "virtual" where the route
//      carries the Pool's virtual balance and "difference" where it does not,
//      and the first row's receipt, opened in the inspector, names
//      Pool.getVirtualUnderlyingBalance or "supplied − borrowed; this Pool has
//      no virtual balance" to match. On Core, WETH's Available is its virtual
//      balance at the oracle price.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-aave-market-caps.mjs

import { chromium } from "playwright";
import { armScope } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const ROWS_TIMEOUT_MS = 180000;
const FIELD_MAX = 2 ** 36 - 1;

const PAGES = [
  { name: "core", path: "/ethereum/aave-v3/markets?market=core", api: "/api/chain/aave-v3/market" },
  { name: "base", path: "/base/aave-v3/markets", api: "/api/chain/aave-v3-base/market" },
  { name: "arbitrum", path: "/arbitrum/aave-v3/markets", api: "/api/chain/aave-v3-arbitrum/market" },
  { name: "spark", path: "/ethereum/spark/markets", api: "/api/chain/spark/market" },
  { name: "seamless", path: "/base/seamless/markets", api: "/api/chain/seamless/market" },
];

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** One side's expected caps text, from the route's raw fields. */
function expectSide(r, side) {
  if (side === "borrow" && !r.borrowEnabled) return { text: "off" };
  const live = side === "supply" ? r.supplyCap : r.borrowCap;
  const max = side === "supply" ? r.supplyCapMax : r.borrowCapMax;
  const amount = side === "supply" ? r.supplied + (r.accruedToTreasury ?? 0) : r.borrowed;
  const cap = max != null && max > 0 ? max : live;
  if (cap == null) return { text: "no cap" };
  if (cap >= FIELD_MAX) return { text: "no cap", fieldMax: true, automator: max != null };
  if (cap === 1) return { text: "closed", one: true };
  return { share: (amount / cap) * 100, automator: max != null && max > 0 };
}
const ltvZeroClosed = (r) =>
  r.bps.ltv === 0 && r.bps.lt > 0 && !(r.emodeCategories ?? []).some((c) => (c.ltv ?? 0) > 0);
function closedCount(rows) {
  return rows.filter((r) => {
    const s = expectSide(r, "supply");
    const b = expectSide(r, "borrow");
    return r.frozen || r.paused || !r.borrowEnabled || s.one || b.one || ltvZeroClosed(r);
  }).length;
}
const NEAR = 90;
/** The pill a side should carry on the row, or null for none. */
function expectPill(r, side) {
  const e = expectSide(r, side);
  if (e.text === "off") return r.borrowed > 0 ? { text: "borrowing off" } : null;
  if (e.one) return { text: "cap closed" };
  if (e.share != null && e.share >= NEAR) return { share: e.share };
  return null;
}
function pillMatches(got, exp) {
  if (exp == null) return got == null;
  if (got == null) return false;
  if (exp.text) return got === exp.text;
  const m = /^cap ([\d,.]+)%$/.exec(got);
  // Display rounds to whole numbers.
  return m != null && Math.abs(Number(m[1].replace(/,/g, "")) - exp.share) <= 0.51;
}
const pillText = (exp) => (exp == null ? "none" : (exp.text ?? `cap ${exp.share.toFixed(1)}%`));

const browser = await chromium.launch();
const facts = {};

for (const p of PAGES) {
  console.log(`\n── ${p.path}`);
  const res = await fetch(`${BASE}${p.api}`);
  const data = res.ok ? await res.json() : null;
  if (!check(`${p.name} 0  route is live`, data && !data.chainStale && data.reserves.length > 0)) continue;
  const rows = data.reserves;
  facts[p.name] = { rows, capAutomator: data.capAutomator };

  // ── Wide ─────────────────────────────────────────────────────────────────
  const wide = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await wide.goto(`${BASE}${p.path}`, NAV);
  await wide.locator("tr[data-reserve-row]").first().waitFor({ timeout: ROWS_TIMEOUT_MS });
  const body = await wide.evaluate(() => document.body.innerText);
  const exp = /\d\.\d+e[+-]\d+/.exec(body)?.[0];
  check(`${p.name} 1  no exponent notation`, exp == null, exp ?? "");

  const capsByAddr = await wide.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("tr[data-reserve-row]")].map((tr) => [
        tr.getAttribute("data-reserve-row"),
        {
          supply: tr.querySelector('[data-caps="supply"]')?.textContent ?? null,
          borrow: tr.querySelector('[data-caps="borrow"]')?.textContent ?? null,
        },
      ]),
    ),
  );
  const shares = Object.values(capsByAddr).flatMap((c) =>
    [c.supply, c.borrow]
      .filter(Boolean)
      .flatMap((t) => [...norm(t).matchAll(/([\d,.]+)%/g)].map((m) => Number(m[1].replace(/,/g, "")))),
  );
  const worst = Math.max(0, ...shares);
  check(`${p.name} 2  no cap share over 1000%`, worst <= 1000, `highest ${worst}%`);

  const bad = [];
  let pills = 0;
  for (const r of rows) {
    const got = capsByAddr[r.address] ?? { supply: null, borrow: null };
    const gs = got.supply == null ? null : norm(got.supply);
    const gb = got.borrow == null ? null : norm(got.borrow);
    const es = expectPill(r, "supply");
    const eb = expectPill(r, "borrow");
    pills += (gs != null) + (gb != null);
    if (!pillMatches(gs, es) || !pillMatches(gb, eb))
      bad.push(`${r.symbol}: S "${gs ?? "none"}" B "${gb ?? "none"}" vs S ${pillText(es)} B ${pillText(eb)}`);
  }
  check(
    `${p.name} 3  every row's cap pills match the route (${rows.length} rows, ${pills} pills)`,
    bad.length === 0,
    bad.slice(0, 3).join("; "),
  );

  const zeroRates = await wide.evaluate(() =>
    [...document.querySelectorAll("tr[data-reserve-row] [data-rate]")]
      .map((td) => ({
        row: td.closest("tr").getAttribute("data-reserve-row"),
        side: td.getAttribute("data-rate"),
        t: [...td.childNodes]
          .filter((n) => !(n.classList && n.classList.contains("dt-cell-label")))
          .map((n) => n.textContent)
          .join("")
          .trim(),
      }))
      .filter((x) => x.t === "0.00%"),
  );
  const zeroWrong = zeroRates.filter((x) => {
    const r = rows.find((y) => y.address === x.row);
    return r && (x.side === "supply" ? r.supplyApr : r.borrowApr) > 0;
  });
  check(
    `${p.name} 9  no non-zero rate reads 0.00%`,
    zeroWrong.length === 0,
    zeroWrong
      .slice(0, 3)
      .map((x) => `${rows.find((y) => y.address === x.row)?.symbol} ${x.side}`)
      .join("; "),
  );

  const summary = norm(await wide.locator("[data-market-summary]").textContent());
  const m = /(All (\d+)|(\d+) of \d+) reserves? (?:is|are) closed to some new business/.exec(summary);
  const pageCount = m ? Number(m[2] ?? m[3]) : 0;
  const want = closedCount(rows);
  check(`${p.name} 4  summary counts closed reserves`, pageCount === want, `page ${pageCount} vs route ${want}`);

  if (p.name === "seamless") {
    const tagged = await wide.evaluate(
      () =>
        [...document.querySelectorAll("tr[data-reserve-row]")].filter((tr) =>
          /frozen/i.test(tr.querySelector("th, td")?.textContent ?? ""),
        ).length,
    );
    const frozen = rows.filter((r) => r.frozen).length;
    check(
      "seamless 7  every frozen reserve carries the tag",
      tagged === frozen && frozen === rows.length,
      `${tagged}/${rows.length}`,
    );
  }

  if (p.name === "core") {
    // The cell's text without its stacked-card name (`.dt-cell-label`, D6).
    const collText = async (addr) =>
      norm(
        await wide.locator(`tr[data-reserve-row="${addr}"] [data-collateral]`).evaluate((td) =>
          [...td.childNodes]
            .filter((n) => !(n.classList && n.classList.contains("dt-cell-label")))
            .map((n) => n.textContent)
            .join(""),
        ),
      );
    const closedLtv = rows.find((r) => ltvZeroClosed(r) && !r.frozen);
    const emodeLtv = rows.find(
      (r) => r.bps.ltv === 0 && r.bps.lt > 0 && (r.emodeCategories ?? []).some((c) => (c.ltv ?? 0) > 0),
    );
    const lends = rows.find((r) => r.bps.ltv > 0);
    if (closedLtv) {
      const t = await collText(closedLtv.address);
      check(`core 8a ${closedLtv.symbol} (LTV 0, no eMode LTV) reads "Not collateral"`, t === "Not collateral", t);
    } else check("core 8a an LTV-0 reserve with no eMode LTV exists", false);
    if (emodeLtv) {
      const t = await collText(emodeLtv.address);
      check(`core 8b ${emodeLtv.symbol} (LTV 0, eMode LTV) reads "E-Mode only"`, t === "E-Mode only", t);
    } else check("core 8b an LTV-0 reserve with an eMode LTV exists", false);
    if (lends) {
      const t = await collText(lends.address);
      const want = `${(lends.bps.ltv / 100).toFixed(2).replace(/\.?0+$/, "")}% / ${(lends.bps.lt / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
      check(`core 8c ${lends.symbol} reads LTV / LT`, t === want, `"${t}" vs "${want}"`);
    }
  }
  // ── 10. Available names its formula ────────────────────────────────────
  {
    const bases = await wide.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("tr[data-reserve-row]")].map((tr) => [
          tr.getAttribute("data-reserve-row"),
          tr.querySelector("[data-available-basis]")?.getAttribute("data-available-basis") ?? null,
        ]),
      ),
    );
    const wrong = rows.filter((r) => bases[r.address] !== (r.virtualBalance != null ? "virtual" : "difference"));
    const virtual = rows.filter((r) => r.virtualBalance != null).length;
    check(
      `${p.name} 10a every row's Available basis matches the Pool (${virtual} of ${rows.length} virtual)`,
      wrong.length === 0,
      wrong
        .slice(0, 3)
        .map((r) => `${r.symbol} ${bases[r.address]}`)
        .join("; "),
    );
    const first = rows.find((r) => r.address === Object.keys(bases)[0]);
    const want =
      first?.virtualBalance != null
        ? /Pool\.getVirtualUnderlyingBalance\(asset\) at block \d+/
        : /supplied − borrowed; this Pool has no virtual balance/i;
    let text = "";
    // The reserves section's ⋮ arms it (no page-wide toggle, ui-jobs 549/550).
    const scope = await wide.locator("[data-reserves-section]").first().getAttribute("data-prov-scope");
    if (scope && (await armScope(wide, scope, { menu: `[data-section-menu="${scope}"]` }).catch(() => false))) {
      await wide
        .locator("tr[data-reserve-row]")
        .first()
        .locator("[data-available-basis] [data-prov-pickable]")
        .first()
        .click();
      await wide.waitForSelector(".prov-inspect-pop", { timeout: 10000 }).catch(() => {});
      text = norm(
        await wide
          .locator(".prov-inspect-pop")
          .first()
          .innerText()
          .catch(() => ""),
      );
      await wide.keyboard.press("Escape");
    }
    check(`${p.name} 10b ${first?.symbol} Available receipt names its formula`, want.test(text), text.slice(0, 140));
    if (p.name === "core") {
      const weth = rows.find((r) => r.symbol === "WETH");
      const shown = await wide
        .locator(`tr[data-reserve-row="${weth?.address}"] [data-available-basis]`)
        .innerText()
        .catch(() => "");
      const m = /\$([\d.,]+)([KMB]?)/.exec(shown);
      const usd = m ? Number(m[1].replace(/,/g, "")) * { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]] : NaN;
      const vbUsd = (weth?.virtualBalance ?? NaN) * (weth?.priceUsd ?? NaN);
      const diffUsd = ((weth?.supplied ?? 0) - (weth?.borrowed ?? 0)) * (weth?.priceUsd ?? 0);
      check(
        "core 10c WETH Available is its virtual balance",
        Math.abs(usd - vbUsd) / vbUsd < 0.01,
        `shown ${shown}; virtual $${(vbUsd / 1e6).toFixed(1)}M; supplied − borrowed $${(diffUsd / 1e6).toFixed(1)}M`,
      );
    }
  }
  await wide.close();

  // ── Narrow ───────────────────────────────────────────────────────────────
  const narrow = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await narrow.goto(`${BASE}${p.path}`, NAV);
  await narrow.locator("tr[data-reserve-row]").first().waitFor({ timeout: ROWS_TIMEOUT_MS });
  const { sw, cw, cards, rowsDrawn } = await narrow.evaluate(() => {
    const trs = [...document.querySelectorAll("tr[data-reserve-row]")];
    return {
      sw: document.scrollingElement.scrollWidth,
      cw: document.scrollingElement.clientWidth,
      cards: trs.filter((tr) => getComputedStyle(tr).display === "grid").length,
      rowsDrawn: trs.length,
    };
  });
  check(
    `${p.name} 5  390px: no sideways scroll, one card per reserve`,
    sw <= cw + 1 && cards === rows.length && rowsDrawn === rows.length,
    `scrollWidth ${sw} / ${cw}, ${cards} cards of ${rowsDrawn} rows`,
  );
  await narrow.close();
}

// ── 11. The Ethereum overview: three panels, each linking its reserves ─────
{
  const ov = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await ov.goto(`${BASE}/ethereum/aave-v3/markets`, NAV);
  await ov
    .waitForFunction(() => document.querySelectorAll("[data-market-reserves-link]").length >= 3, null, {
      timeout: ROWS_TIMEOUT_MS,
    })
    .catch(() => {});
  const panels = await ov.evaluate(() =>
    [...document.querySelectorAll("[data-overview-market]")].map((s) => ({
      key: s.getAttribute("data-overview-market"),
      href: s.querySelector("[data-market-reserves-link]")?.getAttribute("href") ?? null,
      summary: Boolean(s.querySelector("[data-market-summary]")),
    })),
  );
  const rowsOnOverview = await ov.locator("tr[data-reserve-row]").count();
  const wantPanels = [
    ["aave-v3", "/ethereum/aave-v3/markets?market=core"],
    ["aave-v3-prime", "/ethereum/aave-v3/markets?market=prime"],
    ["aave-v3-etherfi", "/ethereum/aave-v3/markets?market=etherfi"],
  ];
  const okPanels =
    panels.length === 3 &&
    wantPanels.every(([k, h], i) => panels[i]?.key === k && panels[i]?.href === h && panels[i]?.summary);
  check(
    "11a the Ethereum overview draws Core, Prime and EtherFi, each linking its reserves",
    okPanels,
    panels.map((p) => `${p.key} → ${p.href}`).join("; "),
  );
  check("11b the overview draws no reserves table", rowsOnOverview === 0, `${rowsOnOverview} rows`);
  await ov.close();
}

// ── 6. The sentinels are present and named ─────────────────────────────────
{
  const core = facts.core?.rows ?? [];
  const one = core.find((r) => r.supplyCap === 1 || (r.borrowEnabled && r.borrowCap === 1));
  check("6a Core carries a cap of one token", one != null, one?.symbol ?? "");
  const spark = facts.spark?.rows ?? [];
  const fieldMax = spark.find((r) => expectSide(r, "supply").fieldMax);
  check("6b SparkLend carries a no-cap field maximum", fieldMax != null, fieldMax?.symbol ?? "");
  const automated = spark.find((r) => expectSide(r, "supply").automator && expectSide(r, "supply").share != null);
  check(
    "6c SparkLend measures a supply cap against the CapAutomator maximum",
    automated != null && facts.spark?.capAutomator != null,
    automated ? `${automated.symbol} max ${automated.supplyCapMax} (live ${automated.supplyCap})` : "",
  );
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
