// Opens every headline row on the page's position cards that stands closed
// (rails-ops ui-jobs 209, 295: on a card with progressive disclosure each row
// opens on a chevron, the ratio row closed by default, and a closed
// row's lines are not in the DOM; the (i) Explanation row draws either way).
// A page whose cards do not disclose has no "Position summary" heading, and
// this returns 0. The row toggles draw once the page hydrates, and clicks are
// retried until the deadline, so a click made before hydration is made again.
export async function openPositionCards(page, deadlineMs = 10_000) {
  const closed = page.locator('[data-card-row-toggle][aria-expanded="false"]');
  const deadline = Date.now() + deadlineMs;
  let opened = 0;
  while (Date.now() < deadline) {
    if ((await page.locator("[data-card-row-toggle]").count()) === 0) {
      if ((await page.locator("[data-position-summary]").count()) === 0) return opened;
      await page.waitForTimeout(300);
      continue;
    }
    if ((await closed.count()) === 0) return opened;
    await closed
      .first()
      .dispatchEvent("click", undefined, { timeout: 3000 })
      .then(() => (opened += 1))
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  return opened;
}
