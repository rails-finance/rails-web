#!/usr/bin/env node
// The vault comparison, /vaults/compare (anatomy E1–E4; rails-ops TO-DO-ui-jobs 553, door 3):
// choosing vaults with the Compare entry in a /vaults row's ⋮ (E2) and the compare bar (E3),
// the page's columns, its "Sort by", the holder donut (E4), the two widths, and keys the index
// does not hold. Like the index, the page owns no vault page and no receipts (decision 0028
// point 8): each column links the vault's page under its protocol, and the page draws no
// receipt and no inspector.
//
// Expectations come from outside the code under test where they can: each column's link,
// size, asset and live holder count are read off the vault's /vaults row (`data-vault-row`,
// `data-total-assets-raw`, `data-held-assets-raw`, `data-token`, `data-holders-live`), and the
// sort's order is checked against the figures the page prints in each column, parsed back.
// ----------------------------------------------------------------------------
// Fixtures (inputs below; a fixture that is gone is a FAIL): two MetaMorpho USDC vaults on
// Ethereum (Steakhouse USDC, Gauntlet USDC Prime), Aave's static aToken for USDC (no
// withdrawable share read, so it sorts last there), and the Umbrella stake on it (asset
// waEthUSDC, so Size sorts by asset first; a cooldown, so no withdrawable share either).
// FIFTH is any other /vaults row, for the refused fifth pick.
//
// Checks:
//   1. /vaults at 1440px: every fixture is a row; the ⋮ entry "Add to compare" ticks it
//      (E2), the bar (E3) appears at two and counts to three, the entry then reads
//      "Remove from compare"; a fifth pick is refused with the bar's line and the bar stays
//      at four; "Compare 3 vaults" lands on /vaults/compare with the three keys in `?v=`,
//      in pick order, and draws those three columns. The asset step
//      (/start/asset/stablecoins/usdc) carries a tick on every card and the same selection's
//      bar; "Clear" removes the bar.
//   2. The direct URL with all four: four columns, the thead order the same as
//      `data-compare-columns`; each name links the vault's page under its protocol, the
//      same href as its /vaults row, and that page answers 200; the page is `data-prov-exempt`
//      with no receipt span, no pickable value and no inspector control (/vaults, which has
//      receipts, is the control).
//   3. Sort by: Size pressed with no `?sort=`; each of the four presses presses only itself,
//      writes `?sort=` off the default, and orders the table's and the phone list's columns
//      as `data-compare-columns`. The order agrees with the figures: Size by asset A to Z
//      then held amount (from the /vaults rows), 30-day yield highest first, 90-day range
//      narrowest first (counting only vaults whose yield is above zero), share withdrawable
//      highest first; a vault with no figure after every vault with one. The range sort and
//      the mixed-asset Size sort say so. The four orders are not all the same. A load with
//      `?sort=withdrawable` draws that order; `?sort=bogus` falls back to Size.
//   4. The holder donut, each column: `data-compare-donut` equals the /vaults row's live
//      holders; slices carry `data-breakdown-slice` with unique keys, the largest first,
//      "others" last; the shares in their titles sum to 100% within the flooring; each
//      slice has its own fill; the key beside it lists the same slices with the same swatch
//      and share. Where slices carry `data-seg` (ShareDonut given a scope), hovering a slice
//      dims the others; where none do, that is said as a NOTE.
//   5. 390px and 1440px: no sideways scroll; at 390px the phone layout shows and the
//      table does not, its vault list in the sort's order.
//   6. Keys the index does not hold: an unknown address is named in
//      `data-compare-not-found` and the rest still compare; a malformed key with one good
//      vault names it and draws the too-few line linking /vaults (no sideways scroll at
//      390px); no `?v=` draws the too-few line and names nothing; an upper-case and a
//      repeated key read as one vault; a fifth key is dropped (four columns). Each answers 200.
//
// Proved it can fail (2026-11-12): with lib/vaults/compare.ts's yield comparator reversed
// (`desc(b…, a…)`), 3b went red:
//   FAIL  3b sort yield: order agrees with the figures — 0x6bf1 0.00% | 0xd4fa 4.20% | 0xdd0f 4.50% | 0xbeef 4.60%
// (reverted with git checkout).
//
// 6f found a defect on its first run (2026-11-12): the not-found line printed the key
// unbroken, and at 390px a 40-hex address ran the page to 420px. The line now breaks.
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
const FIFTH = { chainId: 1, address: "0x974c8fbf4fd795f66b85b73ebc988a51f1a040a9" }; // a fifth /vaults row
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

