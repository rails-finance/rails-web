// The listing toolbar's search and Filters panel for the verifiers (N1,
// ui-jobs 801; components/shared/filter-bar/{list-toolbar,filter-sheet}.tsx).
// ----------------------------------------------------------------------------
// The search rests as an icon, `[data-search-open]`, and draws its field
// `input[data-search-input]` once pressed (or while `?q=` holds a query); an
// empty field collapses again on blur.
//
// An unset filter group has no chip in the row: the Filters button
// `[data-filter-sheet-open]` reaches every dimension, at every width. Below sm
// it opens a bottom sheet portalled to body (`data-filter-sheet=""`); from sm
// a panel in the page under the row (`data-filter-sheet="inline"`). Inside
// both: `[data-filter-sheet-row="<id>"]` per dimension (a drill-in button, or
// a `role="switch"` for a one-option dimension), `[data-filter-sheet-segments]`
// for a two-option one and for Status (`[data-filter-sheet-segment="open|closed|all"]`,
// ui-jobs 805), `[data-filter-sheet-range]` for a range, the open
// sub-view `[data-filter-sheet-view="<id>"]` with `[data-filter-sheet-option]`
// rows, and `[data-filter-sheet-show]`. Edits are staged until Show.
//
//   import { openFilterSheet, setFilterViaSheet } from "./lib/listing-toolbar.mjs";
//   await setFilterViaSheet(page, "market", ["WETH"]);

export const SHEET = "[data-filter-sheet]";

/** The listing's search field, opened from its icon where it rests closed. */
export async function openListingSearch(page, scope = page) {
  const input = scope.locator("input[data-search-input]").first();
  if ((await input.count()) === 0) {
    const opener = scope.locator("[data-search-open]").first();
    if ((await opener.count()) > 0) await opener.click();
  }
  await input.waitFor({ state: "visible", timeout: 10_000 });
  return input;
}

/** The open sheet or panel. */
export const filterSheet = (page) => page.locator(SHEET).first();

/** Open the Filters sheet (below sm) or panel (from sm); false where the
 *  scope draws no Filters button. */
export async function openFilterSheet(page, scope = page) {
  if ((await page.locator(SHEET).count()) > 0) return true;
  const button = scope.locator("[data-filter-sheet-open]").first();
  if ((await button.count()) === 0) return false;
  await button.click();
  await filterSheet(page).waitFor({ state: "visible", timeout: 5000 });
  return true;
}

/** Wait for the sheet or panel to go, then for the listing to take the write. */
async function sheetGone(page) {
  await page.locator(SHEET).first().waitFor({ state: "detached", timeout: 5000 });
  await page.waitForTimeout(200);
}

/** Close without applying: Escape drops the draft at both widths. */
export async function closeFilterSheet(page) {
  if ((await page.locator(SHEET).count()) === 0) return;
  await page.keyboard.press("Escape");
  await sheetGone(page);
}

/** Press Show: the staged draft reaches the URL and the list. */
export async function applyFilterSheet(page) {
  await filterSheet(page).locator("[data-filter-sheet-show]").first().click();
  await sheetGone(page);
}

/** Open one dimension's options in the open sheet; false where it has no
 *  drill-in row. */
export async function openSheetRow(page, id) {
  const sheet = filterSheet(page);
  const row = sheet.locator(`button[data-filter-sheet-row="${id}"]:not([role="switch"])`).first();
  if ((await row.count()) === 0) return false;
  await row.click();
  await sheet.locator(`[data-filter-sheet-view="${id}"]`).first().waitFor({ timeout: 5000 });
  return true;
}

/** Back from a sub-view to the list of rows, keeping the draft. */
export async function leaveSheetRow(page) {
  const sheet = filterSheet(page);
  if ((await sheet.locator("[data-filter-sheet-view]").count()) === 0) return;
  await sheet.locator("[data-filter-sheet-back]").first().click();
  await sheet.locator("[data-filter-sheet-view]").first().waitFor({ state: "detached", timeout: 5000 });
}

/** Every option row of the open sub-view, as `axisRows` reads a pill editor:
 *  key, label, count, ticked, `parent` (the umbrella a leg sits under) and
 *  `umbrella` (the umbrella's row). */
export async function sheetOptionRows(page) {
  return filterSheet(page)
    .locator("[data-filter-sheet-view] [data-filter-sheet-option]")
    .evaluateAll((els) =>
      els.map((el) => {
        const spans = el.querySelectorAll("span");
        const meta = spans[spans.length - 1]?.textContent ?? "";
        return {
          key: el.getAttribute("data-filter-sheet-option"),
          label: (el.querySelector("span.flex-1")?.textContent ?? "").trim(),
          count: /^[\d,]+$/.test(meta.trim()) ? Number(meta.replace(/,/g, "")) : null,
          checked: el.getAttribute("aria-checked") === "true",
          parent: el.getAttribute("data-pill-nested") || null,
          umbrella: el.hasAttribute("data-pill-parent"),
        };
      }),
    );
}

/** In the open multi sub-view, tick `keys` and no other (umbrella rows left alone). */
export async function tickSheetOptions(page, keys) {
  const view = filterSheet(page).locator("[data-filter-sheet-view]").first();
  for (const o of (await sheetOptionRows(page)).filter((r) => !r.umbrella)) {
    if (keys.includes(o.key) !== o.checked) await view.locator(`[data-filter-sheet-option="${o.key}"]`).first().click();
  }
}

/**
 * Set one dimension through the Filters sheet and apply: `values` are the
 * option values to pick (a multi ticks these and no other; a single picks the
 * first, a switch turns on with one value and off with none, a segmented row
 * takes the value or "any"). Returns false, the sheet closed, where the
 * dimension has no row.
 */
export async function setFilterViaSheet(page, id, values, { scope = page } = {}) {
  if (!(await openFilterSheet(page, scope))) return false;
  const sheet = filterSheet(page);
  const segments = sheet.locator(`[data-filter-sheet-segments="${id}"]`).first();
  const toggle = sheet.locator(`[data-filter-sheet-row="${id}"][role="switch"]`).first();
  if ((await segments.count()) > 0) {
    await segments
      .locator(`[data-filter-sheet-segment="${values[0] ?? "any"}"]`)
      .first()
      .click();
  } else if ((await toggle.count()) > 0) {
    const on = (await toggle.getAttribute("aria-checked")) === "true";
    if (on !== values.length > 0) await toggle.click();
  } else if (await openSheetRow(page, id)) {
    const view = sheet.locator(`[data-filter-sheet-view="${id}"]`).first();
    const multi = (await view.locator('[data-filter-sheet-option][role="checkbox"]').count()) > 0;
    if (multi) {
      await tickSheetOptions(page, values);
      await leaveSheetRow(page);
    } else {
      // A single pick returns to the list.
      const opt = view.locator(`[data-filter-sheet-option="${values[0]}"]`).first();
      if ((await opt.getAttribute("aria-checked")) === "true") await leaveSheetRow(page);
      else {
        await opt.click();
        await view.waitFor({ state: "detached", timeout: 5000 });
      }
    }
  } else {
    await closeFilterSheet(page);
    return false;
  }
  await applyFilterSheet(page);
  return true;
}
