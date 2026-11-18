// The timeline's filter pills for the verifiers (ui-jobs 735): Type, Asset,
// Version and Address as the listings' pills (N1.10), each editor staged and
// applied. The callers name an axis by its old menu label or its pill name.
// Hiding an option is "keep every other one", which writes the same ?hide=
// the old untick did.

/** The old menus' names to the pills'. */
export const PILL_OF = { "Types of event": "Type", Assets: "Asset", Versions: "Version", Addresses: "Address" };
const pillName = (label) => PILL_OF[label] ?? label;

/** The axis pill, scoped to `scope` (a page or a locator). */
export const axisPill = (scope, label) => scope.locator(`[data-filter-pill="${pillName(label)}"]`).first();

/** Open an axis pill's editor; false where the page draws no such pill. */
export async function openAxis(page, label, scope = page) {
  const pill = axisPill(scope, label);
  if ((await pill.count()) === 0) return false;
  await pill.locator("[data-pill-open]").first().click();
  await page.locator("[data-pill-option]").first().waitFor({ timeout: 5000 });
  return true;
}

/** The open editor's options, umbrella rows left out: key, label, count and
 *  whether it is ticked (kept). */
export async function axisOptions(page) {
  return page.locator("[data-pill-option]:not([data-pill-parent])").evaluateAll((els) =>
    els.map((el) => {
      const spans = el.querySelectorAll("span");
      const meta = spans[spans.length - 1]?.textContent ?? "";
      return {
        key: el.getAttribute("data-pill-option"),
        label: (el.querySelector("span.flex-1")?.textContent ?? "").trim(),
        count: /^[\d,]+$/.test(meta.trim()) ? Number(meta.replace(/,/g, "")) : null,
        checked: el.getAttribute("aria-checked") === "true",
      };
    }),
  );
}

/** Tick exactly `keys` in the open editor and apply. */
export async function keepOnly(page, keys) {
  for (const o of await axisOptions(page)) {
    if (keys.includes(o.key) !== o.checked) await page.locator(`[data-pill-option="${o.key}"]`).first().click();
  }
  await page.locator("[data-pill-editor-apply]").first().click();
  await page.waitForTimeout(200);
}

/** Hide the n-th option of an axis (keep every other one); its label, or
 *  null where the page draws no such pill. */
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

/** Close an open editor without applying (a second press of its pill). */
export async function closeAxis(page, label, scope = page) {
  await axisPill(scope, label).locator("[data-pill-open]").first().click();
  await page.waitForTimeout(150);
}
