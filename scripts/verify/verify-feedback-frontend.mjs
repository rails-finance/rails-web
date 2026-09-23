// Live in-browser verification of the footer feedback modal (plan §7 UI
// checks). Run against the dev server:  node scripts/verify/verify-feedback-frontend.mjs
// (claude-in-chrome cannot reach localhost — this script is the check.)
//
// Checklist:
//   1. SiteFooter (home): "Send feedback" trigger opens the modal.
//   2. Category pills switch; the Title field hides on Data correction.
//   3. Description counter updates live (n/2000).
//   4. Honeypot input exists in the DOM, invisible, unfocusable and hidden
//      from assistive tech — and empty, which is what makes it a trap.
//   5. Body scroll is free before opening, locks while open, and is restored
//      by Esc.
//   6. AppFooter (/ethereum/liquity-v2): the same modal opens from the slim footer.
//   7. Page line auto-captures the current pathname.
//   8. Mobile width (375px) renders the modal inside the viewport.
//   9. Zero pageerrors throughout.
//
// Submission is NOT exercised here — the route's status matrix is covered by
// curl checks (415/413/400/honeypot-200/429/500-when-env-unset).
//
// WHAT ROTTED: check 7's second arm. Every explorer route is chain-scoped now,
// so `/liquity-v2` is a 308 to `/ethereum/liquity-v2` and the modal correctly
// reported the path it had landed on. The pin is moved to the live route, and
// the check is written as two claims rather than one literal — the line must
// equal the pathname the BROWSER is on (so it is still auto-captured, not
// hard-coded) AND that pathname must be the chain-scoped listing route (so the
// next route move is a loud red here rather than a silent adjustment).
//
// Checks 4 and 5 were audited for the same class of rot and are sound: both read
// values no hover state can reach — `document.body.style.overflow` is an inline
// style the modal sets itself, and the honeypot's invisibility is `display:none`
// on its wrapper, which Playwright's `isVisible` resolves without a computed-style
// read taken next to a pointer. Neither was weakened; both were given the missing
// half of their pair (scroll: the free reading BEFORE the modal opens; honeypot:
// the properties beyond invisibility that make it a trap at all).

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DIALOG = 'div[role="dialog"][aria-labelledby="feedback-modal-title"]';

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Click a trigger and wait for the dialog, retrying — a click that lands
// before React hydration attaches the handler is otherwise silently lost.
const openModal = async (page, trigger) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    try {
      await page.waitForSelector(DIALOG, { timeout: 5000 });
      return true;
    } catch {
      await pause(1000);
    }
  }
  return false;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// ── 1. SiteFooter (home) ─────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 240000 });
const siteTrigger = page.locator('footer button:has-text("Send feedback")').first();
await siteTrigger.scrollIntoViewIfNeeded();
check("1. SiteFooter trigger present", (await siteTrigger.count()) > 0);

// ── 5a. Body scroll is FREE before the modal exists ──────────────────────────
// The other half of the lock. "overflow is hidden while open" says nothing on a
// page that pins the body hidden all the time, so the free reading is taken
// first — the claim is a change of state, not a state.
const overflowBefore = await page.evaluate(() => document.body.style.overflow);
check("5. body scrolls freely before the modal opens", overflowBefore !== "hidden", `overflow="${overflowBefore}"`);

check("1. modal opens from SiteFooter", await openModal(page, siteTrigger));

// ── 5b. Body scroll lock while open ──────────────────────────────────────────
const overflowOpen = await page.evaluate(() => document.body.style.overflow);
check("5. body scroll locks while open", overflowOpen === "hidden", `overflow="${overflowOpen}"`);

// ── 7. Page line captures the pathname ───────────────────────────────────────
const pageLine = (await page.textContent('[data-testid="feedback-page-line"]'))?.trim();
check("7. page line auto-captures pathname", pageLine === "Page: /", `"${pageLine}"`);

// ── 2. Pills switch; Title hides on Data correction ──────────────────────────
const titleInput = page.locator(`${DIALOG} input[placeholder="Short summary"]`);
check("2. Title field visible on Bug report (default)", await titleInput.isVisible());
await page.click(`${DIALOG} button[role="tab"]:has-text("Data correction")`);
await pause(150);
check("2. Title field hides on Data correction", (await titleInput.count()) === 0);
const dataPlaceholder = await page.getAttribute(`${DIALOG} textarea`, "placeholder");
check(
  "2. Data correction placeholder swaps in",
  dataPlaceholder === "Which number looks wrong, and what was expected? A link or tx hash helps.",
  `"${dataPlaceholder}"`,
);
await page.click(`${DIALOG} button[role="tab"]:has-text("Feature request")`);
await pause(150);
check("2. Title field returns on Feature request", await titleInput.isVisible());

