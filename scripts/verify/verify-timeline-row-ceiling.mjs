/**
 * The index's row-ceiling disclosure — <TimelineRowCeilingFooter> under the
 * timeline of the eight capped explorers.
 *
 * Eight rails-server timeline routes read their events MV under
 * `ORDER BY block_number ASC … LIMIT 50000` and, until they carried a real
 * COUNT(*), reported the served row count as the position's total. They now
 * return `totalEvents` + `truncated`; the proxy reduces that pair to
 * `rowCeiling` on the timeline payload and the page states it under the last
 * event.
 *
 * Two properties are asserted, and the SECOND is the one that decides whether
 * this change is safe to ship ahead of the backend:
 *
 *   1. WITH a ceiling on the wire, the footer states it — the served count,
 *      the real total, the difference, and the two consequences (the newest
 *      card is not the newest event; the browser-summed figures cover the
 *      served slice only).
 *   2. WITHOUT it — every response a backend that predates the fields can
 *      send — the page renders exactly as it did before: no footer, no
 *      partial sentence, no empty rule.
 *
 * The ceiling is INJECTED into the real response rather than hunted for: the
 * only positions past 50,000 events are five Aave V3 whales whose payload is
 * 154 MB, and a verifier that needs one of those to go green is a verifier
 * nobody runs. The fixture is therefore a small Liquity V1 wallet, fetched
 * live and then given a ceiling on its way to the page.
 *
 * ⚠️⚠️ THE INJECTION USED TO BE `page.route()` AND STOPPED WORKING SILENTLY.
 * Playwright only sees requests the BROWSER makes, and since the detail-page
 * SSR migration this page makes none — it seeds from the server and the client
 * effect returns early on `if (seeded)`. The route handler never fired, the
 * page rendered the real uncapped response, and every assertion here failed on
 * a NaN. Worse than the reds: had these assertions been NEGATIVE ("no capped
 * verdict"), the whole section would have passed VACUOUSLY.
 *
 * It now injects through ./injecting-proxy.mjs, which sits in front of the dev
 * server. `ssrOrigin()` builds the app's own fetch origin from the incoming
 * request's Host header, so pointing the browser at the proxy makes the SERVER
 * fetch its API back through the proxy too — one injection point for both
 * lanes, and one that cannot rot the same way, because it does not care which
 * side made the request. `proxy.rewrites` is asserted, so an injection that
 * stops firing is a red rather than a silent pass.
 *
 * Needs a dev server. BASE defaults to http://localhost:3000; the wallet is
 * taken from the listing API rather than pinned, so a re-index cannot rot it.
 */
import { chromium } from "playwright";

import { startInjectingProxy } from "./injecting-proxy.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
// Events the fixture does NOT have, standing in for what the ceiling cut.
const MISSING = 53902;

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("  ok:", msg);
  } else {
    failures++;
    console.log("  FAIL:", msg);
  }
}

/** The page's whole timeline text, with the list actually finished.
 *
 *  ⚠️ The footer CLOSES the list, and since the timeline paging programme the
 *  list does not end at the first screen — it stops at 200 rows behind a
 *  "Show N more" control. Scrolling alone leaves the reader (and this script)
 *  looking at the pager, not the disclosure, which is why every assertion
 *  below read a page that had not yet rendered the thing under test. Expand
 *  until the control is gone, THEN scroll, THEN read. */
async function timelineText(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  for (let i = 0; i < 40; i++) {
    const more = page.locator("button", { hasText: /^Show \d[\d,]* more$/ }).first();
    if ((await more.count()) === 0) break;
    await more.click();
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  return page.evaluate(() => document.body.innerText);
}

const res = await fetch(`${BASE}/api/liquity-v1/positions?limit=1`);
const listing = await res.json();
const wallet = listing?.data?.[0]?.wallet;
if (!wallet) throw new Error("no Liquity V1 position to test against — is the dev server up?");
const url = `${BASE}/ethereum/liquity-v1/${wallet}`;
console.log("fixture:", url);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// The ceiling is added in front of the dev server, so it reaches the page
// whichever side fetched the timeline — today that is the server.
const proxy = await startInjectingProxy({
  target: BASE,
  rewrite: (reqUrl, json) => {
    if (!/\/api\/liquity-v1\/timeline/.test(reqUrl)) return null;
    const shown = (json.events ?? []).length;
    if (!shown) return null;
    return { ...json, rowCeiling: { shown, total: shown + MISSING } };
  },
});

console.log("\nwith a row ceiling on the wire");
const capped = await timelineText(page, `${proxy.origin}/ethereum/liquity-v1/${wallet}`);

// ⇒ The injection is asserted BEFORE anything it was supposed to produce. An
// injection that stops firing (as page.route() silently did once SSR landed)
// must read as a broken instrument, never as a page that failed to say its
// piece — and never, on a negative assertion, as a pass.
assert(proxy.rewrites > 0, `the ceiling actually reached the page (${proxy.rewrites} response(s) rewritten)`);
// The other half of the instrument. The footer closes the list, so a list still
// behind its pager cannot show one — and the six assertions below would read
// that as the copy being wrong.
assert(!/\bShow \d[\d,]* more\b/.test(capped), "the list is fully expanded (no pager left holding rows back)");
const shown = Number(/Rails read the first ([\d,]+) of/.exec(capped)?.[1]?.replace(/,/g, "") ?? NaN);
assert(capped.includes("This list is capped."), "the capped verdict is stated");
assert(Number.isFinite(shown) && shown > 0, `the served count is named (${shown})`);
assert(
  capped.includes(`of this position’s ${(shown + MISSING).toLocaleString("en-US")} events`),
  "the position's real total is named",
);
assert(
  capped.includes(`the ${MISSING.toLocaleString("en-US")} that followed were not read`),
  "the difference is named as the events that FOLLOWED — the cut runs ASC, so what is missing is the recent end",
);
assert(
  capped.includes("the newest card above is not this position’s latest event"),
  "the consequence for the list is stated",
);
assert(
  capped.includes("The lifetime totals and the filter counts are summed from the events on this page"),
  "the consequence for the figures above is stated",
);
assert(!/\byou\b/i.test(capped.split("This list is capped.")[1]?.slice(0, 400) ?? ""), "third person, never 'you'");

console.log("\nwithout it — the backend that predates the fields");
// Straight at BASE: no proxy, so nothing is added and this is the real
// response every pre-fields backend sends.
const plain = await timelineText(page, url);
assert(!plain.includes("This list is capped."), "no verdict");
assert(!plain.includes("Rails read the first"), "no partial sentence");
// The same guard the capped half gets. Both halves read a page that rendered
// its timeline; an empty one would pass these two by saying nothing at all.
assert(!/No transaction history available/.test(plain), "the plain page actually rendered its timeline");

await proxy.close();
await browser.close();
console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
