// The PWN loan book stopped listing loans on 2026-08-29. The claim that replaced
// its two per-loan tables is that the LISTING is those tables — status filtered,
// and sorted by the order each section was in: open loans by deadline, defaulted
// loans by the date the claim settled.
//
// Nothing else can catch that link going wrong. Rename a sort value, change a
// status wire value, and the URL still resolves: the listing ignores the param it
// doesn't recognise and serves its DEFAULT view. The page looks fine and quietly
// shows the wrong loans in the wrong order. Fails-safe here is fails-silent, so
// this asserts each link's result against the book's own ordering, recomputed
// from the index the book itself reduces.
//
// Both sorts are DERIVED, not columns: a loan states its deadline as an absolute
// expiry OR a duration from creation, so `dueAt` is computed the same way in the
// listing, the card and the book. That is the thing most likely to drift, so the
// expected order here is rebuilt from the raw rows rather than read off any of
// the three.
//
// Usage: BASE=http://localhost:3000 node scripts/verify/verify-book-listing-link.mjs

const BASE = process.env.BASE ?? "http://localhost:3000";
const BOOK = "/ethereum/pwn/book";
const OPEN_HREF = "/ethereum/pwn?status=open&sortBy=due&sortOrder=asc";
const DEFAULTS_HREF = "/ethereum/pwn?status=defaulted&sortBy=settled&sortOrder=desc";
/** The listing pages at this size — a full page means there is a page 2 behind it. */
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 20);

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else {
    console.log("  FAIL:", msg);
    failures++;
  }
}

/** The book's own lapse-moment rule (lib/pwn/economics.ts `loanDueAt`), restated
 *  here rather than imported: a check that shares the implementation under test
 *  cannot fail when that implementation is wrong. */
const dueAt = (l) => {
  if (l.dueValue == null) return null;
  const v = Number(l.dueValue);
  if (!Number.isFinite(v)) return null;
  if (l.dueKind === "expiration") return v;
  if (l.dueKind === "duration") return l.createdAt != null ? l.createdAt + v : null;
  return null;
};

// ── the index, whole (paged: the route caps `limit` at 100) ──────────────────
const loans = [];
for (let i = 0; i < 200; i++) {
  const res = await fetch(`${BASE}/api/pwn/positions?limit=100&offset=${i * 100}`);
  if (!res.ok) {
    console.log(`  FAIL: /api/pwn/positions → HTTP ${res.status}`);
    process.exit(1);
  }
  const j = await res.json();
  loans.push(...(j.data ?? []));
  if ((j.data ?? []).length < 100 || loans.length >= (j.pagination?.total ?? loans.length)) break;
}
console.log(`\n=== pwn — ${loans.length} loans in the index`);
assert(loans.length > 0, "the index answered with loans to check against");

// Nulls sort LAST on the ascending deadline order — the book's own convention,
// and the reason the accessor uses MAX_SAFE_INTEGER rather than 0.
const expectedOpen = loans
  .filter((l) => l.status === "open")
  .sort((a, b) => (dueAt(a) ?? Number.MAX_SAFE_INTEGER) - (dueAt(b) ?? Number.MAX_SAFE_INTEGER))
  .map((l) => l.loanId);
const expectedDefaulted = loans
  .filter((l) => l.status === "defaulted")
  .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
  .map((l) => l.loanId);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ channel: "chrome" });
const book = await browser.newPage();
await book.goto(BASE + BOOK, { waitUntil: "networkidle" });

// The per-loan rows must be GONE — this is the change under test, and a page
// still drawing them would pass every assertion below.
console.log("\n-- the book page");
const loanRows = await book.locator('a[href*="?loan="]').count();
assert(loanRows === 0, `the book page renders no per-loan rows (found ${loanRows})`);

/** The listing's order when NOTHING is sorted: the fetch order, newest first.
 *  Where a section's own order happens to equal it, matching the rendered order
 *  proves nothing — the page would look identical with the sort dropped. */
