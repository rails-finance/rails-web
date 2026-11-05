// The card's export menu → "Copy Position", and the clipboard it fills. A
// press on the export button before hydration is lost, so the button is
// pressed until the menu item is drawn (the Polaris scripts crashed on the
// item's 30 s wait under load; rails-ops reference/verifier-known-faults.md).
// The page's context needs the clipboard-read permission.

export async function copyPositionMarkdown(page, { tries = 6 } = {}) {
  const button = page.getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i }).first();
  const item = page.getByRole("menuitem", { name: /Copy Position/i });
  for (let i = 0; i < tries; i++) {
    if ((await item.count()) > 0) break;
    await button.click({ timeout: 30_000 });
    await item
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
  }
  await item.first().click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
}
