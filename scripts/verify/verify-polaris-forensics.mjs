// Polaris — liquidation forensics valued at the block, and the gas clause.
// ---------------------------------------------------------------------------
// Checks:
//
//   0. The IDENTITY, recomputed with BigInt from the timeline route's own raw
//      1e18 strings and never from the page: on each of Polaris's two
//      liquidations, (collLiquidated − collSurplus − collateralComp) ×
//      priceAtBlock ÷ 1e18 = debtLiquidated × 1.05, within 1e-4 relative. The
//      1.05 is the protocol's OWN LIQUIDATION_PENALTY_SP(), read live on both
//      markets' cdpManagers at block 11,674,201 on 2026-09-10 (0.05e18) — a
//      chain fact restated here, not a figure this repo computes.
//   1. usdp/175 and usdp/166: the expanded liquidation row states the pool's
//      collateral leg, its value at the block, the premium, the reference
//      "5%", the at-block price pill, and NO "$" anywhere in the row.
//   2. The same rows' Explanation pane states the valued sentence and the
//      collateral-ratio-at-fire sentence.
//   3. usdp/166's OPEN row carries "Gas for this transaction: 0.0018 ETH" —
//      702,311 gas × 2,599,796,780 wei, both read from the rails-server
//      timeline route on 2026-09-10 and pinned here; and the LIQUIDATION row
//      carries no gas clause (the liquidator sent that transaction).
//   4. /coverage/sepolia shows the Polaris "Liquidation forensics" cell filled.
//   5. usdp/175's markdown export carries the same valued legs, premium and
//      collateral ratio at fire, so the LLM's view cannot lag the page.
//
// Every expected string below is restated in this file from the pinned raw
// values and the house formatting rules — never imported from, or read back
// off, the code under test.
//
// ⚠️ Both fixtures are stability-pool absorbs (`_debtRedistributed` = 0). The
// redistribution path and its 15% constant are UNEXERCISED on Sepolia as of
// 2026-09-10; extend this script when a redistributed liquidation appears.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-polaris-forensics.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

// ── the pins (plan §1 + a direct Sepolia read), never route-derived ─────────
const PENALTY_SP_RAW = 100000000000000000n / 2n; // 0.05e18 — LIQUIDATION_PENALTY_SP()
const MCR_LABEL = "115%"; // MCR() = 1.15e18, normal mode, both markets

const FIXTURES = [
  {
    market: "usdp",
    id: "175",
    block: 11618783,
    eventKey: "cdp_updated:0x54ff6b35672de07b4e4d4d044c075a942c5d755658cdcab54c22eac72d579769:84",
    raw: {
      collLiquidated: "4032538090995644179",
      debtLiquidated: "16803409237555889150032",
      collSurplus: "323140478581266836",
      collateralComp: "20162690454978220",
      debtRedistributed: "0",
      priceAtBlock: "4782449497703159616692",
    },
  },
  {
    market: "usdp",
    id: "166",
    block: 11585985,
    eventKey: "cdp_updated:0x4a7513ae28ac742b88cc9a88e4a6ddce7ab815da3dc7f4893582824252e37233:307",
    raw: {
      collLiquidated: "270426123598289887",
      debtLiquidated: "1146405794704979134539",
      collSurplus: "21137356266196701",
      collateralComp: "1352130617991449",
      debtRedistributed: "0",
      priceAtBlock: "4854974643494325153286",
    },
  },
];

// usdp/166's open, block 11,578,179 — tx_gas_used × tx_gas_price straight off
// the rails-server route on 2026-09-10.
const GAS_FIXTURE = {
  market: "usdp",
  id: "166",
  eventKey: "cdp_updated:0xc3cd88b40626d8f4caa15c76e73b9a9e3b2982ca3727f2a0a1b6a9f14256dc28:21",
  gasUsed: 702311,
  gasPrice: 2599796780,
};

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  // Detail on failure only — a green line stays one line.
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
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

