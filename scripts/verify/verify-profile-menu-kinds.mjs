// The profile menu's kinds and /saved-views' inline New view (rails-ops
// TO-DO-ui-jobs 665; Miles 13 Nov 2026).
//
// H20: under Saved views, each kind holding something starred is a link to
// its /saved-views tab in the explorer tabs' type, with every item of the
// kind saved counted in a pill and its starred entries under it; a kind with
// nothing starred is not drawn, and no kind is a toggle. With nothing to
// list, one muted line under the hairline: "Your saved views will display
// here, learn more" with nothing saved, "Starred saved views show here,
// learn more" with something saved and nothing starred; with nothing saved,
// Start here first, over the sections.
//
// B2.2: New view opens the Focus panel's editor in the page, not a dialog.
// Done saves one view; Cancel and Escape save none. An Escape that closes the
// profile menu opened over the editor leaves the draft alone. The inline
// editor has no "Add from all assets" (it edits the view in use on /assets);
// the panel a row's Edit opens keeps it.

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const H20 = '[data-anatomy="H20"]:visible';
const EDITOR = "[data-focus-view-editor]";

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();

/** A fresh context whose first load holds `saved` and nothing else. */
async function fresh(saved) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: bypassHeaders() });
  await ctx.addInitScript((rows) => {
    if (sessionStorage.getItem("verify-seeded")) return;
    sessionStorage.setItem("verify-seeded", "1");
    localStorage.clear();
    localStorage.setItem("rails-saved-stars-652", "1");
    if (rows) localStorage.setItem("rails-saved", JSON.stringify(rows));
  }, saved);
  return { ctx, page: await ctx.newPage() };
}

async function openMenu(page) {
  await page.locator(H20).first().click();
  await page.waitForSelector("[data-profile-menu]");
  await page.waitForTimeout(400);
}

// --- H20: the kinds -------------------------------------------------------

const link = (key, name, protocol, chain, starred) => ({
  kind: key.includes("/0x") ? "position" : "view",
  key,
  name,
  protocol: { id: protocol, name: protocol },
  chain: { id: String(chain), name: chain === 1 ? "Ethereum" : "Base" },
  savedAt: 1,
  ...(starred ? { starred: true } : {}),
});
const W = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const SEED = [
  link("/ethereum/liquity-v2", "Liquity V2 troves", "liquity", 1, true),
  link("/base/morpho", "Morpho markets", "morpho", 8453, false),
  // A position with no star: Positions is not drawn.
  link(
    "/ethereum/aave-v3/0x8008316e61985599dc62d69716bab3ebe643c0a8?market=core",
    "Aave position",
    "aave-v3",
    1,
    false,
  ),
  {
    kind: "wallet",
    key: W,
    addresses: [W],
    ensNames: {},
    lastVisited: 1,
    bookmarkedAt: 1,
    pinned: true,
    starred: true,
  },
];

{
  const { ctx, page } = await fresh(SEED);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(1000);
  await openMenu(page);
  const m = await page.evaluate(() => {
    const menu = document.querySelector("[data-profile-menu]");
    const cs = (e) => getComputedStyle(e);
    return {
      sections: [...menu.querySelectorAll("[data-profile-menu-section]")].map((e) =>
        e.getAttribute("data-profile-menu-section"),
      ),
      kinds: [...menu.querySelectorAll("[data-profile-menu-kind-link]")].map((a) => {
        const word = a.querySelector("span");
        const group = a.closest("[data-profile-menu-kind]");
        return {
          kind: a.getAttribute("data-profile-menu-kind-link"),
          href: a.getAttribute("href"),
          count: a.querySelector("[data-profile-menu-count]")?.textContent,
          toggle: a.hasAttribute("aria-expanded") || !!a.querySelector("svg"),
          type: `${cs(word).fontSize} ${cs(word).fontWeight} ${cs(word).textTransform}`,
          rows: group.querySelectorAll("[data-profile-menu-link], [data-profile-menu-wallet]").length,
        };
      }),
    };
  });
  check(
    "H20: the menu is two sections, Saved views then Advanced",
    m.sections.join() === "saved,advanced",
    m.sections.join(),
  );
  const kinds = m.kinds.map((k) => k.kind).join();
  check(
    "H20: only the kinds holding a starred item are drawn (Listings, Wallets; Positions has none starred)",
    kinds === "listings,wallets",
    kinds,
  );
  const want = { listings: { count: "2", rows: 1 }, wallets: { count: "1", rows: 1 } };
  for (const k of m.kinds) {
    check(`H20: ${k.kind} links to its tab`, k.href === `/saved-views?tab=${k.kind}`, k.href);
    check(`H20: ${k.kind} counts every item saved (${want[k.kind]?.count})`, k.count === want[k.kind]?.count, k.count);
    check(`H20: ${k.kind} lists its starred entries alone`, k.rows === want[k.kind]?.rows, String(k.rows));
    check(`H20: ${k.kind} is no toggle and has no chevron`, !k.toggle);
    check(
      `H20: ${k.kind} is in the explorer tabs' type (11px, 600, uppercase)`,
      k.type === "11px 600 uppercase",
      k.type,
    );
  }
  await page.locator('[data-profile-menu-kind-link="listings"]').click();
  await page.waitForURL(/tab=listings/, { timeout: 60000 }).catch(() => {});
  await page.waitForSelector('[data-saved-tab="listings"][aria-selected="true"]', { timeout: 30000 }).catch(() => {});
  check(
    "H20: Listings opens /saved-views on the Listings tab",
    page.url().endsWith("/saved-views?tab=listings"),
    page.url(),
  );
  await ctx.close();
}

