// Live in-browser verification of the oracle-at-block prices on the two Aave
// V3 Pools on Base — Aave V3 Base and Seamless — as the shared Aave V3 card
// renders them from the index (rails-server-onboarding mig 197,
// scripts/fill-aave-base-prices.mjs): the AtBlockPriceFootnote pill on an
// ordinary row, the valued two-leg liquidation forensics (both legs, the
// realized premium, and the "Bonus at block" reference read from the reserve's
// configuration at the same block), the token-only render for a block the
// walk has not reached, and the seized leg's receipt naming the oracle read.
// Every expected figure is re-derived from the SAME wallet's timeline route
// payload (/api/chain/<explorer>/timeline) and checked against the DOM;
// nothing is pinned to an event number or to an absence
// (verify-historic-usd-pills.mjs's rules): specimens are discovered at run
// time and a run that finds no unpriced row says NO EVIDENCE.
//
// Fail-first (2026-09-04, dev server on :3021 against the onboarding box, Aave V3 Base
// wallet below): run with the index transform's price mapping stashed —
// 2 FAIL (no priced ordinary row, no priced liquidation; the token-only arm
// and the page-error arm PASS); with the mapping restored, ALL PASS — the
// realized premium 4.499% landing on the 5% bonus less the protocol's 10%
// share, the "Bonus at block" reference and its getConfiguration receipt,
// both pills, and a withdraw at block 44,938,452 the walk has not reached
// rendering token-only.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run against a dev server:  BASE=http://localhost:3021 node scripts/verify/verify-at-block-prices-aave-base.mjs
// One explorer only:         EXPLORER=seamless … ; a different wallet: WALLET=0x… (applies to that explorer)

import { chromium } from "playwright";
import { armInspector } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ONLY = process.env.EXPLORER;
const EXPLORERS = [
  {
    key: "aave-v3-base",
    page: (w) => `/base/aave-v3/${w}`,
    timeline: (w) => `/api/chain/aave-v3-base/timeline?wallet=${w}`,
    // The newest LiquidationCall on the Base box on 2026-09-04 (block
    // 50,852,790, USDC collateral for USDbC debt) — every liquidation block is
    // priced by the liquidation-first pass, so both priced arms have specimens.
    wallet: "0x47b3e0a335f7a84fed7c49820eff8a2753536aca",
    protocolFee: true,
  },
  {
    key: "seamless",
    page: (w) => `/base/seamless/${w}`,
    timeline: (w) => `/api/chain/seamless/timeline?wallet=${w}`,
    // Seamless's newest liquidation (block 49,775,555, cbETH for USDC).
    wallet: "0x818214d3494fbc4be4f450c50677e55987804206",
    protocolFee: false,
  },
].filter((x) => !ONLY || x.key === ONLY);
const COUNT_RE = /^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

/** The shown figure rounds to the expected one at the precision it is shown with. */
const roundsTo = (text, expected) => {
  const m = text.replace(/,/g, "").match(/-?\d+(?:\.(\d+))?/);
  if (!m) return false;
  const shown = Number(m[0]);
  const dp = m[1] ? m[1].length : 0;
  return Number.isFinite(shown) && Math.abs(shown - expected) <= 0.5 * 10 ** -dp + 1e-12;
};

// ── Page helpers (verify-at-block-prices-moonwell-base.mjs's) ─────────────

async function setDisplayFlag(page, label, wantOn) {
  const countSpan = page.getByText(COUNT_RE).first();
  await countSpan.waitFor({ state: "visible", timeout: 30000 });
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
  if (!opened) throw new Error(`Display menu never offered "${label}" on ${page.url()}`);
  const isOn = await item
    .locator("span")
    .first()
    .evaluate((el) => el.className.includes("bg-rb-500"))
    .catch(() => false);
  if (isOn !== wantOn) await item.click();
  await countSpan.click();
}

/** Grow the render window until every event is painted. The cap counts PRESSES,
 *  and one press paints `TIMELINE_PAGE_ROWS` (lib/shared/timeline-opening-balance.ts)
 *  — halve that constant and a fixed cap reaches half as far, so the cap is set
 *  well above what any fixture here needs and the loop leaves as soon as the
 *  control is gone. */
async function showAll(page, max = 25) {
  for (let i = 0; i < max; i++) {
    const btn = page.getByRole("button", { name: /^Show \d+ more$/ });
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(150);
  }
}

