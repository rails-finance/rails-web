// Live in-browser verification that the wallet pill on a position surface
// deep-links to the wallet-FILTERED listing — and that the listing actually
// filters (the whole point: a wrong param navigates fine and silently ignores
// the filter, which is how Aave V4's `?wallet=` and Liquity V2's `?ownerAddress=`
// survived every prior check). So per protocol we assert BOTH:
//   1. the pill lands on `<route>?q=0x…`  (lowercased), and
//   2. the resulting listing shows FEWER rows than the unfiltered set
//      (filtered < full) — a URL-only check would have passed on `?wallet=` too.
//
// Runs against a `next dev` pointed at the live indexed backend. Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-wallet-links.mjs [slug…]
// Naming slugs runs only those, for re-running one red alone.
//
// claude-in-chrome can't reach localhost, so this must be the Playwright script.
//
// WHAT ROTTED — two things, neither of them the pill:
//
//  1. ONE CLICK, NO RETRY. The detail pages SSR, so `waitForSelector(FILTER_BTN)`
//     returns at paint and the click that followed it immediately landed before
//     React had attached the handler, where it was silently discarded. The URL
//     then never changed and `waitForURL` timed out 30s later — which reads
//     exactly like a pill that does not navigate. It is not: measured on
//     /ethereum/morpho, /ethereum/compound-v3 and /ethereum/spark, the URL was
//     unchanged five seconds after the first click and the SECOND (spark: the
//     eighth, over 3.0s) navigated correctly. The click is now made in a loop
//     that re-reads the URL each poll, the same remedy `verify-feedback-frontend`
//     uses for its modal trigger.
//
//  2. THE ROUTE WAS ASSUMED TO BE `/<slug>`. Explorer routes are chain-scoped
//     now (rails-ops decision 0016) and the slug is not always the last segment:
//     `/compound` is a 308 to `/ethereum/compound-v3`. Both the `waitForURL`
//     pattern and the `urlOk` regex were built from the slug, so compound could
//     not have passed however well the pill worked. Each explorer now carries
//     its canonical route explicitly, the run asserts the path the browser
//     LANDED on is that route, and the pill's URL is checked against the same
//     constant — so the next route move is one loud red per explorer rather than
//     a silent mismatch.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROW = 'a[class~="group/listing-row"]';
// The shared `components/shared/wallet-pill.tsx` renders exactly this label.
// (A second alternative, `Filter troves by owner`, was carried here long after
// the last component emitting it was retired; a dead selector alternative
// cannot fail, so it was only ever noise.)
const FILTER_BTN = 'button[aria-label^="Filter positions by wallet"]';

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// Protocol → { slug, canonical route, how to reach a pill }.
// `route` is the chain-scoped path the explorer actually serves — the one
// thing here that a route move invalidates, so it is written down once per
// explorer and everything else is derived from it. `check:routes` is the
// static gate that the roster, the route tree and the redirect table agree;
// this is the runtime half.
// `onListing: true` means the listing itself renders a clickable wallet pill
// (Aave V4 listing card, Liquity V2 trove-identity row) so we click there; the
// rest render the pill only on the detail page (the receipts branch), reached
// via the first row's href.
const PROTOCOLS = [
  { slug: "liquity-v2", route: "/ethereum/liquity-v2", onListing: true },
  { slug: "aave-v4", route: "/ethereum/aave-v4", onListing: true },
  { slug: "morpho", route: "/ethereum/morpho" },
  { slug: "compound", route: "/ethereum/compound-v3" },
  { slug: "compound-v2", route: "/ethereum/compound-v2" },
  { slug: "spark", route: "/ethereum/spark" },
  { slug: "aave-v3", route: "/ethereum/aave-v3" },
  { slug: "dolomite", route: "/ethereum/dolomite" },
  { slug: "fluid", route: "/ethereum/fluid" },
  { slug: "maple", route: "/ethereum/maple" },
  { slug: "makerdao", route: "/ethereum/makerdao" },
  { slug: "moonwell", route: "/ethereum/moonwell" },
  { slug: "frankencoin", route: "/ethereum/frankencoin" },
  { slug: "fx", route: "/ethereum/fx" },
  { slug: "llamalend", route: "/ethereum/llamalend" },
  { slug: "liquity-v1", route: "/ethereum/liquity-v1" },
  { slug: "pwn", route: "/ethereum/pwn" },
];

