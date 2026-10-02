// Opens every position card on the page that draws closed (rails-ops ui-jobs
// 209: a card with progressive disclosure is closed by default, and its
// detail lines are not in the DOM until it opens; the (i) Explanation row
// draws in both states). A page whose cards do not disclose has no toggle,
// and this returns 0. Clicks are retried until the deadline, so a click made
// before hydration is made again.
export async function openPositionCards(page, deadlineMs = 10_000) {
  const closed = page.locator('[data-card-disclosure-toggle][aria-expanded="false"]');
  const deadline = Date.now() + deadlineMs;
  let opened = 0;
  while (Date.now() < deadline) {
    if ((await page.locator("[data-card-disclosure-toggle]").count()) === 0) return opened;
    if ((await closed.count()) === 0) return opened;
    await closed
      .first()
      .click({ timeout: 3000 })
      .then(() => (opened += 1))
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  return opened;
}
