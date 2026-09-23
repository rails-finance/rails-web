// Live frontend verification for the Frankencoin explorer.
// Run: node scripts/verify/verify-frankencoin-frontend.mjs [port]
//
// SECTION 1 — the chain lane, against a REAL open V2 position:
//   A. the chain-overlay card renders collateral / minted / liq. price /
//      expiry in NATIVE units (values cross-checked against the overlay API);
//   B. the ANTI-DOLLAR check — no "$" appears anywhere in the page's visible
//      text (Frankencoin is oracle-free; nothing here may be priced in USD);
//   C. the risk grammar renders WITHOUT a health factor.
//
// SECTION 2 — the API-backed surfaces, against the LIVE index:
//   D. the listing renders real rows (native units, no dollars) and the
//      status / hub filters drive the backend;
//   E. the detail page of the known 5-slice V1 challenge position renders the
//      forensics card grouped by (hub, challenge number) — both verdicts, the
//      slice roster, the Hub V1 tag (the wire spells hub_version "V1" — the
//      casing regression), the "Owner Set at Mint" initialization row, the
//      Auction Settlement reclassification, and the closed card's peaks;
//   F. the denied + forced-sale position renders its denied lifecycle and
//      Forced Sale rows.
//
// SECTION 3 — the system view (/ethereum/frankencoin/system):
//   G. the balance sheet renders from the chain (supply / equity / reserve /
//      FPS price / Leadrate), the book renders from the index, and the page
//      stays dollar-free with no invented collateral total.
//
// WHAT ROTTED — a route, a vocabulary, and one figure that simply moved:
//
//   • THE ROUTE. Every explorer is chain-scoped now (rails-ops decision 0016),
//     so `/frankencoin/…` is a 308 to `/ethereum/frankencoin/…` and a cold
//     `networkidle` navigation across that hop times out. Following the fix
//     already made in `verify-feedback-frontend` (`e10fd6e4`): the pins move to
//     the live routes, and every navigation asserts the path the BROWSER landed
//     on is the expected one, so the next route move is a loud red here rather
//     than a silent redirect.
//
//   • THE VOCABULARY. `5f9b4e1e` gave the roster one card vocabulary: the
//     position card's "Minted" became "Debt", the closed card's "Highest
//     recorded mint" became "Highest recorded debt", and a denied position
//     became a terminal card — a CLOSED pill with an `Outcome / Denied` row
//     rather than a DENIED lifecycle pill. Three checks were asserting copy the
//     roster had deliberately retired.
//
//   • THE FIGURE. The owner-declared liquidation price on the open V2 subject
//     is 50,000 ZCHF/cbBTC at head, not the 41,000 pinned in July — an owner
//     may adjust it, so it was never a constant. Section 1's figures are now
//     derived FORWARD from the chain overlay this section already fetches:
//     read the chain value, format it the way the card does (plain `Intl`, not
//     the app's own helper), and require that exact string on the page. The
//     overlay is also the section's positive control — it must return a live,
//     non-stale, non-zero position before any render assertion is believed.

import { chromium } from "playwright";

const PORT = process.argv[2] ?? "3457";
// A real open V2 position: 150 cbBTC (8 decimals), several million ZCHF minted.
// The FIGURES are not pinned — the owner can adjust the declared price and can
// mint or repay — so they are read off the chain overlay at run time and the
// card is asserted against those. Only the position's SHAPE is pinned: open,
// V2, cbBTC collateral, ZCHF debt.
const POSITION = "0xDc189AC81BEC4db551A0478334691D71109d9382";
// The known 5-slice auction: V1, WETH, challenge #8 (plus a 3-slice averted
// challenge #0) — closed at head since Apr 2025, peak collateral 2 WETH, never
// minted. Closed at head is why these figures may still be pinned: a finished
// record's peaks are history and cannot move under the check.
const FIVE_SLICE = "0xa73ea04fef834e41a044f0bdddd959a9ff8fc639";
// Denied (vetoed) V2 position later cleared by forced sale — also terminal.
const DENIED_FORCED = "0xa99160993de03273750d3e253f75fe75f6084aaf";

const base = process.env.BASE ?? `http://localhost:${PORT}`;
const EXPLORER = "/ethereum/frankencoin";

