#!/usr/bin/env node
// verify-anatomy-codes — one position per family, every shared event-card code
// present or n/a with its reason.
// ----------------------------------------------------------------------------
// Subject: rails-ops TO-DO-ui-jobs 307's mechanism ("a verifier walks one
// position per family and asserts every shared code is present or listed n/a
// with its reason") and 309's step 11 (reference/shared-event-card-spec.md §6).
// The codes are the app-anatomy key's (reference/app-anatomy.md, "T — event
// card"): T1 closed card, T2 opened card, T2.1 cell ledger, T3 Explanation,
// T4 "?" learn-more, T5 card chevron, T6 card footer, T7 day mark. T8·liquity
// and T9·liquity are Liquity V2's and are not asserted here.
//
// For each position, at 1280 and at 390: load the page, read every
// `data-anatomy` code on it (closed), open the first event card of the
// timeline, its first ledger cell and its Explanation, and read again. T4 is
// reached by the selector `scripts/anatomy-shots.mjs` names for it (a family
// passes its "?" into the footer). A shared code counts for the family when
// the first card carries it at that width; T7 counts on any card of the page
// (it marks a day's last event).
//
// A code the family does not draw is listed in NA below with the reason, and a
// reason is required: an n/a with no reason fails, and so does an n/a for a
// code the walk found (the table must say what the page does). The run prints a
// family × code table and, per family, every other code the page carried.
//
//   BASE=http://localhost:3131 node scripts/verify/verify-anatomy-codes.mjs
//   ONLY=liquity-v2,aave-v3 …   a subset of the family keys below
//   WIDTHS=1280 …               one width

import { chromium } from "playwright";
import { bypassHeaders } from "./lib/host.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
const WIDTHS = (process.env.WIDTHS ?? "1280,390").split(",").map(Number);

const SHARED = ["T1", "T2", "T2.1", "T3", "T4", "T5", "T6", "T7"];
/** T4's selector (scripts/anatomy-shots.mjs FALLBACKS), plus the code where a
 *  family passes `anatomy` to its LearnMore. */
const T4_SELECTOR = '[data-anatomy~="T4"], [data-anatomy~="T6"] button[aria-label^="Learn more"]';

