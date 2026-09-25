// Live in-browser verification of the historic USD pills (Aave V3 + Spark) —
// the mig-092 per-event oracle-at-block prices already shipped to the event
// timelines on 2026-07-16 (8d36ad5/c8b26c4/354ce38). This script does not
// build anything new; it re-derives the expected numbers from the SAME
// wallet's timeline API payload and checks the rendered DOM agrees, on both
// protocols: the after-balance USD chip, the AtBlockPriceFootnote pill, the
// toggle-off behavior, liquidation forensics (both legs + premium), and the
// USD chip's receipt formula (no "Untraced input" caution anywhere on the card).
//
// NO ROW NUMBER IS PINNED HERE. Event numbers renumber whenever a backfill
// inserts past rows, so each case names the immutable coordinate (the block,
// plus the type and symbol that pick one row out of it) and the number is
// counted off the API.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run against a dev server:  BASE=http://localhost:3021 node scripts/verify/verify-historic-usd-pills.mjs

import { chromium } from "playwright";
import { armInspector } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// ── Test wallets (located by curling the timeline proxy routes against the
// dev server's live data from the onboarding box) ──────────────────────────────
//
// ⚠️ Event numbers are 1-based CHRONOLOGICAL over the wallet's whole
// timeline (useTimelineEvents), so a backfill that inserts PAST rows
// renumbers everything after the insertion point. Migs 159/160 (2026-08-13)
// did exactly that — BalanceTransfer rows joined both timelines, and the
// receive_a_token seizure's paired transfer_out lands directly BEFORE its
// liquidation row — which moved the pins by +9 and +1.
//
// SO NO EVENT NUMBER IS PINNED HERE ANY MORE. Each case names the immutable
// coordinate — the BLOCK, plus the event type and reserve symbol that pick one
// row out of that block — and `resolveEventNumber` counts the number off the
// timeline API at run time. The next backfill renumbers the DOM and the API
// together, so it moves this file's pins with it instead of reddening it.
const AAVE_V3_WALLET = "0xc593352eefa7c45863525a3194870929fd6f5948";
const SPARK_WALLET = "0xf2b07a31316ee4eca5c14c5f237a9903b4806236";

// THE TOKEN-ONLY ARM IS GONE (2026-09-25, rails-ops TO-DO-ui-jobs §50). It
// drove one claim — an event carrying no oracle-at-block price renders no
// AtBlockPriceFootnote pill — against a specimen swept out of the positions
// listing at run time, and it had started answering NO EVIDENCE because the
// sweep found nothing to drive. The sweep was not looking in the wrong place:
// there is nothing left to find. What was searched on rails.finance that day,
// counting only ORDINARY rows (a liquidation carries `collateralPrice` and
// `debtPrice` and never a `price`, so every one of them reads as unpriced and
// the sweep always excluded them):
//
//   aave-v3 core      172 wallets / ~6,000 events, twelve offsets spread over
//                     the whole 249,560-row listing        → 0 unpriced
//   aave-v3 prime      94 wallets / 32,923 events          → 0 unpriced
//   aave-v3 etherfi    97 wallets /    418 events          → 0 unpriced
//   spark              92 wallets / 44,524 events          → 0 unpriced
//
// The oracle-price filler has caught up with the whole history: mig 092's
// floor is behind it and no listed reserve is missing from its roster. The one
// place an unpriced row still appears is the last few minutes of CHAIN HEAD,
// where the filler trails the indexer — three such rows were read at 26,054,696
// –26,054,700 and all three were priced again twenty minutes later. A check
// resting on that is red whenever the filler is level, which is most of the
// time, so it is not a repoint; it is the same bet against the data improving
// that the pinned absence before it was.
//
// To bring the claim back, give it a specimen that cannot be filled in — a
// fixture the price lane is defined not to cover — rather than an absence
// discovered in live data.

// ── The API side: where every event number comes from ───────────────────

