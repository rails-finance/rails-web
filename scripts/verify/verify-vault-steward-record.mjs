#!/usr/bin/env node
// The steward's record (anatomy V14) and bad debt in its vaults (V14.1), rails-ops
// TO-DO-ui-jobs 554 piece C.
// ----------------------------------------------------------------------------
// V14 lists the vaults the page's curator, owner or pool delegate runs, from the /vaults
// directory; V14.1 lists the liquidations that left bad debt in markets those vaults supply,
// each with the vault's part and that part's share of the vault at the block before.
//
// Expectations come from outside the section where they can: each steward row's key and
// link are read off the vault's /vaults row (`data-vault-row`, its link), with every vault
// shown (`?show=all`) and the empty group opened. Held amounts are not compared: the
// directory re-read can sit at a later block than the page's. The rows before "Show all"
// are recomputed from the full list by the component's rule (LIMIT, the empty-vault rule).
//
// Fixtures: Adpend's USDC vault on Ethereum, Lumetra on Base, and the first Maple pool on
// /vaults (the pool delegate's record, no V14.1). What V14.1 states about each is read off
// the page; the run needs at least one fixture with bad debt at 0.01% of a vault or more.
//
// Checks, per MetaMorpho fixture:
//   1. V14 names a steward under "The curator's record" or "The owner's record".
//   2. The count line's n equals the rows after "Show all"; the rows before it are, in
//      order, the page's vault and the vaults that hold something, the first LIMIT of them
//      (the page's vault kept); `data-steward-empty` counts the vaults that hold nothing.
//   3. Exactly one row is the page's vault, marked "this vault".
//   4. Order: the page's vault's token first (`data-steward-token`), then the other tokens
//      A to Z; within each, held amount largest first, an unread amount last. At least one
//      row carries a held amount. The order line says so.
//   5. Each row is a /vaults row, and each linked row links the same href; at least one
//      row besides the page's vault is linked.
//   6. V14.1 sits in V14 and answered with at-block reads. The rows at 0.01% of the vault
//      or more name `data-bad-debt-large` distinct liquidations; the rows before "Show all"
//      are the first LIMIT of them, or the "None" line where there are none. "Show all"
//      adds the rest, to the n "Show all n" states: `data-bad-debt-small` rows under 0.01%,
//      and any row with no share of the vault. Every episode's vault is a row of the record.
//      A fixture with no bad-debt liquidation shows the "No liquidation" line and no rows.
// Maple fixture: V14 headed "The pool delegate's record", no V14.1.
//
// Chain reads: V14 reads none. V14.1 makes one Multicall3 eth_call per liquidation block,
// plus one withdraw-queue read per chain; both are cached, so a second run reads nothing new.

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const FIXTURES = [
  {
    tag: "adpend (ethereum)",
    path: "/ethereum/morpho/vaults/0xcb82e29930835a937429d4bcad0a6fa6636755d7",
    key: "1:0xcb82e29930835a937429d4bcad0a6fa6636755d7",
  },
  {
    tag: "lumetra (base)",
    path: "/base/morpho/vaults/0x7fd62b11654f0dd41ad30edda8174366e225e712",
    key: "8453:0x7fd62b11654f0dd41ad30edda8174366e225e712",
  },
];
/** components/vaults/vault-steward-record.tsx and vault-bad-debt-episodes.tsx. */
const LIMIT = 12;
const ONE_BP_PPM = 100;

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: bypassHeaders() });

async function open(path, ready) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForSelector(ready, { timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return page;
}

// The directory: every /vaults row's link, by key, with every vault shown and the empty
// group opened. A row's data-vault-row is its address; its chain is the link's first segment.
const CHAIN = { ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10 };
const dir = await open("/vaults?show=all", "[data-vault-row]");
const emptyGroup = dir.locator("[data-empty-group] > button");
if ((await emptyGroup.count()) && (await emptyGroup.first().getAttribute("aria-expanded")) !== "true")
  await emptyGroup.first().click();
await dir.waitForTimeout(1000);
const index = Object.fromEntries(
  (
    await dir.evaluate(() =>
      [...document.querySelectorAll("[data-vault-row]")].map((r) => ({
        address: r.getAttribute("data-vault-row").toLowerCase(),
        href:
          r.querySelector("[data-vault-link]")?.getAttribute("href") ??
          r.querySelector("a[href]")?.getAttribute("href") ??
          null,
      })),
    )
  ).map((r) => [`${CHAIN[r.href?.split("/")[1]] ?? "?"}:${r.address}`, r.href]),
);
await dir.close();
const maplePath = Object.values(index).find((h) => h?.startsWith("/ethereum/maple/pools/"));
check(
  "/vaults: the directory answers, with a Maple pool among its rows",
  Object.keys(index).length > 0 && !!maplePath,
  `${Object.keys(index).length} rows`,
);

/** The record's rows, in order. */
const rowsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-anatomy="V14"] [data-steward-vault]')].map((r) => ({
      key: r.getAttribute("data-steward-vault").toLowerCase(),
      token: r.getAttribute("data-steward-token"),
      raw: r.querySelector('[data-cell="steward-held"]')?.getAttribute("data-raw") ?? null,
      href: r.querySelector("a[href]")?.getAttribute("href") ?? null,
      current: r.hasAttribute("data-steward-current"),
      text: r.textContent,
    })),
  );