const browser = await chromium.launch();
const page = await browser.newPage();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** The card's own compact rule, reproduced from the standard library rather
 *  than imported: `lib/utils/format.formatCompact` groups four digits and up
 *  into compact notation at two fraction digits, and renders anything smaller
 *  plainly. Writing it out here keeps the expected value independent of the
 *  code under test — if the house rule changes, this goes red and says so. */
const compact = (n) =>
  Math.abs(n) >= 1000
    ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : n.toLocaleString("en-US");

/** Navigate, assert the browser LANDED on the route we meant, and return the
 *  page text. Two claims, not one: the text is read off whatever path the
 *  browser reached (redirects included), and that path is separately required
 *  to be the expected one — so a route that moves is named here instead of
 *  being followed silently into a check that then fails for the wrong reason. */
async function textOf(path, waitFor, { expectPath = path.split("?")[0] } = {}) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 180000 });
  const landed = new URL(page.url()).pathname;
  check(`route: ${path} is served at ${expectPath}`, landed === expectPath, `landed on ${landed}`);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => {});
  return page.evaluate(() => document.body.innerText);
}

// The shared listing-row anchor, used to make the status claim per ROW instead
// of page-wide — the filter chip prints "Status: Denied" too, so a page-wide
// match for the word would pass on a listing that ignored the param.
const ROW = 'a[class~="group/listing-row"]';
const countRows = () => page.locator(ROW).count();
const countDeniedRows = async () =>
  (await page.locator(ROW).allInnerTexts()).filter((t) => /Outcome\s*\n?\s*Denied\b/.test(t)).length;

const noDollar = (name, text) => {
  const i = text.indexOf("$");
  check(
    `${name}: no '$' anywhere on the page`,
    i === -1,
    i !== -1 ? `found near: "${text.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, " ")}"` : "",
  );
};

// ── Section 1 — the chain lane ────────────────────────────────────────────────
{
  const api = await (await fetch(`${base}/api/chain/frankencoin/position?position=${POSITION}`)).json();
  if (api.chainStale) throw new Error("chain overlay returned a stale stub — RPC down?");

  // THE POSITIVE CONTROL for this whole section. Every assertion below compares
  // the card against these chain values, so a subject that has been closed out,
  // repaid to zero, or answered as an empty stub would make each of them
  // vacuously satisfiable. Require a live, shaped subject FIRST.
  const alive =
    api.isClosed === false &&
    api.collateral > 0 &&
    api.minted > 0 &&
    api.liqPrice > 0 &&
    api.collateralSymbol === "cbBTC" &&
    api.hub === "v2";
  check(
    "chain overlay answers with a live open V2 cbBTC position (the section's control)",
    alive,
    `closed=${api.isClosed} collateral=${api.collateral} minted=${api.minted} liqPrice=${api.liqPrice} ${api.collateralSymbol} hub=${api.hub}`,
  );

  const collateral = compact(api.collateral);
  const minted = compact(api.minted);
  const liqPrice = api.liqPrice.toLocaleString("en-US");
  const interest = (api.annualInterestPPM / 10000).toFixed(2);
  const text = await textOf(`${EXPLORER}/${POSITION.toLowerCase()}`, "text=ZCHF");

  const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check(
    `collateral renders (${collateral} under Collateral, off the chain read)`,
    new RegExp(`Collateral\\s*\\n\\s*${rx(collateral)}\\b`).test(text),
  );
  // `5f9b4e1e` gave the roster one card vocabulary and this label became "Debt";
  // the ZCHF denomination stays on the line beneath it.
  check(
    `debt renders (${minted} under Debt, off the chain read)`,
    new RegExp(`Debt\\s*\\n\\s*${rx(minted)}\\b`).test(text) && /minted ZCHF/.test(text),
  );
  check(
    "economics tower carries native units (cbBTC + ZCHF)",
    new RegExp(`cbBTC\\s*\\n\\s*${rx(collateral)}`).test(text) && new RegExp(`ZCHF\\s*\\n\\s*${rx(minted)}`).test(text),
  );
  check(
    `owner-declared liq. price renders (${liqPrice} ZCHF/cbBTC, off the chain read)`,
    new RegExp(`${rx(liqPrice)}(\\.\\d+)?\\s*ZCHF/cbBTC`).test(text) && /owner-declared/i.test(text),
  );
  check("expiry renders", /expires in \d+d|expired/i.test(text), "countdown against expiration()");
  check(
    `interest renders (${interest}% at minting, off annualInterestPPM)`,
    new RegExp(`${rx(interest)}%`).test(text) && /at minting/i.test(text),
  );
  // The two-axis pill rule: the DETAIL page carries the neutral mode word;
  // the green OPEN lifecycle pill is the listing's (checked in Section 2).
  check("detail status pill is the neutral mode word (Minting)", /\bMinting\b/.test(text));
  noDollar("chain-lane detail", text);
  check("no 'health factor' vocabulary", !/health factor/i.test(text));
}

