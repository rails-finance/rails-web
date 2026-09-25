// Live in-browser verification of the Moonwell oracle-at-block prices, the
// per-block roster capture on Base (rails-server-onboarding mig 195,
// scripts/fill-moonwell-base-prices.mjs) and on Ethereum (mig 325,
// scripts/fill-moonwell-prices.mjs, 2026-09-24) as the shared timeline
// renders it: the AtBlockPriceFootnote pill on an ordinary row, the valued
// two-leg liquidation forensics (both legs + the premium against the
// incentive read at the same block), the token-only render for a block the
// filler has not priced, and the seized leg's receipt naming the two chain
// reads it derives from. Every expected figure is re-derived from the SAME
// wallet's timeline route payload (/api/chain/moonwell-base/timeline or
// /api/moonwell/timeline) and checked against the DOM; nothing is pinned to
// an event number or to an absence (verify-historic-usd-pills.mjs's rules):
// the specimens are discovered at run time and a run that finds no unpriced
// row says NO EVIDENCE, except on a lane whose universe is filled whole
// (Ethereum: ~1,410 blocks, run to completion), where the token-only arm is
// replaced by the stronger claim that EVERY ordinary row carries its price.
//
// EXPLORER=moonwell-base (default) | moonwell picks the arm; one per run.
//
// Fail-first (2026-09-04, dev server on :3021 against the onboarding box, wallet below):
// run with the detail component's forensics/footnote stashed while the
// transform already carried the prices — 6 FAIL (no footnote pill on #2020,
// no forensics grid / premium / incentive / pills / receipt on #2021), the
// API arm and the token-only arm PASS; restored, ALL PASS. Two verifier
// corrections along the way, both recorded here so they are not re-learned:
// the toolbar's count label carries en-US grouping ("Showing 2,021 listed of
// 2,405"), and a card's detail panel mounts BESIDE its header panel, so the
// card locator scopes to EventCard's `min-w-0 grow` content tier, not to the
// header row the Aave verifier scopes to.
//
// The Ethereum arm (2026-09-24) is written ahead of its first run: the lane's
// migration and fill land on the box first (rails-ops reference/pricing.md,
// "The roster-at-block lanes"), and until the fill has run every row is
// unpriced and the arm reports that.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run against a dev server:  BASE=http://localhost:3021 node scripts/verify/verify-at-block-prices-moonwell-base.mjs
// The Ethereum arm:           EXPLORER=moonwell BASE=http://localhost:3021 node scripts/verify/verify-at-block-prices-moonwell-base.mjs

import { chromium } from "playwright";
import { armInspector } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EXPLORERS = {
  "moonwell-base": {
    page: (w) => `/base/moonwell/${w}`,
    timeline: (w) => `/api/chain/moonwell-base/timeline?wallet=${w}`,
    // The MAMO cascade's liquidated wallet (2026-08-27): 596 liquidations and
    // ~1,800 ordinary rows, all on blocks the liquidation-first pass priced, so
    // both the priced arms have specimens; the unpriced arm is discovered.
    wallet: "0x719eae70d4a83f35bf82a2740699f5db84be919d",
    // The historic walk is paced; older rows are token-only until it reaches them.
    complete: false,
  },
  moonwell: {
    page: (w) => `/ethereum/moonwell/${w}`,
    timeline: (w) => `/api/moonwell/timeline?wallet=${w}`,
    // The deployment's newest liquidation (block 25,871,437, 2026-08-30:
    // 9.294028 USDC repaid, 657,205 mcbBTC seized), so the liquidation arm has
    // its specimen alongside the wallet's ordinary rows.
    wallet: "0xcc2f8a9725aa6682478ccb62d9f0dcbed34daad3",
    // A finite lane run to completion: no ordinary row may be unpriced.
    complete: true,
  },
};
const EXPLORER = process.env.EXPLORER ?? "moonwell-base";
const X = EXPLORERS[EXPLORER];
if (!X) throw new Error(`EXPLORER must be one of ${Object.keys(EXPLORERS).join(", ")}`);
const WALLET = process.env.WALLET ?? X.wallet;
// The toolbar's count label: "2,021 events", "Showing 2,021 listed of 2,408",
// "2,021 listed · 2,408 events" — en-US grouping, so no bare \d+ here.
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

/** Parse the first number in a pill's text ("MAMO $0.0479 · oracle at block"). */
/** The shown figure rounds to the expected one at the precision it is shown
 *  with (a $0.009 price shown to two places reads 0.01 and is not wrong). */
