// Browser-verify that spine-flank echoes (SpineVal's <Prov echo>) resolve to
// the header's registered <Prov> receipt across explorers.
//
// ── Why this script was rewritten ───────────────────────────────────────────
// It used to drive `button[aria-label="Show provenance"]` — the per-card
// receipts panel's crosshair. That button no longer exists anywhere in the
// codebase: the per-card pane was retired in favour of the page-level
// provenance inspector (components/shared/prov-inspector.tsx). Every route,
// including untouched ones, logged "no reachable Provenance tab — skipped".
// A verifier that can only skip cannot fail, and a check that cannot fail is
// not a check. This version drives the inspector instead.
//
// ── The resolution proof ────────────────────────────────────────────────────
// A spine flank is a `<Prov echo>`. Its entryKey is `receiptLabel|value|symbol`
// and it is matched BYTE-FOR-BYTE against the header's registered entry. When
// the key drifts, nothing visible breaks — the flank simply stops being
// traceable, silently. (That is exactly how morpho-event-card.tsx shipped an
// unsigned `formatExact(mag)` echo against a signed `chainTruthDeltaValue`
// header registration and nobody noticed.)
//
// 🔑 A MISS STILL OPENS A POPOVER. `Prov.handlePick` resolves
//   `row = all.find(x => !x.echo && entryKey(x) === entryKey(self)) ?? self`
// — on a mismatch it falls back to the echo's OWN entry and pins that. So "a
// receipt opened" proves nothing whatsoever.
//
// The real signature is `locateEntries`, which stamps `data-prov-active` on
// EVERY entry sharing the pinned key:
//   RESOLVED = ≥2 elements stamped, ≥1 of them OUTSIDE the spine
//   DRIFTED  = exactly 1 (the flank pinning itself)
// Spine root is `hidden sm:flex`; the header's value span carries `sm:hidden`
// — a different class — so `closest("div.hidden")` separates them cleanly.
//
// The PWN "claimed" flank is a documented gap: pwn-event-card.tsx renders that
// value with NO `prov` prop, so SpineVal never wraps it in <Prov echo> and no
// `.prov-locate-box` span exists for it. We assert that absence (inertness),
// not resolution — it does not depend on the retired panel.
//
// Run with the dev server up:  BASE=http://localhost:3001 node scripts/verify/verify-flank-echoes.mjs

import { chromium } from "playwright";
import { armInspector, HALO, openInspectorHome } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE || "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 1100 };

// ── DOM contract (derived from source, not guessed) ─────────────────────────
// Card root: EventCard's outer div (event-card.tsx) — `flex w-full items-start
// relative rounded-xl`, always with a `min-w-0 grow` direct child (contentTiers).
const CARD_ROOT = "div.flex.w-full.items-start.relative.rounded-xl:has(> div.min-w-0.grow)";
// Flank span: SpineVal (activity-timeline.tsx) wraps the flanking value in an
// outer span (`justify-self-end pr-5` on the left side / `justify-self-start
// pl-5` on the right), and — only when `prov` is supplied — an inner
// `<Prov echo>` renders as `span.prov-locate-box` (provenance.tsx).
const FLANK_SELECTOR =
  "span.justify-self-end.pr-5 > span.prov-locate-box, span.justify-self-start.pl-5 > span.prov-locate-box";
// A bare (non-echoed) flank value still lives in the same outer span, just
// with no .prov-locate-box child — used to prove the PWN "claimed" inertness.
const FLANK_OUTER_SELECTOR = "span.justify-self-end.pr-5, span.justify-self-start.pl-5";
// The page-level inspector toggle (ProvInspectorToggle): a row of the Tools
// menu on a position view, the dock's leading slot on a Market-type page.
// Either way no card expansion is needed to reach it, and the spine flank is
// visible on a collapsed card — which is precisely why the inspector is the
// right surface for this check.
const POPOVER = ".prov-inspect-pop";

let pass = 0;
let fail = 0;
const failures = [];
const skips = [];

