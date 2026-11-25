#!/usr/bin/env node
// The vault comparison, /vaults/compare (anatomy E1, E1.1, E1.2, E4; rails-ops TO-DO-ui-jobs
// 553 door 3, 779): the search-fed picker, the Differences table and the full record, each
// figure in its receipt, the holder donut, the two widths, and keys the index does not hold.
// The rosters' rows and the asset step's cards no longer choose vaults (E2, E3 retired).
//
// Expectations come from outside the code under test where they can: each column's link
// and live holder count are read off the vault's roster row (`data-vault-row`, its link,
// `data-holders-live`), and Differences is checked against the facts the record prints.
// ----------------------------------------------------------------------------
// Fixtures (a fixture that is gone is a FAIL): two MetaMorpho USDC vaults on Ethereum
// (Steakhouse USDC, Gauntlet USDC Prime), Aave's static aToken for USDC and the Umbrella
// stake on it (asset waEthUSDC). FIFTH is another MetaMorpho Ethereum vault.
//
// Checks:
//   1. The rosters at 1440px draw no Compare: no ⋮ entry, no tick, no bar; the asset step's
//      cards carry no tick. The picker (E1.1) at 1440px: two slots and "Add a vault";
//      Compare aria-disabled under two picks, described by "Pick two to four vaults.";
//      typing "Steakhouse USDC" offers the Ethereum vault (Morpho on Ethereum is in the
//      search index); a pick fills the slot, × clears it and focuses its field; a picked
//      vault is not offered again; four slots and no fifth; Compare writes `?v=` in slot
//      order and the page draws those columns, the picker filled from `?v=`.
//   2. The direct URL with all four: four columns in `?v=` order, each name linking the
//      vault's page under its protocol, the same href as its roster row, answering 200; no
//      sort control and no `?sort=`; the page carries receipts and the profile menu's switch
//      arms it.
//   3. Differences (E1.2): Asset and Family differ for these four and are listed; every row
//      listed has two values that differ in the record's text or the figures; Total assets,
//      Share price, Holders and Fees cells carry a receipt where a figure is printed; the
//      same two MetaMorpho vaults alone list no Family row.
//   4. The holder donut, each column (E4): `data-compare-donut` equals the roster row's live
//      holders; slices unique, largest first, "others" last; shares sum to 100% within the
//      flooring; each slice its own fill; the key lists the same slices.
//   5. 390px and 1440px: no sideways scroll; at 390px the phone layout shows and the tables
//      do not, its vault list in `?v=` order.
//   6. Keys the index does not hold: an unknown address is named and the rest compare; a
//      malformed key with one good vault names it and draws the picker alone; no `?v=` draws
//      the picker alone; an upper-case and a repeated key read as one vault; a fifth key is
//      dropped; a malformed key ahead of four takes no place; at 390px the not-found line
//      causes no sideways scroll.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-vault-compare.mjs

import { chromium } from "playwright";
import { armInspector } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const WAIT = 180000;

// ── Fixtures ───────────────────────────────────────────────────────────────
const FIXTURES = {
  steakhouse: { chainId: 1, address: "0xbeef01735c132ada46aa9aa4c54623caa92a64cb" }, // Steakhouse USDC, MetaMorpho
  gauntlet: { chainId: 1, address: "0xdd0f28e19c1780eb6396170735d45153d261490d" }, // Gauntlet USDC Prime, MetaMorpho
  stata: { chainId: 1, address: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e" }, // static aEthUSDC
  umbrella: { chainId: 1, address: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6" }, // Umbrella stake waEthUSDC
};
const FIFTH = { chainId: 1, address: "0x974c8fbf4fd795f66b85b73ebc988a51f1a040a9" }; // a fifth roster row
const UNKNOWN = "1:0x000000000000000000000000000000000000dead"; // well-formed, not a vault
const MALFORMED = "1:0xnotanaddress";
const ASSET_STEP = "/start/asset/stablecoins/usdc";

const keyOf = (f) => `${f.chainId}:${f.address.toLowerCase()}`;
const [A, B, C, D] = Object.values(FIXTURES).map(keyOf);
const ALL = [A, B, C, D];
const compareUrl = (keys, extra = "") => `${BASE}/vaults/compare?v=${keys.join(",")}${extra}`;

let failures = 0;
let checks = 0;
function check(name, cond, detail = "") {
  checks++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const noScroll = (page) =>
  page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth }));