const roundsTo = (text, expected) => {
  const m = text.replace(/,/g, "").match(/-?\d+(?:\.(\d+))?/);
  if (!m) return false;
  const shown = Number(m[0]);
  const dp = m[1] ? m[1].length : 0;
  return Number.isFinite(shown) && Math.abs(shown - expected) <= 0.5 * 10 ** -dp + 1e-12;
};

// ── Page helpers (verify-historic-usd-pills.mjs's, verbatim in spirit) ──

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

/** The whole card — header panel AND the detail panel that mounts beside it
 *  once expanded (EventCard's `min-w-0 grow` content tier; the header row's
 *  own `items-start relative` div, which the Aave verifier scopes to, holds
 *  no detail here). */
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

// ── Expectations from the API ───────────────────────────────────────────

const tl = await api(X.timeline(WALLET));
const events = tl.events ?? [];
check(
  `API: ${EXPLORER} timeline for ${WALLET.slice(0, 10)}… answers (${events.length} drawn events, source ${tl.coverage?.source ?? "index"})`,
  events.length > 0,
);
const data = (e) => e.context?.data ?? {};
const numbered = events.map((e, i) => ({ n: i + 1, e, d: data(e) }));
// Newest first so the specimens sit inside the default render window.
const newestFirst = [...numbered].reverse();
const pricedOrdinary = newestFirst.find(({ d }) => d.eventType !== "liquidation" && d.priceAtBlock?.usd > 0);
const pricedLiq = newestFirst.find(
  ({ d }) =>
    d.eventType === "liquidation" &&
    d.priceAtBlock?.usd > 0 &&
    d.collateralPriceAtBlock?.usd > 0 &&
    d.seizedUnderlyingAtBlock != null &&
    d.incentiveAtBlock != null,
);
const unpriced = newestFirst.find(({ d }) => d.eventType !== "liquidation" && d.priceAtBlock == null);
check(
  "API: a priced ordinary row exists",
  !!pricedOrdinary,
  pricedOrdinary
    ? `#${pricedOrdinary.n} ${pricedOrdinary.d.eventType} ${pricedOrdinary.d.marketSymbol} @ ${pricedOrdinary.e.blockNumber} $${pricedOrdinary.d.priceAtBlock.usd}`
    : "none",
);
check(
  "API: a liquidation with both legs priced exists",
  !!pricedLiq,
  pricedLiq
    ? `#${pricedLiq.n} ${pricedLiq.d.marketSymbol}→${pricedLiq.d.collateralSymbol} @ ${pricedLiq.e.blockNumber}`
    : "none",
);
if (unpriced)
  console.log(
    `      unpriced specimen: #${unpriced.n} ${unpriced.d.eventType} ${unpriced.d.marketSymbol} @ ${unpriced.e.blockNumber}`,
  );
else console.log("      NO EVIDENCE for the token-only arm on this wallet (every ordinary row is priced)");

// ── DOM ─────────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const pageErrors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => pageErrors.push(String(e)));
// `?folders=0` PINNED. The badges below are read card by card, so the page must
// be flat. The default page is answered in folders (leg C of 0019), and since
// rails-ops decision 0021 a served page neither offers "Collapse like events"
// nor opens its folders when the flag is off. The flat answer groups in the
// browser, so the toggle below still expands its runs.
await page.goto(`${BASE}${X.page(WALLET)}?folders=0`, { waitUntil: "domcontentloaded", timeout: 240000 });
await page.getByText(COUNT_RE).first().waitFor({ state: "visible", timeout: 120000 });
await setDisplayFlag(page, "Event Numbers", true);
// A collapsed ×N run renders no individual badge — the MAMO cascade is
// hundreds of like liquidations in a row, so runs stay expanded here.
await setDisplayFlag(page, "Collapse like events", false);
await showAll(page, 25);
// Chronological numbering runs over the WHOLE history (an elided older
// window offsets it), so the DOM number of API index i is offset + i + 1,
// with the offset read off the newest badge rather than assumed.
const badgeNumbers = await page
  .locator('[aria-label^="Event "]')
  .evaluateAll((els) => els.map((e) => Number((e.getAttribute("aria-label") ?? "").slice(6))).filter(Number.isFinite));
const offset = badgeNumbers.length ? Math.max(...badgeNumbers) - events.length : 0;
console.log(`      ${badgeNumbers.length} numbered cards in the DOM; numbering offset ${offset}`);
const domN = (n) => offset + n;

