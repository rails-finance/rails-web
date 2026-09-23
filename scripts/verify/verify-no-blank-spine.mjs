// Assert: no event card renders an EMPTY spine slot. Every spine column must
// carry either a token row or a semantic glyph — the icon states WHY there is
// no flow. Also asserts a third-party zero-delta row keeps the PINK external
// glyph rather than the neutral no-change one (who acted is the more
// informative fact there), and that maple/makerdao no longer hide a header
// delta into a spine row that does not exist.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-no-blank-spine.mjs
//
// Proved able to fail: reverting SpineColumn's fallback resolver to its previous
// form (`icon ?? (externalParty && !tokens?.length ? "external" : undefined)`)
// turns up 5 blank slots on frankencoin across this same 836-card sample.

import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:3000";
const CARD = "div.flex.w-full.items-start.relative.rounded-xl:has(> div.min-w-0.grow)";
const SPINE = "div.hidden.sm\\:flex.flex-col.items-center.relative";

const ROUTES = [
  [
    "morpho",
    "/ethereum/morpho/a4774e3e693fff2ebd1dcbbd69b1b0a5b9bb0ccc753bfda5dd07bdac97c4818a-0x3b3bdaa4462851621818d2cebc835e077587147a",
  ],
  ["fx (transfer → delegate glyph)", "/ethereum/fx/wbtc-811"],
  ["makerdao", "/ethereum/makerdao/31731"],
  ["maple (shares leg row)", "/ethereum/maple/0x9ec2d8dd95ee25975ba2a5bb4e9d50dd57b7c87a"],
  ["fluid", "/ethereum/fluid/11044"],
  [
    "liquity-v2",
    "/ethereum/liquity-v2/trove/WETH/22412517865912344610666591322850826630726594253808037974356128721405243892759",
  ],
  ["aave-v4", "/ethereum/aave-v4/spoke/main/0x0e2ac680f55ee9bde7c778617c9c22ed2257e726"],
  ["compound-v2", "/ethereum/compound-v2/0x1a6bae20f70691ce1755a003c4560879b7798910"],
  [
    "dolomite",
    "/ethereum/dolomite/0xe6705fccaf951870ef24463c88a81f31610efba4/53264333596970428064010753932179380014364720754547549633613121572245119207273",
  ],
  [
    "llamalend",
    "/ethereum/llamalend/0xa920de414ea4ab66b97da1bfe9e6eca7d4219635/0x538c8ec378fa4a27331c281ed7803a46fd17f566",
  ],
  ["moonwell", "/ethereum/moonwell/0x9781f72f15ff9d961f5b0aaf1d93b40c23905f05"],
  ["compound", "/ethereum/compound-v3/usdc/0x5b4a24501dcc7cf8cff580dbce4a2a50b7865ff1"],
  ["spark", "/ethereum/spark/0x2c06f8a915b30414084a535bc79f0931353af494"],
  ["aave-v3", "/ethereum/aave-v3/0x11111605b53ecef22726df86881e4d6d40b5ca11?market=core"],
  // A liquidated account whose remaining debt the Pool wrote off (one
  // bad_debt_written_off row beside the liquidation, server mig 261).
  ["aave-v3 write-off", "/ethereum/aave-v3/0x067739a4be2942a1c31e4513beaac08b814f29f0?market=core"],
  ["frankencoin", "/ethereum/frankencoin/0x6377a63b2a8caa1db4190a5419d2dc9215d74a3f"],
  ["liquity-v1", "/ethereum/liquity-v1/0x04ca2a945ccba92ca2443024c07c99f81e71547f?epoch=1"],
  ["ebisu", "/ethereum/ebisu/WBTC/75911241408635389930317354588378809432274724767733080584082611717827843647638"],
  [
    "asymmetry",
    "/ethereum/asymmetry/sUSDS/8309122898133156698498852897464396224593631760337811282458430493454418132410",
  ],
  ["pwn", "/ethereum/pwn/0x0598b250a99bd45155a6b9b04af2ee19a2e5fed0?loan=20"],
];

let pass = 0,
  fail = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
let totalCards = 0,
  totalBlank = 0,
  totalGlyph = 0,
  totalTokens = 0;

for (const [label, path] of ROUTES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(CARD, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(
    ({ CARD, SPINE }) => {
      const out = { cards: 0, blank: 0, glyph: 0, tokens: 0, blankSamples: [], handovers: [] };
      for (const card of document.querySelectorAll(CARD)) {
        const spine = card.querySelector(SPINE);
        if (!spine) continue;
        out.cards++;
        // The icon well is the z-10 block above the spine line; content is either
        // token chips (img/TokenChipIcon) or an inline SVG glyph.
        const well = spine.querySelector("div.relative.z-10");
        const hasImg = !!well?.querySelector("img");
        const hasSvg = !!well?.querySelector("svg");
        if (hasImg) out.tokens++;
        else if (hasSvg) {
          out.glyph++;
          // Which glyph landed, not merely that one did. An ownership handover
          // must read as the people glyph (delegate), never the generic
          // zero-delta equals sign — the party changing IS the event.
          const label = (card.innerText || "").trim().slice(0, 40).replace(/\s+/g, " ");
          if (/Ownership Transferred|Owner Set at Mint|Transferred to/i.test(label)) {
            const svg = well.querySelector("svg");
            const isPeople = !!svg && /circle cx="9"|M16 21v-2/.test(svg.innerHTML);
            out.handovers.push({ label, isPeople });
          }
        } else {
          out.blank++;
          if (out.blankSamples.length < 3)
            out.blankSamples.push((card.innerText || "").trim().slice(0, 70).replace(/\s+/g, " "));
        }
      }
      return out;
    },
    { CARD, SPINE },
  );
  totalCards += r.cards;
  totalBlank += r.blank;
  totalGlyph += r.glyph;
  totalTokens += r.tokens;
  if (r.cards === 0) {
    console.log(`SKIP  ${label}: no cards`);
    continue;
  }
  for (const h of r.handovers) {
    if (h.isPeople) {
      pass++;
      console.log(`PASS  ${label}: handover "${h.label}" wears the people glyph, not the equals sign`);
    } else {
      fail++;
      console.log(`FAIL  ${label}: handover "${h.label}" fell through to the generic zero-delta glyph`);
    }
  }
  if (r.blank === 0) {
    pass++;
    console.log(`PASS  ${label}: ${r.cards} cards, 0 blank spine slots (${r.tokens} token, ${r.glyph} glyph)`);
  } else {
    fail++;
    console.log(`FAIL  ${label}: ${r.blank}/${r.cards} BLANK spine slots — e.g. ${JSON.stringify(r.blankSamples)}`);
  }
}

console.log(`\nTOTAL cards=${totalCards} tokenRows=${totalTokens} glyphs=${totalGlyph} BLANK=${totalBlank}`);
console.log(`\n=== SUMMARY ===\nPASS=${pass} FAIL=${fail}`);
await browser.close();
console.log(fail === 0 ? "ALL CHECKS: PASS" : "ALL CHECKS: FAIL");
process.exit(fail === 0 ? 0 : 1);