/** The page's columns as drawn: the attribute, the table's head, the phone list, and each cell's text. */
const readColumns = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-compare-columns]");
    const table = root?.querySelector('[data-compare-table="record"]');
    const phone = root?.querySelector("ol[data-compare-phone]");
    const cells = {};
    for (const tr of table?.querySelectorAll("tr[data-compare-row]") ?? []) {
      for (const td of tr.querySelectorAll("td[data-compare-cell]")) {
        const k = td.getAttribute("data-compare-cell");
        cells[k] ??= {};
        cells[k][tr.getAttribute("data-compare-row")] = td.innerText.replace(/\s+/g, " ").trim();
      }
    }
    return {
      attr: root?.getAttribute("data-compare-columns")?.split(",") ?? [],
      head: [...(table?.querySelectorAll("th[data-compare-column]") ?? [])].map((e) =>
        e.getAttribute("data-compare-column"),
      ),
      phone: [...(phone?.querySelectorAll("[data-compare-column]") ?? [])].map((e) =>
        e.getAttribute("data-compare-column"),
      ),
      links: [...(table?.querySelectorAll("th[data-compare-column]") ?? [])].map((th) => ({
        key: th.getAttribute("data-compare-column"),
        href: th.querySelector("a[data-compare-vault-link]")?.getAttribute("href") ?? null,
        linkKey: th.querySelector("a[data-compare-vault-link]")?.getAttribute("data-compare-vault-link") ?? null,
      })),
      cells,
    };
  });

const browser = await chromium.launch();

