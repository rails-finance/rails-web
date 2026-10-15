// A group on the timeline, as the verifiers read it (rails-ops TO-DO-ui-jobs
// 250, third revision; `components/shared/group-frame.tsx`,
// `components/shared/timeline-run-card.tsx`).
// ----------------------------------------------------------------------------
// Until 7 Oct 2026 (`9301aba`) a run or served folder was a header named
// "72 consecutive redemptions — expand the run" whose click opened it. Since
// then a group is a `GroupFrame` (`data-group-frame="closed"` or `"open"`);
// closed, it holds one card whose header is named by the group's label
// ("72 redemptions, 1 Sep 2026 to 27 Sep 2026: cleared 2,010 USDaf, reduced
// 1,798 sUSDS"), and a click on that header opens the summary card. The
// members open only from the row's ⋮, "Show 72 grouped events"
// (`data-menu-item="show-group"`); open, the frame holds the members alone and
// each member's ⋮ offers "Hide".
//
//   import { GROUP_FRAME, GROUP_HEADER, groupCount, openGroup } from "./lib/group-rows.mjs";

/** Every group, closed or open. */
export const GROUP_FRAME = "[data-group-frame]";
/** A closed group's frame. */
export const CLOSED_GROUP = '[data-group-frame="closed"]';
/** An open group's frame. */
export const OPEN_GROUP = '[data-group-frame="open"]';
/** The header inside a closed group's frame: the control named by the group's label. */
export const HEADER_IN_GROUP = '[role="button"][aria-expanded][aria-label]';
/** A closed group's header, from the page. */
export const GROUP_HEADER = `${CLOSED_GROUP} ${HEADER_IN_GROUP}`;

/** The member count a group's label states: "72 redemptions, …" → 72. */
export function groupCount(label) {
  return Number((/^([\d,]+) /.exec(label ?? "")?.[1] ?? "0").replace(/,/g, ""));
}

/** The member noun a group's label states: "72 redemptions, …" → "redemptions". */
export function groupNoun(label) {
  return /^[\d,]+ ([^,]+),/.exec(label ?? "")?.[1] ?? null;
}

/** An open group draws its members a batch at a time (decision 0039, rule 5;
 *  `GROUP_MEMBER_BATCH` in group-frame.tsx): the next batch's button, under
 *  the drawn members, while more remain. */
export const GROUP_MORE = "[data-group-more] button";

/** Press an open group's next-batch button from inside the page until every
 *  member is drawn (`data-group-members-drawn` reaches `data-group-members`).
 *  A Playwright click would scroll the button into view and trip the
 *  window's sentinel under it. */
export async function drawAllMembers(page, frameHandle, { max = 200 } = {}) {
  for (let i = 0; i < max; i++) {
    const pressed = await frameHandle.evaluate((el) => {
      const b = el.querySelector(":scope > [data-group-members] > [data-group-more] button");
      if (!b) return false;
      b.click();
      return true;
    });
    if (!pressed) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

/** Open a closed group from its ⋮: `frame` is a Locator on a closed
 *  `[data-group-frame]`. Retries the trigger, since a press before hydration is
 *  lost. Resolves true once the frame reads "open", with every member drawn
 *  unless `allMembers` is false. */
export async function openGroup(page, frame, { tries = 6, allMembers = true } = {}) {
  const handle = await frame.elementHandle();
  if (!handle) return false;
  for (let attempt = 0; attempt < tries; attempt++) {
    await frame
      .locator('[data-event-head-menu] button[aria-haspopup="menu"]')
      .first()
      .click()
      .catch(() => {});
    const item = page.locator('[data-menu-item="show-group"]:visible').first();
    const shown = await item
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (shown) {
      await item.click().catch(() => {});
      const open = await page
        .waitForFunction((el) => el.getAttribute("data-group-frame") === "open", handle, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (open) {
        if (allMembers) await drawAllMembers(page, handle);
        return true;
      }
    }
    await page.waitForTimeout(700);
  }
  return false;
}