// ── The positions ────────────────────────────────────────────────────────────
// `path` is the position; `listing` + `rowHref` pick the first position the
// family's listing links to, for the families with no pinned position.
const FAMILIES = [
  {
    key: "liquity-v2",
    path: "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154",
  },
  { key: "compound-v2", path: "/ethereum/compound-v2/0x7e23c6ab8e21213f4a470df979d8e7348d30f756" },
  { key: "moonwell", path: "/base/moonwell/0x2d7a6b617f11b6755bfd3ab79f1d7cb963ff9e9c" },
  { key: "compound-v3", path: "/ethereum/compound-v3/usdc/0xd51c5283b8727206bf9be2b2db4e5673efaf519c" },
  { key: "liquity-v1", path: "/ethereum/liquity-v1/0x8eb2e0cebcd191625037a042c9edf67b7f7fd74c" },
  {
    key: "ebisu",
    path: "/ethereum/ebisu/WBTC/75911241408635389930317354588378809432274724767733080584082611717827843647638",
  },
  { key: "polaris", path: "/sepolia/polaris/usdp/166" },
  { key: "aave-v3", path: "/ethereum/aave-v3/0xc593352eefa7c45863525a3194870929fd6f5948" },
  { key: "spark", path: "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e" },
  { key: "seamless", path: "/base/seamless/0x818214d3494fbc4be4f450c50677e55987804206" },
  {
    key: "morpho",
    path: "/ethereum/morpho/ebd23a871b52e0a8c92bd719f4413600101b69e946cb72923b3a33fb5bc6ec85-0xebb870a0aaaa7bc55ead925d03a4af4a8db79a03",
  },
  { key: "makerdao", path: "/ethereum/makerdao/21264" },
  {
    key: "llamalend",
    path: "/ethereum/llamalend/0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67/0x4ffc5f22770ab6046c8d66dabae3a9cd1e7a03e7",
  },
  { key: "fluid", path: "/ethereum/fluid/7682" },
  { key: "fx", path: "/ethereum/fx/wsteth-249" },
  { key: "frankencoin", path: "/ethereum/frankencoin/0xa73ea04fef834e41a044f0bdddd959a9ff8fc639" },
  { key: "maple", path: "/ethereum/maple/0x9ec2d8dd95ee25975ba2a5bb4e9d50dd57b7c87a" },
  { key: "pwn", path: "/ethereum/pwn/0x8f1fc3766884d4a890acb2cf4bd7a9af7b2a6932?loan=60" },
  { key: "aave-v4", path: "/ethereum/aave-v4/spoke/main/0x7eac02864fbae93de38394a3e7b72a22e9b5fa09" },
  { key: "alchemix-v3", path: "/ethereum/alchemix/eth-alusd/1221" },
  { key: "alchemix-v2", path: "/ethereum/alchemix/v2/eth-aleth-v2/0xb6af7c04f67b5eb61f0dc7ac4a760888ec3e3887" },
  { key: "alchemix-transmuter", path: "/ethereum/alchemix/transmuter/eth-alusd/103" },
  { key: "sky-savings", path: "/ethereum/sky-savings/0xef42cf85be6adf3081ada73af87e27996046fe63" },
  {
    key: "morpho-base-vaults",
    path: "/base/morpho/vaults/0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2/0xaa3e1a91fc83723e527062ff929a357354d10dcb",
  },
  {
    key: "yearn-vaults",
    path: "/ethereum/yearn/vaults/0x310b7ea7475a0b449cfd73be81522f1b88efafaa/0xb634316e06cc0b358437cbadd4dc94f1d3a92b3b",
  },
  {
    key: "aave-vaults",
    path: "/ethereum/aave/vaults/0x0bfc9d54fc184518a81162f8fb99c2eaca081202/0xaafd07d53a7365d3e9fb6f3a3b09ec19676b73ce",
  },
  { key: "dolomite", listing: "/ethereum/dolomite", rowHref: /^\/ethereum\/dolomite\/0x[0-9a-f]{40}\/\d+$/i },
  { key: "asymmetry", listing: "/ethereum/asymmetry", rowHref: /^\/ethereum\/asymmetry\/[^/?]+\/\d+$/ },
  { key: "basedollar", listing: "/base/basedollar", rowHref: /^\/base\/basedollar\/[^/?]+\/\d+$/ },
];

// ── The codes a family does not draw, with the reason ────────────────────────
// Keyed by family, then code. Only the shared codes above are read from here.
const NO_FLOWS_CHART = "the page is not tied to a Lifetime flows chart (`dates` stays on in its view), so no day mark";
const NO_LEDGER = "the family's cells carry no ledger (`ledgers: { none }`, no flows panel), so no cell opens into one";
const NO_LEDGER_SHEET =
  "the opened card's T2 is the event sheet (ui-jobs 330), whose sides and panels hold no cell, so no cell opens into a ledger; verify-event-share.mjs reads the sheet";
/** Families with a sheet builder (ui-jobs 330). Some of their event kinds keep
 *  the cells, so the n/a is read off the walk: where the first card's T2 draws
 *  `data-sheet`, T2.1 is n/a for NO_LEDGER_SHEET; where it draws cells, the
 *  family's entry in NA below (or none) stands. */