const only = new Set(process.argv.slice(2));
const subjects = only.size ? PROTOCOLS.filter((p) => only.has(p.slug)) : PROTOCOLS;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(90000);

// The run-level control: how many explorers actually got as far as clicking a
// pill. Every filter assertion below is conditional on reaching one, so a run
// that reached none asserted nothing about `?q=`.
let withPill = 0;

async function countRows() {
  // Rows hydrate after the data fetch; give them a beat, then count.
  try {
    await page.waitForSelector(ROW, { timeout: 45000 });
  } catch {
    return 0;
  }
  await page.waitForTimeout(800);
  return page.locator(ROW).count();
}

/**
 * Click the wallet pill until the URL actually changes.
 *
 * The pill is a client component on an SSR'd page, so it is on screen and
 * clickable well before its handler exists, and a click made in that window is
 * discarded with no trace. Re-asserting the URL each poll and clicking again is
 * what separates "not hydrated yet" from "does not navigate": if it never
 * navigates, this still returns false after the full deadline and the caller's
 * assertion goes red — which is then a product finding, not a timing artefact.
 *
 * The exit condition is deliberately "the URL moved AT ALL", never "the URL
 * moved to a ?q= link". A pill that navigates to the wrong param — `?wallet=`,
 * `?ownerAddress=`, the exact defect this file was written for — must arrive at
 * the param assertion below and be named there, not be swallowed here as a
 * click that never landed.
 *
 * Returns the URL it navigated to, or null if the deadline passed with the URL
 * unmoved.
 */
// The deadline is generous on purpose. Hydration is what is being waited out,
// and its cost scales with what else is running: the same morpho pill took 2
// clicks on a quiet machine and 29 (~12s) with a second dev server competing
// for the box. A deadline tight enough to expire under load turns a busy
// machine into a "the pill did not navigate" finding, which is the artefact
// this file was just repaired for reporting.
async function clickPillUntilNavigated(deadlineMs = 60000) {
  const before = page.url();
  const deadline = Date.now() + deadlineMs;
  let clicks = 0;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url !== before) return { url, clicks };
    if ((await page.locator(FILTER_BTN).count()) > 0) {
      clicks++;
      await page
        .locator(FILTER_BTN)
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  const url = page.url();
  return url !== before ? { url, clicks } : null;
}

// Wait for the listing to actually RENDER the filtered set, then return its
// settled row count. The old check counted rows right after the pill's in-app
// navigation flipped the URL to ?q=…, then leaned on `networkidle` + a fixed
// pause — but the server-tier listings (liquity-v2, aave-v4) do NOT re-filter
// on that client-side param change at all; only a load of the deep-link URL
// does. So the caller loads the pill's ?q= URL and hands it here, and we poll
// the live DOM until the count settles into the asserted window [1, full): the
// very condition the check makes. On timeout return the last count seen (==
// full when the filter was silently ignored, as `?wallet=` was), so the
// caller's assertion goes RED rather than passing on a stale snapshot.
//
// `settled` says WHICH of the two happened. A run that never saw the count drop
// still fails — a check that could not observe the filter has not proved it
// works — but the two are not the same claim, and the old message asserted the
// stronger one for both. Measured: under a second dev server competing for the
// box, morpho's filtered listing did not repaint inside 20s and was reported as
// "the filter was ignored"; alone on the same server it settled to 2 of 20.
// Widened to 45s and the message now distinguishes them, so a load artefact
// reads as one and is re-run rather than recorded.
async function waitForFilteredCount(full, timeoutMs = 45000) {
  const results = page.locator("[aria-busy]").first();
  const deadline = Date.now() + timeoutMs;
  let last = full;
  while (Date.now() < deadline) {
    // Don't sample mid-refetch: aria-busy true means rows are being replaced.
    const busy = (await results.count()) > 0 ? await results.getAttribute("aria-busy") : null;
    if (busy !== "true") {
      last = await page.locator(ROW).count();
      if (last >= 1 && last < full) return { count: last, settled: true };
    }
    await page.waitForTimeout(200);
  }
  return { count: last, settled: false };
}