// ── restated formatting, independent of lib/utils/format.ts ────────────────
const E18 = 10n ** 18n;
/** Exact raw → Number, via the decimal string (no float in the division). */
const toNum = (raw) => {
  const v = BigInt(raw);
  const neg = v < 0n;
  const a = neg ? -v : v;
  return Number(`${neg ? "-" : ""}${a / E18}.${(a % E18).toString().padStart(18, "0")}`);
};
/** formatNumber's plain-decimal path: Intl defaults (0–3 fraction digits). */
const fmtNum = (n) => n.toLocaleString("en-US", { style: "decimal" });
/** The market's own unit — USDp to 2dp. */
const fmtValue = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** The premium pill: sign + two places, U+2212 for a negative. */
const fmtPremium = (f) => `${f >= 0 ? "+" : "−"}${(Math.abs(f) * 100).toFixed(2)}%`;
/** The explainer's own percentage: two places, no sign. */
const fmtPct = (f) => `${(f * 100).toFixed(2)}%`;
/** formatGasCost's ETH leg: 4 places at or above 0.001, else 6. */
const fmtGasEth = (eth) => (eth < 0.001 ? eth.toFixed(6) : eth.toFixed(4));

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}

/** Expand one event row by its `event_key` and return its whole text,
 *  whitespace-collapsed. */
async function expandRow(page, eventId) {
  const row = page.locator(`[data-event-id="${eventId}"]`);
  if ((await row.count()) === 0) return null;
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button").first().click();
  await page.waitForTimeout(300);
  return (await row.innerText()).replace(/\s+/g, " ");
}

/** Open an expanded row's Explanation pane and return its text. */
async function readExplanation(page, eventId) {
  const row = page.locator(`[data-event-id="${eventId}"]`);
  const btn = row.getByRole("button", { name: /explanation/i }).first();
  if ((await btn.count()) === 0) return null;
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.waitForTimeout(300);
  return (await row.innerText()).replace(/\s+/g, " ");
}

console.log("Polaris — liquidation forensics valued at the block, and the gas clause\n");
console.log(`BASE ${BASE}\n`);

// ── 0. the identity, from the route's raw strings only ──────────────────────

const routes = {};
for (const f of FIXTURES) {
  const key = `${f.market}/${f.id}`;
  routes[key] = await api(`/api/polaris/timeline?market=${f.market}&id=${f.id}`);
  const ev = routes[key].events.find((e) => e.id === f.eventKey);
  const raw = ev?.context?.data?.raw;
  const priceRaw = ev?.context?.data?.priceAtBlock?.raw;

  const sameAsPinned =
    raw != null &&
    raw.collLiquidated === f.raw.collLiquidated &&
    raw.debtLiquidated === f.raw.debtLiquidated &&
    raw.collSurplus === f.raw.collSurplus &&
    raw.collateralComp === f.raw.collateralComp &&
    raw.debtRedistributed === f.raw.debtRedistributed &&
    priceRaw === f.raw.priceAtBlock;
  check(
    `0a. ${key}'s liquidation row on the route carries the pinned raw legs at block ${f.block}`,
    sameAsPinned && ev.blockNumber === f.block,
    sameAsPinned ? `block ${ev?.blockNumber}` : JSON.stringify({ raw, priceRaw }),
  );

  // BigInt throughout: leg × price ÷ 1e18 against debt × 1.05, compared as a
  // relative gap under 1e-4. Nothing on the page is consulted.
  const leg = BigInt(f.raw.collLiquidated) - BigInt(f.raw.collSurplus) - BigInt(f.raw.collateralComp);
  const legValue = (leg * BigInt(f.raw.priceAtBlock)) / E18;
  const expected = (BigInt(f.raw.debtLiquidated) * (E18 + PENALTY_SP_RAW)) / E18;
  const gap = legValue > expected ? legValue - expected : expected - legValue;
  const relative = Number((gap * 1000000n) / expected) / 1000000;
  check(
    `0b. ${key}: (seized − surplus − compensation) × price = debt × 1.05 (LIQUIDATION_PENALTY_SP), within 1e-4 relative`,
    relative < 1e-4,
    `leg ${leg} → ${legValue}, expected ${expected}, relative gap ${relative}`,
  );
  check(`0c. ${key} is a stability-pool absorb (the 15% path is unexercised)`, f.raw.debtRedistributed === "0");
}

