// Browser-verify the third-party-action spine treatment: the pink external
// badge annotates the token flow instead of replacing it.
//
// Two halves:
//   A. Structural (via the temporary /__spine-probe route) — the SpineColumn
//      cases no live position can reach, chiefly `externalParty` with no token
//      rows, which must fall back to the standalone glyph rather than paint a
//      blank spine slot.
//   B. Live (the Morpho fixture below) — 1,578 of its 1,589 events were
//      executed by an authorised operator and 11 by the owner, so ONE page
//      carries both treatments and they can be compared without navigating.
//
// Run with the dev server up: BASE=http://localhost:3001 node scripts/verify/verify-external-spine.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

// Section A needs SpineColumn rendered in states no live position reaches, so it
// writes a throwaway route, drives it, and removes it again — the repo keeps no
// debug page, and the check stays runnable rather than becoming a comment. The
// folder canNOT be `_`-prefixed: Next treats those as private and 404s them.
const PROBE_DIR = "app/(app)/spine-probe-tmp";
const PROBE_PAGE = `"use client";

import { SpineColumn } from "@/components/shared/spine-column";

export default function SpineProbePage() {
  return (
    <div className="flex gap-8 p-8">
      {/* isLast={false} throughout: the spine line only renders when a card
          follows, and the dotted-vs-solid assertion needs it drawn. */}
      <div data-probe="undefined-tokens">
        <SpineColumn externalParty spine="dotted" isLast={false} />
      </div>
      <div data-probe="empty-tokens">
        <SpineColumn externalParty tokens={[]} spine="dotted" isLast={false} />
      </div>
      <div data-probe="flow">
        <SpineColumn
          externalParty
          tokens={[{ symbol: "USDC", direction: "right", value: 1234 }]}
          spine="dotted"
          isLast={false}
        />
      </div>
      <div data-probe="explicit-badge-wins">
        <SpineColumn externalParty tokens={[{ symbol: "USDC", badge: "check" }]} spine="dotted" isLast={false} />
      </div>
      <div data-probe="warning-wins">
        <SpineColumn
          icon="warning"
          warningTone="critical"
          warningLabel="Liquidation"
          externalParty
          spine="dotted"
          isLast={false}
        />
      </div>
      <div data-probe="owner-acted">
        <SpineColumn tokens={[{ symbol: "USDC", direction: "right", value: 1234 }]} isLast={false} />
      </div>
    </div>
  );
}
`;

const BASE = process.env.BASE || "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 1100 };
const FIXTURE =
  "/ethereum/morpho/3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49-0x405dbf6606336ab3d6574f78eddfa68038e9f9a1";
const LIQ_FIXTURE =
  "/ethereum/morpho/3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49-0x1f1de251ee59f4272ac21ffda2bd4dfc40c81912";

const CARD_ROOT = "div.flex.w-full.items-start.relative.rounded-xl:has(> div.min-w-0.grow)";
// The spine column itself (spine-column.tsx root).
const SPINE = "div.hidden.sm\\:flex.flex-col.items-center.relative.px-1.pt-4.self-stretch";

let pass = 0;
let fail = 0;
const failures = [];
const ok = (m) => {
  pass++;
  console.log(`PASS: ${m}`);
};
const bad = (m) => {
  fail++;
  failures.push(m);
  console.log(`FAIL: ${m}`);
};

/** What a spine column is drawing, read from the DOM rather than inferred. */
const READ_SPINE = `(el) => {
  const svgs = [...el.querySelectorAll('svg')];
  const html = el.innerHTML;
  return {
    // The ExternalBadge: a pink circle wrapping a WHITE-FILLED svg.
    externalBadge: [...el.querySelectorAll('div')].some(
      (d) => (d.style.backgroundColor || '').replace(/\\s/g, '') === 'rgb(236,72,153)' && d.querySelector('svg[fill="white"]'),
    ),
    // The standalone glyph: a STROKED pink users icon, not a filled badge.
    standaloneGlyph: svgs.some((s) => (s.getAttribute('stroke') || '').toUpperCase() === '#EC4899'),
    tokenIcons: el.querySelectorAll('img, [class*="token"]').length,
    checkBadge: [...el.querySelectorAll('div')].some(
      (d) => (d.style.backgroundColor || '').replace(/\\s/g, '') === 'rgb(34,197,94)',
    ),
    warningGlyph: svgs.some((s) => (s.getAttribute('stroke') || '').includes('red') || (s.getAttribute('stroke') || '') === 'rgb(239 68 68)'),
    warningLabel: /Liquidation|Absorbed|Redemption/.test(el.textContent || ''),
    dotted: html.includes('linear-gradient'),
    flankText: (el.textContent || '').trim(),
  };
}`;