// ── 1. No Compare on the rows; the picker ──────────────────────────────────
const ROSTERS = ["/ethereum/morpho/vaults?show=all", "/ethereum/aave-v3/vaults?show=all"];
const index = {};
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const href of ROSTERS) {
    await page.goto(`${BASE}${href}`, NAV);
    await page.locator("[data-vault-row]").first().waitFor({ timeout: WAIT });
    await page.waitForTimeout(1500);
    const leftover = await page.evaluate(
      () =>
        document.querySelectorAll("[data-vault-row] [data-row-menu], [data-compare-tick], [data-compare-bar]").length,
    );
    check(`1a ${href}: no row ⋮, no tick, no bar`, leftover === 0, `${leftover} left`);
    for (const f of [...Object.values(FIXTURES), FIFTH]) {
      const k = keyOf(f);
      if (index[k]) continue;
      const row = page.locator(`[data-vault-row="${f.address}"]`).first();
      if ((await row.count()) === 0) continue;
      index[k] = await row.evaluate((e) => ({
        href: e.getAttribute("href") ?? e.querySelector("a[href]")?.getAttribute("href") ?? null,
        live: e.getAttribute("data-holders-live"),
      }));
    }
  }
  for (const f of [...Object.values(FIXTURES), FIFTH]) check(`1b ${keyOf(f)} is a roster row`, !!index[keyOf(f)]);

  await page.goto(`${BASE}${ASSET_STEP}`, NAV);
  await page.locator("[data-asset-card]").first().waitFor({ timeout: WAIT });
  await page.waitForTimeout(1000);
  check(
    `1c ${ASSET_STEP}: the cards carry no tick and the step no bar`,
    (await page.locator("[data-compare-tick], [data-compare-bar]").count()) === 0,
  );

  await page.goto(`${BASE}/vaults/compare`, NAV);
  const picker = page.locator("[data-compare-picker]");
  await picker.waitFor({ timeout: WAIT });
  await page.waitForTimeout(1000);
  const slots = () => page.locator("[data-compare-slot]").count();
  const go = page.locator("[data-compare-go]");
  check(
    "1d the picker opens with two slots, Add a vault, and Compare disabled",
    (await slots()) === 2 &&
      (await page.locator("[data-compare-add]").count()) === 1 &&
      (await go.getAttribute("aria-disabled")) === "true" &&
      ((await page.locator(`#${await go.getAttribute("aria-describedby")}`).textContent()) ?? "").includes(
        "Pick two to four",
      ),
    `${await slots()} slots`,
  );
  /** Types into slot `n` and returns the offered keys. */
  const offer = async (n, text) => {
    const input = page.locator(`[data-compare-input="${n}"]`);
    await input.click();
    await input.fill(text);
    await page
      .locator("[data-compare-option]")
      .first()
      .waitFor({ timeout: 60000 })
      .catch(() => {});
    return page
      .locator("[data-compare-option]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-compare-option")));
  };
  const choose = async (k) => {
    await page.locator(`[data-compare-option="${k}"]`).click();
    await page.waitForTimeout(150);
  };
  let offered = await offer(1, "Steakhouse USDC");
  check(
    "1e Steakhouse USDC on Ethereum is offered (Morpho on Ethereum is in the index)",
    offered.includes(A),
    offered.join(","),
  );
  if (offered.includes(A)) await choose(A);
  check("1f a pick fills its slot", (await page.locator(`[data-compare-pick="${A}"]`).count()) === 1);
  offered = await offer(2, "Steakhouse USDC");
  check("1g a picked vault is not offered again", offered.length > 0 && !offered.includes(A), offered.join(","));
  await page.keyboard.press("Escape");
  await page.locator(`[data-compare-input="2"]`).fill("");
  for (const [n, f, q] of [
    [2, FIXTURES.gauntlet, "Gauntlet USDC Prime"],
    [3, FIXTURES.stata, FIXTURES.stata.address],
    [4, FIXTURES.umbrella, FIXTURES.umbrella.address],
  ]) {
    if ((await slots()) < n) await page.locator("[data-compare-add]").click();
    const got = await offer(n, q);
    const k = keyOf(f);
    check(`1h slot ${n}: ${q.slice(0, 20)} offers ${k.slice(0, 12)}`, got.includes(k), got.join(","));
    if (got.includes(k)) await choose(k);
  }
  check(
    "1i four slots, no fifth: Add a vault is gone",
    (await slots()) === 4 && (await page.locator("[data-compare-add]").count()) === 0,
  );
  await page.locator(`[data-compare-clear="${C}"]`).click();
  await page.waitForTimeout(150);
  check(
    "1j × clears a pick, and the focus goes to the slot's field",
    (await page.locator(`[data-compare-pick="${C}"]`).count()) === 0 &&
      (await page.evaluate(() => document.activeElement?.getAttribute("data-compare-input"))) === "3",
  );
  const got = await offer(3, FIXTURES.stata.address);
  if (got.includes(C)) await choose(C);
  check("1k Compare is enabled with picks", (await go.getAttribute("aria-disabled")) === "false");
  await Promise.all([page.waitForURL(/\/vaults\/compare\?v=/, { timeout: WAIT }), go.click()]);
  const v = new URL(page.url()).searchParams.get("v");
  check("1l Compare writes ?v= in slot order", v === ALL.join(","), v ?? "");
  await page.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
  const cols = await readColumns(page);
  const filled = await page
    .locator("[data-compare-pick]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-compare-pick")));
  check(
    "1m it draws those columns, the picker filled from ?v=",
    cols.attr.join() === ALL.join() && filled.join() === ALL.join(),
    `${cols.attr.join(",")} | ${filled.join(",")}`,
  );
  await ctx.close();
}

