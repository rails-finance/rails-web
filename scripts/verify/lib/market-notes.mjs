// Market notes on a desktop timeline, for the verifiers that read them.
// ----------------------------------------------------------------------------
// Since rails-ops TO-DO-ui-jobs item 118 a closed note on desktop is a MARKER on
// the spine (`[data-note-marker]`), not a row: the `[data-market-note]` row
// mounts only once the note is opened. A verifier that reads note rows turns on
// Display's "Open all market notes" before the page loads, which draws every
// note as its header row, the shape the rows had at rest before the markers.
//
//   import { showNoteRows, setMarketNotes, marketNoteCount } from "./lib/market-notes.mjs";
//
//   showNoteRows(context)       every page the context opens draws note rows.
//                               A stored preference the page already holds for
//                               the key wins, so a check that turns it off and
//                               reloads reads what it set.
//   setMarketNotes(page, on)    Display's "Market notes", ticked or not;
//                               false when the page offers no such item.
//   marketNoteCount(page)       every note the timeline places, drawn or not:
//                               `data-market-notes` on the timeline root. The
//                               toolbar's "Market notes · N" pill stated it
//                               until item 118.

const KEY = "timeline-display-v3";

export async function showNoteRows(context) {
  await context.addInitScript((key) => {
    try {
      const cur = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (cur.openAllMarketNotes === undefined) {
        localStorage.setItem(key, JSON.stringify({ ...cur, openAllMarketNotes: true }));
      }
    } catch {}
  }, KEY);
}

/** The timeline's own Display trigger; the page chrome has a Display control
 *  of its own with the same accessible name. */
const displayTrigger = (page) =>
  page.locator('button[aria-label="Display"][title="Choose what each timeline row shows"]').first();

export async function setMarketNotes(page, wantOn) {
  const trigger = displayTrigger(page);
  if ((await trigger.count()) === 0) return false;
  await trigger.click();
  const item = page.locator("button.overlay-item", { hasText: /^Market Notes$/i }).first();
  const offered = await item
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (offered) {
    const on = (await item.locator(".bg-rb-500").count()) > 0;
    if (on !== wantOn) await item.click();
  }
  // A second press of the trigger closes the menu.
  await trigger.click();
  return offered;
}

export async function marketNoteCount(page) {
  const v = await page
    .locator("[data-timeline-rows-drawn]")
    .first()
    .getAttribute("data-market-notes")
    .catch(() => null);
  return v == null ? 0 : Number(v);
}
