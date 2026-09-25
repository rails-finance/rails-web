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

// ── THE COUNT LINE ─────────────────────────────────────────────────────────
// Decision 0019 §3, as its 2026-09-24 amendment left it: the "Showing 1,000 of
// 3,342 events" form is retired, "the page states time, not the cap", and the
// preload is "never stated to the reader as a number" (rule 2). Every form the
// toolbar writes is below, and one parser reads all of them.
//
// ⚠️ READ THE LINE WHOLE, NEVER MATCH FOR THE SHAPE YOU ARE ABOUT TO ASSERT.
// Eight verifiers pulled the line out of the DOM with a regex for the form they
// were about to check, so when the form changed the line read ABSENT and the
// failure pointed at nothing — and where the read sat behind a guard the clause
// judged nought and passed in silence (`6a41491`, and TO-DO-ui-jobs §58). The
// line has its own element: take that element's text, then judge its contents.

/** The count line's own element, inside the timeline toolbar. Scope it to the
 *  timeline you mean — a wallet on two Comets draws one toolbar per market. */
export const COUNT_LINE_SEL = "[data-prov-exempt] span.text-xs.tabular-nums";

/** The span the loaded rows cover, as `loadedSpanText` renders it: en-GB, UTC,
 *  one date where they sit inside a day. */
export const LOADED_SPAN = /\d{1,2} [A-Za-z]+ \d{4}(?: to \d{1,2} [A-Za-z]+ \d{4})?/;

/** The phrases that name the preload cap to the reader, which the amendment
 *  retired. The same set `verify-timeline-navigator.mjs` rejects. */
export const NAMES_THE_CAP =
  /Showing [\d,]+ (?:rows|of [\d,]+ events)|most recent [\d,]+ events|above what Rails|showing the newest/i;

const toNum = (v) => Number(String(v).replace(/,/g, ""));

/** Every form of `eventCountLine` (components/shared/timeline-toolbar.tsx —
 *  read it before changing this), parsed into what the line actually STATES:
 *
 *    at rest, whole history      "3,342 events"
 *    at rest, windowed           "7,161 events · loaded 20 Jan 2025 to 24 Sept 2026"
 *    at rest, lifetime pending   "Loaded 20 Jan 2025 to 24 Sept 2026" / "Showing 1,000 listed"
 *    filtered, whole history     "120 of 3,342 events"
 *    filtered, windowed          "Showing 563 of 20 Aug 2026 to 25 Sept 2026 · 29,839 events"
 *    filtered, pending           "Showing 563 of 20 Aug 2026 to 25 Sept 2026" / "…of 1,000 listed"
 *    on a segment                "January 2026 holds 709 events; loaded 25 to 31 January"
 *    on a segment, filtered      "Showing 4 of December 2024, 1 to 3 December loaded"
 *
 *  A total or a numerator may read "at least N" where the arm can only bound
 *  it. NOTE WHAT IS NOT HERE: the rows the page loaded. The amendment took the
 *  cap off the line, so a check that wants that grain reads the page's own
 *  `data-timeline-rows-loaded` marker (`drawnRows` above), not this.
 *
 *  @returns {{text:string,total:number|null,totalIsFloor:boolean,span:string|null,
 *    shown:number|null,shownIsFloor:boolean,listed:number|null,segment:string|null}|null}
 *    null where the line matches NO form the toolbar writes — which is a
 *    finding about the page or about this grammar, never a reason to skip. */
export function parseCountLine(text) {
  if (text == null) return null;
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return null;
  const out = {
    text: t,
    total: null,
    totalIsFloor: false,
    span: null,
    shown: null,
    shownIsFloor: false,
    listed: null,
    segment: null,
  };
  const SPAN = LOADED_SPAN.source;
  let m;
  // A SEGMENT states its month, in time, and never a row count.
  if ((m = t.match(/^(.+ \d{4}) holds ([\d,]+) events?(?:; loaded (.+))?$/))) {
    return { ...out, segment: m[1], total: toNum(m[2]), span: m[3] ?? null };
  }
  if ((m = t.match(/^Showing (at least )?([\d,]+) of ([A-Z][a-z]+ \d{4})(?:, (.+) loaded)?$/))) {
    return { ...out, segment: m[3], shown: toNum(m[2]), shownIsFloor: !!m[1], span: m[4] ?? null };
  }
  // At rest, windowed, the lifetime figures in hand.
  if ((m = t.match(new RegExp(`^(at least )?([\\d,]+) events? · loaded (${SPAN})$`)))) {
    return { ...out, total: toNum(m[2]), totalIsFloor: !!m[1], span: m[3] };
  }
  // At rest, lifetime figures still in flight: time alone, or what is listed
  // where not even a row has landed.
  if ((m = t.match(new RegExp(`^Loaded (${SPAN})$`)))) return { ...out, span: m[1] };
  if ((m = t.match(/^Showing ([\d,]+) listed$/))) return { ...out, listed: toNum(m[1]) };
  // Filtered on a windowed page: the numerator over the span its rows cover,
  // the life's total beside it where it is known.
  if ((m = t.match(new RegExp(`^Showing (at least )?([\\d,]+) of (${SPAN})(?: · (at least )?([\\d,]+) events?)?$`)))) {
    return {
      ...out,
      shown: toNum(m[2]),
      shownIsFloor: !!m[1],
      span: m[3],
      total: m[5] ? toNum(m[5]) : null,
      totalIsFloor: !!m[4],
    };
  }
  if ((m = t.match(/^Showing (at least )?([\d,]+) of ([\d,]+) listed(?: · (at least )?([\d,]+) events?)?$/))) {
    return {
      ...out,
      shown: toNum(m[2]),
      shownIsFloor: !!m[1],
      listed: toNum(m[3]),
      total: m[5] ? toNum(m[5]) : null,
      totalIsFloor: !!m[4],
    };
  }
  // A whole history, unfiltered and filtered. Last, because "7,161 events" is
  // also what a windowed page reads before a single row has a timestamp.
  if ((m = t.match(/^(?:(at least )?([\d,]+) of )?(at least )?([\d,]+) events?$/))) {
    return { ...out, shown: m[2] ? toNum(m[2]) : null, shownIsFloor: !!m[1], total: toNum(m[4]), totalIsFloor: !!m[3] };
  }
  return null;
}

/** The count line's text, read WHOLE off its own element. `root` scopes it to
 *  one timeline; null where the page draws no count line at all. */
export async function countLineText(page, root = "") {
  const sel = `${root ? `${root} ` : ""}${COUNT_LINE_SEL}`;
  return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
}
