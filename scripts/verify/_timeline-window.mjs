// THE CUT, READ FROM THE CONSTANT ITSELF.
//
// Several checks compare what a page drew against what the index would answer
// for the same window, and to do that they have to ask the index for the same
// number of rows the page asked for. Writing that number into each script
// makes a second source of truth for it: raise the cut and the scripts keep
// asking for the old window, so the comparison is between two different
// questions and goes quiet rather than red — the green-but-vacuous family
// again.
//
// So it is read out of `lib/shared/timeline-opening-balance.ts` at run time.
// Not imported: these are plain .mjs scripts and that file is TypeScript. A
// regex over one `export const` line is the whole dependency, and it throws
// rather than defaulting if the line ever moves — a check that silently fell
// back to a guessed cut would be the exact failure this exists to prevent.
import { readFileSync } from "node:fs";

const SOURCE = new URL("../../lib/shared/timeline-opening-balance.ts", import.meta.url);
const text = readFileSync(SOURCE, "utf8");
const m = /^export const TIMELINE_WINDOW_ROWS = (\d+);$/m.exec(text);
if (!m) {
  throw new Error(
    "TIMELINE_WINDOW_ROWS not found in lib/shared/timeline-opening-balance.ts — " +
      "the cut moved or was renamed, and every check that compares a window against the index is now guessing.",
  );
}

/** The newest N rows a timeline draws before the boundary. */
export const TIMELINE_WINDOW_ROWS = Number(m[1]);

/** The same number as the index takes it: `?recent=N`. */
export const RECENT_QS = `recent=${TIMELINE_WINDOW_ROWS}`;

/** `1,000` / `5,000` — the cut as the page PRINTS it, for a check that reads a
 *  count line. en-US, the house locale for numbers. */
export const CUT_TEXT = TIMELINE_WINDOW_ROWS.toLocaleString("en-US");