// ── 2. The direct URL ──────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const res = await page.goto(compareUrl(ALL), NAV);
  check("2a the direct URL answers 200", res?.status() === 200, String(res?.status()));
  await page.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
  const cols = await readColumns(page);
  check(
    "2b four columns in ?v= order, the head the same",
    cols.attr.join() === ALL.join() && cols.head.join() === ALL.join(),
    cols.head.join(","),
  );
  for (const l of cols.links) {
    const want = index[l.key]?.href;
    check(
      `2c ${l.key} links its vault's page under its protocol`,
      l.linkKey === l.key &&
        /^\/(ethereum|base)\/(morpho|aave|yearn|maple)\/(vaults|pools)\//.test(l.href ?? "") &&
        l.href === want,
      `${l.href} (roster ${want})`,
    );
    if (l.href) {
      const r = await fetch(`${BASE}${l.href}`, { signal: AbortSignal.timeout(300000) }).catch((e) => ({
        status: String(e),
      }));
      check(`2d ${l.href} answers 200`, r.status === 200, String(r.status));
    }
  }
  check("2e no sort control", (await page.locator("[data-compare-sort], [data-compare-sort-note]").count()) === 0);
  const marks = await page
    .locator("[data-compare-columns] [data-prov-covered], [data-compare-columns] .prov-locate-box")
    .count();
  const uncovered = await page.locator("[data-prov-uncovered]").count();
  check(
    "2f the figures carry receipts, and the tripwire finds none uncovered",
    marks > 0 && uncovered === 0,
    `${marks} receipt spans, ${uncovered} uncovered`,
  );
  const armed = await armInspector(page);
  const picks = await page.locator("[data-compare-columns] [data-prov-pickable]").count();
  check("2g the profile menu's switch arms the page", armed && picks > 0, `${picks} pickable values`);
  if (armed) await page.keyboard.press("Escape");

  // ── 3. Differences ──
  const diff = await page.evaluate(() => {
    const sec = document.querySelector('[data-anatomy="E1.2"]');
    const table = sec?.querySelector('[data-compare-table="differences"]');
    const rows = {};
    for (const tr of table?.querySelectorAll("tr[data-compare-row]") ?? []) {
      rows[tr.getAttribute("data-compare-row")] = [...tr.querySelectorAll("td[data-compare-cell]")].map((td) => ({
        text: td.innerText.replace(/\s+/g, " ").trim(),
        receipt: !!td.querySelector("[data-prov-covered], .prov-locate-box"),
      }));
    }
    return { attr: sec?.getAttribute("data-compare-differences") ?? "", rows };
  });
  const keys = Object.keys(diff.rows);
  check(
    "3a Asset and Family differ for these four and are listed",
    keys.includes("asset") && keys.includes("family") && diff.attr === keys.join(","),
    diff.attr,
  );
  check(
    "3b every listed row has values that differ",
    keys.every((k) => new Set(diff.rows[k].map((c) => c.text)).size > 1),
    keys.filter((k) => new Set(diff.rows[k].map((c) => c.text)).size <= 1).join(",") || "all differ",
  );
  for (const k of ["total-assets", "share-price", "holder-count", "fees"].filter((k) => diff.rows[k])) {
    const printed = diff.rows[k].filter((c) => /\d/.test(c.text));
    check(
      `3c ${k}: each printed figure carries a receipt`,
      printed.length > 0 && printed.every((c) => c.receipt),
      diff.rows[k].map((c) => `${c.text.slice(0, 24)}${c.receipt ? " ✓" : ""}`).join(" | "),
    );
  }
  await page.close();
  const two = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await two.goto(compareUrl([A, B]), NAV);
  await two.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
  const attr = (await two.locator('[data-anatomy="E1.2"]').getAttribute("data-compare-differences")) ?? "";
  check(
    "3d two MetaMorpho USDC vaults list no Asset, Family or Chain row",
    !/(^|,)(asset|family|chain)(,|$)/.test(attr),
    attr,
  );
  await two.close();
}

