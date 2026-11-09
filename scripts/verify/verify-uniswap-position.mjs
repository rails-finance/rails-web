#!/usr/bin/env node
// The Uniswap position page (anatomy U1, U1.1, U2, U2.1; rails-ops TO-DO-ui-jobs 556, door 1):
// the card, the six readout lines in their order, and the readout's (i), on three positions
// whose shape does not move with the market. Structure and stable text only: no live figure is
// pinned, and the one figure read (Worth) is compared between the chip and the card.
// ----------------------------------------------------------------------------
// Checks, per fixture:
//   1. The page draws the card (`data-position-card=<version>:<id>`), the readout
//      (`data-pool-readout`) and six lines (`data-pool-line`), each once, with no
//      sideways scroll at 390px.
//   2. Line order: Range first while out of range, Size first in range (words.ts
//      `readoutLines`).
//   3. The header's Worth chip writes the card's Worth figure character for character.
//   4. The readout's (i) opens to one group per line, in the lines' order, at most
//      eight bullets, inside one phone screen (844px).
//   5. The fixture's own shape:
//      V3 1083471  out of range: the range bar is not "in"; the Range line says
//                  "Out of range" and "It holds only <one token>"; the card holds 0 of the
//                  other token.
//      V4 225457   hooked: the sub line names "hook 0x…"; the Withdrawals line names the
//                  hook and says it "has no permission on withdrawals".
//      V4 50101    full range: the range bar is "full"; the Range line reads "In range at
//                  every price"; Withdrawals says the pool has no hook.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-uniswap-position.mjs
//   FIXTURES=50101 … reads one fixture.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const WAIT = 180000;
const LINES = ["range", "fees", "against", "size", "withdrawals", "steward"];
const LABEL = {
  range: "Range",
  fees: "Fees",
  against: "Against holding",
  size: "Size",
  withdrawals: "Withdrawals",
  steward: "Steward",
};

const FIXTURES = [
  {
    path: "/ethereum/uniswap-v3/position/1083471",
    key: "v3:1083471",
    first: "range",
    shape: (g, tag) => {
      check(`${tag} 5a range bar out of range`, g.bar !== null && g.bar !== "in" && g.bar !== "full", g.bar);
      check(`${tag} 5b Range line says out of range`, /^Out of range/.test(g.lines.range ?? ""), g.lines.range);
      const only = /It holds only (\S+) and earns no fees/.exec(g.lines.range ?? "");
      check(`${tag} 5c Range line names the one token it holds`, only !== null, g.lines.range);
      const two = /([\d,.]+) (\S+?) ?and ([\d,.]+) (\S+)$/.exec(g.holds);
      const zero =
        two !== null && (two[1] === "0") !== (two[3] === "0") && only?.[1] === (two[1] === "0" ? two[4] : two[2]);
      check(`${tag} 5d the card holds only that token`, zero, g.holds);
    },
  },
  {
    path: "/ethereum/uniswap-v4/position/225457",
    key: "v4:225457",
    shape: (g, tag) => {
      check(`${tag} 5a the sub line names the hook`, /· hook 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.test(g.sub), g.sub);
      const w = g.lines.withdrawals ?? "";
      check(
        `${tag} 5b Withdrawals names the hook`,
        /The pool's hook 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4} runs on/.test(w),
        w,
      );
      check(`${tag} 5c Withdrawals: no permission on withdrawals`, /has no permission on withdrawals\./.test(w), w);
    },
  },
  {
    path: "/ethereum/uniswap-v4/position/50101",
    key: "v4:50101",
    first: "size",
    shape: (g, tag) => {
      check(`${tag} 5a range bar full`, g.bar === "full", g.bar);
      check(
        `${tag} 5b Range line reads full range`,
        /^In range at every price: the position is full range\./.test(g.lines.range ?? ""),
        g.lines.range,
      );
      check(
        `${tag} 5c Withdrawals: no hook`,
        /The pool has no pause and no hook\./.test(g.lines.withdrawals ?? ""),
        g.lines.withdrawals,
      );
    },
  },
].filter((f) => !process.env.FIXTURES || process.env.FIXTURES.split(",").some((s) => f.path.includes(s.trim())));