/** "4.6%" or "−3.2%" as a fraction. */
const pctOf = (t) => Number(t.replace("−", "-").replace(/,/g, "")) / 100;

/** The figures a column prints, parsed back from its cells. Null where it prints none. */
function figuresOf(cells) {
  const y = cells.yield ?? "";
  let yearly30 = null;
  let range = null;
  const ym = y.match(/^(−?[\d.,]+)% a year over the last \d+ days/);
  if (ym) yearly30 = pctOf(ym[1]);
  else if (/^0\.0% over \d+ days/.test(y)) yearly30 = 0;
  const rm = y.match(/earned between (−?[\d.,]+)% and (−?[\d.,]+)%/);
  if (rm && yearly30 != null && yearly30 > 0) range = pctOf(rm[2]) - pctOf(rm[1]);
  const w = cells.withdrawals ?? "";
  let withdrawable = null;
  const wm = w.match(/^([\d.,]+)% of the vault's assets (withdrawable|idle)/);
  if (wm) withdrawable = pctOf(wm[1]);
  else if (/^Withdrawals are paused/.test(w)) withdrawable = 0;
  const held = (cells.size ?? "").match(/Held [\d.,]+[KMBT]? (\S+) at the last read/);
  return { yearly30, range, withdrawable, heldAsset: held ? held[1] : null };
}

/** Is `vals` in order (dir 1 highest first, -1 lowest first) within `tol`, nulls last? */
function inOrder(vals, dir, tol) {
  const firstNull = vals.findIndex((v) => v == null);
  if (firstNull >= 0 && vals.slice(firstNull).some((v) => v != null)) return false;
  const nums = firstNull >= 0 ? vals.slice(0, firstNull) : vals;
  for (let i = 1; i < nums.length; i++) if (dir * (nums[i - 1] - nums[i]) < -tol) return false;
  return true;
}

/** The page's columns as drawn: the attribute, the table's head, the phone list, and each cell's text. */
const readColumns = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-compare-columns]");
    const table = root?.querySelector("[data-compare-table]");
    const phone = root?.querySelector("[data-compare-phone]");
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

