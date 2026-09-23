// The Liquity V1 system page stopped listing its redemption queue on 2026-08-30.
// The claim that replaced those rows is that the LISTING is the queue — open
// status, sorted by ratio ascending — and the page now hands the reader one link
// built from param names.
//
// Nothing else can catch that link going wrong. Rename the sort value, change
// the status wire value, and the URL still resolves: the listing ignores the
// param it doesn't recognise and serves its DEFAULT view (recency). The page
// looks entirely correct and quietly shows the wrong Troves under a heading
// promising the queue. Fails-safe here is fails-SILENT, so this asserts the
// link's RESULT against the protocol's own sorted list.
//
// Why V1 can assert more than its forks' sibling (verify-branch-queue-link.mjs).
// That one compares SETS inside a rate band and excludes zombies, because a fork
// trove can leave the sorted list while the index still calls it open. V1 has no
// zombie state — a Trove is in the list or it is closed — and its index was
// brought level with the chain at the wei on 2026-08-30, so here the two sides
// are expected to agree exactly. The comparison is correspondingly strict.
//
// What is checked:
//   A. The rows are GONE. A page still drawing them would pass everything below.
//   B. The link exists and carries all three selections.
//   C. The listing HONOURED them. The discriminating check is the sort control's
//      rendered LABEL — an unrecognised sortBy leaves it reading "Latest
//      activity" while the page looks fine. A set comparison alone would not
//      catch that on a small list (the trap verify-book-listing-link.mjs hit).
//   D. The order is the protocol's. Each listed wallet is mapped back to the
//      CHAIN's own getCurrentICR and that sequence must be non-decreasing down
//      the page — tie-safe, and false on the default recency view.
//   E. Nothing at the front is missing: every Trove the chain ranks below the
//      page's last row must be ON the page. Bounded by the last row's ratio
//      rather than by count, so a cut through a tie group can't fail it.
//   F. The page's own aggregates (queue size, below-minimum count) match the
//      same chain read they claim to summarise.
//
// ⚠️ Both samples must be non-empty, asserted explicitly. An empty comparison
// satisfies every assertion about its contents while proving nothing.
//
// Usage: BASE=http://localhost:3000 node scripts/verify/verify-v1-queue-link.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SYSTEM_PATH = "/ethereum/liquity-v1/system";
const CHAIN_API = "/api/chain/liquity-v1/system";
const POSITIONS_API = "/api/liquity-v1/positions?status=open&limit=1";

let failures = 0;
function assert(cond, msg) {
  console.log(cond ? `    ok: ${msg}` : `    FAIL: ${msg}`);
  if (!cond) failures++;
}

const pct = (x) => (x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(1)}%`);
/** Name the first few and count the rest. A failing assertion that dumps every
 *  address buries the thing it is telling you (the wrong-direction
 *  falsification printed 55). */
const some = (xs, n = 4) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} … +${xs.length - n} more`);

// ── the chain side ──────────────────────────────────────────────────────────
// The system route still returns the whole queue even though the page no longer
// draws it: the walk is what the aggregates are read off, and it is the ground
// truth this file compares against.
const chainRes = await fetch(BASE + CHAIN_API);
if (!chainRes.ok) {
  console.log(`    FAIL: ${CHAIN_API} → HTTP ${chainRes.status}`);
  process.exit(1);
}
const chain = await chainRes.json();
if (chain.chainStale) {
  console.log("    FAIL: the chain read came back stale — no ground truth to compare against");
  process.exit(1);
}
const queue = chain.queue ?? [];
const icrOf = new Map(queue.map((e) => [e.owner.toLowerCase(), e.icr]));
console.log(`# chain: ${queue.length} troves in the sorted list, block ${chain.blockNumber}`);
assert(queue.length > 0, `the chain's sorted list is non-empty (${queue.length}) — the comparison is not vacuous`);

const browser = await chromium.launch({ channel: "chrome" });

// ── A + B: the system page ──────────────────────────────────────────────────
console.log("\n=== A. the queue rows are gone");
const page = await browser.newPage();
await page.goto(BASE + SYSTEM_PATH, { waitUntil: "networkidle" });

// ⚠️ MATCH THE ELEMENT WHOSE WHOLE TEXT IS THE COLUMN HEAD, not a substring.
// The first version of this check used text=/Redeemed before it/i and went RED
// on a correct page: the section's own new prose says "how much LUSD is redeemed
// before it", and a substring match cannot tell a retired table header from a
// sentence about what the table used to show. Same trap the fork verifier hit
// from the other direction — a card's text nodes concatenate, so only the
// element whose ENTIRE text is the value can be trusted.
assert(
  (await page.getByText("Redeemed before it", { exact: true }).count()) === 0,
  "no 'Redeemed before it' column head",
);
// The preview toggle the retired list carried. It exists only when rows do.
assert(
  (await page.locator('button:has-text("Show all"), button:has-text("Show only the first")').count()) === 0,
  "no 'Show all N troves' preview toggle",
);
// Every retired row linked to one Trove's page. One such link anywhere on this
// page means rows are still being drawn.
const troveLinks = await page.locator('a[href^="/ethereum/liquity-v1/0x"]').count();
assert(troveLinks === 0, `no per-Trove links on the system page (${troveLinks} found)`);

