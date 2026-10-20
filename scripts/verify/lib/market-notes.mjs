// Market notes on a desktop timeline, for the verifiers that read them.
// ----------------------------------------------------------------------------
// Since rails-ops TO-DO-ui-jobs item 399 every note draws its collapsed row
// (`[data-market-note]`, or `[data-market-note-run]` for a run of rate notes)
// whenever Display's "Market notes" is on; the spine markers and "Open all
// market notes" are gone.
//
//   import { showNoteRows, setMarketNotes, marketNoteCount } from "./lib/market-notes.mjs";
//
//   showNoteRows(context)       nothing since item 399: the rows draw at rest.
//                               Kept so its callers read unchanged.
//   setMarketNotes(page, on)    Display's "Market notes", ticked or not;
//                               false when the page offers no such item.
//   marketNoteCount(page)       every note the timeline places, drawn or not:
//                               `data-market-notes` on the timeline root. The
//                               toolbar's "Market notes · N" pill stated it
//                               until item 118.

// eslint-disable-next-line no-unused-vars
export async function showNoteRows(context) {}

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