const SHEET_FAMILIES = new Set([
  "compound-v2",
  "moonwell",
  "liquity-v1",
  "ebisu",
  "asymmetry",
  "basedollar",
  "polaris",
  "spark",
  "makerdao",
  "fx",
  "frankencoin",
  "maple",
  "pwn",
  "aave-v4",
  "sky-savings",
  "dolomite",
  "morpho-base-vaults",
  "yearn-vaults",
  "aave-vaults",
  "compound-v3",
  "morpho",
  "llamalend",
  "fluid",
  "alchemix-v3",
]);
const NA = {
  "liquity-v2": { "T2.1": NO_LEDGER_SHEET },
  "aave-v3": { "T2.1": NO_LEDGER_SHEET },
  // The pinned positions' first (newest) cards are rows that move no position
  // flow; the family draws ledgers on its flow rows.
  pwn: {
    "T2.1":
      "the first card is loan #60's Claimed row (to the note holder), which moves no position flow; PwnLedgerProvider gives ledgers to created, repaid and seized rows only",
  },
  frankencoin: {
    "T2.1":
      "the first card is a Challenge Started row, whose cells are stat cells (collateral challenged); the ledgers stand on mint, deposit, withdraw and sale rows",
  },
  "aave-v4": { "T2.1": NO_LEDGER },
  "alchemix-v3": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
  "alchemix-v2": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
  "alchemix-transmuter": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
  "sky-savings": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
  "morpho-base-vaults": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
  "yearn-vaults": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
  "aave-vaults": { "T2.1": NO_LEDGER, T7: NO_FLOWS_CHART },
};

// ── the walk ─────────────────────────────────────────────────────────────────

let failures = 0;
let counted = 0;
function check(name, cond, detail = "") {
  counted++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
}

const browser = await chromium.launch();

/** The card's row by its event id: a page can re-mount its timeline once its
 *  reads land, so the row is found again each time rather than marked. */
const cardSelector = (id) => `[data-event-id="${id.replace(/"/g, '\\"')}"]`;

/** Every `data-anatomy` code on the page and on the first card, with T4's
 *  selector applied to both. */
async function readCodes(page, id) {
  return page.evaluate(
    ([t4, sel]) => {
      const codesIn = (root) => {
        const out = new Set();
        if (!root) return out;
        for (const el of root.querySelectorAll("[data-anatomy]"))
          for (const c of (el.getAttribute("data-anatomy") ?? "").split(/\s+/)) if (c) out.add(c);
        if (root.matches?.("[data-anatomy]"))
          for (const c of root.getAttribute("data-anatomy").split(/\s+/)) if (c) out.add(c);
        if (root.querySelector(t4)) out.add("T4");
        return out;
      };
      const card = document.querySelector(sel);
      return { page: [...codesIn(document.body)], card: [...codesIn(card)] };
    },
    [T4_SELECTOR, cardSelector(id)],
  );
}

/** The first event card of the timeline: a `data-event-id` row that holds a
 *  T1, outside any group. Waits for the timeline to draw one. */