// ── Section 2 — the API-backed surfaces ───────────────────────────────────────
{
  // D. the listing, resting view (status=open server-side).
  const text = await textOf(EXPLORER, "text=ZCHF");
  check("listing renders real open rows (OPEN pill + Hub tag)", /\bOPEN\b/.test(text) && /Hub V[12]/.test(text));
  noDollar("listing", text);
  // The resting listing's denied count — the other half of the filter claim
  // below. Read here, while we are already on the unfiltered page.
  const restingDenied = await countDeniedRows();
  const restingRows = await countRows();

  // D. status filter drives the backend — denied rows only.
  //
  // ⚠️ `5f9b4e1e` made a denied position a TERMINAL card: it carries the shared
  // CLOSED pill and an `Outcome / Denied` row, not a DENIED lifecycle pill. So
  // the old `/\bDENIED\b/` assertion was testing retired copy. Its obvious
  // replacement is worse than useless: the words "Status: Denied" are printed
  // by the filter CHIP itself, so a page-wide search for "Denied" passes on a
  // listing that ignored the param entirely. The claim is made per ROW instead,
  // and paired with the resting listing so it is a CHANGE of set, not a state:
  // every row on the filtered page is denied, at least one row is there to
  // check, and the unfiltered page has none.
  await textOf(`${EXPLORER}?status=denied`, `${ROW}`);
  const deniedRows = await countRows();
  const deniedOutcomes = await countDeniedRows();
  check("status=denied: the filtered listing renders rows at all", deniedRows > 0, `${deniedRows} rows`);
  check(
    "status=denied: EVERY row is a denied outcome",
    deniedRows > 0 && deniedOutcomes === deniedRows,
    `${deniedOutcomes}/${deniedRows} rows carry Outcome · Denied`,
  );
  check(
    "status=denied changes the set (the resting listing carries no denied rows)",
    restingRows > 0 && restingDenied === 0,
    `resting: ${restingDenied}/${restingRows} denied`,
  );

  // D. hub filter + the wire-casing regression: V1 rows must read Hub V1.
  const v1 = await textOf(`${EXPLORER}?hub=v1&status=open,closed,denied`, "text=Hub V1");
  check("hub=v1 filter renders Hub V1 rows (wire casing normalized)", /Hub V1/.test(v1) && !/Hub V2/.test(v1));

  // E. the 5-slice challenge position's detail page.
  const t = await textOf(`${EXPLORER}/${FIVE_SLICE}`, "text=Challenge history");
  check("forensics card renders", /Challenge history/.test(t) && /2 challenges/.test(t));
  check("groups keyed by (hub, challenge number)", /Challenge #0/.test(t) && /Challenge #8/.test(t));
  check("group hub tag says Hub V1 (casing regression)", /Hub V1/.test(t) && !/Hub V2/.test(t));
  check("both verdicts render (AVERTED + SUCCEEDED)", /AVERTED/.test(t) && /SUCCEEDED/.test(t));
  check("5 succeeded slices grouped under one challenge", /5 slices \(one settlement per bid/.test(t));
  check(
    "slice copy says who paid what in which token",
    /paid\s+1,?704\.\d+\s*ZCHF/.test(t) && /took\s+1\.4\s*WETH/.test(t),
  );
  check("two-axis outcome line renders", /closed at head|remains open/.test(t));
  check("Owner Set at Mint initialization row renders", /Owner Set at Mint/.test(t));
  // The 5 slices collapse into one run row (10 events: a Challenge Succeeded
  // and its Auction Settlement echo per bid). Since 2026-09-02 that row speaks
  // the folder grammar — `ea7778c0` made it a folder, `b87e8087` replaced its
  // "Auction settled ×5" label with a calculator glyph beside the summed pairs,
  // and `207d8ee7` dropped the "Show all 5" hint — so the count is stated by
  // the row's aria-label and the row's text is the two sums. Pinned from the
  // live page 2026-09-19; the auction closed in Apr 2025, so its sums (2 WETH
  // sold, 2.4K ZCHF raised — the five slices above added up) cannot move.
  const run = page.locator('[role="button"][aria-label^="5 consecutive auction slices"]');
  const runCount = await run.count();
  const runText = runCount === 1 ? (await run.innerText()).replace(/\s+/g, " ").trim() : "";
  const rowsCollapsed = await page.locator("[data-event-id]").count();
  check(
    "auction run card collapses the settlement echoes",
    runCount === 1 &&
      (await run.getAttribute("aria-expanded")) === "false" &&
      /^Sold 2 Raised 2\.4K\b/.test(runText) &&
      !/Auction Settlement/.test(t) &&
      rowsCollapsed === 9,
    `${runCount} run row(s), text "${runText}", ${rowsCollapsed} event rows at rest (19 events, 10 of them inside the run)`,
  );
  // A missing run card already failed above — the click must not turn that
  // one cause into a crash that discards every later check. And the page SSRs,
  // so a single click can land before React attaches the handler and be
  // discarded silently; re-assert the expanded state each poll and click again.
  let expanded = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    expanded = await page.evaluate(() => document.body.innerText);
    if (/Auction Settlement/.test(expanded)) break;
    await run.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  const settlements = (expanded.match(/Auction Settlement/g) ?? []).length;
  const rowsExpanded = await page.locator("[data-event-id]").count();
  check(
    "Auction Settlement reclassification renders (expanded run)",
    settlements === 5 && rowsExpanded === 19,
    `${settlements} "Auction Settlement" row(s), ${rowsExpanded} event rows once expanded`,
  );
  // `5f9b4e1e` renamed the closed card's mint peak to "Highest recorded debt"
  // as part of the roster's one card vocabulary. The FIGURES stay pinned here
  // because this record closed in Apr 2025: a finished position's peaks are
  // history and cannot move under the check the way an open position's can.
  check(
    "closed card peaks render (2 WETH peak collateral, dash for never-minted)",
    /Highest recorded collateral\s*\n\s*2\b/.test(t) && /Highest recorded debt\s*\n\s*—/.test(t),
  );
  noDollar("challenge detail", t);

  // F. the denied + forced-sale position.
  const d = await textOf(`${EXPLORER}/${DENIED_FORCED}`, "text=Position Denied");
  check("DENIED lifecycle renders from the index", /Position Denied/.test(d) && /vetoed by|denied/i.test(d));
  check("Forced Sale rows render", /Forced Sale/.test(d));
  noDollar("denied/forced-sale detail", d);
}

// ── Section 3 — the system view ───────────────────────────────────────────────
{
  const t = await textOf(`${EXPLORER}/system`, "text=The franc");
  check("system: the franc renders (supply in ZCHF)", /ZCHF in existence\s*\n\s*[\d.,]+[KMB]? ZCHF/.test(t));
  check(
    "system: the capital's two accounts + the pool render",
    /Equity \(FPS holders\)/.test(t) && /Borrowers' reserve/.test(t) && /Reserve pool, total/.test(t),
  );
  check("system: FPS price renders in ZCHF (never USD)", /FPS price\s*\n\s*[\d.,]+ ZCHF/.test(t));
  check("system: the Leadrate renders as a percent", /Base rate \(Leadrate\)\s*\n\s*[\d.]+%/.test(t));
  check(
    "system: the at-mint boundary is stated",
    /past mints\s*\n?\s*keep the rate of their own moment|past mints keep the rate/.test(t.replace(/\n/g, " ")),
  );
  check(
    "system: the book renders from the index (positions ever + open)",
    /Positions ever/.test(t) && /Open at head/.test(t),
  );
  check("system: the enforcement record renders", /Challenges ever/.test(t) && /forced sale/i.test(t));
  check("system: no collateral total is invented (counts, with the reason)", /no collateral total exists here/.test(t));
  check("system: chain snapshot stamp renders", /Chain snapshot · block [\d,]+/.test(t));
  noDollar("system view", t);
}

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