/** The bad-debt rows, in order. */
const episodesOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-anatomy="V14.1"] [data-bad-debt-episode]')].map((e) => ({
      key: e.getAttribute("data-bad-debt-episode"),
      vault: e.getAttribute("data-bad-debt-vault").toLowerCase(),
      ppm: e.hasAttribute("data-bad-debt-of-vault") ? Number(e.getAttribute("data-bad-debt-of-vault")) : null,
    })),
  );
const ids = (rows) => rows.map((r) => r.key).join(",");
const epIds = (rows) => rows.map((e) => `${e.key}@${e.vault}`).join(",");

let withLarge = 0;
for (const f of FIXTURES) {
  const page = await open(f.path, '[data-anatomy="V14"]');
  await page.waitForSelector('[data-anatomy="V14.1"]', { timeout: 300000 }).catch(() => {});
  const head = await page.evaluate(() => {
    const s = document.querySelector('[data-anatomy="V14"]');
    return {
      address: s?.getAttribute("data-steward-record") ?? null,
      heading: s?.querySelector("h2, h3")?.textContent.trim() ?? "",
      count: Number(s?.querySelector("[data-steward-count]")?.getAttribute("data-steward-count") ?? NaN),
      empty: Number(s?.querySelector("[data-steward-empty]")?.getAttribute("data-steward-empty") ?? 0),
      order: s?.querySelector("[data-steward-order]")?.textContent.trim() ?? "",
      unread: !!s?.querySelector("[data-steward-unread]"),
    };
  });
  check(
    `${f.tag}: V14 names a steward under the curator's or owner's heading`,
    /^0x[0-9a-f]{40}$/i.test(head.address ?? "") && /^The (curator|owner)’s record$/.test(head.heading) && !head.unread,
    JSON.stringify({ address: head.address, heading: head.heading }),
  );

  const before = await rowsOf(page);
  const showAll = page.locator('[data-anatomy="V14"] [data-steward-show-all]');
  if (await showAll.count()) await showAll.first().click();
  await page.waitForTimeout(400);
  const rows = await rowsOf(page);
  check(`${f.tag}: the count line's n equals the rows`, rows.length === head.count, `${head.count} vs ${rows.length}`);

  // The rows before Show all, by the component's rule, from the full list.
  const holdsNothing = (r) => r.raw === "0";
  const expectBefore = rows.filter((r) => r.current || !holdsNothing(r)).filter((r, i) => i < LIMIT || r.current);
  const emptyCount = rows.filter((r) => holdsNothing(r) && !r.current).length;
  check(
    `${f.tag}: before Show all, the vaults that hold something (first ${LIMIT}, this vault kept); the empty count names the rest`,
    ids(before) === ids(expectBefore) && head.empty === emptyCount,
    JSON.stringify({ before: before.length, expected: expectBefore.length, empty: head.empty, emptyCount }),
  );

  const current = rows.filter((r) => r.current);
  check(
    `${f.tag}: one row is this vault`,
    current.length === 1 && current[0].key === f.key && /this vault/.test(current[0].text),
    current.map((r) => r.key).join(","),
  );

  // Order: this vault's token first, then A to Z; by held within each, an unread last.
  const lead = current[0]?.token;
  const groups = [];
  for (const r of rows) if (groups[groups.length - 1] !== r.token) groups.push(r.token);
  const rest = groups.slice(1);
  const grouped = new Set(groups).size === groups.length;
  const az = rest.every((g, i) => i === 0 || rest[i - 1].localeCompare(g, "en") <= 0);
  const byHeld = rows.every((r, i) => {
    const p = rows[i - 1];
    if (i === 0 || p.token !== r.token || r.raw == null) return true;
    return p.raw != null && BigInt(p.raw) >= BigInt(r.raw);
  });
  const read = rows.filter((r) => r.raw != null).length;
  check(
    `${f.tag}: this vault's token first, then A to Z, by held within each, unread last`,
    groups[0] === lead && grouped && az && byHeld && read > 0,
    JSON.stringify({ groups, byHeld, read }),
  );
  check(
    `${f.tag}: the order line names the rule`,
    /first, as this vault’s asset, then the others A to Z/.test(head.order),
    head.order,
  );

  // Each row against /vaults, by key and link.
  const missing = rows.filter((r) => !(r.key in index));
  const offLink = rows.filter((r) => r.href != null && index[r.key] !== r.href);
  const linked = rows.filter((r) => !r.current && r.href != null).length;
  check(
    `${f.tag}: every row is a /vaults row with the same link, and other rows are linked`,
    missing.length === 0 && offLink.length === 0 && linked > 0,
    JSON.stringify({
      missing: missing.map((r) => r.key),
      offLink: offLink.map((r) => `${r.href} / ${index[r.key]}`),
      linked,
    }),
  );

  // V14.1, branching on what the page states.
  const bd = await page.evaluate(() => {
    const s = document.querySelector('[data-anatomy="V14"] [data-anatomy="V14.1"]');
    const attr = (sel, a) => s?.querySelector(sel)?.getAttribute(a) ?? null;
    return {
      present: !!s,
      unread: !!s?.hasAttribute("data-bad-debt-unread"),
      count: Number(attr("[data-bad-debt-count]", "data-bad-debt-count") ?? NaN),
      large: attr("[data-bad-debt-large]", "data-bad-debt-large"),
      none: !!s?.querySelector("[data-bad-debt-none]"),
      small: Number(attr("[data-bad-debt-small]", "data-bad-debt-small") ?? 0),
      reads: Number(s?.getAttribute("data-bad-debt-reads") ?? 0),
      rows: s?.querySelectorAll("[data-bad-debt-episode]").length ?? 0,
      noLiquidation: /^No liquidation left bad debt/.test(
        s?.querySelector("[data-bad-debt-count]")?.textContent.trim() ?? "",
      ),
    };
  });
  // No episode at all (the curator left the markets that had bad debt): the "No
  // liquidation" line, no rows, and nothing further to check on this fixture.
  if (bd.present && !bd.unread && bd.count === 0) {
    check(
      `${f.tag}: no bad-debt liquidation: the No liquidation line and no rows`,
      bd.noLiquidation && bd.rows === 0 && bd.large == null && !bd.none,
      JSON.stringify(bd),
    );
    await page.close();
    continue;
  }
  check(
    `${f.tag}: V14.1 sits in V14 and answered with at-block reads`,
    bd.present && !bd.unread && bd.count > 0 && bd.reads > 0,
    JSON.stringify({ count: bd.count, reads: bd.reads }),
  );
  const shown = await episodesOf(page);
  const bdAll = page.locator('[data-anatomy="V14.1"] [data-bad-debt-show-all]');
  // "Show all n": the n it states, or the rows already shown where there is no button.
  const statedAll = (await bdAll.count())
    ? Number((await bdAll.first().textContent()).replace(/[^0-9]/g, ""))
    : shown.length;
  if (await bdAll.count()) await bdAll.first().click();
  await page.waitForTimeout(400);
  const all = await episodesOf(page);
  const reaches = (e) => e.ppm != null && e.ppm >= ONE_BP_PPM;
  const largeRows = all.filter(reaches);
  const smallRows = all.filter((e) => e.ppm != null && e.ppm < ONE_BP_PPM);
  const noShare = all.filter((e) => e.ppm == null);
  const distinctLarge = new Set(largeRows.map((e) => e.key)).size;
  if (largeRows.length > 0) {
    withLarge += 1;
    check(
      `${f.tag}: the rows at 0.01% or more name data-bad-debt-large liquidations, and the rows before Show all are the first ${LIMIT} of them`,
      Number(bd.large) === distinctLarge && !bd.none && epIds(shown) === epIds(largeRows.slice(0, LIMIT)),
      JSON.stringify({ large: bd.large, distinctLarge, shown: shown.length, largeRows: largeRows.length }),
    );
  } else {
    check(
      `${f.tag}: no row at 0.01% or more: the None line, no count of them, no row before Show all`,
      bd.none && bd.large == null && shown.length === 0,
      JSON.stringify({ none: bd.none, large: bd.large, shown: shown.length }),
    );
  }
  check(
    `${f.tag}: Show all adds the rest: data-bad-debt-small under 0.01%, rows with no share counted apart`,
    shown.length === Math.min(largeRows.length, LIMIT) && smallRows.length === bd.small && all.length === statedAll,
    JSON.stringify({
      shown: shown.length,
      all: all.length,
      large: largeRows.length,
      small: smallRows.length,
      stated: bd.small,
      noShare: noShare.length,
      statedAll,
    }),
  );
  const keys = new Set(rows.map((r) => r.key));
  const stray = all.filter((e) => !keys.has(e.vault));
  check(
    `${f.tag}: every episode's vault is a row of the record`,
    stray.length === 0,
    stray.map((e) => e.vault).join(","),
  );
  await page.close();
}
check("at least one fixture has bad debt at 0.01% of a vault or more", withLarge > 0, `${withLarge}`);

// Maple: the pool delegate's record, no bad-debt list.
if (maplePath) {
  const page = await open(maplePath, '[data-anatomy="V14"]');
  const m = await page.evaluate(() => {
    const s = document.querySelector('[data-anatomy="V14"]');
    return {
      heading: s?.querySelector("h2, h3")?.textContent.trim() ?? "",
      rows: s?.querySelectorAll("[data-steward-vault]").length ?? 0,
      only: !!s?.querySelector("[data-steward-only]"),
      v141: !!document.querySelector('[data-anatomy="V14.1"]'),
    };
  });
  check(
    `maple ${maplePath.split("/").pop().slice(0, 10)}: the pool delegate's record, no V14.1`,
    m.heading === "The pool delegate’s record" && (m.rows > 0 || m.only) && !m.v141,
    JSON.stringify(m),
  );
  await page.close();
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures || checked === 0 ? 1 : 0);