/** GET one of the dev server's proxy routes. The backend rate-limits, and a 429
 *  in the middle of a sweep is not a finding about the pills — back off and
 *  retry rather than letting it read as a missing specimen. */
async function api(path, tries = 5) {
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

/** The event at `block` of type `eventType` (on `symbol` where given) — the
 *  selection resolveEventNumber makes, without its count. */
const findEvent = (events, { block, eventType, symbol }) =>
  events.find((e) => {
    const d = e.context?.data ?? {};
    return (
      e.blockNumber === block &&
      d.eventType === eventType &&
      (!symbol || d.reserveSymbol === symbol || d.collateralSymbol === symbol)
    );
  });

/** The chip an Aave V3 Ethereum card draws for one exact balance, restated from
 *  the position-state answer the card reads: raw × price ÷ 10^(decimals + 8), in
 *  whole dollars. A served event carries its tx hash as the third `:` segment of
 *  its id. Null when there is no answer, or it is unpriced. */
async function exactChipText(wallet, market, event, symbol, side) {
  if (!event) return null;
  const tx = event.txHash ?? String(event.id).split(":")[2];
  const qs = new URLSearchParams({ wallet, market, block: String(event.blockNumber), tx });
  const state = await api(`/api/aave-v3/timeline/position-state?${qs}`, 2).catch(() => null);
  const r = state?.reserves?.find((x) => x.symbol === symbol);
  if (!r?.priceBase || r.decimals == null) return null;
  const usd = Number((BigInt(r[side].after) * BigInt(r.priceBase)) / BigInt(10) ** BigInt(r.decimals + 4)) / 1e4;
  return usd < 1 ? `$${usd.toFixed(2)}` : "$" + usd.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const timelinePath = (proto, wallet) =>
  proto === "aave-v3"
    ? `/api/aave-v3/timeline?wallet=${wallet}&market=core`
    : `/api/${proto}/timeline?wallet=${wallet}`;

/** The 1-based chronological number the timeline will render for the event at
 *  `block` of type `eventType` (and, where a block holds more than one, the one
 *  on `symbol`). The API returns the wallet's whole history in block order, so
 *  the number is that row's position — the same count `useTimelineEvents` does.
 *
 *  It insists on EXACTLY ONE match. A pin that no longer selects a row, or that
 *  has become ambiguous, is reported here rather than downstream as an empty
 *  card locator, which is the shape that reads as "nothing violated the rule". */
function resolveEventNumber(events, { block, eventType, symbol }, label) {
  const hits = events
    .map((e, i) => ({ n: i + 1, e }))
    .filter(({ e }) => {
      const d = e.context?.data ?? {};
      if (e.blockNumber !== block || d.eventType !== eventType) return false;
      if (!symbol) return true;
      return d.reserveSymbol === symbol || d.collateralSymbol === symbol;
    });
  check(
    `${label}: exactly one ${eventType} at block ${block}${symbol ? ` on ${symbol}` : ""}`,
    hits.length === 1,
    `${hits.length} matched`,
  );
  return hits.length === 1 ? hits[0].n : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Open the toolbar's "Display" eye-menu and toggle the named item on/off
 *  (idempotent target state), then close the menu. */
async function setDisplayFlag(page, label, wantOn) {
  // The eye-menu trigger is the LAST FilterDropdown's own direct-child
  // <button> in the toolbar's control row (the "Types of event" dropdown is
  // the only other one wired the same way, and it always renders first) —
  // located via the "N events" count span, which anchors that row
  // unambiguously. The `>` direct-child combinator is load-bearing: once the
  // panel is open its rows are ALSO <button>s inside the same wrapper div,
  // and a plain descendant `button` selector's `.last()` would grab the
  // panel's last row instead of the trigger (misfires the wrong toggle).
  const countSpan = page.getByText(/^\d+ events?$/).first();
  await countSpan.waitFor({ state: "visible", timeout: 30000 });
  const row = countSpan.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
  );
  const trigger = row.locator("div.relative.inline-flex.items-center > button").last();
  const item = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
  // A click that lands before React has attached the handler is swallowed and
  // the menu never opens — on a small, fast-painting wallet that is the common
  // case, not the rare one. Retry until the panel is actually up; each failed
  // attempt left the menu closed, so re-clicking opens rather than toggles.
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
  // multi-select items carry no aria-pressed; read the checkbox dot instead
  // (filled bg-rb-500 = on).
  const isOn = await item
    .locator("span")
    .first()
    .evaluate((el) => el.className.includes("bg-rb-500"))
    .catch(() => false);
  if (isOn !== wantOn) await item.click();
  // Close by clicking outside the dropdown — it has no Escape handler, only
  // a mousedown-outside listener; the count span is a safe neutral target.
  await countSpan.click();
}

/** Grow the render window until every event is painted. The cap counts PRESSES,
 *  and one press paints `TIMELINE_PAGE_ROWS` (lib/shared/timeline-opening-balance.ts)
 *  — halve that constant and a fixed cap reaches half as far, so the cap is set
 *  well above what any fixture here needs and the loop leaves as soon as the
 *  control is gone. */
async function showAll(page) {
  for (let i = 0; i < 25; i++) {
    const btn = page.getByRole("button", { name: /^Show \d+ more$/ });
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(150);
  }
}

/** Locator for the card containing event number N's badge (only rendered
 *  once "Event numbers" is on) — scoped to the card's own `data-event-id`
 *  element so assertions never leak into a neighboring card. It used to climb
 *  to the nearest `items-start relative` ancestor, which since 7778cf09 is the
 *  header row (`.evt-has-chev`), not the card: every chip and forensics check
 *  below then read an open card as empty. */
function cardFor(page, n) {
  const badge = page.locator(`[aria-label="Event ${n}"]`);
  return badge.locator("xpath=ancestor::*[@data-event-id][1]");
}

/** Expand event N's card by clicking its header's click-to-toggle area. */
async function expandCard(page, n) {
  const badge = page.locator(`[aria-label="Event ${n}"]`);
  await badge.waitFor({ state: "visible", timeout: 20000 });
  const clickable = badge.locator('xpath=ancestor::div[@role="button"][1]');
  await clickable.click();
  await page.waitForTimeout(200);
}

const usdChipSel = "span.border-l-2.border-r-2.border-rb-500";

/** An Aave V3 Ethereum card reads its balances when it opens (rails-ops
 *  TO-DO-ui-jobs §19), and its USD chips arrive with that answer: wait for it
 *  before reading them. */
async function positionStateSettled(proto, card) {
  if (proto !== "aave-v3") return;
  await card
    .locator('[data-position-state="ready"], [data-position-state="unavailable"]')
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  check(
    `${proto}: the open card's position state is ready`,
    (await card.locator('[data-position-state="ready"]').count()) > 0,
  );
}

/** Read the receipt behind the card value matching `valueText`, via the
 *  page-level provenance inspector — the per-card receipts panel this
 *  originally drove ('Show provenance' → .prov-receipts accordion) is
 *  retired; the inspector popover is THE receipt surface now. Arms the
 *  crosshair (reading aria-pressed first — the tool is sticky, a blind
 *  toggle click turns it OFF on alternate calls), picks the card's scoped
 *  <Prov> span whose text matches the value, reads the popover, then puts
 *  the tool fully down (Escape ladder: popover, then mode) so the display
 *  toggles below never race an armed pick layer. Returns the popover's
 *  full text, or null if no pickable value matched. */
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

// ── Runner ──────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const pageErrors = [];

/** Open a wallet's position page with event numbers and USD values on, every
 *  event painted. */
async function openTimeline(proto, wallet) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${proto}/${wallet}: ${e}`));
  await page.goto(`${BASE}/ethereum/${proto}/${wallet}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page
    .getByText(/^\d+ events?$/)
    .first()
    .waitFor({ state: "visible", timeout: 60000 });

  await setDisplayFlag(page, "Event Numbers", true);
  await setDisplayFlag(page, "USD Values", true);
  await showAll(page);
  return page;
}

async function runProtocol(proto, wallet, cases) {
  const page = await openTimeline(proto, wallet);

  // ── Priced ordinary event ──────────────────────────────────────────
  // A case whose number did not resolve has already been reported by
  // `resolveEventNumber`; driving the DOM with a null would only add a
  // locator timeout on top of the finding.
  if (cases.pricedOrdinary?.num != null) {
    const { num, symbol, priceText, chipText, block } = cases.pricedOrdinary;
    await expandCard(page, num);
    const card = cardFor(page, num);
    await positionStateSettled(proto, card);

    const chip = card.locator(usdChipSel).first();
    check(`${proto}: priced ordinary (#${num}, block ${block}) USD chip renders`, (await chip.count()) > 0);
    if ((await chip.count()) > 0) {
      const text = await chip.innerText();
      check(`${proto}: priced ordinary chip amount ≈ expected`, text.includes(chipText), text);
    }

    const footnote = card.getByText(/oracle at block/).first();
    check(`${proto}: priced ordinary AtBlockPriceFootnote pill renders`, (await footnote.count()) > 0);
    if ((await footnote.count()) > 0) {
      const text = await card.locator("text=/oracle at block/").first().locator("xpath=..").innerText();
      check(
        `${proto}: footnote reads "${symbol} ${priceText} · oracle at block"`,
        text.includes(symbol) && text.includes(priceText),
        text.replace(/\s+/g, " ").trim(),
      );
    }

    // Receipt: formula + valued operands, no "Untraced input" anywhere.
    const panelText = await openReceiptFor(page, card, chipText);
    check(
      `${proto}: USD chip receipt shows "after × price at block" formula`,
      !!panelText && panelText.includes("after × price at block"),
    );
    check(`${proto}: card has no "Untraced input" caution`, !(await card.innerText()).includes("Untraced input"));

    // Toggle-off: chip disappears.
    await setDisplayFlag(page, "USD Values", false);
    const chipOff = card.locator(usdChipSel);
    check(`${proto}: USD chip disappears when "USD values" toggled off`, (await chipOff.count()) === 0);
    await setDisplayFlag(page, "USD Values", true);
    const chipBackOn = card.locator(usdChipSel);
    check(`${proto}: USD chip returns when "USD values" toggled back on`, (await chipBackOn.count()) > 0);
  }

  // ── Priced liquidation: both legs + forensics ───────────────────────
  if (cases.liquidation?.num != null) {
    const { num, block, premiumPct, seizedUsd, clearedUsd, collSymbol, collPrice, debtSymbol, debtPrice } =
      cases.liquidation;
    await expandCard(page, num);
    const card = cardFor(page, num);
    await positionStateSettled(proto, card);

    const chips = card.locator(usdChipSel);
    check(
      `${proto}: liquidation (#${num}, block ${block}) has chips on BOTH legs`,
      (await chips.count()) >= 2,
      `${await chips.count()} chip(s)`,
    );

    check(
      `${proto}: LiquidationForensics "Seized, at fire" renders`,
      (await card.getByText("Seized, at fire").count()) > 0,
    );
    check(
      `${proto}: LiquidationForensics "Cleared, at fire" renders`,
      (await card.getByText("Cleared, at fire").count()) > 0,
    );
    check(
      `${proto}: LiquidationForensics "Realized premium" renders`,
      (await card.getByText("Realized premium").count()) > 0,
    );

    const bodyText = await card.innerText();
    check(`${proto}: seized-leg value ≈ ${seizedUsd}`, bodyText.includes(seizedUsd));
    check(`${proto}: cleared-leg value ≈ ${clearedUsd}`, bodyText.includes(clearedUsd));
    check(
      `${proto}: realized premium ${premiumPct} (near the market's liquidation bonus)`,
      bodyText.includes(premiumPct),
      bodyText.match(/[+−-]\d+\.\d{2}%/)?.[0] ?? "no percent found",
    );
    check(
      `${proto}: footnote prices both legs (${collSymbol} ${collPrice}, ${debtSymbol} ${debtPrice})`,
      bodyText.includes(collPrice) && bodyText.includes(debtPrice),
    );

    const panelText = await openReceiptFor(page, card, seizedUsd);
    check(`${proto}: liquidation card has no "Untraced input" caution`, !bodyText.includes("Untraced input"));
    check(
      `${proto}: liquidation receipts include amount × price at block`,
      !!panelText && panelText.includes("amount × price at block"),
    );
  }

  await page.close();
}

// Numbers are counted off the API, never pinned. Fetching the two fixtures'
// timelines up front also proves the routes answer at all before the browser
// arm reads their DOM.
const aaveEvents = (await api(timelinePath("aave-v3", AAVE_V3_WALLET))).events ?? [];
const sparkEvents = (await api(timelinePath("spark", SPARK_WALLET))).events ?? [];
check(`aave-v3: fixture timeline is non-empty`, aaveEvents.length > 0, `${aaveEvents.length} events`);
check(`spark: fixture timeline is non-empty`, sparkEvents.length > 0, `${sparkEvents.length} events`);

// The Ethereum card's chip is the EXACT after-balance × the oracle price read at
// the block (rails-ops TO-DO-ui-jobs §19), no longer the replayed principal × the
// captured price — $13,320 when it was (121.0796 AAVE × 110.008). The figure is
// re-derived at run time from the position-state answer for that event, the
// answer the card itself reads, and not pinned.
const AAVE_SUPPLY = { block: 24655255, eventType: "supply", symbol: "AAVE" };
const aaveChip = await exactChipText(AAVE_V3_WALLET, "core", findEvent(aaveEvents, AAVE_SUPPLY), "AAVE", "supply");
check(`aave-v3: the position state prices the AAVE supply at block ${AAVE_SUPPLY.block}`, aaveChip != null);

console.log(`\n=== Aave V3 — ${AAVE_V3_WALLET} ===`);
await runProtocol("aave-v3", AAVE_V3_WALLET, {
  pricedOrdinary: {
    num: resolveEventNumber(aaveEvents, AAVE_SUPPLY, "aave-v3"),
    block: AAVE_SUPPLY.block,
    symbol: "AAVE",
    priceText: "110.01",
    chipText: aaveChip ?? "(no position state)",
  },
  liquidation: {
    num: resolveEventNumber(aaveEvents, { block: 21919039, eventType: "liquidation" }, "aave-v3"),
    block: 21919039,
    premiumPct: "6.75%",
    seizedUsd: "$4,130.27",
    clearedUsd: "$3,869.10",
    collSymbol: "AAVE",
    collPrice: "211.80",
    debtSymbol: "GHO",
    debtPrice: "1.00",
  },
});

console.log(`\n=== Spark — ${SPARK_WALLET} ===`);
await runProtocol("spark", SPARK_WALLET, {
  pricedOrdinary: {
    num: resolveEventNumber(sparkEvents, { block: 21319438, eventType: "supply", symbol: "WETH" }, "spark"),
    block: 21319438,
    symbol: "WETH",
    priceText: "3,651.25",
    chipText: "$335",
  },
  liquidation: {
    num: resolveEventNumber(sparkEvents, { block: 21615423, eventType: "liquidation" }, "spark"),
    block: 21615423,
    premiumPct: "6.30%",
    seizedUsd: "$3,767.35",
    clearedUsd: "$3,544.07",
    collSymbol: "wstETH",
    collPrice: "3,653.19",
    debtSymbol: "USDC",
    debtPrice: "1.00",
  },
});

check("zero pageerrors across both protocol pages", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