/** The whole card — header panel and the detail panel that mounts beside it
 *  (EventCard's `min-w-0 grow` content tier). */
function cardFor(page, n) {
  const badge = page.locator(`[aria-label="Event ${n}"]`);
  return badge.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " min-w-0 ") and contains(concat(" ", normalize-space(@class), " "), " grow ")][1]',
  );
}

async function expandCard(page, n) {
  const badge = page.locator(`[aria-label="Event ${n}"]`);
  await badge.waitFor({ state: "visible", timeout: 20000 });
  await badge.scrollIntoViewIfNeeded();
  const clickable = badge.locator('xpath=ancestor::div[@role="button"][1]');
  await clickable.click();
  await page.waitForTimeout(250);
}

async function openReceiptFor(page, card, valueText) {
  // The toggle rides in the Tools menu on a position view and in the dock on
  // a Market-type page; armInspector reads either, and is a no-op once armed
  // (the tool is STICKY — a blind second click would put it down).
  if (!(await armInspector(page))) return null;
  const target = card.locator("span.prov-locate-box").filter({ hasText: valueText }).first();
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

const browser = await chromium.launch();
const pageErrors = [];
const data = (e) => e.context?.data ?? {};
const isPricedOrdinary = (d) => d.eventType !== "liquidation" && d.price?.usd > 0;

/** A wallet with a priced ordinary row, found from the listing's most recent
 *  accounts: the forward tick prices the newest event blocks within minutes,
 *  so a recently active account with a short history carries one. Used when
 *  the liquidation fixture's own rows all sit below the walk frontier (a
 *  frozen Pool's liquidated wallet has had no ordinary event in months). */
async function discoverPricedOrdinary(x) {
  for (const offset of [0, 25, 50]) {
    let listing;
    try {
      listing = await api(`/api/${x.key}/positions?limit=25&offset=${offset}`);
    } catch (e) {
      console.log(`  (positions page @${offset} unavailable: ${e.message})`);
      continue;
    }
    for (const row of listing.rows ?? []) {
      let tl;
      try {
        tl = await api(x.timeline(row.wallet));
      } catch {
        continue;
      }
      const events = tl.events ?? [];
      if (!events.length || events.length > 120 || tl.coverage?.source !== "index") continue;
      if (events.some((e) => isPricedOrdinary(data(e)))) return { wallet: row.wallet, events };
    }
  }
  return null;
}

/** Open a wallet's page with numbers on and runs expanded; returns the page
 *  and the API-index → DOM-number map. */
async function openPage(x, wallet, events) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${x.key}/${wallet}: ${e}`));
  await page.goto(`${BASE}${x.page(wallet)}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.getByText(COUNT_RE).first().waitFor({ state: "visible", timeout: 120000 });
  await setDisplayFlag(page, "Event Numbers", true);
  await setDisplayFlag(page, "Collapse like events", false);
  await showAll(page, 25);
  const badgeNumbers = await page
    .locator('[aria-label^="Event "]')
    .evaluateAll((els) =>
      els.map((e) => Number((e.getAttribute("aria-label") ?? "").slice(6))).filter(Number.isFinite),
    );
  const offset = badgeNumbers.length ? Math.max(...badgeNumbers) - events.length : 0;
  console.log(`      ${badgeNumbers.length} numbered cards in the DOM; numbering offset ${offset}`);
  return { page, domN: (n) => offset + n };
}