// ── 4. The holder donut ────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(compareUrl(ALL), NAV);
  await page.locator('[data-compare-table="record"] [data-compare-donut]').first().waitFor({ timeout: WAIT });
  const donuts = await page.evaluate(() =>
    [...document.querySelectorAll('[data-compare-table="record"] td[data-compare-cell]')]
      .filter((td) => td.querySelector("[data-compare-donut]"))
      .map((td) => {
        const d = td.querySelector("[data-compare-donut]");
        return {
          key: td.getAttribute("data-compare-cell"),
          anatomy: d.getAttribute("data-anatomy"),
          live: d.getAttribute("data-compare-donut"),
          slices: [...d.querySelectorAll("[data-breakdown-slice]")].map((s) => ({
            key: s.getAttribute("data-breakdown-slice"),
            fill: getComputedStyle(s).fill,
            title: s.querySelector("title")?.textContent ?? "",
            seg: s.getAttribute("data-seg"),
          })),
          rows: [...d.querySelectorAll("ul > li")].map((li) => ({
            swatch: getComputedStyle(li.querySelector("span")).backgroundColor,
            text: li.innerText.replace(/\s+/g, " ").trim(),
          })),
        };
      }),
  );
  check(
    "4a every column draws a donut (four census families)",
    donuts.length === 4,
    donuts.map((d) => d.key).join(","),
  );
  let wired = false;
  for (const d of donuts) {
    const tag = d.key.slice(0, 10);
    check(
      `4b ${tag} E4, live count equals its roster row`,
      d.anatomy === "E4" && d.live === index[d.key]?.live,
      `${d.live} vs ${index[d.key]?.live}`,
    );
    const shares = d.slices.map((s) => {
      const m = s.title.match(/: ([\d.]+)% of the vault$/);
      return m ? Number(m[1]) : NaN;
    });
    const sum = shares.reduce((a, x) => a + x, 0);
    const keys = d.slices.map((s) => s.key);
    const others = keys.indexOf("others");
    check(
      `4c ${tag} slices: unique keys, largest first, others last`,
      d.slices.length >= 2 &&
        new Set(keys).size === keys.length &&
        (others === -1 || others === keys.length - 1) &&
        shares.slice(0, others === -1 ? undefined : others).every((x, i, a) => i === 0 || a[i - 1] >= x),
      keys.map((k, i) => `${k === "others" ? "others" : k.slice(0, 6)} ${shares[i]}%`).join(", "),
    );
    // Each title floors to 0.1%: the sum is under 100 by less than 0.1 a slice.
    check(
      `4d ${tag} shares sum to about 100%`,
      shares.every(Number.isFinite) && sum <= 100.05 && sum >= 100 - 0.1 * d.slices.length,
      sum.toFixed(1),
    );
    check(
      `4e ${tag} each slice its own fill`,
      new Set(d.slices.map((s) => s.fill)).size === d.slices.length,
      d.slices.map((s) => s.fill).join(" "),
    );
    check(
      `4f ${tag} the key lists each slice with its swatch and share`,
      d.rows.length === d.slices.length &&
        d.rows.every((r, i) => r.swatch === d.slices[i].fill && r.text.endsWith(`${shares[i]}%`)),
      d.rows.map((r) => r.text).join(" | "),
    );
    if (d.slices.some((s) => s.seg != null)) wired = true;
  }
  if (wired) {
    const slice = page
      .locator('[data-compare-table="record"] [data-compare-donut] [data-breakdown-slice][data-seg]')
      .first();
    await slice.hover();
    await page.waitForTimeout(400);
    const dim = await page.evaluate(() => {
      const d = document.querySelector('[data-compare-table="record"] [data-compare-donut]');
      return [...d.querySelectorAll("[data-breakdown-slice]")].map((s) => Number(getComputedStyle(s).opacity));
    });
    check("4g hovering a slice dims the others", dim[0] === 1 && dim.slice(1).every((o) => o < 1), dim.join(","));
  } else {
    console.log(
      "NOTE  4g the donut's slices carry no data-seg: hover linking of slice and key is not wired (ShareDonut has no scope here)",
    );
  }
  await page.close();
}