for (const { slug, route, onListing } of subjects) {
  console.log(`\n── ${slug} ${"─".repeat(Math.max(1, 40 - slug.length))}`);
  try {
    // 1) Unfiltered listing → full count. Navigate to the canonical route and
    // assert the browser is still on it, so an explorer that has moved (or
    // redirects away) is a red here rather than a mismatch three checks later.
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 120000 });
    const landed = new URL(page.url()).pathname;
    check(`${slug}: serves its chain-scoped listing route`, landed === route, `landed on ${landed}`);
    const full = await countRows();
    check(`${slug}: listing renders rows`, full > 0, `${full} rows (full)`);
    if (full === 0) continue;

    // 2) Reach a wallet pill and click its filter affordance.
    let hasBtn;
    if (onListing) {
      // The listing itself renders the pill (loaded already with the rows).
      hasBtn = (await page.locator(FILTER_BTN).count()) > 0;
    } else {
      // The pill lives on a detail page (the receipts branch), but not every
      // position renders one — e.g. spark's first listed position is
      // wallet-less. So walk the first rows until a detail page shows the
      // affordance, waiting for it (never a bare post-goto count) so a slow
      // receipts/overlay render isn't misread as absent. Deterministic on live
      // data — the same spirit as picking a subject that has the shape tested.
      const hrefs = await page
        .locator(ROW)
        .evaluateAll((as, n) => as.slice(0, n).map((a) => a.getAttribute("href")), 8);
      hasBtn = false;
      for (const href of hrefs) {
        await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        const found = await page
          .waitForSelector(FILTER_BTN, { timeout: 4000 })
          .then(() => true)
          .catch(() => false);
        if (found) {
          hasBtn = true;
          break;
        }
      }
    }
    check(`${slug}: wallet pill filter affordance present`, hasBtn);
    if (!hasBtn) continue;

    const navigated = await clickPillUntilNavigated();
    check(
      `${slug}: the pill navigates`,
      navigated !== null,
      navigated ? `${navigated.clicks} click(s)` : "URL unmoved for 30s — the pill did not navigate",
    );
    if (!navigated) continue;
    withPill++;

    const url = navigated.url;
    const m = url.match(/\?q=([^&]+)/);
    const q = m ? decodeURIComponent(m[1]) : "";

    // 3a) The pill's URL is this explorer's own route plus the lowercased
    // `?q=<addr>` form (NOT ?wallet= / ?ownerAddress=). Built from `route`, so
    // a route move fails here as loudly as a wrong param does.
    const path = url.replace(BASE, "");
    const urlOk = new RegExp(`^${route.replace(/[-/]/g, "\\$&")}\\?q=0x[0-9a-f]{40}$`).test(path);
    check(`${slug}: pill → ${route}?q=0x… lowercased`, urlOk, path);

    // 3b) THE assertion that matters: the pill's deep-link listing actually
    // filters. Load the ?q= URL the pill produced (server-tier listings only
    // filter on a load of it, never on the in-app param flip) and wait for the
    // filtered rows to render — not networkidle + a pause. See the helper.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    const { count: filtered, settled } = await waitForFilteredCount(full);
    check(
      `${slug}: FILTERED count < full (proves ?q= is honored)`,
      filtered >= 1 && filtered < full,
      settled
        ? `filtered=${filtered} vs full=${full}  q=${q}`
        : `NOT SETTLED — still ${filtered} of ${full} when the wait expired, so the filter was never` +
            ` observed to apply. Re-run this explorer alone before recording it: a busy box looks like` +
            ` an ignored ?q= here.  q=${q}`,
    );

    // 3c) Informational only (some listing cards don't render the owner as
    // visible text, so a miss here isn't a filter failure): how many filtered
    // rows visibly carry the wallet's last-4 hex.
    if (q.length >= 6 && filtered > 0) {
      const tail = q.slice(-4).toLowerCase();
      const bodies = await page.locator(ROW).allInnerTexts();
      const matched = bodies.filter((t) => t.toLowerCase().includes(tail)).length;
      console.log(`INFO  ${slug}: ${matched}/${bodies.length} filtered rows visibly show …${tail}`);
    }
  } catch (e) {
    check(`${slug}: run completed without throwing`, false, String(e).split("\n")[0]);
  }
}

await browser.close();

// The control. Every `?q=` assertion above is conditional on a pill that
// navigated, so a run that reached none of them tested no deep link at all.
if (withPill === 0) {
  console.log(`\nNO EVIDENCE — not one of the ${subjects.length} explorers produced a ?q= deep link to check.`);
  process.exit(1);
}

console.log(
  `\n${failures === 0 ? "ALL WALLET-LINK CHECKS PASSED" : `${failures} FAILURES`}` +
    ` · ${withPill}/${subjects.length} explorers reached a navigating pill (the control)`,
);
process.exit(failures === 0 ? 0 : 1);
