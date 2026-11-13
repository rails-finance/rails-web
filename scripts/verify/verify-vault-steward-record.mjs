#!/usr/bin/env node
// The steward's record (anatomy V14) and bad debt in its vaults (V14.1), rails-ops
// TO-DO-ui-jobs 554 piece C.
// ----------------------------------------------------------------------------
// V14 lists the vaults the page's curator, owner or pool delegate runs, from the /vaults
// directory; V14.1 lists the liquidations that left bad debt in markets those vaults supply,
// each with the vault's part and that part's share of the vault at the block before.
//
// Expectations come from outside the section where they can: each steward row's link and
// total assets are read off the vault's /vaults row (`data-vault-row`,
// `data-total-assets-raw`), and the order is checked against the asset and held figures
// the rows print.
//
// Fixtures: Adpend's USDC vault on Ethereum (bad debt, three episodes at 0.01% of the vault
// or more), Lumetra on Base (bad debt, none at 0.01%), and the first Maple pool on /vaults
// (the pool delegate's record, no V14.1).
//
// Checks, per MetaMorpho fixture:
//   1. V14 is on the page with a steward address, headed "The curator's record" or "The
//      owner's record"; the count line's n equals the rows after "Show all", and "Show all"
//      adds exactly the k vaults `data-steward-empty` names.
//   2. Exactly one row is the page's vault, marked "this vault".
//   3. Order: the page's vault's asset first, then the other assets A to Z, by held amount
//      within each asset; the order line says so.
//   4. Each row links its vault's /vaults href, and its held raw equals that /vaults row's
//      total assets.
//   5. V14.1 sits in V14; its count line names the liquidations; the rows before "Show all"
//      are the ones at 0.01% of the vault or more, `data-bad-debt-large` of them; "Show all"
//      adds `data-bad-debt-small` rows, each under 0.01%; every episode's vault is a row of
//      the record; the at-block read count is above zero.
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
    badDebt: "large",
  },
  {
    tag: "lumetra (base)",
    path: "/base/morpho/vaults/0x7fd62b11654f0dd41ad30edda8174366e225e712",
    key: "8453:0x7fd62b11654f0dd41ad30edda8174366e225e712",
    badDebt: "none",
  },
];
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

// The directory: every /vaults row's href and total assets, by key. /vaults shows the
// vaults with 100+ holders by default and keeps the empty ones behind a disclosure; the
// record lists every vault, so both are opened. Read after each fixture's page, so the two
// read the same cached directory.
const CHAIN = { ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10 };
async function readDirectory() {
  const dir = await open("/vaults", "[data-vault-row]");
  await dir
    .locator("button", { hasText: /^Shown/ })
    .first()
    .click();
  await dir.getByText("Every vault", { exact: true }).last().click();
  await dir.waitForTimeout(1000);
  const empty = dir.locator("[data-empty-group] > button");
  if ((await empty.count()) && (await empty.first().getAttribute("aria-expanded")) !== "true")
    await empty.first().click();
  await dir.waitForTimeout(1000);
  const rows = await dir.evaluate(() =>
    [...document.querySelectorAll("[data-vault-row]")].map((r) => ({
      address: r.getAttribute("data-vault-row").toLowerCase(),
      href:
        r.querySelector("[data-vault-link]")?.getAttribute("href") ??
        r.querySelector("a[href]")?.getAttribute("href") ??
        null,
      raw: r.getAttribute("data-total-assets-raw"),
    })),
  );
  await dir.close();
  return Object.fromEntries(
    rows.map((r) => [`${CHAIN[r.href?.split("/")[1]] ?? "?"}:${r.address}`, { href: r.href, raw: r.raw }]),
  );
}
const first = await readDirectory();
const maplePath = Object.values(first)
  .map((v) => v.href)
  .find((h) => h?.startsWith("/ethereum/maple/pools/"));
check(
  "/vaults: the directory answers, with a Maple pool among its rows",
  Object.keys(first).length > 0 && !!maplePath,
  `${Object.keys(first).length} rows`,
);

