// Verifies the Compound V3 closed-card peak grammar after the interest-phantom
// clamp (backend Part A) + the supply-only labelling (frontend Part B).
//
// No proxy. When this was written the mig-054 dust clamp lived only in a local
// proxy in front of RAILS_API_URL, and the header said so. It has since shipped:
// the live backend serves this lender `peak.borrowedBaseRaw: "0"`, so an ordinary
// dev server on the real API is what the assertions below want.
//
// TWO PINS ROTTED, and only one of them said so. The peak-debt column is
// `CARD_VOCAB.peakDebt` and the lexicon renamed it "Highest recorded principal"
// → "Highest recorded debt" (the principal-only caveat moved to a footnote under
// the figure). The control's positive assertion went red, which is how the rename
// was found — but its sibling on the lender card, `!includes("Highest recorded
// principal")`, went on passing the whole time, because the string it forbids had
// stopped existing anywhere in the app. It was asserting nothing.
//
// So the two are written as ONE PAIR at the end, against a single constant: the
// label must be PRESENT on the borrower's card and ABSENT from the lender's. A
// future rename can no longer break the half that fails and quietly satisfy the
// half that passes — it takes them both down together.
//
//   BASE=http://localhost:3021 node scripts/verify/verify-compound-peak-clamp.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

// The peak-debt column label, from lib/shared/card-vocab.ts (`peakDebt`). One
// constant, so the presence and the absence below cannot drift apart.
const PEAK_DEBT = "Highest recorded debt";

// Pure lender: supplied 3 WETH, withdrew the full balance + interest. Its peak
// borrow is the interest tail — a phantom, not a borrow.
const LENDER = "0xae11326b304410837e6499cb40e81d2f69f58e5b";
// A genuine closed WETH borrow (peak 0.1 WETH, well above the 1e14 dust) — the
// no-regression control: the fix must not suppress real data.
const BORROWER = "0xd89c490984af4ae33ebb71534d65b331c9e32b60";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok:", msg);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

// --- The phantom-borrow card ------------------------------------------------
console.log(`\n${LENDER} — pure lender, cWETHv3`);
await page.goto(`${BASE}/ethereum/compound-v3?q=${LENDER}`, { waitUntil: "networkidle", timeout: 240_000 });

// The closed card is the only one carrying a "Highest recorded" stat grid.
const grid = page.locator("div.grid").filter({ hasText: "Highest recorded" });
assert((await grid.count()) === 1, "exactly one closed-position stat grid on the page");
const rawText = await grid.innerText();
const cardText = rawText.replace(/\s+/g, " ");

const bodyText = await page.locator("body").innerText();
// The wallet pill sits between the CLOSED badge and the market label since
// the identity flip (wallet leads the cluster) — allow it, keep the
// same-header-cluster claim tight (≤60 chars of pill between them).
assert(/CLOSED[\s\S]{0,60}?cWETHv3/.test(bodyText), "the closed card is the cWETHv3 one");
assert(cardText.includes("Highest recorded supply"), "collateral column labelled 'Highest recorded supply'");
assert(!cardText.includes("Highest recorded collateral"), "no 'Highest recorded collateral' on a supply-only card");
assert(/Highest recorded supply\s*3\b/.test(rawText), "supply value reads 3");

assert(!/8\.94\d*e-7/.test(bodyText), "no 8.94e-7 phantom anywhere on the page");
assert(!/e-\d/.test(bodyText), "no exponential tiny-amount rendering at all");

// The Debt slot is kept (empty) so Outcome stays in the same column. Assert the
// COMPUTED layout, not just markup presence.
const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
assert(cols.split(" ").length === 4, `stat grid resolves to 4 columns (got "${cols}")`);
const placeholder = await grid.evaluate((el) => {
  const kids = Array.from(el.children);
  const d = kids[1];
  return { display: getComputedStyle(d).display, text: d.textContent.trim() };
});
assert(placeholder.text === "", "second stat column is the empty Debt placeholder");
assert(
  placeholder.display === "block",
  `placeholder computed display is block at >=640px (got ${placeholder.display})`,
);

const labels = await grid.evaluate((el) =>
  Array.from(el.children).map((c) => (c.firstElementChild?.textContent ?? "").trim()),
);
assert(labels[2] === "Outcome", `Outcome sits in the third column (got ${JSON.stringify(labels)})`);

// --- No regression on a genuine borrow --------------------------------------
console.log(`\n${BORROWER} — genuine closed WETH borrow (control)`);
await page.goto(`${BASE}/ethereum/compound-v3?q=${BORROWER}`, { waitUntil: "networkidle", timeout: 240_000 });
// This wallet has since closed a second, collateral-only position, so the page
// carries more than one "Highest recorded" grid and `.first()` is no longer the
// borrow. Pick the card by the thing that makes it the control — it is the one
// with a peak debt — and assert exactly one such card exists, so a page that
// renders none cannot read as a card that renders correctly.
const bGrid = page.locator("div.grid").filter({ hasText: PEAK_DEBT });
assert((await bGrid.count()) === 1, `exactly one stat grid carries a "${PEAK_DEBT}" column`);
const bRaw = await bGrid.innerText();
const bText = bRaw.replace(/\s+/g, " ");
assert(
  /CLOSED[\s\S]{0,60}?cWETHv3/.test(await page.locator("body").innerText()),
  "the control's closed card is cWETHv3",
);
assert(new RegExp(`${PEAK_DEBT}\\s*0\\.1\\b`).test(bRaw), "genuine borrow still reads 0.1");
assert(bText.includes("Highest recorded collateral"), "a borrower's supply column stays 'collateral'");
// The caveat the old label carried in-line lives on as the column's footnote —
// dropping the word "principal" from the heading must not drop the claim.
assert(
  bText.includes("principal only — accrued interest not included"),
  "the principal-only caveat still rides the debt column as a footnote",
);

const bCols = await bGrid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
assert(bCols === cols, `both cards share one computed column geometry ("${bCols}")`);

// --- The pair ---------------------------------------------------------------
// Present here, absent there. Neither half can pass on its own: a rename kills
// the presence, and only the presence licenses reading the absence as a fact
// about the lender's card rather than about the vocabulary.
console.log(`\n"${PEAK_DEBT}" — present on the borrow, absent on the pure lend`);
assert(bText.includes(PEAK_DEBT), `the genuine borrow's card carries a "${PEAK_DEBT}" column`);
assert(!cardText.includes(PEAK_DEBT), `the pure lender's card drops the "${PEAK_DEBT}" column`);

await browser.close();
console.log("\nAll assertions passed.");
