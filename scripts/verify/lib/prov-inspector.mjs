// Reaching the provenance inspector from a verifier.
// ----------------------------------------------------------------------------
// The toggle (button.prov-inspect-toggle) is one control in two places since
// rails-ops TO-DO-ui-jobs 48: the floating dock the Market-type pages still
// mount, where it is on the page from first paint, and a row of the Tools
// dropdown on a position or detail view, which is in the DOM only while the
// menu is open. A verifier that wants the toggle goes through here rather than
// locating it directly, so the same check reads either surface.
//
//   import { INSPECTOR, openInspectorHome, armInspector } from "./lib/prov-inspector.mjs";
//
// `openInspectorHome` leaves the toggle in the DOM and says whether the page
// has one at all; `armInspector` leaves the tool ARMED and says so, and is
// idempotent — it reads the armed state (`HALO`: the page-wide halo, or the
// ring on the one armed section), which outlives the menu that arms it.
//
// Scoped arming (rails-ops TO-DO-ui-jobs 284): a section's "Inspect provenance"
// (`[data-prov-scope-toggle="<scope>"]`: a row of the position card's ⋮, the
// Lifetime flows ⋮ or the event page card's ⋮) arms that section alone, and
// that section wears `[data-prov-lit]`. The Liquity V2 Trove page has no
// page-level tool: its card menu (C17) carries the card's row, so there
// `openInspectorHome` and `armInspector` reach that row and the card's values
// are the targets. `armScope` arms a named section from its control. A
// product page (ui-jobs 549/550) has neither the toggle nor a Tools menu: there
// the first section ⋮'s row stands in, and a check that wants a given
// section's values arms it with `armScope`.

export const INSPECTOR = "button.prov-inspect-toggle";
export const TOOLS_TRIGGER = "[data-tools-menu] > button";
export const HALO = ".prov-inspect-halo, [data-prov-lit]";
export const SCOPE_TOGGLE = "[data-prov-scope-toggle]";
const CARD_ROW = '[data-card-menu] [data-prov-scope-toggle="position-card"]';
/** The first section ⋮ on a product page. */
const SECTION_MENU = "[data-section-menu] button[aria-haspopup]";

/** Put the toggle in the DOM: open the Tools menu where the page has one, and
 *  do nothing where the dock already carries the toggle. False means the page
 *  mounts no inspector at all — which is a finding, not a flake. */
export async function openInspectorHome(page) {
  if (await page.$(INSPECTOR)) return true;
  // A product page (rails-ops ui-jobs 549/550) has no page-wide toggle: each
  // section's ⋮ carries its own "Inspect provenance". The first one stands in.
  const section = await page.$(SECTION_MENU);
  if (section && !(await page.$(TOOLS_TRIGGER))) {
    for (let i = 0; i < 4; i++) {
      await page.click(SECTION_MENU).catch(() => {});
      if (await page.waitForSelector(SCOPE_TOGGLE, { timeout: 4_000 }).catch(() => null)) return true;
    }
    return Boolean(await page.$(SCOPE_TOGGLE));
  }
  const trigger = await page.waitForSelector(TOOLS_TRIGGER, { timeout: 15_000 }).catch(() => null);
  if (!trigger) return false;
  // A click inside the hydration window is not answered late, it is lost
  // (lib/shared/ui-grammar.ts: up to 1.8s on a slow load, and the first page
  // of a cold run is the slow one). So try the trigger again rather than
  // reporting a menu that is there as a page without an inspector.
  for (let i = 0; i < 4; i++) {
    await trigger.click().catch(() => {});
    const opened = await page.waitForSelector(`${INSPECTOR}, ${CARD_ROW}`, { timeout: 4_000 }).catch(() => null);
    if (opened) return true;
  }
  return Boolean(await page.$(`${INSPECTOR}, ${CARD_ROW}`));
}

/** Arm the inspector, from either surface. Already armed is a no-op: the halo
 *  is the state, and the menu that armed it has closed behind the click. */
export async function armInspector(page) {
  if (await page.$(HALO)) return true;
  if (!(await openInspectorHome(page))) return false;
  // The dock's toggle is on the page from first paint, so the press can land
  // inside the hydration window and be lost (above). Press again until the
  // halo shows; the card row is re-opened first where the menu closed.
  for (let i = 0; i < 4; i++) {
    const target = (await page.$(INSPECTOR))
      ? INSPECTOR
      : (await page.$(CARD_ROW)) || !(await page.$(SECTION_MENU))
        ? CARD_ROW
        : SCOPE_TOGGLE;
    if (!(await page.$(target))) await openInspectorHome(page);
    await page.click(target).catch(() => {});
    if (await page.waitForSelector(HALO, { timeout: 4_000 }).catch(() => null)) return true;
  }
  return Boolean(await page.$(HALO));
}

/** Arm one section from its "Inspect provenance". `menu` is the ⋮ wrapper
 *  that holds the row (a locator or selector), opened first; without it the
 *  control is on the page. Already armed on
 *  that section is a no-op. Returns whether the halo shows and the control
 *  reads pressed. */
export async function armScope(page, scope, { menu = null } = {}) {
  // A section ⋮ (`[data-section-menu]`) wraps its trigger a level down.
  const trigger = (wrap) => wrap.locator(":scope > button, :scope button[aria-haspopup]").first();
  const sel = `[data-prov-scope-toggle="${scope}"]`;
  const pressed = async () =>
    (await page
      .locator(sel)
      .first()
      .getAttribute("aria-pressed")
      .catch(() => null)) === "true";
  if ((await page.$(HALO)) && (await pressed())) return true;
  if (menu) {
    const wrap = typeof menu === "string" ? page.locator(menu).first() : menu;
    for (let i = 0; i < 4 && (await page.locator(sel).count()) === 0; i++) {
      await trigger(wrap)
        .click()
        .catch(() => {});
      await page.waitForSelector(sel, { timeout: 4_000 }).catch(() => {});
    }
  }
  await page.locator(sel).first().click();
  await page.waitForSelector(HALO, { timeout: 10_000 }).catch(() => {});
  return Boolean(await page.$(HALO));
}
