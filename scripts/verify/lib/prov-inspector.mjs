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
// idempotent — it reads the armed halo, which outlives the menu that arms it.

export const INSPECTOR = "button.prov-inspect-toggle";
export const TOOLS_TRIGGER = "[data-tools-menu] > button";
export const HALO = ".prov-inspect-halo";

/** Put the toggle in the DOM: open the Tools menu where the page has one, and
 *  do nothing where the dock already carries the toggle. False means the page
 *  mounts no inspector at all — which is a finding, not a flake. */
export async function openInspectorHome(page) {
  if (await page.$(INSPECTOR)) return true;
  const trigger = await page.waitForSelector(TOOLS_TRIGGER, { timeout: 15_000 }).catch(() => null);
  if (!trigger) return false;
  // A click inside the hydration window is not answered late, it is lost
  // (lib/shared/ui-grammar.ts: up to 1.8s on a slow load, and the first page
  // of a cold run is the slow one). So try the trigger again rather than
  // reporting a menu that is there as a page without an inspector.
  for (let i = 0; i < 4; i++) {
    await trigger.click().catch(() => {});
    const opened = await page.waitForSelector(INSPECTOR, { timeout: 4_000 }).catch(() => null);
    if (opened) return true;
  }
  return Boolean(await page.$(INSPECTOR));
}

/** Arm the inspector, from either surface. Already armed is a no-op: the halo
 *  is the state, and the menu that armed it has closed behind the click. */
export async function armInspector(page) {
  if (await page.$(HALO)) return true;
  if (!(await openInspectorHome(page))) return false;
  await page.click(INSPECTOR);
  await page.waitForSelector(HALO, { timeout: 10_000 }).catch(() => {});
  return Boolean(await page.$(HALO));
}