function logPass(msg) {
  pass++;
  console.log(`PASS: ${msg}`);
}
function logFail(msg) {
  fail++;
  failures.push(msg);
  console.log(`FAIL: ${msg}`);
}
function logSkip(msg) {
  skips.push(msg);
  console.log(`SKIPPED: ${msg}`);
}
function logInfo(msg) {
  console.log(`INFO: ${msg}`);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Arm the inspector if it has dropped.
 *
 *  ⚠️ The tool is STICKY — a pick moves the popover and leaves it ARMED.
 *  Clicking the toggle unconditionally between picks therefore toggles it OFF
 *  on alternate rounds, which yields phantom "nothing was stamped" results that
 *  look exactly like a drifted key. Always read `aria-pressed` first. */
async function ensureArmed(page) {
  // Already armed is the common case between picks, and it costs nothing: the
  // settling wait below is only for an arming that actually happened.
  if (await page.$(HALO)) return true;
  if (!(await armInspector(page))) return false;
  await sleep(250);
  return true;
}

/** Close an open popover without disarming. Click-away is pointerdown-based so
 *  a click on the next flank would also work, but a popover that physically
 *  covers the next flank fails Playwright's actionability check — so dismiss it
 *  explicitly. Uses the popover's own close button rather than Escape, because
 *  Escape's second rung disarms the tool. */
async function dismissPopover(page) {
  const pop = page.locator(POPOVER).first();
  if ((await pop.count()) === 0) return;
  await pop
    .locator("button.prov-inspect-close")
    .first()
    .click()
    .catch(() => {});
  await sleep(150);
}

/** Pick one flank and classify the result.
 *
 *  Returns { resolved, detail }. `resolved` is true only when the pin lit up an
 *  entry OUTSIDE the spine — i.e. the flank actually reached its header
 *  receipt, rather than falling back to pinning itself. */
async function pickFlank(page, flank) {
  const text = ((await flank.innerText().catch(() => "")) || "").trim();
  await dismissPopover(page);
  if (!(await ensureArmed(page))) {
    return { resolved: false, detail: `${text} — inspector toggle vanished mid-run` };
  }
  await flank.scrollIntoViewIfNeeded().catch(() => {});
  await flank.click({ timeout: 5000 }).catch(() => {});
  await sleep(400);

  const stamped = await page.evaluate(() =>
    [...document.querySelectorAll("[data-prov-active]")].map((el) => ({
      text: (el.textContent || "").trim().slice(0, 28),
      inSpine: !!el.closest("div.hidden"),
    })),
  );

  if (stamped.length === 0) {
    return { resolved: false, detail: `${text} — nothing stamped at all; the pick did not land` };
  }
  const outside = stamped.filter((s) => !s.inSpine);
  if (stamped.length >= 2 && outside.length > 0) {
    return { resolved: true, detail: `${text} → also lit ${outside.map((s) => `"${s.text}"`).join(", ")}` };
  }
  return {
    resolved: false,
    detail: `${text} — only the flank lit up (${stamped.length} stamped, all in-spine): the echo key has DRIFTED`,
  };
}

/** Run the found/resolved sweep for a page. The windowed timeline can hold many
 *  cards, so we sample enough to be conclusive without driving every event on a
 *  1,500-event wallet. */
async function testPage(page, { label, url, maxCards = 6, maxFlanksPerCard = 4, mustInclude = null }) {
  console.log(`\n--- ${label} :: ${url} ---`);

  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(CARD_ROOT, { timeout: 30000 }).catch(() => {});
  await sleep(1200); // let register() effects settle after hydration

  const cardCount = await page.locator(CARD_ROOT).count();
  const staticFlankCount = await page.locator(FLANK_SELECTOR).count();
  logInfo(`event cards mounted: ${cardCount}; echoed flank spans: ${staticFlankCount}`);

  if (!(await openInspectorHome(page))) {
    logFail(`${label}: no provenance inspector on this page — the trace surface is missing entirely`);
    return { found: 0, resolved: 0 };
  }

  // Order the cards to visit: any matching `mustInclude` (a specific event kind
  // we're regression-targeting, e.g. compound-v2's transfer_in cToken lane) go
  // first — a blind top-N sample can otherwise miss the one event kind the
  // check exists to cover — then fill up to maxCards from the top in order.
  let order = Array.from({ length: cardCount }, (_, i) => i);
  if (mustInclude) {
    const matched = [];
    for (let ci = 0; ci < cardCount; ci++) {
      const t =
        (await page
          .locator(CARD_ROOT)
          .nth(ci)
          .innerText()
          .catch(() => "")) || "";
      if (mustInclude.test(t)) matched.push(ci);
    }
    logInfo(`cards matching ${mustInclude}: ${matched.length} (indices ${matched.join(",") || "none"})`);
    if (matched.length === 0) {
      logFail(`${label}: no card matched ${mustInclude} — the targeted event kind is absent from the fixture`);
    }
    const rest = order.filter((i) => !matched.includes(i));
    order = [...matched, ...rest];
  }

  let found = 0;
  let resolved = 0;
  let cardsTested = 0;
  const perFlankLog = [];

  for (const ci of order) {
    if (cardsTested >= maxCards) break;
    const card = page.locator(CARD_ROOT).nth(ci);
    const flankCountInCard = await card.locator(FLANK_SELECTOR).count();
    if (flankCountInCard === 0) continue;
    cardsTested++;

    const n = Math.min(flankCountInCard, maxFlanksPerCard);
    for (let fi = 0; fi < n; fi++) {
      const flank = card.locator(FLANK_SELECTOR).nth(fi);
      found++;
      const { resolved: ok, detail } = await pickFlank(page, flank);
      if (ok) resolved++;
      perFlankLog.push(`card#${ci} flank#${fi}: ${ok ? "RESOLVED" : "UNRESOLVED"} — ${detail}`);
    }
  }

  await dismissPopover(page);
  for (const l of perFlankLog) console.log(`  ${l}`);

  if (found === 0) {
    logFail(`${label}: NO echoed flanks found on this page — cannot prove echoes resolve here`);
    return { found, resolved };
  }

  console.log(`  flanks found=${found} resolved=${resolved} (sampled ${cardsTested} card(s))`);
  if (resolved === found) {
    logPass(`${label}: all ${found} sampled flank(s) resolved to their header receipt`);
  } else {
    logFail(`${label}: only ${resolved}/${found} sampled flank(s) resolved — see UNRESOLVED lines above`);
  }
  return { found, resolved };
}

/** PWN-specific: assert `created` / `paid_back` / non-default `claimed`
 *  flanks all resolve to their header receipts. The claimed flank was a
 *  documented inert gap (no Prov wrapper) until Run 7 gave the collect its
 *  repayAmountProv delta + echo (e24cd10); it now holds the same bar as its
 *  siblings. */
async function testPwn(page, { label, url }) {
  console.log(`\n--- ${label} :: ${url} ---`);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(CARD_ROOT, { timeout: 30000 }).catch(() => {});
  await sleep(1200);

  const cardCount = await page.locator(CARD_ROOT).count();
  logInfo(`event cards mounted: ${cardCount}`);

  if (!(await openInspectorHome(page))) {
    logFail("pwn: no provenance inspector on this page");
    return;
  }

  let createdChecked = false;
  let paidBackChecked = false;
  let claimedChecked = false;

  for (let ci = 0; ci < cardCount; ci++) {
    const card = page.locator(CARD_ROOT).nth(ci);
    const cardText = (await card.innerText().catch(() => "")) || "";
    const flankCount = await card.locator(FLANK_SELECTOR).count();
    const bareOuterCount = await card.locator(FLANK_OUTER_SELECTOR).count();

    const isCreated = /created/i.test(cardText) && !createdChecked;
    const isPaidBack = /repaid|paid back|paid_back/i.test(cardText) && !paidBackChecked;

    if (flankCount > 0 && (isCreated || isPaidBack)) {
      const flank = card.locator(FLANK_SELECTOR).first();
      const { resolved, detail } = await pickFlank(page, flank);
      const kind = isCreated ? "created" : "paid_back";
      if (resolved) logPass(`pwn ${kind} flank resolved — ${detail}`);
      else logFail(`pwn ${kind} flank did NOT resolve — ${detail}`);
      if (isCreated) createdChecked = true;
      if (isPaidBack) paidBackChecked = true;
    }

    // Claimed (non-default) card: the collect's flank echoes the header's
    // repayAmountProv delta — assert it resolves like created / paid_back.
    if (!claimedChecked && /claimed/i.test(cardText) && !/default/i.test(cardText)) {
      claimedChecked = true;
      if (flankCount > 0) {
        const flank = card.locator(FLANK_SELECTOR).first();
        const { resolved, detail } = await pickFlank(page, flank);
        if (resolved) logPass(`pwn claimed flank resolved — ${detail}`);
        else logFail(`pwn claimed flank did NOT resolve — ${detail}`);
      } else if (bareOuterCount > 0) {
        logFail(
          "pwn claimed flank has NO .prov-locate-box — the collect's receipt (e24cd10) regressed to the inert shape",
        );
      } else {
        logSkip(`pwn: claimed card #${ci} matched by text but no flank-shaped span found to inspect`);
      }
    }
  }

  await dismissPopover(page);
  if (!createdChecked) logFail("pwn: no 'created' event card found in the reachable window");
  if (!paidBackChecked) logSkip("pwn: no 'paid_back' event card found in the reachable window");
  if (!claimedChecked) logSkip("pwn: no non-default 'claimed' event card found in the reachable window");
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // The whole explorer roster, not a sample. The failure this guards is silent
  // and per-card: a drifted key on one protocol is invisible from every other,
  // so partial coverage would have left exactly the hole Morpho sat in.
  const targets = [
    {
      label: "aave-v3",
      url: `${BASE}/aave-v3/0x11111605b53ecef22726df86881e4d6d40b5ca11?market=core`,
    },
    { label: "spark", url: `${BASE}/spark/0x2c06f8a915b30414084a535bc79f0931353af494` },
    {
      label: "fluid (regression — bare→signed fix)",
      url: `${BASE}/fluid/11044`,
    },
    {
      label: "liquity-v1 (open/adjust)",
      url: `${BASE}/liquity-v1/0x04ca2a945ccba92ca2443024c07c99f81e71547f?epoch=1`,
    },
    {
      label: "liquity-v2 (own ChangeProv builder, not chainTruthDeltaValue)",
      url: `${BASE}/liquity-v2/trove/WETH/22412517865912344610666591322850826630726594253808037974356128721405243892759`,
    },
    {
      label: "ebisu (liquity fork)",
      url: `${BASE}/ebisu/WBTC/75911241408635389930317354588378809432274724767733080584082611717827843647638`,
    },
    {
      label: "asymmetry (liquity fork)",
      url: `${BASE}/asymmetry/sUSDS/8309122898133156698498852897464396224593631760337811282458430493454418132410`,
    },
    {
      label: "frankencoin (closed position — signed-on-close)",
      url: `${BASE}/frankencoin/0x6377a63b2a8caa1db4190a5419d2dc9215d74a3f`,
    },
    {
      label: "compound-v2: cToken lane (transfer_in wallet)",
      url: `${BASE}/compound-v2/0x1a6bae20f70691ce1755a003c4560879b7798910`,
      mustInclude: /received/i,
      maxCards: 7,
    },
    {
      label: "compound (Comet) — never checked before",
      url: `${BASE}/compound/usdc/0x5b4a24501dcc7cf8cff580dbce4a2a50b7865ff1`,
    },
    {
      label: "moonwell — never checked before",
      url: `${BASE}/moonwell/0x9781f72f15ff9d961f5b0aaf1d93b40c23905f05`,
    },
    {
      label: "morpho (the card that shipped the unsigned drift)",
      url: `${BASE}/morpho/a4774e3e693fff2ebd1dcbbd69b1b0a5b9bb0ccc753bfda5dd07bdac97c4818a-0x3b3bdaa4462851621818d2cebc835e077587147a`,
    },
    { label: "fx", url: `${BASE}/fx/wbtc-811` },
    { label: "maple", url: `${BASE}/maple/0x9ec2d8dd95ee25975ba2a5bb4e9d50dd57b7c87a` },
    { label: "makerdao", url: `${BASE}/makerdao/31731` },
    {
      label: "dolomite",
      url: `${BASE}/dolomite/0xe6705fccaf951870ef24463c88a81f31610efba4/53264333596970428064010753932179380014364720754547549633613121572245119207273`,
    },
    {
      label: "llamalend",
      url: `${BASE}/llamalend/0xa920de414ea4ab66b97da1bfe9e6eca7d4219635/0x538c8ec378fa4a27331c281ed7803a46fd17f566`,
    },
    {
      label: "aave-v4 (flanks were bare text until aaveV4AmountProv)",
      url: `${BASE}/aave-v4/spoke/main/0x0e2ac680f55ee9bde7c778617c9c22ed2257e726`,
    },
  ];

  for (const t of targets) {
    try {
      await testPage(page, t);
    } catch (err) {
      logFail(`${t.label}: threw during test — ${err && err.message}`);
    }
  }

  try {
    await testPwn(page, {
      label: "pwn: created/paid_back/claimed resolve",
      url: `${BASE}/pwn/0x0598b250a99bd45155a6b9b04af2ee19a2e5fed0?loan=20`,
    });
  } catch (err) {
    logFail(`pwn: threw during test — ${err && err.message}`);
  }

  await browser.close();

  console.log(`\n=== SUMMARY ===`);
  console.log(`PASS=${pass} FAIL=${fail} SKIPPED=${skips.length}`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (skips.length > 0) {
    console.log("Skips:");
    for (const s of skips) console.log(`  - ${s}`);
  }
  console.log(fail === 0 ? "ALL CHECKS: PASS" : "ALL CHECKS: FAIL");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