console.log("\n=== B. the link");
const link = page.locator('a:has-text("Open the queue in the listing")').first();
assert((await link.count()) > 0, "the system page offers an 'Open the queue in the listing →' link");
if ((await link.count()) === 0) {
  await browser.close();
  console.log(`\nFAIL — ${failures} assertion(s)`);
  process.exit(1);
}
const href = await link.getAttribute("href");
console.log(`    href: ${href}`);
const params = new URLSearchParams(href.split("?")[1] ?? "");
assert(href.startsWith("/ethereum/liquity-v1?"), "the link points at the Liquity V1 listing");
assert(params.get("status") === "open", `status=open (got ${params.get("status")})`);
assert(params.get("sortBy") === "ratio", `sortBy=ratio (got ${params.get("sortBy")})`);
assert(params.get("sortOrder") === "asc", `sortOrder=asc — the queue's front first (got ${params.get("sortOrder")})`);

// ── F: the page's aggregates against the same read ──────────────────────────
console.log("\n=== F. the page's aggregates");
// ⚠️ THE PAGE IS ISR-CACHED (revalidate 600) AND THE CHAIN READ ABOVE IS LIVE.
// Comparing a render from ten minutes ago against a read from now is comparing
// two different moments, and V1 moves — one run of this file went red on
// exactly that, with nothing wrong on the page. So the page's own stamped block
// decides whether section F can say anything: equal, and the three assertions
// below are meaningful; different, and they are withheld with the gap named
// rather than passed silently. The gap itself is still asserted — a page stuck
// at yesterday's block is a real defect, and the only thing that separates it
// from an ordinary cache hit is how far behind it is.
const stamp = (await page.locator("text=/Chain snapshot . block/").first().innerText()).replace(/[\s,]/g, "");
const stampedBlock = Number(stamp.match(/block(\d+)/)?.[1] ?? NaN);
/** How far AHEAD of our own head read the page may legitimately be — two
 *  independent nodes read within seconds of each other, not one clock. */
const AHEAD_SLACK = 10;
const drift = chain.blockNumber - stampedBlock;
console.log(`    page rendered at block ${stampedBlock}, chain read at ${chain.blockNumber} (${drift} behind)`);
assert(Number.isFinite(stampedBlock), "the page stamps the block it was read at");
// 600s of revalidate is ~50 blocks; 300 is generous headroom for a slow
// revalidation and still catches a page that has stopped refreshing at all.
//
// The lower bound is NOT zero. `drift` is the gap between two INDEPENDENT head
// reads — the page's and this script's — and two nodes a moment apart disagree
// by a block or two in either direction, so the page legitimately renders
// AHEAD of the read we compare it to. This run read -2 and called a correct
// page defective. A few blocks of slack is the reader's own jitter; anything
// past it is the page reading a chain this one is not on.
assert(drift > -AHEAD_SLACK && drift < 300, `the page's render is within 300 blocks of head (${drift})`);
// The three figures are NOT equally block-sensitive, and treating them alike
// either withholds too much or cries wolf:
//   * queue length changes only when a Trove opens or closes — days apart.
//   * the below-minimum count changes only when a Trove crosses 110%, which at
//     this book's ratios is not a per-block event either.
//   * the FRONT RATIO changes every block the oracle moves — getCurrentICR is
//     evaluated at the head price. This is the one that went red on a correct
//     page, and the only one that needs the blocks to match.
const frontComparable = drift === 0;
if (!frontComparable) {
  console.log(`    note: front-ratio comparison withheld — render and read are ${drift} block(s) apart,`);
  console.log("    and the ratio is priced at head. The two count assertions still stand.");
}
const cardText = (await page.locator("text=/The queue right now/i").first().locator("xpath=../..").innerText()).replace(
  /\s+/g,
  " ",
);
const belowMinimum = queue.filter((e) => e.liquidatable).length;
assert(
  new RegExp(`\\b${queue.length} trove`).test(cardText),
  `the card states the chain's ${queue.length} troves (card: "${cardText.slice(0, 120)}")`,
);
assert(
  new RegExp(`Below the minimum ${belowMinimum}\\b`).test(cardText),
  `the card states ${belowMinimum} trove(s) below the minimum`,
);
const front = queue[0];
if (frontComparable && front?.icr != null) {
  assert(cardText.includes(pct(front.icr)), `the card states the front ratio ${pct(front.icr)}`);
}
// Block-independent, so it is asserted whatever the render's age: the shape of
// the sentence beside the count, which is what tells a reader what the count
// means. A silent copy change would otherwise take it away unnoticed.
assert(
  /(No Trove in the queue is below the [\d.]+% minimum|Troves? sits? below the [\d.]+% minimum)/.test(cardText),
  "the card says in words what the below-minimum count means",
);

