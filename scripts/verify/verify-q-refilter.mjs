// Verifies the `q` wallet-filter param on the server-tier listing pages
// (/ethereum/aave-v4, /ethereum/liquity-v2 — both on the shared
// ChainTruthListingPage driver) survives an in-app SPA transition, not just a
// fresh page load.
//
// Root cause this guards: `lib/shared/use-url-search-params.ts`'s useUrlSearchParams
// only reconciled its `search` state on mount, on `popstate`, and on the driver's own
// `notifyUrlChanged` event (fired by its own history.pushState calls). A genuine
// Next.js client-side navigation to the SAME route with different search params
// (e.g. clicking a WalletPill, which calls `router.push`) hands the persisting
// client component a fresh `initialSearch` prop without remounting it, without a
// `popstate`, and without the custom event — so the old `search` state (and
// therefore `filters.q`) never advanced, and the listing rendered unfiltered even
// though the address bar showed the right URL.
//
// TWO THINGS ROTTED HERE, and they failed in opposite directions.
//
// The selector. Every owner/wallet pill on every surface is now the one shared
// `components/shared/wallet-pill.tsx`, whose button reads
// `aria-label="Filter positions by wallet <label>"`. Liquity V2's trove detail
// page used to render its own row labelled "Filter troves by owner", and that
// string no longer exists anywhere in the repo — the locator matched nothing and
// timed out. It is re-pinned to the shared label below.
//
// The counts. A listing selector that matches nothing reads as "zero wallets",
// and "zero wallets, all of them the filtered one" is trivially true — the shape
// of a green-but-vacuous pass. So every locator these checks read now goes
// through `rows()`, which states the magnitude it expected and fails when the
// selector comes back empty. That guard earns its keep immediately: on a cold
// dev server the first `networkidle` lands while the route is still compiling
// and the listing genuinely has no rows yet, which is what made the aave-v4 arm
// of this script look rotted when it was not. `rows()` waits for the first row
// to attach before reading, so a slow compile is a wait and an empty listing is
// a failure — the two stop looking alike.
//
// Run against the worktree's own dev server:
//   BASE=http://localhost:3021 node scripts/verify/verify-q-refilter.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let failures = 0;

// The shared WalletPill's filter button, on listing rows and detail pages alike.
const WALLET_FILTER_BTN = 'button[aria-label^="Filter positions by wallet"]';
// Both listings page at 20 rows; anything at or above this is a populated
// listing rather than a half-painted one.
const MIN_LISTING_ROWS = 5;

function ok(label, cond, extra = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`[${status}] ${label}${extra ? " — " + extra : ""}`);
}

/** Read a selector that the checks below depend on, waiting for its first match
 *  to attach. `min` is the count this call expects; falling short is reported as
 *  a failure of the READER, because every assertion downstream of an empty match
 *  set is vacuously true. Returns the matched elements' hrefs/labels. */
async function rows(page, what, selector, attr, min) {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: "attached", timeout: 60_000 })
    .catch(() => {});
  const values = await page.$$eval(
    selector,
    (els, a) => els.map((el) => el.getAttribute(a)).filter((v) => v != null),
    attr,
  );
  ok(`${what}: selector matched ≥${min} (${selector})`, values.length >= min, `${values.length} matched`);
  return values;
}