// --- H20: Start here and the empty line ---------------------------------

/** The menu's items in order, each by its hook, and the empty line's look. */
async function readOrder(page) {
  return page.evaluate(() => {
    const m = document.querySelector("[data-profile-menu]");
    const items = [...m.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')].map(
      (e) =>
        (e.hasAttribute("data-profile-menu-start") && "start") ||
        (e.hasAttribute("data-profile-menu-bookmarks") && "saved") ||
        (e.closest("[data-profile-menu-empty]") && "learn-more") ||
        (e.hasAttribute("data-profile-menu-kind-link") && `kind:${e.getAttribute("data-profile-menu-kind-link")}`) ||
        e.getAttribute("data-profile-menu-group-toggle") ||
        "row",
    );
    const empty = m.querySelector("[data-profile-menu-empty]");
    const link = empty?.querySelector("a");
    return {
      items: items.join(),
      startOutside: !!m.querySelector(":scope > [data-profile-menu-start]"),
      empty: empty && {
        text: empty.textContent.replace(/\s+/g, " ").trim(),
        size: getComputedStyle(empty).fontSize,
        href: link?.getAttribute("href"),
        linkColor: getComputedStyle(link).color,
        color: getComputedStyle(empty).color,
        underOutside: !!empty.closest('[data-profile-menu-section="saved"]'),
      },
    };
  });
}
const CASES = [
  {
    name: "nothing saved",
    seed: null,
    items: "start,saved,learn-more,advanced",
    empty: "Your saved views will display here, learn more",
    start: true,
  },
  {
    name: "saved, nothing starred",
    seed: [link("/base/morpho", "Morpho markets", "morpho", 8453, false)],
    items: "saved,learn-more,advanced",
    empty: "Starred saved views show here, learn more",
    start: false,
  },
  {
    name: "something starred",
    seed: SEED,
    items: "saved,kind:listings,row,kind:wallets,row,advanced",
    empty: false,
    start: false,
  },
];
for (const c of CASES) {
  const { ctx, page } = await fresh(c.seed);
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(1000);
  await openMenu(page);
  const o = await readOrder(page);
  check(`H20 ${c.name}: the items in order (${c.items})`, o.items === c.items, o.items);
  check(`H20 ${c.name}: Start here ${c.start ? "first, over the sections" : "absent"}`, o.startOutside === c.start);
  check(
    `H20 ${c.name}: the empty line ${c.empty ? "shown" : "absent"}`,
    !!o.empty === !!c.empty,
    JSON.stringify(o.empty),
  );
  if (o.empty) {
    check(
      `H20 ${c.name}: the empty line reads as asked, 12px muted, in Saved views, learn more to /saved-views in link blue`,
      o.empty.text === c.empty &&
        o.empty.size === "12px" &&
        o.empty.underOutside &&
        o.empty.href === "/saved-views" &&
        o.empty.linkColor !== o.empty.color,
      JSON.stringify(o.empty),
    );
    // Keyboard: from the Saved views header, ArrowDown reaches learn more.
    await page.locator("[data-profile-menu-bookmarks]").focus();
    await page.keyboard.press("ArrowDown");
    const onLink = await page.evaluate(() => !!document.activeElement?.closest("[data-profile-menu-empty]"));
    check(`H20 ${c.name}: ArrowDown from Saved views lands on learn more`, onLink);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/saved-views/, { timeout: 60000 }).catch(() => {});
    const closed = !(await page.$("[data-profile-menu]"));
    check(
      `H20 ${c.name}: learn more opens /saved-views and closes the menu`,
      page.url().endsWith("/saved-views") && closed,
      page.url(),
    );
  }
  await ctx.close();
}