// ── 3. Live counter ──────────────────────────────────────────────────────────
const counterBefore = (await page.textContent('[data-testid="feedback-counter"]'))?.trim();
await page.fill(`${DIALOG} textarea`, "The counter counts.");
const counterAfter = (await page.textContent('[data-testid="feedback-counter"]'))?.trim();
check(
  "3. counter updates live",
  counterBefore === "0/2000" && counterAfter === "19/2000",
  `${counterBefore} → ${counterAfter}`,
);

// ── 4. Honeypot present but invisible ────────────────────────────────────────
// A honeypot is only a honeypot if a real reader cannot reach it AND a bot can:
// it has to be in the submitted form, empty, invisible, off the tab order and
// hidden from assistive tech. Invisibility alone would be satisfied by a field
// that was merely broken. All five are read in one pass off the element itself —
// none of them is a computed style a hovering pointer could colour.
const honeypot = page.locator(`${DIALOG} input[name="website"]`);
check("4. honeypot input exists in the DOM", (await honeypot.count()) === 1);
check("4. honeypot is invisible", !(await honeypot.isVisible()));
const trap = await honeypot.evaluate((el) => ({
  inForm: !!el.closest("form"),
  value: el.value,
  tabIndex: el.tabIndex,
  ariaHidden: !!el.closest('[aria-hidden="true"]'),
}));
check("4. honeypot rides the submitted form", trap.inForm);
check("4. honeypot starts empty (a filled one is the bot signal)", trap.value === "", `value="${trap.value}"`);
check("4. honeypot is out of the tab order", trap.tabIndex === -1, `tabIndex=${trap.tabIndex}`);
check("4. honeypot is hidden from assistive tech", trap.ariaHidden);

// ── 5c. Esc closes and restores scroll ───────────────────────────────────────
await page.keyboard.press("Escape");
await pause(250);
check("5. Esc closes the modal", (await page.locator(DIALOG).count()) === 0);
const overflowClosed = await page.evaluate(() => document.body.style.overflow);
check("5. body scroll restored on close", overflowClosed !== "hidden", `overflow="${overflowClosed}"`);

// ── 6. AppFooter (/ethereum/liquity-v2) ──────────────────────────────────────
const APP_ROUTE = "/ethereum/liquity-v2";
await page.goto(`${BASE}${APP_ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
const appTrigger = page.locator('footer button:has-text("Send feedback")').first();
await appTrigger.scrollIntoViewIfNeeded();
check("6. AppFooter trigger present", (await appTrigger.count()) > 0);
check("6. modal opens from AppFooter", await openModal(page, appTrigger));
const appPageLine = (await page.textContent('[data-testid="feedback-page-line"]'))?.trim();
const landedPath = new URL(page.url()).pathname;
// Two claims. The line is CAPTURED (it agrees with the address bar the browser
// actually landed on, redirects included) …
check(
  "7. page line reflects the pathname the browser is on",
  appPageLine === `Page: ${landedPath}`,
  `"${appPageLine}" vs ${landedPath}`,
);
// … and the fixture is still the route this check means to exercise, so a move
// reads as a red here instead of quietly re-pointing the check at somewhere else.
check("7. that pathname is the liquity-v2 listing", landedPath === APP_ROUTE, landedPath);
await page.keyboard.press("Escape");
await pause(250);

// ── 8. Mobile width ──────────────────────────────────────────────────────────
await page.setViewportSize({ width: 375, height: 700 });
check("8. modal reopens at mobile width", await openModal(page, appTrigger));
const box = await page.locator(DIALOG).boundingBox();
check(
  "8. modal fits a 375px viewport",
  box != null && box.x >= 0 && box.width <= 375,
  box ? `x=${box.x}, width=${box.width}` : "no box",
);
check("8. modal visible at mobile width", await page.isVisible(DIALOG));

// ── 9. No page errors anywhere in the run ────────────────────────────────────
check("9. zero pageerrors", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