// ── 1. Choosing on /vaults ─────────────────────────────────────────────────
const index = {};
let vaultsInspector = 0;
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/vaults`, NAV);
  await page.locator("[data-vault-row]").first().waitFor({ timeout: WAIT });
  // The profile menu's switch arms /vaults (ui-jobs 625); put down again at
  // once, so the picks below are row presses.
  vaultsInspector = (await armInspector(page)) ? 1 : 0;
  if (vaultsInspector) await page.keyboard.press("Escape");
  for (const f of [...Object.values(FIXTURES), FIFTH]) {
    const k = keyOf(f);
    const row = page.locator(`[data-vault-row="${f.address}"][data-chain="${f.chainId}"]`).first();
    const there = (await row.count()) > 0;
    check(`1a ${k} is a /vaults row`, there);
    if (!there) continue;
    index[k] = await row.evaluate((e) => ({
      href: e.getAttribute("href") ?? e.querySelector("a[href]")?.getAttribute("href") ?? null,
      held: e.getAttribute("data-held-assets-raw") || e.getAttribute("data-total-assets-raw") || "",
      token: e.getAttribute("data-token"),
      live: e.getAttribute("data-holders-live"),
    }));
  }

  const bar = page.locator("[data-compare-bar]");
  const pick = async (k) => {
    const f = [...Object.values(FIXTURES), FIFTH].find((x) => keyOf(x) === k);
    const row = page.locator(`[data-vault-row="${f.address}"][data-chain="${f.chainId}"]`).first();
    await row.locator("button[data-row-menu]").click();
    const item = page.locator(`[data-row-menu-list] [data-compare-tick="${k}"]`);
    await item.waitFor({ timeout: 10000 });
    const said = { label: norm(await item.textContent()), checked: await item.getAttribute("aria-checked") };
    await item.click();
    await page.waitForTimeout(200);
    return said;
  };
  const barCount = async () => ((await bar.count()) ? await bar.getAttribute("data-compare-bar") : null);

  if ([A, B, C, D, keyOf(FIFTH)].every((k) => index[k])) {
    const first = await pick(A);
    check(
      "1b the ⋮ entry reads Add to compare, unchecked",
      first.label === "Add to compare" && first.checked === "false",
      JSON.stringify(first),
    );
    check("1c one pick draws no bar", (await barCount()) == null, String(await barCount()));
    await pick(B);
    check("1d two picks draw the bar at 2", (await barCount()) === "2", String(await barCount()));
    await pick(C);
    const go = page.locator("[data-compare-go]");
    check(
      "1e three picks: the bar reads Compare 3 vaults",
      (await barCount()) === "3" && norm(await go.textContent()) === "Compare 3 vaults",
      `${await barCount()} "${norm(await go.textContent())}"`,
    );
    // Reopen A's menu: the entry now reads Remove, checked; Escape leaves it as it is.
    {
      const f = FIXTURES.steakhouse;
      await page
        .locator(`[data-vault-row="${f.address}"][data-chain="1"]`)
        .first()
        .locator("button[data-row-menu]")
        .click();
      const item = page.locator(`[data-row-menu-list] [data-compare-tick="${A}"]`);
      await item.waitFor({ timeout: 10000 });
      check(
        "1f a picked vault's entry reads Remove from compare, checked",
        norm(await item.textContent()) === "Remove from compare" &&
          (await item.getAttribute("aria-checked")) === "true" &&
          (await item.getAttribute("data-compare-checked")) === "",
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
    await pick(D);
    await pick(keyOf(FIFTH));
    const refused = page.locator("[data-compare-refused]");
    check(
      "1g a fifth pick is refused and the bar stays at 4",
      (await barCount()) === "4" &&
        (await refused.count()) === 1 &&
        norm(await refused.textContent()) === "Four vaults is the most one comparison holds.",
      `${await barCount()} "${(await refused.count()) ? norm(await refused.textContent()) : ""}"`,
    );
    await pick(D);
    check(
      "1h unpicking one: the bar at 3, the refusal gone",
      (await barCount()) === "3" && (await refused.count()) === 0,
    );
    const href = await go.getAttribute("href");
    await Promise.all([page.waitForURL(/\/vaults\/compare\?/, { timeout: WAIT }), go.click()]);
    const v = new URL(page.url()).searchParams.get("v");
    check(
      "1i the bar lands on /vaults/compare with the three keys in pick order",
      v === [A, B, C].join(","),
      `${href} → ${v}`,
    );
    await page.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
    const cols = await readColumns(page);
    check(
      "1j it draws those three columns",
      cols.attr.length === 3 && [A, B, C].every((k) => cols.attr.includes(k)),
      cols.attr.join(","),
    );

    // The asset step: the same selection, a tick on every card.
    await page.goto(`${BASE}${ASSET_STEP}`, NAV);
    await page.locator("[data-asset-card]").first().waitFor({ timeout: WAIT });
    const cards = await page.locator("[data-asset-card]").count();
    const ticks = await page.locator("[data-compare-tick][data-anatomy='E2']").count();
    check(`1k ${ASSET_STEP}: a tick on every card`, cards > 0 && ticks >= cards, `${ticks} ticks, ${cards} cards`);
    // The bar draws after hydration (the server's snapshot is empty).
    await bar.waitFor({ timeout: 30000 }).catch(() => {});
    check("1l the asset step shows the same selection's bar", (await barCount()) === "3", String(await barCount()));
    if (await bar.count()) {
      await page.locator("[data-compare-clear]").click();
      await page.waitForTimeout(200);
      check("1m Clear removes the bar", (await barCount()) == null);
    } else check("1m Clear removes the bar", false, "no bar to clear");
  } else {
    check("1b–1m picking needs every fixture on /vaults", false, "a fixture is missing");
  }
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
    "2b four columns, the head in the attribute's order",
    cols.attr.length === 4 && cols.head.join() === cols.attr.join(),
    cols.head.join(","),
  );
  for (const l of cols.links) {
    const want = index[l.key]?.href;
    check(
      `2c ${l.key} links its vault's page under its protocol`,
      l.linkKey === l.key &&
        /^\/(ethereum|base)\/(morpho|aave|yearn|maple)\/(vaults|pools)\//.test(l.href ?? "") &&
        l.href === want,
      `${l.href} (index ${want})`,
    );
    if (l.href) {
      const r = await fetch(`${BASE}${l.href}`, { signal: AbortSignal.timeout(300000) }).catch((e) => ({
        status: String(e),
      }));
      check(`2d ${l.href} answers 200`, r.status === 200, String(r.status));
    }
  }
  const prov = await page.evaluate(() => {
    const root = document.querySelector("[data-compare-page]");
    return {
      exempt: root?.getAttribute("data-prov-exempt") ?? "",
      anatomy: root?.getAttribute("data-anatomy"),
      marks:
        root?.querySelectorAll(".prov-locate-box, [data-prov-covered], [data-prov-pickable], [data-prov-inspect]")
          .length ?? -1,
    };
  });
  check("2e the page is E1 and data-prov-exempt", prov.anatomy === "E1" && prov.exempt.length > 0, prov.exempt);
  check("2f no receipt marks on the page's figures", prov.marks === 0, `${prov.marks} marks`);
  {
    // The switch on, the compare page does not arm (no route of the switch).
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(compareUrl(ALL), NAV);
    await p.evaluate(() => localStorage.setItem("rails-prov-inspector", "1"));
    await p.reload(NAV);
    await p.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
    await p.waitForTimeout(1500);
    const armedHere =
      (await p.locator("[data-prov-inspect-on]").count()) + (await p.locator("[data-prov-pickable]").count());
    await p.close();
    check(
      "2g the switch on, the page does not arm (the switch arms /vaults)",
      armedHere === 0 && vaultsInspector > 0,
      `compare ${armedHere}, /vaults ${vaultsInspector}`,
    );
  }

  // ── 3. Sort by ──
  const sortNote = page.locator("[data-compare-sort-note]");
  const pressed = async () =>
    page
      .locator("[data-compare-sort]")
      .evaluateAll((els) =>
        els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.getAttribute("data-compare-sort")),
      );
  check("3a Size pressed with no ?sort=", (await pressed()).join() === "size");
  const orders = {};
  const RULES = {
    size: null,
    yield: { fig: "yearly30", dir: 1, tol: 0.0005 },
    range: { fig: "range", dir: -1, tol: 0.0011 },
    withdrawable: { fig: "withdrawable", dir: 1, tol: 0.001 },
  };
  for (const s of ["yield", "range", "withdrawable", "size"]) {
    await page.locator(`[data-compare-sort="${s}"]`).click();
    await page.waitForTimeout(250);
    const c = await readColumns(page);
    orders[s] = c.attr.join(",");
    const q = new URL(page.url()).searchParams.get("sort");
    check(
      `3b sort ${s}: pressed alone, ?sort=${s === "size" ? "(none)" : s}, table and phone in the attribute's order`,
      (await pressed()).join() === s &&
        q === (s === "size" ? null : s) &&
        c.head.join() === c.attr.join() &&
        c.phone.join() === c.attr.join(),
      `pressed ${(await pressed()).join()}, ?sort=${q}`,
    );
    if (s === "size") {
      // From outside: the /vaults rows' asset and held amount.
      const want = [...c.attr].sort(
        (a, b) =>
          index[a].token.localeCompare(index[b].token, "en-US") ||
          (BigInt(index[b].held) > BigInt(index[a].held) ? 1 : BigInt(index[b].held) < BigInt(index[a].held) ? -1 : 0),
      );
      const assetsAgree = c.attr.every((k) => figuresOf(c.cells[k]).heldAsset === index[k].token);
      check(
        "3b sort size: order agrees with the figures — asset A to Z, then held",
        c.attr.join() === want.join() && assetsAgree,
        c.attr.map((k) => `${index[k].token} ${index[k].held}`).join(" | "),
      );
      check(
        "3c the mixed-asset Size sort says so",
        norm(await sortNote.textContent()) ===
          "Vaults in different assets sort by asset first, then by size within each.",
        norm(await sortNote.textContent()),
      );
    } else {
      const r = RULES[s];
      const vals = c.attr.map((k) => figuresOf(c.cells[k])[r.fig]);
      check(
        `3b sort ${s}: order agrees with the figures`,
        inOrder(vals, r.dir, r.tol),
        c.attr
          .map((k, i) => `${k.slice(2, 8)} ${vals[i] == null ? "none" : (vals[i] * 100).toFixed(2) + "%"}`)
          .join(" | "),
      );
      if (s === "withdrawable")
        check(
          "3d a vault with no withdrawable share is drawn, after those with one",
          vals.includes(null) && vals.length === 4,
          vals.map(String).join(","),
        );
      if (s === "range")
        check(
          "3e the range sort says vaults whose share price grew come first",
          norm(await sortNote.textContent()) ===
            "Vaults whose share price grew over the 30 days come first; the others follow.",
          norm(await sortNote.textContent()),
        );
    }
  }
  check("3f the four sorts do not all draw one order", new Set(Object.values(orders)).size > 1, JSON.stringify(orders));
  await page.close();

  for (const [q, want] of [
    ["withdrawable", "withdrawable"],
    ["bogus", "size"],
  ]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(compareUrl(ALL, `&sort=${q}`), NAV);
    await p.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
    const c = await readColumns(p);
    const on = await p
      .locator("[data-compare-sort]")
      .evaluateAll((els) =>
        els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.getAttribute("data-compare-sort")),
      );
    check(
      `3g ?sort=${q} loads ${want}, in its order`,
      on.join() === want && c.attr.join(",") === orders[want],
      `${on.join()} ${c.attr.join(",")}`,
    );
    await p.close();
  }
}

