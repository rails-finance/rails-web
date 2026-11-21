// The timeline's filter pills for the verifiers (ui-jobs 735, 801): Type,
// Asset, Version and Address as the listings' pills (N1.10), each editor
// staged and applied. An axis that hides nothing draws no pill; the Filters
// sheet reaches it (lib/listing-toolbar.mjs), and these helpers take that
// route, so a caller reads and ticks the same rows either way.
// The callers name an axis by its old menu label or its pill name. Hiding an
// option is "keep every other one", which writes the same ?hide= the old
// untick did.

import {
  SHEET,
  applyFilterSheet,
  closeFilterSheet,
  leaveSheetRow,
  openFilterSheet,
  openSheetRow,
  sheetOptionRows,
  tickSheetOptions,
} from "./listing-toolbar.mjs";

/** The old menus' names to the pills'. */
export const PILL_OF = { "Types of event": "Type", Assets: "Asset", Versions: "Version", Addresses: "Address" };
const pillName = (label) => PILL_OF[label] ?? label;
/** The axis's dimension id in the Filters sheet ("Type" → "type"). */
const axisId = (label) => pillName(label).toLowerCase();

/** The axis pill, scoped to `scope` (a page or a locator). */
export const axisPill = (scope, label) => scope.locator(`[data-filter-pill="${pillName(label)}"]`).first();

/** True while an axis's options are open in the Filters sheet. */
const inSheet = async (page) => (await page.locator(`${SHEET} [data-filter-sheet-view]`).count()) > 0;

/** Open an axis's options: its pill's editor where the pill is drawn (the
 *  axis hides something), else its row in the Filters sheet; false where the
 *  page offers neither. */
export async function openAxis(page, label, scope = page) {
  const pill = axisPill(scope, label);
  if ((await pill.count()) > 0) {
    await pill.locator("[data-pill-open]").first().click();
    await page.locator("[data-pill-option]").first().waitFor({ timeout: 5000 });
    return true;
  }
  if (!(await openFilterSheet(page, scope))) return false;
  if (await openSheetRow(page, axisId(label))) return true;
  await closeFilterSheet(page);
  return false;
}

/** Every row of the open editor or sheet view: key, label, count, whether it
 *  is ticked (kept), `parent` (the umbrella a leg sits under, else null) and
 *  `umbrella` (the umbrella's row, which ticks its legs). */
export async function axisRows(page) {
  if (await inSheet(page)) return sheetOptionRows(page);
  return page.locator("[data-pill-option]").evaluateAll((els) =>
    els.map((el) => {
      const spans = el.querySelectorAll("span");
      const meta = spans[spans.length - 1]?.textContent ?? "";
      return {
        key: el.getAttribute("data-pill-option"),
        label: (el.querySelector("span.flex-1")?.textContent ?? "").trim(),
        count: /^[\d,]+$/.test(meta.trim()) ? Number(meta.replace(/,/g, "")) : null,
        checked: el.getAttribute("aria-checked") === "true",
        parent: el.getAttribute("data-pill-nested") || null,
        umbrella: el.hasAttribute("data-pill-parent"),
      };
    }),
  );
}

/** The open editor's options, umbrella rows left out. */
export async function axisOptions(page) {
  return (await axisRows(page)).filter((r) => !r.umbrella);
}

/** The options a row label stands for: an umbrella's legs, or the one option. */
export function optionsOf(rows, label) {
  const row = rows.find((r) => r.label === label);
  if (!row) return [];
  return row.umbrella ? rows.filter((r) => r.parent === row.key) : [row];
}

/** Tick exactly `keys` in the open editor or sheet view and apply. */
export async function keepOnly(page, keys) {
  if (await inSheet(page)) {
    await tickSheetOptions(page, keys);
    await leaveSheetRow(page);
    await applyFilterSheet(page);
    return;
  }
  for (const o of await axisOptions(page)) {
    if (keys.includes(o.key) !== o.checked) await page.locator(`[data-pill-option="${o.key}"]`).first().click();
  }
  await page.locator("[data-pill-editor-apply]").first().click();
  await page.waitForTimeout(200);
}

/** Hide the n-th option of an axis (keep every other one); its label, or
 *  null where the page offers no such axis. */
export async function hideOption(page, label, n = 0, scope = page) {
  if (!(await openAxis(page, label, scope))) return null;
  const opts = await axisOptions(page);
  const target = opts[n];
  await keepOnly(
    page,
    opts.filter((_, i) => i !== n).map((o) => o.key),
  );
  return target?.label ?? null;
}

/** Close an open editor without applying: a second press of its pill, or
 *  Escape on the Filters sheet. */
export async function closeAxis(page, label, scope = page) {
  if ((await page.locator(SHEET).count()) > 0) {
    await closeFilterSheet(page);
    return;
  }
  await axisPill(scope, label).locator("[data-pill-open]").first().click();
  await page.waitForTimeout(150);
}