// ── C + D + E: follow the link ──────────────────────────────────────────────
console.log("\n=== C. the listing honoured the link");
const listing = await browser.newPage();
await listing.goto(BASE + href, { waitUntil: "networkidle" });
await listing.waitForTimeout(1200);

// THE DISCRIMINATING CHECK. SortControl resolves its label by looking the
// current sortBy up in its own options — `options.find(...)?.label ?? "Sort"` —
// so an unrecognised value leaves the control reading the bare word "Sort"
// while the page renders perfectly and quietly serves recency. On a short list
// the row comparison below can pass by luck; this cannot.
//
// ⚠️ SELECTED STRUCTURALLY, AND THAT MATTERS. The first version matched the
// button by its expected text ("Ratio"), which meant the broken case — the one
// this check exists for — found NO element and threw a 30s timeout instead of
// failing. A verifier that crashes has not said anything about the page (see
// run-all.mjs's three outcomes), so the locator must find the control whatever
// it says, and the assertion reads its text afterwards.
const sortControl = listing
  .locator('button[aria-label*="Sort ascending"], button[aria-label*="Sort descending"]')
  .first()
  .locator("xpath=following-sibling::div[1]/button");
const foundControl = (await sortControl.count()) > 0;
assert(foundControl, "the listing toolbar renders a sort control");
const sortLabel = foundControl ? (await sortControl.first().innerText()).trim() : "(no control)";
assert(sortLabel === "Ratio", `the sort control reads "Ratio" (got "${sortLabel}")`);
const chips = await listing.locator("text=/Status: Open/i").count();
assert(chips > 0, "the listing shows a 'Status: Open' chip — the status was applied, not ignored");

console.log("\n=== D. the order is the protocol's");
// Wallets come off each row's OWN href, never off its text: a card's text nodes
// concatenate without separators, and a shortened chip ("0xc1c5…9974") cannot be
// mapped back to a full address without guessing.
const wallets = await listing.locator("a.group\\/listing-row").evaluateAll((els) =>
  els.map((el) => {
    const m = el.getAttribute("href")?.match(/\/ethereum\/liquity-v1\/(0x[0-9a-fA-F]{40})/);
    return m ? m[1].toLowerCase() : null;
  }),
);
const rows = wallets.filter(Boolean);
assert(rows.length > 0, `the listing rendered rows to compare (${rows.length}) — the check is not vacuous`);

const strangers = rows.filter((w) => !icrOf.has(w));
assert(
  strangers.length === 0,
  `every listed wallet is in the chain's sorted list${strangers.length ? ` — stranger(s) ${some(strangers)}` : ""}`,
);

const ratios = rows.map((w) => icrOf.get(w)).filter((r) => r != null);
assert(ratios.length === rows.length, `every listed wallet has a chain ratio (${ratios.length}/${rows.length})`);
const nonDecreasing = ratios.every((r, i) => i === 0 || r >= ratios[i - 1]);
assert(nonDecreasing, `the chain ratios ascend down the page (${ratios.slice(0, 6).map(pct).join(" → ")})`);

console.log("\n=== E. nothing at the front is missing");
// Bounded by the last row's RATIO rather than by count: the page is a prefix and
// may cut through a tie group, so below that ratio both sides hold everything
// there is and any difference is a real defect, while at or above it a
// difference is an artefact of where the page stopped.
// Empty `ratios` means section D already failed on something upstream (no rows,
// or none of them in the sorted list). Say that instead of computing a band from
// undefined and reporting "below NaN%", which reads like a different defect.
const band = ratios.length > 0 ? ratios[ratios.length - 1] : null;
assert(band != null, "there is a last-row ratio to bound the comparison by — section D produced usable rows");
const shouldBeOnPage =
  band == null ? [] : queue.filter((e) => e.icr != null && e.icr < band).map((e) => e.owner.toLowerCase());
const missing = shouldBeOnPage.filter((w) => !rows.includes(w));
assert(
  shouldBeOnPage.length > 0,
  `there are troves below the page's last ratio ${pct(band)} to compare (${shouldBeOnPage.length})`,
);
assert(
  missing.length === 0,
  `every trove ranked below ${pct(band)} is on the page${missing.length ? ` — missing ${some(missing)}` : ` (${shouldBeOnPage.length} compared)`}`,
);

// The index and the chain must also agree on the SIZE of the open set. This is
// what went wrong before the ingest landed (88 vs 75) and it is the one failure
// that makes every ordering assertion above meaningless while they all pass.
const posRes = await fetch(BASE + POSITIONS_API);
if (posRes.ok) {
  const pos = await posRes.json();
  const total = pos.pagination?.total;
  assert(total === queue.length, `the index's open count (${total}) equals the chain's sorted list (${queue.length})`);
} else {
  assert(false, `${POSITIONS_API} → HTTP ${posRes.status}`);
}

await listing.close();
await page.close();
await browser.close();
console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