async function probeStructural(page) {
  console.log("\n── A. structural (/__spine-probe) ──────────────────────────");
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(`${PROBE_DIR}/page.tsx`, PROBE_PAGE);
  await new Promise((r) => setTimeout(r, 2500)); // let the dev server pick it up

  const res = await page.goto(`${BASE}/spine-probe-tmp`, { waitUntil: "networkidle", timeout: 60_000 });
  if (!res || res.status() >= 400) {
    bad(`probe route returned ${res && res.status()} — cannot run structural checks`);
    return;
  }
  await page.waitForSelector("[data-probe]", { timeout: 30_000 });

  const readAt = async (name) => {
    const el = await page.$(`[data-probe="${name}"] ${SPINE}`);
    if (!el) return null;
    return page.evaluate(new Function("el", `return (${READ_SPINE})(el)`), el);
  };

  const undef = await readAt("undefined-tokens");
  if (!undef) bad("probe: no spine rendered for undefined tokens");
  else if (undef.standaloneGlyph && !undef.externalBadge)
    ok("externalParty + tokens=undefined → standalone pink glyph (no blank slot)");
  else bad(`externalParty + tokens=undefined → ${JSON.stringify(undef)}`);

  const empty = await readAt("empty-tokens");
  if (empty && empty.standaloneGlyph && !empty.externalBadge)
    ok("externalParty + tokens=[] → standalone pink glyph (empty array, not just undefined)");
  else bad(`externalParty + tokens=[] → ${JSON.stringify(empty)}`);

  const flow = await readAt("flow");
  // The flank renders COMPACT (fmtSpine): 1234 → "1.2K".
  if (flow && flow.externalBadge && !flow.standaloneGlyph && flow.tokenIcons > 0 && /1\.2K/.test(flow.flankText))
    ok("externalParty + a token row → token flow KEPT, pink badge overlaid, flank value present");
  else bad(`externalParty + a token row → ${JSON.stringify(flow)}`);
  if (flow && flow.dotted) ok("externalParty rows carry the dotted spine");
  else bad(`externalParty row's spine is not dotted → ${JSON.stringify(flow && flow.dotted)}`);

  const explicit = await readAt("explicit-badge-wins");
  if (explicit && explicit.checkBadge && !explicit.externalBadge)
    ok("an explicit row badge (check) WINS over the external badge — one corner, one badge");
  else bad(`explicit badge case → ${JSON.stringify(explicit)}`);

  const warn = await readAt("warning-wins");
  if (warn && warn.warningLabel && !warn.externalBadge && !warn.standaloneGlyph)
    ok("icon='warning' still wins over externalParty — liquidation keeps its critical glyph");
  else bad(`warning case → ${JSON.stringify(warn)}`);

  const owner = await readAt("owner-acted");
  if (owner && !owner.externalBadge && owner.tokenIcons > 0 && !owner.dotted)
    ok("owner-acted control: token flow, no badge, SOLID spine");
  else bad(`owner-acted control → ${JSON.stringify(owner)}`);
}

/** The load-bearing one. The spine flank is a <Prov echo>; if its entryKey
 *  (`receiptLabel|value|symbol`) does not byte-match the header's registered
 *  receipt, NOTHING visible breaks — the flank just stops being targetable.
 *  Worse, a miss still opens a popover (handlePick falls back to the echo's own
 *  entry), so "a receipt opened" proves nothing.
 *
 *  The real signature is `locateEntries`: it stamps data-prov-active on EVERY
 *  entry sharing the pinned key. Resolved → the flank AND the header's value
 *  span both light up (≥2). Drifted → only the flank does (1). */
