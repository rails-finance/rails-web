// The opened event card's Explanation | Figures tabs (rails-ops TO-DO-ui-jobs
// 370), on the page.
// ---------------------------------------------------------------------------
// An opened timeline card with both an explanation and figures draws
// `CardTabStrip` (components/shared/info-disclosure.tsx): two tab buttons,
// `data-card-tab="explanation"|"figures"`, and the T2 panel carries
// `data-card-tab-open`. Each card keeps its own tab; the Display preference
// "Figures first" (`figuresFirst` in localStorage `timeline-display-v3`) is the
// tab a card opens on. The event page draws no strip: the explanation (T3)
// stands open above the sheet. This script proves, on a Polaris, a Liquity V2
// and an Aave V3 card:
//
//   a. an opened card draws the strip with exactly the two tabs, Explanation
//      then Figures, open on Explanation (1280; and at 390, opened by a tap);
//   b. a press on one card's tab leaves a second opened card's tab alone, both
//      ways;
//   c. with `figuresFirst: true` stored, a freshly opened card opens on
//      Figures, its sheet drawn;
//   d. the event page draws no strip, and T3 stands in T2 ahead of the sheet;
//   e. at 1280 the first tab's text starts on the head's action word's text
//      (within 1px);
//   f. Learn more sits inside the Explanation region, and no part of the sheet
//      (`[data-sheet]`) is in the DOM while Explanation is open; on Figures the
//      sheet is drawn and the explanation is not.
//
// Run:  BASE=http://localhost:3011 node scripts/verify/verify-card-tabs.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { CARD_TAB_OPEN, showCardTab } from "./lib/card-tabs.mjs";

const SUBJECTS = [
  {
    name: "Polaris usdp/166",
    path: "/sepolia/polaris/usdp/166",
    id: "cdp_updated:0x4a7513ae28ac742b88cc9a88e4a6ddce7ab815da3dc7f4893582824252e37233:307",
  },
  {
    name: "Liquity V2 Trove …870154",
    path: "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154",
    id: "0x6b124d875bcd9a5ba55e9cc18a91268b8239444d057192d65b7e8f97cb1cf506_157",
  },
  {
    name: "Aave V3 0xc593…5948",
    path: "/ethereum/aave-v3/0xc593352eefa7c45863525a3194870929fd6f5948",
    id: "borrow:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2:0xfe55122b7ee1b28604cf49aff91b97e4e09c34168149c2227ef466bd02bafaff:4",
  },
];
/** Learn more: T4, or the "?" a family passes into the footer
 *  (verify-anatomy-codes.mjs reads it the same way). */
const LEARN_MORE = '[data-anatomy~="T4"], button[aria-label^="Learn more"]';
const SHEET = "[data-sheet]";
const landing = (s) => `${s.path}?at=${encodeURIComponent(s.id)}`;
const eventPage = (s) => `${s.path}/event/${encodeURIComponent(s.id)}`;
const rowSel = (id) => `[data-event-id="${id}"]`;

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();

async function open(width, path, { touch = false, figuresFirst = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: bypassHeaders(),
  });
  if (figuresFirst)
    await ctx.addInitScript(() => {
      try {
        const k = "timeline-display-v3";
        const cur = JSON.parse(localStorage.getItem(k) ?? "{}");
        localStorage.setItem(k, JSON.stringify({ ...cur, figuresFirst: true }));
      } catch {}
    });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  return { ctx, page, errors };
}

/** Wait for the row's opened card to draw its strip. */
async function waitStrip(row, timeout = 120000) {
  await row
    .locator('[data-anatomy~="T2"]')
    .first()
    .waitFor({ state: "attached", timeout })
    .catch(() => {});
  return row
    .locator("[data-card-tab]")
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .then(() => true)
    .catch(() => false);
}

/** The strip as it reads: its tabs in order, their roles and selection, the
 *  open tab, and what stands in the card under it. */
const readStrip = (row, learnMore, sheet) =>
  row.evaluate(
    (r, [learnMore, sheet]) => {
      const list = r.querySelector('[role="tablist"]');
      const t3 = r.querySelector('[data-anatomy="T3"]');
      return {
        tabs: [...r.querySelectorAll("[data-card-tab]")].map((b) => ({
          key: b.getAttribute("data-card-tab"),
          text: b.textContent.trim(),
          role: b.getAttribute("role"),
          selected: b.getAttribute("aria-selected"),
          inList: !!list && list.contains(b),
        })),
        open: r.querySelector("[data-card-tab-open]")?.getAttribute("data-card-tab-open") ?? null,
        t3: !!t3,
        learnMoreInT3: t3 ? t3.querySelectorAll(learnMore).length : 0,
        learnMore: r.querySelectorAll(learnMore).length,
        sheet: r.querySelectorAll(sheet).length,
      };
    },
    [learnMore, sheet],
  );