async function firstCardId(page) {
  const found = await page
    .waitForFunction(
      () => {
        const row = [...document.querySelectorAll("[data-event-id]")].find(
          (el) => el.querySelector('[data-anatomy~="T1"]') && !el.closest("[data-group-frame]"),
        );
        return row ? row.getAttribute("data-event-id") : false;
      },
      null,
      { timeout: 240_000, polling: 1000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  return found;
}

/** Open the first card from its control at this width (the header from
 *  640px, the spine's segment below it), then its first ledger cell and its
 *  Explanation. A press before hydration is lost, so each is pressed until
 *  it reads open. Returns the codes read with the ledger open and with the
 *  Explanation open, merged; null when the card never opened. */
async function openCard(page, id, expectLedger, sheetFamily) {
  const card = page.locator(cardSelector(id)).first();
  const control = card
    .locator('[data-spine-toggle], [data-anatomy~="T1"] [data-row-control][role="button"]')
    .locator("visible=true")
    .first();
  // Under load hydration can take a minute: press, wait for the control to
  // read open, and press again, for up to 120 s.
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    if ((await control.getAttribute("aria-expanded").catch(() => null)) === "true") break;
    await control.click({ timeout: 10_000 }).catch(() => {});
    await page
      .waitForFunction(
        (el) => el?.getAttribute("aria-expanded") === "true",
        await control.elementHandle().catch(() => null),
        {
          timeout: 15_000,
        },
      )
      .catch(() => {});
  }
  const opened = (await control.getAttribute("aria-expanded").catch(() => null)) === "true";
  if (!opened) return null;
  await card
    .locator('[data-anatomy~="T2"]')
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  // The cells settle after the family's reads (Spark and Aave read on open).
  await page.waitForTimeout(4000);
  // A sheet family's T2 stands as cells placeholders until its read lands.
  if (sheetFamily)
    await card
      .locator('[data-anatomy~="T2"] [data-sheet]')
      .first()
      .waitFor({ state: "attached", timeout: 60_000 })
      .catch(() => {});
  const sheet = (await card.locator('[data-anatomy~="T2"] [data-sheet]').count()) > 0;
  if (sheet) expectLedger = false;
  // A ledger cell draws its toggle once the flows model arrives (10 to 40 s,
  // longer under load, ui-jobs 309 step 7); a family with no ledger draws none.
  const ledger = card.locator("[data-ledger-toggle]").locator("visible=true").first();
  if (expectLedger) await ledger.waitFor({ timeout: 120_000 }).catch(() => {});
  for (let i = 0; i < 4 && (await ledger.count()); i++) {
    if ((await ledger.getAttribute("aria-expanded").catch(() => null)) === "true") break;
    await ledger.click({ timeout: 5000 }).catch(() => {});
    await card
      .locator('[data-anatomy~="T2.1"]')
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
  }
  // Read once with the ledger open, before the Explanation's press.
  const withLedger = await readCodes(page, id);
  const t3 = card.locator("[data-t3-toggle]").locator("visible=true").first();
  for (let i = 0; i < 4 && (await t3.count()); i++) {
    if ((await t3.getAttribute("aria-expanded").catch(() => null)) === "true") break;
    await t3.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1000);
  const withExplanation = await readCodes(page, id);
  return {
    page: [...new Set([...withLedger.page, ...withExplanation.page])],
    card: [...new Set([...withLedger.card, ...withExplanation.card])],
    sheet,
  };
}

/** The family's position path: pinned, or the first row its listing links to. */
async function positionOf(f) {
  if (f.path) return f.path;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: bypassHeaders() });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${f.listing}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    const href = await page
      .waitForFunction(
        (src) => {
          const re = new RegExp(src, "i");
          const a = [...document.querySelectorAll("a[href]")].find((x) => re.test(x.getAttribute("href")));
          return a ? a.getAttribute("href") : false;
        },
        f.rowHref.source,
        { timeout: 240_000, polling: 1000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    return href;
  } finally {
    await ctx.close();
  }
}

/** One family at one width: { closed, opened, page, firstId } or { error }. */
async function walk(path, width, expectLedger, sheetFamily) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 640 ? 844 : 1100 },
    extraHTTPHeaders: bypassHeaders(),
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    let firstId = await firstCardId(page);
    if (!firstId) {
      // A timeline that never draws a row is a backend 429: reload once.
      await page.reload({ waitUntil: "domcontentloaded", timeout: 300_000 }).catch(() => {});
      firstId = await firstCardId(page);
    }
    if (!firstId) return { error: "no event card drew" };
    await page.waitForTimeout(2000);
    const closed = await readCodes(page, firstId);
    const opened = await openCard(page, firstId, expectLedger, sheetFamily);
    if (!opened) return { error: `the first card (${firstId}) never opened`, closed };
    return { firstId, closed, opened };
  } catch (e) {
    return { error: String(e?.message ?? e).split("\n")[0] };
  } finally {
    await ctx.close();
  }
}

// ── the run ──────────────────────────────────────────────────────────────────