async function runExplorer(x) {
  const wallet = (ONLY === x.key && process.env.WALLET) || x.wallet;
  console.log(`\n=== ${x.key} — ${wallet} ===`);

  // ── Expectations from the API ──
  const tl = await api(x.timeline(wallet));
  const events = tl.events ?? [];
  check(
    `${x.key} API: timeline answers (${events.length} drawn events, source ${tl.coverage?.source})`,
    events.length > 0,
  );
  check(
    `${x.key} API: served from the index (the sweep carries no prices)`,
    tl.coverage?.source === "index",
    `source ${tl.coverage?.source}`,
  );
  const numbered = events.map((e, i) => ({ n: i + 1, e, d: data(e) }));
  const newestFirst = [...numbered].reverse();
  let pricedOrdinary = newestFirst.find(({ d }) => isPricedOrdinary(d));
  let ordinaryWallet = wallet;
  let ordinaryEvents = events;
  if (!pricedOrdinary) {
    const found = await discoverPricedOrdinary(x);
    if (found) {
      ordinaryWallet = found.wallet;
      ordinaryEvents = found.events;
      pricedOrdinary = found.events
        .map((e, i) => ({ n: i + 1, e, d: data(e) }))
        .reverse()
        .find(({ d }) => isPricedOrdinary(d));
      console.log(`      priced ordinary row discovered on ${ordinaryWallet} (${found.events.length} events)`);
    }
  }
  const pricedLiq = newestFirst.find(
    ({ d }) =>
      d.eventType === "liquidation" &&
      d.collateralPrice?.usd > 0 &&
      d.debtPrice?.usd > 0 &&
      d.liquidationBonusAtBlock?.bonusBps > 10000,
  );
  const unpriced = newestFirst.find(({ d }) => d.eventType !== "liquidation" && d.price == null);
  check(
    `${x.key} API: a priced ordinary row exists (fixture wallet or a discovered recent account)`,
    !!pricedOrdinary,
    pricedOrdinary
      ? `#${pricedOrdinary.n} ${pricedOrdinary.d.eventType} ${pricedOrdinary.d.reserveSymbol} @ ${pricedOrdinary.e.blockNumber} $${pricedOrdinary.d.price.usd}`
      : "none",
  );
  check(
    `${x.key} API: a liquidation with both legs priced and the bonus at block exists`,
    !!pricedLiq,
    pricedLiq
      ? `#${pricedLiq.n} ${pricedLiq.d.collateralSymbol}→${pricedLiq.d.reserveSymbol} @ ${pricedLiq.e.blockNumber} bonus ${pricedLiq.d.liquidationBonusAtBlock.bonusBps} fee ${pricedLiq.d.liquidationBonusAtBlock.protocolFeeBps}`
      : "none",
  );
  if (pricedLiq) {
    const b = pricedLiq.d.liquidationBonusAtBlock;
    check(
      `${x.key} API: the reserve's protocol fee is ${x.protocolFee ? "non-zero (Aave V3 Base keeps a share)" : "zero (Seamless keeps none)"}`,
      x.protocolFee ? b.protocolFeeBps > 0 : b.protocolFeeBps === 0,
      `${b.protocolFeeBps} bps`,
    );
    // The premium the legs realize lands on the bonus less the protocol's share.
    const seized = Number(pricedLiq.d.liquidatedCollateralAmount) * pricedLiq.d.collateralPrice.usd;
    const cleared = Number(pricedLiq.d.debtToCover) * pricedLiq.d.debtPrice.usd;
    const realized = seized / cleared - 1;
    const bonus = (b.bonusBps - 10000) / 10000;
    const expected = bonus * (1 - b.protocolFeeBps / 10000);
    check(
      `${x.key} API: realized premium ${(realized * 100).toFixed(3)}% lands on bonus less the protocol share (${(expected * 100).toFixed(3)}%)`,
      Math.abs(realized - expected) < 0.0015,
    );
  }
  if (unpriced)
    console.log(
      `      unpriced specimen: #${unpriced.n} ${unpriced.d.eventType} ${unpriced.d.reserveSymbol} @ ${unpriced.e.blockNumber}`,
    );
  else console.log("      NO EVIDENCE for the token-only arm on this wallet (every ordinary row is priced)");

  // ── DOM ──
  const { page, domN } = await openPage(x, wallet, events);

  if (pricedOrdinary) {
    const { n, d } = pricedOrdinary;
    const own = ordinaryWallet === wallet ? { page, domN } : await openPage(x, ordinaryWallet, ordinaryEvents);
    await expandCard(own.page, own.domN(n));
    const card = cardFor(own.page, own.domN(n));
    const pill = card.getByText(/oracle at block/).first();
    check(`${x.key} ordinary #${n}: AtBlockPriceFootnote pill renders`, (await pill.count()) > 0);
    if ((await pill.count()) > 0) {
      const text = (await pill.locator("xpath=..").innerText()).replace(/\s+/g, " ").trim();
      check(
        `${x.key} ordinary #${n}: pill names ${d.reserveSymbol} at its at-block price`,
        text.includes(d.reserveSymbol) && roundsTo(text.replace(d.reserveSymbol, ""), d.price.usd),
        `"${text}" vs ${d.price.usd}`,
      );
      const receipt = await openReceiptFor(own.page, card, d.reserveSymbol);
      check(
        `${x.key} ordinary #${n}: the pill's receipt names IAaveOracle getAssetPrice at the block`,
        !!receipt && /getAssetPrice/.test(receipt) && !/Untraced input/.test(receipt),
        receipt ? receipt.slice(0, 120).replace(/\s+/g, " ") : "no receipt",
      );
    }
    check(
      `${x.key} ordinary #${n}: no forensics grid on an ordinary row`,
      (await card.getByText("Seized, at fire").count()) === 0,
    );
    if (own.page !== page) await own.page.close();
  }

  if (pricedLiq) {
    const { n, d } = pricedLiq;
    await expandCard(page, domN(n));
    const card = cardFor(page, domN(n));
    const seized = Number(d.liquidatedCollateralAmount) * d.collateralPrice.usd;
    const cleared = Number(d.debtToCover) * d.debtPrice.usd;
    const premium = seized / cleared - 1;
    check(
      `${x.key} liquidation #${n}: forensics grid renders (Seized / Cleared / Realized premium)`,
      (await card.getByText("Seized, at fire").count()) > 0 &&
        (await card.getByText("Cleared, at fire").count()) > 0 &&
        (await card.getByText("Realized premium").count()) > 0,
    );
    const premiumEl = card.getByText(/^[+−]\d+\.\d\d%$/).first();
    if ((await premiumEl.count()) > 0) {
      const text = await premiumEl.innerText();
      const shown = Number(text.replace("−", "-").replace("%", "")) / 100;
      check(
        `${x.key} liquidation #${n}: premium ≈ seized ÷ cleared − 1 from the API figures`,
        Math.abs(shown - premium) < 0.0006,
        `${text} vs ${(premium * 100).toFixed(3)}%`,
      );
    } else check(`${x.key} liquidation #${n}: premium value renders`, false);
    const b = d.liquidationBonusAtBlock;
    const bonusText = `+${((b.bonusBps - 10000) / 100).toFixed(2)}%`;
    const ref = card.getByText(/Bonus at block/).first();
    check(
      `${x.key} liquidation #${n}: "Bonus at block" reference reads ${bonusText}${b.protocolFeeBps > 0 ? ` with the protocol's ${b.protocolFeeBps / 100}% share stated` : ""}`,
      (await ref.count()) > 0 &&
        (await ref.innerText()).includes(bonusText) &&
        (b.protocolFeeBps > 0
          ? (await ref.innerText()).includes(`${b.protocolFeeBps / 100}% of it to the protocol`)
          : true),
      (await ref.count()) > 0 ? (await ref.innerText()).replace(/\s+/g, " ") : "no reference",
    );
    const pills = card.getByText(/oracle at block/);
    check(
      `${x.key} liquidation #${n}: two at-block price pills (${d.collateralSymbol}, ${d.reserveSymbol})`,
      (await pills.count()) === 2,
      `${await pills.count()} pill(s)`,
    );
    const receipt = await openReceiptFor(page, card, "$");
    check(
      `${x.key} liquidation #${n}: a leg's receipt is amount × price at block, no untraced input`,
      !!receipt && /amount × price at block/.test(receipt) && !/Untraced input/.test(receipt),
      receipt ? receipt.replace(/\s+/g, " ").slice(0, 300) : "no receipt",
    );
    // Matched on the label: with no protocol fee the reference's value equals
    // the realized premium's text, and a value match would open the wrong receipt.
    const bonusReceipt = await openReceiptFor(page, card, "Bonus at block");
    check(
      `${x.key} liquidation #${n}: the bonus reference's receipt names getConfiguration at the block`,
      !!bonusReceipt && /getConfiguration/.test(bonusReceipt),
      bonusReceipt ? bonusReceipt.replace(/\s+/g, " ").slice(0, 200) : "no receipt",
    );
  }

  if (unpriced) {
    const { n } = unpriced;
    await expandCard(page, domN(n));
    const card = cardFor(page, domN(n));
    check(
      `${x.key} unpriced #${n}: renders token-only (no "oracle at block" pill)`,
      (await card.getByText(/oracle at block/).count()) === 0,
    );
  } else {
    check(
      `${x.key} token-only arm: NO EVIDENCE — no unpriced ordinary row on this wallet`,
      false,
      "set WALLET= to a wallet with older rows the walk has not reached",
    );
  }
  await page.close();
}

for (const x of EXPLORERS) {
  try {
    await runExplorer(x);
  } catch (e) {
    check(`${x.key}: run completed`, false, String(e).slice(0, 200));
  }
}
check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