async function probeEcho(page) {
  console.log("\n── D. flank echo resolves to the header receipt ─────────────");
  await page.goto(`${BASE}${FIXTURE}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(CARD_ROOT, { timeout: 90_000 });
  await page.waitForTimeout(2000);

  const toggle = await page.$("button.prov-inspect-toggle");
  if (!toggle) {
    bad("no provenance-inspector toggle on the page — cannot test the echo");
    return;
  }
  await toggle.click();
  await page.waitForTimeout(400);

  const FLANK =
    "span.justify-self-end.pr-5 > span.prov-locate-box, span.justify-self-start.pl-5 > span.prov-locate-box";
  const flanks = await page.$$(FLANK);
  console.log(`   ${flanks.length} spine flanks present (0 before this change — the glyph displaced them)`);
  if (flanks.length === 0) {
    bad("no spine flank spans exist on third-party rows — the echo cannot resolve");
    return;
  }

  let resolved = 0;
  let lonely = 0;
  for (const flank of flanks.slice(0, 4)) {
    // Sticky mode: a pick moves the popover and leaves the tool ARMED. Re-arming
    // between picks would toggle it OFF on alternate rounds (which is what
    // produced phantom empty results the first time this ran) — so just check
    // the armed state and only click the toggle when it has actually dropped.
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
      await page.waitForTimeout(250);
    }
    await flank.click();
    await page.waitForTimeout(400);
    const stamped = await page.evaluate(() =>
      [...document.querySelectorAll("[data-prov-active]")].map((el) => ({
        text: (el.textContent || "").trim().slice(0, 24),
        // The spine column root is `hidden sm:flex`; the header's value span
        // carries `sm:hidden`, which is a DIFFERENT class — so this cleanly
        // separates "the flank" from "the header receipt it must reach".
        inSpine: !!el.closest("div.hidden"),
      })),
    );
    if (stamped.length >= 2 && stamped.some((s) => !s.inSpine)) resolved++;
    else {
      lonely++;
      console.log(`   unresolved pick → ${JSON.stringify(stamped)}`);
    }
  }

  if (resolved > 0 && lonely === 0)
    ok(`${resolved}/${resolved} flank picks light up the header receipt too — the echo resolves byte-for-byte`);
  else bad(`${lonely} of ${resolved + lonely} flank picks stamped ONLY the flank — the echo key has drifted`);
}

async function probeLive(page) {
  console.log("\n── B. live fixture (Morpho, 1,578 third-party rows) ─────────");
  await page.goto(`${BASE}${FIXTURE}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(CARD_ROOT, { timeout: 90_000 });
  await page.waitForTimeout(2500); // let ENS resolve + the window settle

  const cards = await page.$$(CARD_ROOT);
  console.log(`   ${cards.length} event cards in the window`);

  let badged = 0;
  let glyphOnly = 0;
  let plain = 0;
  let dupes = 0;
  const samples = [];
  // Scan the WHOLE window, not a prefix: the owner-acted rows on this position
  // sit at newest-first index 41 and 155-164, so a 25-card sample would report
  // "nothing to compare against" and quietly skip the contrast this page exists
  // to provide.
  for (const card of cards) {
    const spine = await card.$(SPINE);
    if (!spine) continue;
    const s = await page.evaluate(new Function("el", `return (${READ_SPINE})(el)`), spine);
    // innerText, NOT textContent: the hand-off works by `sm:hidden` on the
    // header's value span, so textContent would happily report an amount that
    // is display:none and the duplication check could never fail.
    const headerText = await card.evaluate((el) => {
      const h = el.querySelector("div.flex.flex-wrap.items-center");
      return h ? h.innerText || "" : "";
    });
    const flank = (s.flankText.match(/[\d,]+\.?\d*/) || [])[0];
    // The hand-off: with the flank drawn, the header must NOT also paint the
    // same magnitude at this width.
    const headerHasSameNumber = flank && headerText.includes(flank);
    if (s.externalBadge) {
      badged++;
      if (headerHasSameNumber) dupes++;
      if (samples.length < 3) samples.push({ flank, dotted: s.dotted, headerText: headerText.slice(0, 90) });
    } else if (s.standaloneGlyph) glyphOnly++;
    else plain++;
  }

  console.log(`   badged=${badged} standalone-glyph=${glyphOnly} plain=${plain}`);
  for (const s of samples) console.log(`   sample: flank=${s.flank} dotted=${s.dotted} header="${s.headerText}"`);

  if (badged > 0) ok(`${badged} third-party rows render token flow + pink badge (was: a lone glyph, no flow)`);
  else bad("no badged rows found — the external badge is not reaching the live page");

  if (glyphOnly === 0) ok("no third-party row fell back to the bare glyph (all have a flow to draw)");
  else console.log(`   note: ${glyphOnly} row(s) used the standalone-glyph fallback`);

  if (dupes === 0) ok("no row paints its amount twice (header hand-off intact after dropping isPassive)");
  else bad(`${dupes} row(s) show the same magnitude in BOTH header and spine flank`);

  if (plain > 0) ok(`${plain} owner-acted row(s) on the same page render unbadged — the two treatments differ`);
  else console.log("   note: no owner-acted row in the first 25 cards to compare against");

  // The actor chip, ENS-resolved.
  const chip = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span.font-medium")].find((s) => /\.eth$|^0x/.test(s.textContent || ""));
    return el ? el.textContent : null;
  });
  if (chip && chip.endsWith(".eth")) ok(`actor chip reverse-resolved: "${chip}"`);
  else bad(`actor chip did not resolve to a name — got ${JSON.stringify(chip)}`);

  // The Explanation's operator bullet.
  const bodyText = await page.evaluate(() => document.body.textContent || "");
  if (/executed by an address other than the owner/.test(bodyText)) {
    ok("position Explanation states the third-party execution fact");
    const m = bodyText.match(/Of those, [\d,]+ (?:was|were) executed by an address other than the owner[^]{0,320}/);
    if (m) console.log(`   → ${m[0].replace(/\s+/g, " ").slice(0, 320)}`);
    if (/ran through \S+\.eth/.test(bodyText)) ok("…and names the leading operator where ENS resolves it");
    else bad("operator bullet present but names no operator despite a resolving address");
  } else bad("position Explanation does not mention third-party execution");

  await page.screenshot({ path: "/tmp/external-spine-live.png", fullPage: false });
}