/** The record's rows, in order: key, asset, held raw, href, current. */
const rowsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-anatomy="V14"] [data-steward-vault]')].map((r) => ({
      key: r.getAttribute("data-steward-vault").toLowerCase(),
      asset: r.querySelector('[data-label="Asset"]')?.textContent.trim() ?? [...r.children][2]?.textContent.trim(),
      raw: r.querySelector('[data-cell="steward-held"]')?.getAttribute("data-raw") ?? null,
      href: r.querySelector("a[href]")?.getAttribute("href") ?? r.getAttribute("data-href"),
      current: r.hasAttribute("data-steward-current"),
      text: r.textContent,
    })),
  );

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
  check(
    `${f.tag}: Show all adds exactly the vaults that hold nothing`,
    rows.length - before.length === head.empty || (head.empty === 0 && rows.length > before.length),
    JSON.stringify({ before: before.length, after: rows.length, empty: head.empty }),
  );
  const current = rows.filter((r) => r.current);
  check(
    `${f.tag}: one row is this vault`,
    current.length === 1 && current[0].key === f.key && /this vault/.test(current[0].text),
    current.map((r) => r.key).join(","),
  );

  // Order: this vault's asset first, then A to Z; by held, largest first, within each.
  const first = current[0]?.asset;
  const groups = [];
  for (const r of rows) if (groups[groups.length - 1] !== r.asset) groups.push(r.asset);
  const rest = groups.slice(1);
  const grouped = new Set(groups).size === groups.length;
  const az = rest.every((g, i) => i === 0 || rest[i - 1].localeCompare(g, "en") <= 0);
  const byHeld = rows.every(
    (r, i) => i === 0 || rows[i - 1].asset !== r.asset || BigInt(rows[i - 1].raw ?? "0") >= BigInt(r.raw ?? "0"),
  );
  check(
    `${f.tag}: this vault's asset first, then A to Z, by held within each`,
    groups[0] === first && grouped && az && byHeld,
    JSON.stringify({ groups, byHeld }),
  );
  check(
    `${f.tag}: the order line names the rule`,
    /first, as this vault’s asset, then the others A to Z/.test(head.order),
    head.order,
  );

  // Each row against its /vaults row.
  const index = await readDirectory();
  const off = rows.filter((r) => {
    const d = index[r.key];
    return !d || (r.href && d.href !== r.href) || (r.raw != null && d.raw != null && d.raw !== r.raw);
  });
  check(
    `${f.tag}: every row's link and held amount match its /vaults row`,
    off.length === 0,
    off.map((r) => `${r.key} ${r.href} ${r.raw} / ${index[r.key]?.href} ${index[r.key]?.raw}`).join("; "),
  );

  // V14.1.
  const bd = await page.evaluate(() => {
    const s = document.querySelector('[data-anatomy="V14"] [data-anatomy="V14.1"]');
    const eps = () => [...(s?.querySelectorAll("[data-bad-debt-episode]") ?? [])];
    return {
      present: !!s,
      unread: !!s?.hasAttribute("data-bad-debt-unread"),
      count: Number(s?.querySelector("[data-bad-debt-count]")?.getAttribute("data-bad-debt-count") ?? NaN),
      large: s?.querySelector("[data-bad-debt-large]")?.getAttribute("data-bad-debt-large") ?? null,
      none: !!s?.querySelector("[data-bad-debt-none]"),
      small: Number(s?.querySelector("[data-bad-debt-small]")?.getAttribute("data-bad-debt-small") ?? 0),
      reads: Number(s?.getAttribute("data-bad-debt-reads") ?? 0),
      shown: eps().map((e) => ({
        ppm: e.getAttribute("data-bad-debt-of-vault"),
        vault: e.getAttribute("data-bad-debt-vault"),
      })),
    };
  });
  check(
    `${f.tag}: V14.1 sits in V14 and answered`,
    bd.present && !bd.unread && bd.count > 0 && bd.reads > 0,
    JSON.stringify({ count: bd.count, reads: bd.reads }),
  );
  const atLeast = (e) => e.ppm != null && Number(e.ppm) >= ONE_BP_PPM;
  if (f.badDebt === "large") {
    check(
      `${f.tag}: the rows before Show all are the ones at 0.01% of the vault or more`,
      bd.large != null && bd.shown.length === Number(bd.large) && bd.shown.every(atLeast) && !bd.none,
      JSON.stringify({ large: bd.large, shown: bd.shown.map((e) => e.ppm) }),
    );
  } else {
    check(
      `${f.tag}: none at 0.01% of the vault: the line says so and no row shows before Show all`,
      bd.none && bd.large == null && bd.shown.length === 0,
      JSON.stringify({ none: bd.none, shown: bd.shown.length }),
    );
  }
  const bdAll = page.locator('[data-anatomy="V14.1"] [data-bad-debt-show-all]');
  if (await bdAll.count()) await bdAll.first().click();
  await page.waitForTimeout(400);
  const all = await page.evaluate(() =>
    [...document.querySelectorAll('[data-anatomy="V14.1"] [data-bad-debt-episode]')].map((e) => ({
      ppm: e.getAttribute("data-bad-debt-of-vault"),
      vault: e.getAttribute("data-bad-debt-vault").toLowerCase(),
    })),
  );
  const added = all.filter((e) => !atLeast(e));
  check(
    `${f.tag}: Show all adds the ${bd.small} rows under 0.01%`,
    all.length === bd.shown.length + bd.small && added.length === bd.small,
    JSON.stringify({ shown: bd.shown.length, after: all.length, small: bd.small }),
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