// ── 5. Widths ──────────────────────────────────────────────────────────────
for (const w of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(compareUrl(ALL), NAV);
  await page.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
  const s = await noScroll(page);
  check(`5a ${w}px no sideways scroll`, s.sw <= s.cw, `${s.sw} vs ${s.cw}`);
  const tableShown = await page.locator('[data-compare-table="record"]').isVisible();
  const phoneShown = await page.locator('[data-compare-phone="record"]').isVisible();
  check(
    `5b ${w}px ${w === 390 ? "the phone layout, no table" : "the table, no phone layout"}`,
    w === 390 ? phoneShown && !tableShown : tableShown && !phoneShown,
    `table ${tableShown}, phone ${phoneShown}`,
  );
  if (w === 390) {
    const c = await readColumns(page);
    check("5c 390px the vault list in ?v= order", c.phone.join() === ALL.join(), c.phone.join(","));
  }
  await page.close();
}

// ── 6. Keys the index does not hold ────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const open = async (url) => {
    const r = await page.goto(url, NAV);
    await page.locator("[data-compare-page]").waitFor({ timeout: WAIT });
    return page.evaluate((status) => {
      const nf = document.querySelector("[data-compare-not-found]");
      return {
        status,
        notFound: nf?.getAttribute("data-compare-not-found") ?? null,
        notFoundText: nf?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        pickerOnly:
          !!document.querySelector("[data-compare-picker]") && !document.querySelector("[data-compare-columns]"),
        cols: document.querySelector("[data-compare-columns]")?.getAttribute("data-compare-columns")?.split(",") ?? [],
      };
    }, r?.status());
  };

  let g = await open(compareUrl([A, UNKNOWN, B]));
  check(
    "6a an unknown address is named, the other two compare",
    g.status === 200 &&
      g.notFound === UNKNOWN &&
      g.notFoundText.includes(UNKNOWN) &&
      g.cols.length === 2 &&
      !g.pickerOnly,
    JSON.stringify(g),
  );
  g = await open(compareUrl([A, MALFORMED]));
  check(
    "6b a malformed key is named; one vault left draws the picker alone",
    g.status === 200 && g.notFound === MALFORMED && g.pickerOnly && g.cols.length === 0,
    JSON.stringify(g),
  );
  g = await open(`${BASE}/vaults/compare`);
  check(
    "6c no ?v= draws the picker alone and names nothing",
    g.status === 200 && g.pickerOnly && g.notFound == null,
    JSON.stringify(g),
  );
  const upper = `1:0x${FIXTURES.steakhouse.address.slice(2).toUpperCase()}`;
  g = await open(compareUrl([upper, A, B]));
  check(
    "6d an upper-case and a repeated key read as one vault",
    g.status === 200 && g.notFound == null && g.cols.length === 2,
    JSON.stringify(g),
  );
  g = await open(compareUrl([MALFORMED, ...ALL]));
  check(
    "6g a malformed key is named and takes no place: the four after it compare",
    g.status === 200 && g.notFound === MALFORMED && g.cols.join() === ALL.join(),
    JSON.stringify(g),
  );
  g = await open(compareUrl([...ALL, keyOf(FIFTH)]));
  check(
    "6e a fifth key is dropped: four columns",
    g.status === 200 && g.cols.length === 4 && !g.cols.includes(keyOf(FIFTH)),
    JSON.stringify(g),
  );
  await page.close();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(compareUrl([A, UNKNOWN, B]), NAV);
  await phone.locator("[data-compare-not-found]").waitFor({ timeout: WAIT });
  const s = await noScroll(phone);
  check("6f 390px an unknown key's line causes no sideways scroll", s.sw <= s.cw, `${s.sw} vs ${s.cw}`);
  await phone.close();
}

await browser.close();
if (checks === 0) {
  console.log("\nCRASH: no checks ran");
  process.exit(2);
}
console.log(failures === 0 ? `\nALL PASS (${checks})` : `\n${failures} FAILURE(S) of ${checks}`);
process.exit(failures === 0 ? 0 : 1);