const fetchOrder = (rows) => [...rows].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map((l) => l.loanId);

for (const [label, href, expected, sortLabel, universe] of [
  ["open", OPEN_HREF, expectedOpen, "Due", loans.filter((l) => l.status === "open")],
  ["defaulted", DEFAULTS_HREF, expectedDefaulted, "Settled", loans.filter((l) => l.status === "defaulted")],
]) {
  console.log(`\n-- ${label}`);
  const link = book.locator(`a[href="${href}"]`);
  const hasLink = (await link.count()) > 0;

  // A section with nothing in it must offer NO link: it would open an empty
  // listing under a heading promising those loans.
  if (expected.length === 0) {
    assert(!hasLink, `${label}: none in the book — no link offered`);
    continue;
  }
  assert(hasLink, `${label}: the book offers a link to ${href}`);
  if (!hasLink) continue;

  const listing = await browser.newPage();
  await listing.goto(BASE + href, { waitUntil: "networkidle" });
  await listing.waitForTimeout(1200);

  // The listing must have HONOURED the selection, not fallen back to its default
  // view. Its own chips are the page's statement of what it applied.
  const chips = await listing.locator("text=/Status:/i").allTextContents();
  assert(
    chips.some((c) => c.toLowerCase().includes(label)),
    `${label}: the listing shows a Status chip naming ${label} (link honoured, not ignored)`,
  );

  // The sort control names the sort the listing ACTUALLY applied. This is the
  // assertion that catches a renamed sort value, and it holds however few loans
  // the book has: an unrecognised `sortBy` leaves the control reading "Created",
  // its default, while the rows below can still happen to come out in the right
  // order and prove nothing.
  const sortShown = await listing.locator(`text="${sortLabel}"`).count();
  assert(sortShown > 0, `${label}: the listing's sort control reads "${sortLabel}" (the sort value was recognised)`);

  // The id comes off the ELEMENT whose whole text is the loan's name, never from
  // a regex over the row: a card's text nodes concatenate without separators
  // ("Loan #260xc8cf…515f"), so a pattern scanning the row reads the next node's
  // leading digits into the id and the check goes red — or worse, green — on a
  // number that was never on the page.
  const ids = await listing.locator("a.group\\/listing-row").evaluateAll((els) =>
    els.map((el) => {
      for (const node of el.querySelectorAll("*")) {
        const m = node.textContent
          .replace(/\s+/g, " ")
          .trim()
          .match(/^(?:PWN · )?Loan #(\d+)$/);
        if (m) return m[1];
      }
      return null;
    }),
  );
  const shown = ids.filter(Boolean);
  assert(shown.length > 0, `${label}: the listing rendered rows to compare (sample not empty)`);

  // One page at a time: compare against the head of the expected order, since a
  // full page means more behind it. Comparing the whole expected list against a
  // page would fail for a reason that is not a defect.
  const head = expected.slice(0, shown.length);
  assert(
    shown.join(",") === head.join(","),
    `${label}: the listing's order IS the book's order` +
      (shown.join(",") === head.join(",")
        ? ` (${shown.length} compared)`
        : `\n        expected ${head.join(",")}\n        got      ${shown.join(",")}`),
  );
  if (shown.length < PAGE_SIZE)
    assert(shown.length === expected.length, `${label}: the page holds every one of the ${expected.length} loans`);

  // Say so when the order comparison could not have failed. It is not a defect —
  // it is the book being small — but a green line that proves nothing is worse
  // than no line, so it is named rather than counted as evidence.
  const discriminating = shown.length >= 2 && expected.join(",") !== fetchOrder(universe).join(",");
  if (!discriminating)
    console.log(
      `  note: ${label}: the order check is NOT discriminating on today's data ` +
        `(${expected.length} loan(s); this order is the listing's unsorted order) — ` +
        `the sort-control assertion above is what holds here.`,
    );

  await listing.close();
}

await browser.close();
console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