// ── 4. The holder donut ────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(compareUrl(ALL), NAV);
  await page.locator("[data-compare-table] [data-compare-donut]").first().waitFor({ timeout: WAIT });
  const donuts = await page.evaluate(() =>
    [...document.querySelectorAll("[data-compare-table] td[data-compare-cell]")]
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
      `4b ${tag} E4, live count equals its /vaults row`,
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
    const slice = page.locator("[data-compare-table] [data-compare-donut] [data-breakdown-slice][data-seg]").first();
    await slice.hover();
    await page.waitForTimeout(400);
    const dim = await page.evaluate(() => {
      const d = document.querySelector("[data-compare-table] [data-compare-donut]");
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
  await page.goto(compareUrl(ALL, "&sort=yield"), NAV);
  await page.locator("[data-compare-columns]").waitFor({ timeout: WAIT });
  const s = await noScroll(page);
  check(`5a ${w}px no sideways scroll`, s.sw <= s.cw, `${s.sw} vs ${s.cw}`);
  const tableShown = await page.locator("[data-compare-table]").isVisible();
  const phoneShown = await page.locator("[data-compare-phone]").isVisible();
  check(
    `5b ${w}px ${w === 390 ? "the phone layout, no table" : "the table, no phone layout"}`,
    w === 390 ? phoneShown && !tableShown : tableShown && !phoneShown,
    `table ${tableShown}, phone ${phoneShown}`,
  );
  if (w === 390) {
    const c = await readColumns(page);
    check(
      "5c 390px the vault list in the sort's order",
      c.phone.join() === c.attr.join() && c.attr.length === 4,
      c.phone.join(","),
    );
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
      const few = document.querySelector("[data-compare-too-few]");
      return {
        status,
        notFound: nf?.getAttribute("data-compare-not-found") ?? null,
        notFoundText: nf?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        tooFew: !!few,
        toIndex: few?.querySelector("a")?.getAttribute("href") ?? null,
        cols: document.querySelector("[data-compare-columns]")?.getAttribute("data-compare-columns")?.split(",") ?? [],
      };
    }, r?.status());
  };

  let g = await open(compareUrl([A, UNKNOWN, B]));
  check(
    "6a an unknown address is named, the other two compare",
    g.status === 200 && g.notFound === UNKNOWN && g.notFoundText.includes(UNKNOWN) && g.cols.length === 2 && !g.tooFew,
    JSON.stringify(g),
  );
  g = await open(compareUrl([A, MALFORMED]));
  check(
    "6b a malformed key is named; one vault left draws the too-few line linking /vaults",
    g.status === 200 && g.notFound === MALFORMED && g.tooFew && g.toIndex === "/vaults" && g.cols.length === 0,
    JSON.stringify(g),
  );
  g = await open(`${BASE}/vaults/compare`);
  check(
    "6c no ?v= draws the too-few line and names nothing",
    g.status === 200 && g.tooFew && g.notFound == null,
    JSON.stringify(g),
  );
  const upper = `1:0x${FIXTURES.steakhouse.address.slice(2).toUpperCase()}`;
  g = await open(compareUrl([upper, A, B]));
  check(
    "6d an upper-case and a repeated key read as one vault",
    g.status === 200 && g.notFound == null && g.cols.length === 2,
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
