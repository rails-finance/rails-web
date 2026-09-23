// Reading a timeline that is still drawing itself — the one helper.
// ---------------------------------------------------------------------------
// Two states of the same page look alike from outside and neither is a defect:
//
//   DRAWING   the local paging has drawn its first `TIMELINE_PAGE_ROWS` and a
//             "Show N more" button stands below them. Everything that hangs
//             off a row is drawn with it, market notes included, so a census
//             taken here counts the window and not the position.
//   SETTLING  the rows are served but the position's lifetime figures have
//             not arrived, so the count line can only state what is listed
//             ("Showing 1,004 listed") rather than its settled shape
//             ("Showing 1,000 rows of 29,513 events").
//
// Both were read as findings on 2026-09-20 (TO-DO-ui-jobs §38): a trove that
// draws 50 of its 70 rows shows 7 of its 9 price-gap notes, which was recorded
// as a disagreement between the page and the rule for a day; and three checks
// of `verify-event-share`'s served-folders arm went red under batch load
// against a page that had not settled. Neither page was wrong — both said so
// on their face, and nothing was reading what they said.
//
// The page states both facts as markers now: `data-timeline-rows-drawn` /
// `data-timeline-rows-loaded` on the timeline root, `data-timeline-total` on
// the count line (`components/shared/chain-truth-timeline.tsx`,
// `components/shared/timeline-toolbar.tsx`). A verifier that censuses rows, or
// anything hanging off them, waits here first.

/** Press the list's own "Show N more" from INSIDE the page. A Playwright click
 *  scrolls the button into view first, which trips the list's scroll sentinel
 *  and re-renders the button out from under the click. */
export const PRESS_SHOW_MORE = () =>
  [...document.querySelectorAll("button")].some((b) => {
    if (!/^Show [\d,]+ more$/.test(b.textContent?.trim() ?? "")) return false;
    b.click();
    return true;
  });

const PAGE_CLICKS_MAX = 80;

/** Grow the render window until the list stops paging. Returns the number of
 *  presses, or −1 if the cap was hit — which the caller must NOT read as "the
 *  list is exhausted". */
export async function exhaustPaging(page, { max = PAGE_CLICKS_MAX } = {}) {
  let presses = 0;
  for (; presses < max; presses++) {
    let pressed = await page.evaluate(PRESS_SHOW_MORE);
    if (!pressed) {
      await page.waitForTimeout(600);
      pressed = await page.evaluate(PRESS_SHOW_MORE);
      if (!pressed) break;
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(400);
  return presses >= max ? -1 : presses;
}

/** `{ drawn, loaded }` off the timeline root, or nulls where the page carries
 *  no timeline (both markers absent is a fact about the page, not an error). */
export async function drawnRows(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-timeline-rows-loaded]");
    if (!el) return { drawn: null, loaded: null };
    return {
      drawn: Number(el.getAttribute("data-timeline-rows-drawn")),
      loaded: Number(el.getAttribute("data-timeline-rows-loaded")),
    };
  });
}

/** Draw the whole loaded list, then say so. `{ complete, drawn, loaded,
 *  presses }` — `complete` false means the cap was hit or the markers never
 *  agreed, and a census taken on it counts a window. */
export async function drawWholeList(page, opts) {
  const presses = await exhaustPaging(page, opts);
  const { drawn, loaded } = await drawnRows(page);
  return { complete: presses >= 0 && drawn != null && drawn >= loaded, drawn, loaded, presses };
}

/** Wait for the count line to state the position's lifetime figures. Returns
 *  the state it reached — "known", "floor", "pending" (it never settled) or
 *  null (no count line on the page at all, which several whole-history pages
 *  correctly have). */
export async function waitForCountSettled(page, { timeout = 30000 } = {}) {
  const read = () =>
    page.evaluate(() => document.querySelector("[data-timeline-total]")?.getAttribute("data-timeline-total") ?? null);
  const until = Date.now() + timeout;
  let state = await read();
  while (state === "pending" && Date.now() < until) {
    await page.waitForTimeout(500);
    state = await read();
  }
  return state;
}