const addressesIn = (values) => new Set(values.map((v) => v.match(/0x[0-9a-fA-F]{40}/i)?.[0]).filter(Boolean));

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
// Aave V4: (1) fresh load with ?q= is filtered; (2) same-page in-app nav
// (clicking a WalletPill on the unfiltered listing, router.push to ?q=) filters;
// (4) in-app nav back to unfiltered shows all rows again.
// ---------------------------------------------------------------------------
const V4_ROW = "a[href*='/ethereum/aave-v4/spoke/']";
{
  const page = await browser.newPage();

  // Pick a real wallet from the live unfiltered listing.
  await page.goto(`${BASE}/ethereum/aave-v4`, { waitUntil: "networkidle", timeout: 240_000 });
  const walletsUnfiltered = addressesIn(await rows(page, "aave-v4 unfiltered rows", V4_ROW, "href", MIN_LISTING_ROWS));
  ok(
    "aave-v4: unfiltered listing has multiple wallets (precondition)",
    walletsUnfiltered.size > 1,
    `${walletsUnfiltered.size} wallets`,
  );
  const wallet = [...walletsUnfiltered][0];

  // (1) Fresh load of /ethereum/aave-v4?q=<wallet>. One row is the whole point
  // of the filter, so this arm expects exactly one — but it still asserts a
  // match happened at all, because "no rows" would satisfy "no wrong rows".
  await page.goto(`${BASE}/ethereum/aave-v4?q=${wallet}`, { waitUntil: "networkidle", timeout: 240_000 });
  const freshWallets = addressesIn(await rows(page, "aave-v4 ?q= rows", V4_ROW, "href", 1));
  ok(
    "aave-v4: fresh load of ?q=<wallet> shows only matching rows",
    freshWallets.size === 1 && freshWallets.has(wallet),
    `[${[...freshWallets].join(",")}]`,
  );

  // (2) Starting unfiltered, in-app nav (WalletPill click -> router.push) to ?q=<wallet>.
  await page.goto(`${BASE}/ethereum/aave-v4`, { waitUntil: "networkidle", timeout: 240_000 });
  const walletsBeforeClick = addressesIn(
    await rows(page, "aave-v4 rows before click", V4_ROW, "href", MIN_LISTING_ROWS),
  );
  ok("aave-v4: back on unfiltered listing before click", walletsBeforeClick.size > 1);

  const documentIdBefore = await page.evaluate(() => window.__verifyMarker || (window.__verifyMarker = Math.random()));
  // Click the first wallet-filter pill and read the resulting q back off the URL.
  const pills = await rows(page, "aave-v4 wallet pills", WALLET_FILTER_BTN, "aria-label", MIN_LISTING_ROWS);
  // Clicking a selector that matches nothing is a 30-second timeout and a stack
  // trace, which reads as an infrastructure problem rather than the rename it
  // usually is. Name it instead.
  if (pills.length === 0) {
    console.log(
      `[NO EVIDENCE] aave-v4: no ${WALLET_FILTER_BTN} on the listing — the in-app click arm never ran.` +
        " Re-read components/shared/wallet-pill.tsx for the current label.",
    );
    failures++;
    await page.close();
    await browser.close();
    console.log(`\n${failures} ASSERTION(S) FAILED`);
    process.exit(1);
  }
  await page.locator(WALLET_FILTER_BTN).first().click();
  await page.waitForTimeout(1500);

  const documentIdAfter = await page.evaluate(() => window.__verifyMarker);
  ok(
    "aave-v4: in-app nav did NOT cause a full page reload",
    documentIdBefore === documentIdAfter,
    `marker before=${documentIdBefore} after=${documentIdAfter}`,
  );

  const url = new URL(page.url());
  const qParam = url.searchParams.get("q");
  ok("aave-v4: URL updated to carry q after in-app click", !!qParam, url.toString());

  const walletsAfterClick = addressesIn(await rows(page, "aave-v4 rows after click", V4_ROW, "href", 1));
  ok(
    "aave-v4: in-app SPA nav to ?q=<wallet> now shows ONLY that wallet",
    walletsAfterClick.size === 1 && qParam && walletsAfterClick.has(qParam.toLowerCase()),
    `[${[...walletsAfterClick].join(",")}] q=${qParam}`,
  );

  // (4) In-app nav BACK to the unfiltered listing (click logo / go to bare basePath via history).
  await page.evaluate(() => window.history.pushState(null, "", "/ethereum/aave-v4"));
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
  await page.waitForTimeout(1500);
  const walletsAfterClear = addressesIn(
    await rows(page, "aave-v4 rows after clearing q", V4_ROW, "href", MIN_LISTING_ROWS),
  );
  ok(
    "aave-v4: in-app nav back to unfiltered listing shows all wallets again",
    walletsAfterClear.size > 1,
    `${walletsAfterClear.size} wallets`,
  );

  await page.close();
}