const stripOk = (st, open) =>
  !!st &&
  JSON.stringify(st.tabs.map((t) => [t.key, t.text])) ===
    JSON.stringify([
      ["explanation", "Explanation"],
      ["figures", "Figures"],
    ]) &&
  st.tabs.every((t) => t.role === "tab" && t.inList && t.selected === String(t.key === open)) &&
  st.open === open;

/** The left edge of the first visible text in `el`. */
const textLeft = (loc) =>
  loc
    .evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || n.parentElement.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rect = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
        if (rect) return { left: rect.left, text: n.textContent.trim().slice(0, 24) };
      }
      return null;
    })
    .catch(() => null);

// ── a, e, f: each subject's card at 1280 ─────────────────────────────────
for (const s of SUBJECTS) {
  const { ctx, page, errors } = await open(1280, landing(s));
  const row = page.locator(rowSel(s.id)).first();
  const drawn = await waitStrip(row);
  if (!check(`a. ${s.name} @1280: the opened card draws the tab strip`, drawn)) {
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(1500);
  const st = await readStrip(row, LEARN_MORE, SHEET).catch(() => null);
  check(
    `a. ${s.name} @1280: exactly Explanation then Figures, tab roles, open on Explanation`,
    stripOk(st, "explanation"),
    JSON.stringify(st && { tabs: st.tabs, open: st.open }),
  );

  const head = await textLeft(row.locator('[data-anatomy="T1"]').first());
  const tab = await textLeft(row.locator('[data-card-tab="explanation"]').first());
  const gap = head && tab ? Math.abs(tab.left - head.left) : null;
  check(
    `e. ${s.name} @1280: the first tab's text starts on the head's action word's text (within 1px)`,
    gap != null && gap <= 1,
    head && tab ? `head "${head.text}" ${head.left.toFixed(1)}, tab ${tab.left.toFixed(1)}` : "not measured",
  );

  check(
    `f. ${s.name}: on Explanation, Learn more stands inside the explanation (T3)`,
    !!st && st.t3 && st.learnMoreInT3 > 0 && st.learnMoreInT3 === st.learnMore,
    JSON.stringify(st && { t3: st.t3, learnMoreInT3: st.learnMoreInT3, learnMore: st.learnMore }),
  );
  check(
    `f. ${s.name}: on Explanation, no part of the sheet is in the DOM`,
    !!st && st.sheet === 0,
    `${st?.sheet} found`,
  );

  const moved = await showCardTab(row, "figures");
  await row
    .locator(SHEET)
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const fig = await readStrip(row, LEARN_MORE, SHEET).catch(() => null);
  check(
    `f. ${s.name}: on Figures, the sheet is drawn and the explanation is not`,
    moved === "tabbed" && stripOk(fig, "figures") && fig.sheet > 0 && !fig.t3,
    JSON.stringify(fig && { moved, open: fig.open, sheet: fig.sheet, t3: fig.t3 }),
  );
  check(`${s.name} @1280: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── a at 390: a tap opens the card (`?at=` leaves it closed under 640px) ──
{
  const s = SUBJECTS[0];
  const { ctx, page, errors } = await open(390, landing(s), { touch: true });
  const row = page.locator(rowSel(s.id)).first();
  await row.waitFor({ state: "attached", timeout: 120000 }).catch(() => {});
  const toggle = row.locator("[data-spine-toggle]").first();
  await toggle.waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 8 && (await row.locator(CARD_TAB_OPEN).count()) === 0; i++) {
    await toggle.scrollIntoViewIfNeeded().catch(() => {});
    await toggle.tap({ timeout: 5000 }).catch(() => {});
    await row
      .locator(CARD_TAB_OPEN)
      .first()
      .waitFor({ state: "attached", timeout: 8000 })
      .catch(() => {});
  }
  const st = await readStrip(row, LEARN_MORE, SHEET).catch(() => null);
  check(
    `a. ${s.name} @390: a tap opens the card on the strip, open on Explanation`,
    stripOk(st, "explanation"),
    JSON.stringify(st && { tabs: st.tabs.map((t) => t.key), open: st.open }),
  );
  check(`${s.name} @390: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── b: two opened cards keep their own tabs ──────────────────────────────
{
  const s = SUBJECTS[0];
  const { ctx, page, errors } = await open(1280, landing(s));
  const a = page.locator(rowSel(s.id)).first();
  await waitStrip(a);
  await page.waitForTimeout(1500);
  // A second card with both an explanation and figures: the next rows outside
  // any group, opened by the header until one draws the strip.
  const others = await page.$$eval(
    "[data-event-id]",
    (els, id) =>
      els
        .filter(
          (e) =>
            e.querySelector('[data-anatomy~="T1"]') && !e.closest("[data-group-frame]") && e.dataset.eventId !== id,
        )
        .map((e) => e.dataset.eventId),
    s.id,
  );
  let bId = null;
  for (const id of others.slice(0, 6)) {
    const row = page.locator(rowSel(id)).first();
    const head = row.locator('[data-anatomy~="T1"] [data-row-control][role="button"]').first();
    for (let i = 0; i < 4 && (await head.getAttribute("aria-expanded").catch(() => null)) !== "true"; i++) {
      await head.click({ position: { x: 120, y: 18 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    if (await waitStrip(row, 20000)) {
      bId = id;
      break;
    }
  }
  if (check(`b. ${s.name}: a second opened card draws the strip`, !!bId, `${others.length} other rows`)) {
    const b = page.locator(rowSel(bId)).first();
    const tabOf = (row) =>
      row
        .locator(CARD_TAB_OPEN)
        .first()
        .getAttribute("data-card-tab-open")
        .catch(() => null);
    const start = [await tabOf(a), await tabOf(b)];
    await showCardTab(a, "figures");
    const afterA = [await tabOf(a), await tabOf(b)];
    check(
      "b. Figures pressed on the first card: the first reads figures, the second stays on explanation",
      JSON.stringify(start) === JSON.stringify(["explanation", "explanation"]) &&
        JSON.stringify(afterA) === JSON.stringify(["figures", "explanation"]),
      `${JSON.stringify(start)} → ${JSON.stringify(afterA)}`,
    );
    await showCardTab(b, "figures");
    await showCardTab(a, "explanation");
    const swapped = [await tabOf(a), await tabOf(b)];
    check(
      "b. then Figures on the second and Explanation on the first: each card reads its own",
      JSON.stringify(swapped) === JSON.stringify(["explanation", "figures"]),
      JSON.stringify(swapped),
    );
  }
  check(`b. ${s.name}: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── c: "Figures first" stored, a fresh card opens on Figures ─────────────
for (const s of SUBJECTS.slice(0, 2)) {
  const { ctx, page, errors } = await open(1280, landing(s), { figuresFirst: true });
  const row = page.locator(rowSel(s.id)).first();
  await waitStrip(row);
  await row
    .locator(SHEET)
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const stored = await page
    .evaluate(() => JSON.parse(localStorage.getItem("timeline-display-v3") ?? "{}").figuresFirst ?? null)
    .catch(() => null);
  const st = await readStrip(row, LEARN_MORE, SHEET).catch(() => null);
  check(
    `c. ${s.name}: with figuresFirst stored, the opened card opens on Figures, its sheet drawn`,
    stored === true && stripOk(st, "figures") && st.sheet > 0 && !st.t3,
    JSON.stringify({ stored, open: st?.open, sheet: st?.sheet, t3: st?.t3 }),
  );
  check(`c. ${s.name}: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── d: the event page stands the explanation above the sheet, no strip ───
for (const s of SUBJECTS.slice(0, 2)) {
  const { ctx, page, errors } = await open(1280, eventPage(s));
  await page
    .locator(`[data-anatomy~="T2"] ${SHEET}`)
    .first()
    .waitFor({ state: "attached", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const read = await page
    .evaluate((sheet) => {
      const t2 = document.querySelector('[data-anatomy~="T2"]');
      const t3 = t2?.querySelector('[data-anatomy="T3"]');
      const sh = t2?.querySelector(sheet);
      return {
        t2: !!t2,
        t3: !!t3,
        sheet: !!sh,
        strip: document.querySelectorAll('[data-card-tab], [data-card-tab-open], [role="tablist"] [role="tab"]').length,
        t3First: !!t3 && !!sh && !!(t3.compareDocumentPosition(sh) & Node.DOCUMENT_POSITION_FOLLOWING),
        t3Above: !!t3 && !!sh && t3.getBoundingClientRect().bottom <= sh.getBoundingClientRect().top + 0.5,
      };
    }, SHEET)
    .catch(() => null);
  check(`d. ${s.name} event page: no tab strip`, !!read && read.t2 && read.strip === 0, JSON.stringify(read));
  check(
    `d. ${s.name} event page: T3 stands in T2 ahead of the sheet, in document order and on screen`,
    !!read && read.t3 && read.sheet && read.t3First && read.t3Above,
    JSON.stringify(read),
  );
  check(`d. ${s.name} event page: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();
console.log(
  failures ? `\n${failures} CHECK(S) FAILED of ${checked}` : `\nALL ${checked} CHECKS PASS — the card tabs hold`,
);
if (checked === 0) {
  console.log("CRASH — zero checks ran");
  process.exit(2);
}
process.exit(failures ? 1 : 0);