console.log(`verify-anatomy-codes — ${BASE}, widths ${WIDTHS.join(", ")}\n`);

for (const [fam, codes] of Object.entries(NA))
  for (const [code, why] of Object.entries(codes))
    if (!why || !String(why).trim()) check(`${fam} ${code}: the n/a states its reason`, false, "no reason given");

const table = [];
for (const f of FAMILIES) {
  if (ONLY && !ONLY.has(f.key)) continue;
  const path = await positionOf(f);
  console.log(`\n── ${f.key} ${path ?? "(no position found on the listing)"}`);
  if (!path) {
    check(`${f.key}: a position to walk`, false, `the listing ${f.listing} linked no row`);
    table.push({ key: f.key, cells: Object.fromEntries(SHARED.map((c) => [c, "—"])) });
    continue;
  }
  const byWidth = {};
  for (const w of WIDTHS) {
    byWidth[w] = await walk(path, w, !NA[f.key]?.["T2.1"], SHEET_FAMILIES.has(f.key));
    if (byWidth[w].error) check(`${f.key} @${w}: the walk read the page`, false, byWidth[w].error);
  }
  const na = { ...(NA[f.key] ?? {}) };
  // The first card's T2 drew the sheet at a width: no cell, so no ledger.
  if (WIDTHS.some((w) => byWidth[w]?.opened?.sheet)) na["T2.1"] = NO_LEDGER_SHEET;
  const cells = {};
  for (const code of SHARED) {
    const at = WIDTHS.filter((w) => {
      const r = byWidth[w];
      if (!r || r.error) return false;
      const onCard = new Set([...r.closed.card, ...r.opened.card]);
      const onPage = new Set([...r.closed.page, ...r.opened.page]);
      return code === "T7" ? onPage.has(code) : onCard.has(code);
    });
    const read = WIDTHS.filter((w) => byWidth[w] && !byWidth[w].error);
    if (na[code]) {
      cells[code] = at.length ? "n/a?" : "n/a";
      check(
        `${f.key} ${code}: n/a — ${na[code]}`,
        at.length === 0,
        at.length ? `but the walk found it @${at.join(", ")}: the n/a is stale` : "",
      );
    } else {
      cells[code] =
        at.length === WIDTHS.length ? "yes" : at.length ? `@${at.join(",")}` : read.length ? "MISSING" : "—";
      if (read.length)
        check(
          `${f.key} ${code}: present at ${read.join(" and ")}`,
          read.every((w) => at.includes(w)),
          at.length === read.length ? "" : `found @${at.join(", ") || "neither"}`,
        );
    }
  }
  const others = new Set();
  for (const w of WIDTHS) {
    const r = byWidth[w];
    if (!r || r.error) continue;
    for (const c of [...r.closed.page, ...(r.opened?.page ?? [])]) if (!SHARED.includes(c)) others.add(c);
  }
  console.log(
    `      first card ${byWidth[WIDTHS[0]]?.firstId ?? "?"}; other codes on the page: ${[...others].sort().join(" ")}`,
  );
  table.push({ key: f.key, cells });
}

await browser.close();

// ── the table ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const w0 = Math.max(6, ...table.map((r) => r.key.length)) + 2;
console.log(`\n${pad("family", w0)}${SHARED.map((c) => pad(c, 9)).join("")}`);
for (const r of table) console.log(`${pad(r.key, w0)}${SHARED.map((c) => pad(r.cells[c], 9)).join("")}`);
console.log(
  `\nyes: on the first card at every width (T7: on the page); @w: at that width only; n/a: listed with its reason;\n` +
    `n/a?: listed n/a but found; MISSING: not found and not listed; —: the page was not read.`,
);

console.log(`\n${counted - failures}/${counted} checks passed`);
if (counted === 0) {
  console.log("CRASH — zero checks ran");
  process.exit(2);
}
process.exit(failures === 0 ? 0 : 1);
