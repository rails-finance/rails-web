// The opened timeline event card's Explanation | Figures tabs (rails-ops
// TO-DO-ui-jobs 370, `CardTabStrip` in components/shared/info-disclosure.tsx).
// A card with both an explanation and figures draws the strip: buttons with
// `data-card-tab="explanation"|"figures"`, and the T2 panel carries
// `data-card-tab-open="<tab>"`. A card with only one of the two draws it alone,
// with no strip; the event page stands the explanation above the sheet.

export const CARD_TAB_OPEN = "[data-card-tab-open]";
export const cardTabButton = (tab) => `[data-card-tab="${tab}"]`;

/** Show `tab` ("explanation" | "figures") on the opened card inside `scope` (a
 *  Playwright locator for the card's row or the card, or a page holding one
 *  opened card). A press before hydration
 *  is lost, so it presses until the panel reads the tab. Resolves to "tabbed"
 *  when the strip shows the tab, "untabbed" when the card draws no strip (both
 *  regions stand, or only one exists), or "stuck" when the strip never moved. */
export async function showCardTab(scope, tab, { tries = 6 } = {}) {
  const page = typeof scope.page === "function" ? scope.page() : scope;
  const panel = scope.locator(CARD_TAB_OPEN).first();
  if ((await panel.count()) === 0) return "untabbed";
  for (let i = 0; i < tries; i++) {
    if ((await panel.getAttribute("data-card-tab-open").catch(() => null)) === tab) return "tabbed";
    await scope
      .locator(cardTabButton(tab))
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400).catch(() => {});
  }
  return (await panel.getAttribute("data-card-tab-open").catch(() => null)) === tab ? "tabbed" : "stuck";
}

/** Wait for the opened card in `card` (a row locator) to draw `sel` on its
 *  Figures tab: the tab is pressed whenever the strip stands on Explanation,
 *  since the strip can arrive after the figures (an explainer that reads on
 *  open). Resolves true once `sel` is attached with Figures showing or no strip. */
export async function waitOnFigures(card, sel, timeout = 120_000) {
  const until = Date.now() + timeout;
  const page = card.page();
  while (Date.now() < until) {
    const state = await showCardTab(card, "figures", { tries: 2 });
    if (state !== "stuck" && (await card.locator(sel).count()) > 0) return true;
    await page.waitForTimeout(1000).catch(() => {});
  }
  return false;
}
