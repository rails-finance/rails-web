// Waits for the page's position card (rails-ops TO-DO-position-card 270,
// 322). The card has no open or closed rows any more: every headline draws
// its lines and the (i) Explanation row is the one toggle, so there is
// nothing to open. Returns as soon as a detail card frame (P1) is in the DOM,
// or at the deadline on a page with none. Returns 0, the rows it opened,
// for the callers that log it.
export async function openPositionCards(page, deadlineMs = 10_000) {
  await page
    .locator('[data-anatomy~="P1"]')
    .first()
    .waitFor({ state: "attached", timeout: deadlineMs })
    .catch(() => {});
  return 0;
}