let failures = 0;
let checks = 0;
function check(name, cond, detail = "") {
  checks++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const browser = await chromium.launch();
for (const f of FIXTURES) {
  const tag = f.key;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}${f.path}`, NAV);
  const ready = await page
    .locator("[data-pool-readout] [data-pool-line]")
    .first()
    .waitFor({ timeout: WAIT })
    .then(() => true)
    .catch(() => false);
  check(`${tag} 1a the page draws the readout`, ready);
  if (!ready) {
    await page.close();
    continue;
  }
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => {
    const t = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const lineEls = [...document.querySelectorAll("[data-pool-readout] [data-pool-line]")];
    const lines = {};
    for (const el of lineEls) lines[el.getAttribute("data-pool-line")] = t(el.querySelector("div"));
    const worthHead = document.querySelector('[data-position-card] [data-card-head="worth"]');
    const holdsHead = document.querySelector('[data-position-card] [data-card-head="holds"]');
    return {
      card: document.querySelector("[data-position-card]")?.getAttribute("data-position-card") ?? null,
      order: lineEls.map((el) => el.getAttribute("data-pool-line")),
      lines,
      bar: document.querySelector("[data-range-bar]")?.getAttribute("data-range-bar") ?? null,
      sub: t(document.querySelector("[data-uniswap-position]")?.nextElementSibling),
      chip: t(document.querySelector("[data-latest-prices] button")),
      worth: t(worthHead),
      holds: t(holdsHead),
      sw: document.scrollingElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });

  // ── 1. The parts ─────────────────────────────────────────────────────────
  check(`${tag} 1b the card is this position`, g.card === f.key, g.card);
  check(
    `${tag} 1c six lines, each once`,
    g.order.length === 6 && LINES.every((k) => g.order.includes(k)),
    g.order.join(","),
  );
  check(`${tag} 1d no sideways scroll at 390px`, g.sw <= g.cw, `${g.sw} vs ${g.cw}`);

  // ── 2. Line order ────────────────────────────────────────────────────────
  if (f.first) check(`${tag} 2 ${LABEL[f.first]} leads`, g.order[0] === f.first, g.order[0]);

  // ── 3. Chip and card agree ───────────────────────────────────────────────
  const fig = /([\d,.]+(?: (?:M|bn))? \S+)$/.exec(g.worth)?.[1] ?? null;
  check(
    `${tag} 3 the Worth chip writes the card's figure`,
    fig !== null && new RegExp(`Worth ?${fig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(g.chip),
    `chip "${g.chip}", card "${fig}"`,
  );

  // ── 4. The readout's (i) ─────────────────────────────────────────────────
  await page.locator('[data-pool-readout] button[aria-label="Show explanation of these lines"]').click();
  await page.waitForTimeout(400);
  const pane = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-pool-readout] [data-nosnippet]")].at(-1);
    if (!el) return null;
    return {
      titles: [...el.querySelectorAll("h4")].map((h) => h.textContent.trim()),
      bullets: el.querySelectorAll("li").length,
      h: Math.round(el.getBoundingClientRect().height),
    };
  });
  check(`${tag} 4a the (i) opens`, pane !== null);
  if (pane) {
    check(
      `${tag} 4b one group per line, in the lines' order`,
      pane.titles.join("|") === g.order.map((k) => LABEL[k]).join("|"),
      pane.titles.join(","),
    );
    check(`${tag} 4c at most eight bullets`, pane.bullets >= 6 && pane.bullets <= 8, String(pane.bullets));
    check(`${tag} 4d inside one phone screen`, pane.h <= 844, `${pane.h}px`);
  }

  // ── 5. The fixture's shape ───────────────────────────────────────────────
  f.shape(g, tag);
  await page.close();
}

await browser.close();
if (checks === 0) {
  console.log("\nCRASH: no checks ran");
  process.exit(2);
}
console.log(failures === 0 ? `\nALL PASS (${checks})` : `\n${failures} FAILURE(S) of ${checks}`);
process.exit(failures === 0 ? 0 : 1);