// ── the browser ────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});

for (const f of FIXTURES) {
  const key = `${f.market}/${f.id}`;
  const leg = toNum(
    (BigInt(f.raw.collLiquidated) - BigInt(f.raw.collSurplus) - BigInt(f.raw.collateralComp)).toString(),
  );
  const price = toNum(f.raw.priceAtBlock);
  const cleared = toNum(f.raw.debtLiquidated);
  const legValue = leg * price;
  const premium = legValue / cleared - 1;
  const icr = (toNum(f.raw.collLiquidated) * price) / cleared;

  const want = {
    leg: fmtNum(leg),
    legValue: fmtValue(legValue),
    cleared: fmtValue(cleared),
    premium: fmtPremium(premium),
    icr: fmtPct(icr),
    price: fmtValue(price),
  };
  console.log(`\n(info) ${key}: ${JSON.stringify(want)}`);

  const page = await open(context, polarisUrl(f.market, f.id));
  const rowText = await expandRow(page, f.eventKey);
  if (!check(`1. ${key}'s liquidation row expands`, rowText != null)) {
    await page.close();
    continue;
  }

  check(
    `1a. ${key} states the pool's collateral leg (${want.leg} pETH) beside the entire seized amount`,
    rowText.includes(`Collateral to the pool ${want.leg}`) && rowText.includes("Collateral seized"),
    rowText.slice(0, 500),
  );
  check(
    `1b. ${key} values that leg at ${want.legValue} and the cleared debt at ${want.cleared}`,
    rowText.includes(want.legValue) && rowText.includes(want.cleared),
    rowText.slice(0, 700),
  );
  check(
    `1c. ${key} states the premium ${want.premium} against the protocol's own 5% penalty`,
    rowText.includes(want.premium) && /protocol['’]s liquidation penalty 5%/.test(rowText),
    rowText.slice(0, 700),
  );
  check(
    `1d. ${key} carries exactly one at-block price pill (${want.price} · oracle at block)`,
    rowText.includes(`pETH ${want.price}`) && (rowText.match(/oracle at block/g) ?? []).length === 1,
    `${(rowText.match(/oracle at block/g) ?? []).length} pill(s)`,
  );
  check(`1e. ${key}'s row states no figure in dollars`, !rowText.includes("$"), rowText.slice(0, 700));

  const explained = await readExplanation(page, f.eventKey);
  if (check(`2. ${key}'s Explanation pane opens`, explained != null)) {
    check(
      `2a. ${key}'s explainer states the valued sentence (${want.leg} pETH → ${want.legValue} against ${want.cleared})`,
      explained.includes(`${want.leg} pETH came to ${want.legValue} USDp`) &&
        explained.includes(`${want.cleared} USDp of debt cleared`) &&
        explained.includes(`a premium of ${want.premium}`),
      explained.slice(0, 900),
    );
    check(
      `2b. ${key}'s explainer states the collateral ratio at liquidation (${want.icr}, against ${MCR_LABEL})`,
      explained.includes(`collateral ratio at liquidation at ${want.icr}`) &&
        explained.includes(`normal-mode minimum of ${MCR_LABEL}`),
      explained.slice(0, 900),
    );
    check(
      `2c. ${key}'s liquidation row carries NO gas clause (the liquidator sent that transaction)`,
      !/Gas for this transaction/.test(explained),
      explained.slice(0, 900),
    );
    check(`2d. ${key}'s explainer states no figure in dollars`, !explained.includes("$"), explained.slice(0, 900));
  }
  await page.close();
}

// ── 3. the gas clause on the holder's own open ─────────────────────────────

const wantGas = `Gas for this transaction: ${fmtGasEth((GAS_FIXTURE.gasUsed * GAS_FIXTURE.gasPrice) / 1e18)} ETH.`;
const pageGas = await open(context, polarisUrl(GAS_FIXTURE.market, GAS_FIXTURE.id));
await expandRow(pageGas, GAS_FIXTURE.eventKey);
const openText = await readExplanation(pageGas, GAS_FIXTURE.eventKey);
check(
  `3. usdp/166's open row states "${wantGas}" (${GAS_FIXTURE.gasUsed} gas × ${GAS_FIXTURE.gasPrice} wei)`,
  openText != null && openText.includes(wantGas),
  openText ? openText.slice(0, 700) : "row not found",
);
await pageGas.close();

// ── 5. the markdown export ─────────────────────────────────────────────────
// Recomputed from usdp/175's pinned raws, exactly as the page checks above.
{
  const f = FIXTURES[0];
  const leg = toNum(
    (BigInt(f.raw.collLiquidated) - BigInt(f.raw.collSurplus) - BigInt(f.raw.collateralComp)).toString(),
  );
  const price = toNum(f.raw.priceAtBlock);
  const cleared = toNum(f.raw.debtLiquidated);
  const legValue = leg * price;
  const pageMd = await open(context, polarisUrl(f.market, f.id));
  await pageMd
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await pageMd.getByRole("menuitem", { name: /Copy Position/i }).click();
  await pageMd.waitForTimeout(500);
  const md = await pageMd.evaluate(() => navigator.clipboard.readText());
  check(
    "5. usdp/175's markdown export carries the valued liquidation legs, the premium and the ratio at fire",
    /## Liquidation/.test(md) &&
      md.includes(`${fmtValue(legValue)} USDp`) &&
      md.includes(`${fmtValue(cleared)} USDp at face`) &&
      md.includes(fmtPct(legValue / cleared - 1)) &&
      md.includes(fmtPct((toNum(f.raw.collLiquidated) * price) / cleared)) &&
      /LIQUIDATION_PENALTY_SP\(\)` is 5%/.test(md),
    md.slice(md.indexOf("## Liquidation"), md.indexOf("## Liquidation") + 1400),
  );
  await pageMd.close();
}

// ── 4. the coverage matrix ─────────────────────────────────────────────────

const pageCov = await context.newPage();
await pageCov.goto(`${BASE}/coverage/sepolia`, { waitUntil: "domcontentloaded", timeout: 180000 });
await pageCov.waitForTimeout(1500);
const cell = await pageCov.evaluate(() => {
  for (const table of document.querySelectorAll("table")) {
    const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
    // The header cells run their label and their description together with no
    // separating whitespace, so the match is on the two words adjacent.
    const col = heads.findIndex((h) => /Liquidation\s*forensics/i.test(h));
    if (col < 0) continue;
    for (const tr of table.querySelectorAll("tbody tr")) {
      const rowHead = (tr.querySelector("th")?.textContent ?? "").trim();
      const tds = [...tr.querySelectorAll("td")];
      // The essay row a matrix can carry beneath an explorer spans one cell.
      if (!/Polaris/i.test(rowHead) || tds.length < 2) continue;
      // The row header is the <th>; the capability <td>s follow it, so the
      // header index minus the leading header column indexes the cells.
      const td = tds[col - (heads.length - tds.length)];
      if (!td) return { found: false, reason: `no cell at column ${col}` };
      return {
        found: true,
        included: td.querySelector('[aria-label="Included"]') != null,
        label: td.querySelector("[aria-label]")?.getAttribute("aria-label") ?? null,
      };
    }
  }
  return { found: false, reason: "no Polaris row in a matrix with a forensics column" };
});
check(
  "4. /coverage/sepolia shows Polaris's Liquidation forensics cell filled",
  cell.found === true && cell.included === true,
  JSON.stringify(cell),
);
await pageCov.close();

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — Polaris liquidation forensics hold at the block`,
);
process.exit(failures ? 1 : 0);