// --- B2.2: the inline editor ----------------------------------------------

{
  const { ctx, page } = await fresh(null);
  await page.goto(`${BASE}/saved-views?tab=focus`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForSelector("[data-focus-view-new]");
  await page.waitForTimeout(800);
  const views = () =>
    page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("rails-focus-views") ?? "{}").views?.length ?? 0;
      } catch {
        return -1;
      }
    });
  const open = async () => {
    await page.locator("[data-focus-view-new]").click();
    await page.waitForSelector(EDITOR);
  };
  const chain = (id) => page.locator(`${EDITOR} [data-focus-chain="${id}"]`);

  await open();
  const inline = await page.evaluate((sel) => {
    const ed = document.querySelector(sel);
    return { inPanel: !!ed.closest("#saved-panel"), dialog: !!ed.closest('[role="dialog"]') };
  }, EDITOR);
  check(
    "B2.2: New view opens the editor in the page, not in a dialog",
    inline.inPanel && !inline.dialog,
    JSON.stringify(inline),
  );
  await page.locator(`${EDITOR} input`).first().fill("Base only");
  await chain(8453).click();
  check("B2.2: nothing is saved while the editor is open", (await views()) === 0, String(await views()));
  await page.locator("[data-focus-view-editor-done]").click();
  await page.waitForTimeout(300);
  check("B2.2: Done saves one view and closes the editor", (await views()) === 1 && !(await page.$(EDITOR)));

  await open();
  await chain(1).click();
  await page.locator("[data-focus-view-editor-cancel]").click();
  await page.waitForTimeout(300);
  check("B2.2: Cancel closes the editor with nothing saved", (await views()) === 1 && !(await page.$(EDITOR)));

  await open();
  await chain(1).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("B2.2: Escape closes the editor with nothing saved", (await views()) === 1 && !(await page.$(EDITOR)));

  // The profile menu over the open editor: its Escape closes the menu alone.
  await open();
  await page.locator(`${EDITOR} input`).first().fill("Kept");
  await chain(1).click();
  await openMenu(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const kept = await page.evaluate((sel) => {
    const ed = document.querySelector(sel);
    return {
      menu: !!document.querySelector("[data-profile-menu]"),
      editor: !!ed,
      name: ed?.querySelector("input")?.value,
      chain: ed?.querySelector('[data-focus-chain="1"]')?.getAttribute("aria-pressed"),
    };
  }, EDITOR);
  check(
    "B2.2: Escape on the profile menu over the editor closes the menu and leaves the draft",
    !kept.menu && kept.editor && kept.name === "Kept" && kept.chain === "true",
    JSON.stringify(kept),
  );

  // "Add from all assets": not in the inline editor; still in the panel a
  // row's Edit opens.
  check(
    "B2.2: the inline editor has no Add from all assets",
    (await page.locator(`${EDITOR} [data-asset-scope-manage]`).count()) === 0,
  );
  await page.locator(`${EDITOR} [data-focus-view-editor-cancel]`).click();
  await page.locator('[data-bookmark-row="focus"] [data-row-menu]').first().click();
  await page.locator('[data-row-menu-list] [role="menuitem"]', { hasText: "Edit" }).first().click();
  await page.waitForSelector("[data-asset-scope-dialog]", { timeout: 10000 }).catch(() => {});
  check(
    "B2.2: the panel a row's Edit opens keeps Add from all assets",
    (await page.locator("[data-asset-scope-dialog] [data-asset-scope-manage]").count()) === 1,
  );
  await ctx.close();
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures || checked === 0 ? 1 : 0);