if (pricedOrdinary) {
  const { n, d } = pricedOrdinary;
  await expandCard(page, domN(n));
  const card = cardFor(page, domN(n));
  const pill = card.getByText(/oracle at block/).first();
  check(`ordinary #${n}: AtBlockPriceFootnote pill renders`, (await pill.count()) > 0);
  if ((await pill.count()) > 0) {
    const text = (await pill.locator("xpath=..").innerText()).replace(/\s+/g, " ").trim();
    check(
      `ordinary #${n}: pill names ${d.marketSymbol} at its at-block price`,
      text.includes(d.marketSymbol) && roundsTo(text.replace(d.marketSymbol, ""), d.priceAtBlock.usd),
      `"${text}" vs ${d.priceAtBlock.usd}`,
    );
    const receipt = await openReceiptFor(page, card, d.marketSymbol);
    check(
      `ordinary #${n}: the pill's receipt names Comptroller.oracle() → getUnderlyingPrice at the block`,
      !!receipt &&
        /getUnderlyingPrice/.test(receipt) &&
        /Comptroller\.oracle\(\)/.test(receipt) &&
        !/Untraced input/.test(receipt),
      receipt ? receipt.slice(0, 120).replace(/\s+/g, " ") : "no receipt",
    );
  }
  check(
    `ordinary #${n}: no forensics grid on an ordinary row`,
    (await card.getByText("Seized, at fire").count()) === 0,
  );
}

if (pricedLiq) {
  const { n, d } = pricedLiq;
  await expandCard(page, domN(n));
  const card = cardFor(page, domN(n));
  const seized = Number(d.seizedUnderlyingAtBlock) * d.collateralPriceAtBlock.usd;
  const cleared = Math.abs(Number(d.assetsDelta)) * d.priceAtBlock.usd;
  const premium = seized / cleared - 1;
  check(
    `liquidation #${n}: forensics grid renders (Seized / Cleared / Realized premium)`,
    (await card.getByText("Seized, at fire").count()) > 0 &&
      (await card.getByText("Cleared, at fire").count()) > 0 &&
      (await card.getByText("Realized premium").count()) > 0,
  );
  const premiumEl = card.getByText(/^[+−]\d+\.\d\d%$/).first();
  if ((await premiumEl.count()) > 0) {
    const text = await premiumEl.innerText();
    const shown = Number(text.replace("−", "-").replace("%", "")) / 100;
    check(
      `liquidation #${n}: premium ≈ seized ÷ cleared − 1 from the API figures`,
      Math.abs(shown - premium) < 0.0006,
      `${text} vs ${(premium * 100).toFixed(3)}%`,
    );
  } else check(`liquidation #${n}: premium value renders`, false);
  const incentive = card.getByText(/Incentive at block/).first();
  check(
    `liquidation #${n}: incentive reference reads +${((d.incentiveAtBlock - 1) * 100).toFixed(2)}%`,
    (await incentive.count()) > 0 &&
      (await incentive.innerText()).includes(`+${((d.incentiveAtBlock - 1) * 100).toFixed(2)}%`),
  );
  const pills = card.getByText(/oracle at block/);
  check(
    `liquidation #${n}: two at-block price pills (${d.collateralSymbol}, ${d.marketSymbol})`,
    (await pills.count()) === 2,
    `${await pills.count()} pill(s)`,
  );
  const receipt = await openReceiptFor(page, card, "$");
  check(
    `liquidation #${n}: a leg's receipt derives from exchangeRateStored and getUnderlyingPrice at the block`,
    !!receipt &&
      /exchangeRateStored|repayAmount/.test(receipt) &&
      /getUnderlyingPrice/.test(receipt) &&
      !/Untraced input/.test(receipt),
    receipt ? receipt.replace(/\s+/g, " ").slice(0, 600) : "no receipt",
  );
}

if (X.complete) {
  // A lane filled whole has no token-only row to find; the claim the cell
  // stands on is that none exists.
  const unpricedOrdinary = numbered.filter(({ d }) => d.eventType !== "liquidation" && d.priceAtBlock == null);
  check(
    `complete lane: every ordinary row on this wallet carries its at-block price`,
    unpricedOrdinary.length === 0,
    `${unpricedOrdinary.length} unpriced of ${numbered.length}`,
  );
}
if (unpriced) {
  const { n } = unpriced;
  await expandCard(page, domN(n));
  const card = cardFor(page, domN(n));
  check(
    `unpriced #${n}: renders token-only (no "oracle at block" pill)`,
    (await card.getByText(/oracle at block/).count()) === 0,
  );
} else if (!X.complete) {
  check(
    "token-only arm: NO EVIDENCE — no unpriced ordinary row on this wallet",
    false,
    "set WALLET= to a wallet with older rows the walk has not reached",
  );
}

check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