// ---------------------------------------------------------------------------
// Liquity V2: (3) fresh load + in-app nav FROM A DIFFERENT PAGE (a trove detail
// page's owner pill, via router.push) both filter correctly; (4) nav back clears.
// ---------------------------------------------------------------------------
const V2_ROW = "a[href*='/ethereum/liquity-v2/trove/']";
{
  const page = await browser.newPage();

  await page.goto(`${BASE}/ethereum/liquity-v2`, { waitUntil: "networkidle", timeout: 240_000 });
  const troveHrefs = await rows(page, "liquity-v2 listing rows", V2_ROW, "href", MIN_LISTING_ROWS);
  const troveHref = troveHrefs[0];

  // Visit a trove detail page and grab its owner address via the owner pill.
  await page.goto(`${BASE}${troveHref}`, { waitUntil: "networkidle", timeout: 240_000 });
  const ownerBtn = page.locator(WALLET_FILTER_BTN).first();
  const ownerBtnCount = await page
    .locator(WALLET_FILTER_BTN)
    .first()
    .waitFor({ state: "attached", timeout: 60_000 })
    .then(() => page.locator(WALLET_FILTER_BTN).count())
    .catch(() => 0);
  ok("liquity-v2: trove detail page has an owner-filter pill", ownerBtnCount > 0, `${ownerBtnCount} matched`);

  // The five checks below all hang off that pill. Skipping them quietly when it
  // is missing is how this file could report "1 failure" for a rot that had
  // actually disabled most of its coverage, so the absence is stated as its own
  // finding and the arm ends.
  if (ownerBtnCount === 0) {
    console.log(
      `[NO EVIDENCE] liquity-v2: no ${WALLET_FILTER_BTN} on ${troveHref} — the in-app nav arm never ran.` +
        " Re-read components/shared/wallet-pill.tsx for the current label before trusting this run.",
    );
    failures++;
  } else {
    // The identity the page DISPLAYS for this owner — an ENS name where one
    // resolves, the truncated address otherwise. The listing rows render the
    // same display identity, never the raw hex, so the filtered-listing
    // assertion below compares display identity to display identity (an
    // ENS-named owner made an older hex-only grep fail on a correctly filtered
    // page, 2026-08-10).
    const ownerLabel = (await ownerBtn.getAttribute("aria-label")).trim();
    const markerBefore = await page.evaluate(() => window.__verifyMarker || (window.__verifyMarker = Math.random()));
    await ownerBtn.click();
    await page.waitForTimeout(1500);
    const markerAfter = await page.evaluate(() => window.__verifyMarker);
    ok(
      "liquity-v2: in-app nav (detail page -> listing) did NOT cause a full page reload",
      markerBefore === markerAfter,
    );

    const url = new URL(page.url());
    const qParam = url.searchParams.get("q");
    ok("liquity-v2: URL updated to carry q after in-app owner click", !!qParam, url.toString());
    ok("liquity-v2: landed on the listing route", url.pathname === "/ethereum/liquity-v2");

    // The filtered listing's OWN pills are the evidence: every row must carry
    // the same owner identity the detail page showed. Reading the whole body
    // for a substring of the address would pass on an unfiltered listing that
    // merely happens to contain that owner somewhere.
    const cardCountFiltered = (await rows(page, "liquity-v2 filtered rows", V2_ROW, "href", 1)).length;
    const filteredPills = await rows(page, "liquity-v2 filtered pills", WALLET_FILTER_BTN, "aria-label", 1);
    const distinctOwners = new Set(filteredPills.map((l) => l.trim()));
    ok(
      "liquity-v2: in-app SPA nav to ?q=<owner> shows a listing of THAT owner and nobody else",
      distinctOwners.size === 1 && distinctOwners.has(ownerLabel),
      `${cardCountFiltered} row(s), owners=[${[...distinctOwners].join(" | ")}], expected "${ownerLabel}"`,
    );

    // (4) In-app nav back to the unfiltered listing.
    await page.evaluate(() => window.history.pushState(null, "", "/ethereum/liquity-v2"));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await page.waitForTimeout(1500);
    const cardCountUnfiltered = (await rows(page, "liquity-v2 rows after clearing q", V2_ROW, "href", MIN_LISTING_ROWS))
      .length;
    ok(
      "liquity-v2: in-app nav back to unfiltered listing shows more (or equal, if 1 trove total) rows",
      cardCountUnfiltered >= cardCountFiltered,
      `filtered=${cardCountFiltered} unfiltered=${cardCountUnfiltered}`,
    );
  }

  await page.close();
}

await browser.close();

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
