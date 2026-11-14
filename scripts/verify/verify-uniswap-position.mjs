#!/usr/bin/env node
// The Uniswap position page (anatomy U1, U1.1, U2, U2.1; rails-ops TO-DO-ui-jobs 556, door 1; 594):
// the card, the readout's then / now table and its (i), on three positions whose shape does not
// move with the market. Structure and stable text only: no live figure is pinned, and the one
// figure read (Value) is compared between the chip and the card.
// ----------------------------------------------------------------------------
// Checks, per fixture:
//   1. The page draws the card (`data-position-card=<version>:<id>`), the readout
//      (`data-pool-readout`) with its two groups, This position and The pool
//      (`data-readout-group`), and the rows every open position has (`data-pool-line`),
//      each once, with no sideways scroll at 390px.
//   2. The card's status word (`data-card-status`): "out of range" outside the range,
//      "live" inside it (words.ts `cardStatus`).
//   3. The header's Worth chip writes the card's Value figure character for character.
//   4. The readout's (i) opens to How it compares, This position and The pool, inside
//      one phone screen (844px).
//   5. The fixture's own shape:
//      V3 1083471  out of range: the range bar is not "in"; the share row reads 0% with
//                  "out of range" under it; the card holds 0 of one token.
//      V4 225457   hooked: the sub line names "hook 0x…"; Withdrawals reads Open with "the
//                  hook has no withdrawal permission" under it.
//      V4 50101    full range: the range bar is "full"; Withdrawals reads Open with no line
//                  under it (no hook).
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-uniswap-position.mjs
//   FIXTURES=50101 … reads one fixture.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const WAIT = 180000;
/** The rows every open position draws (words.ts `readoutTable`). */
const ROWS = ["token:0", "token:1", "earned", "against", "share", "withdrawals", "price", "fullRange", "protocolFee"];
const GROUPS = ["This position", "The pool"];
const PANE = ["How it compares", "This position", "The pool"];

const FIXTURES = [
  {
    path: "/ethereum/uniswap-v3/position/1083471",
    key: "v3:1083471",
    status: "out of range",
    shape: (g, tag) => {
      check(`${tag} 5a range bar out of range`, g.bar !== null && g.bar !== "in" && g.bar !== "full", g.bar);
      check(
        `${tag} 5b the share row reads 0%, out of range`,
        g.rows.share?.now === "0%" && g.rows.share?.note === "out of range",
        JSON.stringify(g.rows.share),
      );
      check(`${tag} 5c the card holds 0 of one token`, /(^|\D)0 [A-Z]/.test(g.holds), g.holds);
    },
  },
  {
    path: "/ethereum/uniswap-v4/position/225457",
    key: "v4:225457",
    shape: (g, tag) => {
      check(`${tag} 5a the sub line names the hook`, /· hook 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.test(g.sub), g.sub);
      check(
        `${tag} 5b Withdrawals: open, the hook has no withdrawal permission`,
        g.rows.withdrawals?.now === "Open" && g.rows.withdrawals?.note === "the hook has no withdrawal permission",
        JSON.stringify(g.rows.withdrawals),
      );
    },
  },
  {
    path: "/ethereum/uniswap-v4/position/50101",
    key: "v4:50101",
    status: "live",
    shape: (g, tag) => {
      check(`${tag} 5a range bar full`, g.bar === "full", g.bar);
      check(
        `${tag} 5b Withdrawals: open, no hook`,
        g.rows.withdrawals?.now === "Open" && g.rows.withdrawals?.note === "",
        JSON.stringify(g.rows.withdrawals),
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
    const rowEls = [...document.querySelectorAll("[data-pool-readout] [data-pool-line]")];
    const rows = {};
    for (const el of rowEls)
      rows[el.getAttribute("data-pool-line")] = {
        now: t(el.lastElementChild),
        note: t(el.querySelector("[data-row-note]")),
      };
    const worthHead = document.querySelector('[data-position-card] [data-card-head="worth"]');
    const holdsHead = document.querySelector('[data-position-card] [data-card-head="holds"]');
    return {
      card: document.querySelector("[data-position-card]")?.getAttribute("data-position-card") ?? null,
      status: document.querySelector("[data-card-status]")?.getAttribute("data-card-status") ?? null,
      groups: [...document.querySelectorAll("[data-pool-readout] [data-readout-group]")].map((el) =>
        el.getAttribute("data-readout-group"),
      ),
      keys: rowEls.map((el) => el.getAttribute("data-pool-line")),
      rows,
      bar: document.querySelector("[data-range-bar]")?.getAttribute("data-range-bar") ?? null,
      // The title sits in a HistoryTitleRow (567), so climb to the header's own child, then read its next sibling.
      sub: (() => {
        const h2 = document.querySelector("[data-uniswap-position]");
        const header = h2?.closest("header");
        let n = h2;
        while (n && header && n.parentElement !== header) n = n.parentElement;
        return t(n?.nextElementSibling);
      })(),
      chip: t(document.querySelector("[data-latest-prices] button")),
      worth: t(worthHead),
      holds: t(holdsHead),
      sw: document.scrollingElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });

  // ── 1. The parts ─────────────────────────────────────────────────────────
  check(`${tag} 1b the card is this position`, g.card === f.key, g.card);
  check(`${tag} 1c the table's two groups`, g.groups.join("|") === GROUPS.join("|"), g.groups.join(","));
  check(
    `${tag} 1d the rows every open position has`,
    ROWS.every((k) => g.keys.includes(k)),
    ROWS.filter((k) => !g.keys.includes(k)).join(",") || "all present",
  );
  check(`${tag} 1e no sideways scroll at 390px`, g.sw <= g.cw, `${g.sw} vs ${g.cw}`);

  // ── 2. The status word ───────────────────────────────────────────────────
  if (f.status) check(`${tag} 2 the card's status is ${f.status}`, g.status === f.status, g.status);

  // ── 3. Chip and card agree ───────────────────────────────────────────────
  const fig = /([\d,.]+(?: (?:M|bn))? \S+)$/.exec(g.worth)?.[1] ?? null;
  check(
    `${tag} 3 the Worth chip writes the card's figure`,
    fig !== null && new RegExp(`Worth ?${fig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(g.chip),
    `chip "${g.chip}", card "${fig}"`,
  );

  // ── 4. The readout's (i) ─────────────────────────────────────────────────
  await page.locator('[data-pool-readout] button[aria-label="Show explanation of this table"]').click();
  await page.waitForTimeout(400);
  const pane = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-pool-readout] [data-nosnippet]")].at(-1);
    if (!el) return null;
    return {
      titles: [...el.querySelectorAll("h4")].map((h) => h.textContent.trim()),
      h: Math.round(el.getBoundingClientRect().height),
    };
  });
  check(`${tag} 4a the (i) opens`, pane !== null);
  if (pane) {
    check(
      `${tag} 4b How it compares, This position, The pool`,
      pane.titles.join("|") === PANE.join("|"),
      pane.titles.join(","),
    );
    check(`${tag} 4c inside one phone screen`, pane.h <= 844, `${pane.h}px`);
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
