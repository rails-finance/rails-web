// Reaching the provenance inspector from a verifier.
// ----------------------------------------------------------------------------
// The inspector is armed in one place (rails-ops TO-DO-ui-jobs 625): the
// profile menu's switch (H20.1, `[data-profile-menu-prov]`, reading "on" or
// "off"), which saves the choice in localStorage (`rails-prov-inspector`) and
// arms the page at once, on the routes in lib/shared/prov-preference-routes.ts.
// While the inspector is armed on a page with a traced value, its menu button
// (`[data-prov-inspect-menu]`, H7.4) stands beside the profile control, so its
// presence is the armed state (ui-jobs 651).
//
//   import { ARMED, armInspector } from "./lib/prov-inspector.mjs";
//
// `armInspector` leaves the tool ARMED and says so, and is idempotent. False on
// a route the switch does not arm, which is a finding, not a flake.

export const ARMED = "[data-prov-inspect-menu]";
const H20 = '[data-anatomy="H20"]:visible';
const SWITCH = "[data-profile-menu-prov]";

/** Turn the profile menu's switch on (where it reads off) and wait for the
 *  page to arm. The menu is closed from its control: Escape would also be the
 *  inspector's. */
export async function armInspector(page) {
  if (await page.$(ARMED)) return true;
  // A press inside the hydration window is lost rather than answered late,
  // so open the menu again until the switch shows.
  for (let i = 0; i < 4; i++) {
    await page
      .locator(H20)
      .first()
      .click({ timeout: 10_000 })
      .catch(() => {});
    const sw = await page.waitForSelector(SWITCH, { timeout: 4_000 }).catch(() => null);
    if (!sw) continue;
    if ((await sw.getAttribute("data-profile-menu-prov")) === "off") await sw.click().catch(() => {});
    if (await page.$("[data-profile-menu]"))
      await page
        .locator(H20)
        .first()
        .click()
        .catch(() => {});
    if (await page.waitForSelector(ARMED, { timeout: 6_000 }).catch(() => null)) return true;
  }
  return Boolean(await page.$(ARMED));
}

/** The receipt behind a traced value in `scope` (a locator): the first
 *  `span.prov-locate-box` whose text matches `valueText`, or `valueText`
 *  itself where it is a locator. Arms through the switch, picks, reads the
 *  popover, then puts the inspector down with two Escapes (the receipt, then
 *  the mode and the saved choice), so the page and the next load are left
 *  unarmed. Null where nothing matched or the route does not arm. Event pages
 *  are not on the switch's routes, so a card is read on its timeline. */
export async function receiptIn(scope, valueText) {
  const page = scope.page();
  if (!(await armInspector(page))) return null;
  try {
    const target =
      typeof valueText === "string"
        ? scope.locator("span.prov-locate-box").filter({ hasText: valueText }).first()
        : valueText;
    if ((await target.count()) === 0) return null;
    await target.scrollIntoViewIfNeeded();
    await target.click();
    const pop = page.locator(".prov-inspect-pop");
    await pop.waitFor({ state: "visible", timeout: 10000 });
    return await pop.innerText();
  } catch {
    return null;
  } finally {
    if (await page.$(".prov-inspect-pop")) await page.keyboard.press("Escape");
    if (await page.$(ARMED)) await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}