async function probeLiquidation(page) {
  console.log("\n── C. liquidation fixture (critical must still win) ─────────");
  await page.goto(`${BASE}${LIQ_FIXTURE}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(CARD_ROOT, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  // The two liquidations sit at newest-first index 317 and 369, past the first
  // render window (`TIMELINE_PAGE_ROWS` in lib/shared/timeline-opening-balance.ts)
  // — grow it with the timeline's own "Show more" control rather than declaring
  // the check unexercisable. The loop presses until the 370th row is painted or
  // the control is gone, so it does not have to know the window's grain: a fixed
  // press count silently stops short the day that constant is halved, and this
  // probe's miss reads as "nothing to assert" rather than as a failure.
  for (let i = 0; i < 20; i++) {
    if ((await page.$$(CARD_ROOT)).length > 370) break;
    const more = await page.$('button:has-text("more")');
    if (!more) break;
    await more.click();
    await page.waitForTimeout(900);
  }
  const cards = await page.$$(CARD_ROOT);
  console.log(`   ${cards.length} event cards after growing the window`);
  let liqSeen = 0;
  let liqBadged = 0;
  for (const card of cards) {
    const spine = await card.$(SPINE);
    if (!spine) continue;
    const s = await page.evaluate(new Function("el", `return (${READ_SPINE})(el)`), spine);
    if (!/Liquidation/.test(s.flankText)) continue;
    liqSeen++;
    if (s.externalBadge || s.standaloneGlyph) liqBadged++;
  }
  if (liqSeen === 0) console.log("   note: no liquidation row in the reachable window — nothing to assert");
  else if (liqBadged === 0) ok(`${liqSeen} liquidation row(s) keep the critical warning glyph, unbadged`);
  else bad(`${liqBadged} of ${liqSeen} liquidation rows gained an external badge — critical must win`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();
try {
  await probeStructural(page);
  await probeLive(page);
  await probeLiquidation(page);
  await probeEcho(page);
} catch (err) {
  bad(`threw: ${err && err.message}`);
} finally {
  // Always, including on a throw — a leftover debug route inside (app) breaks
  // its SIBLING routes' dev compile, not just its own.
  rmSync(PROBE_DIR, { recursive: true, force: true });
  // ⚠️ Next generates a type stub per route under .next/types, and removing the
  // route does NOT remove it. Left behind, it fails `tsc --noEmit` with
  // "Cannot find module .../spine-probe-tmp/page.js" — i.e. running this check
  // turns the repo's own correctness gate red on a tree that is fine. Clear it
  // with the route it describes.
  rmSync(`.next/types/${PROBE_DIR}`, { recursive: true, force: true });
  await browser.close();
}

console.log(`\n=== SUMMARY === PASS=${pass} FAIL=${fail}`);
for (const f of failures) console.log(`  - ${f}`);
console.log(fail === 0 ? "ALL CHECKS: PASS" : "ALL CHECKS: FAIL");
process.exit(fail === 0 ? 0 : 1);
