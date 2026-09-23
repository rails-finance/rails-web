// The Moonwell Base listing gained Supplying / Borrowing facets on 2026-08-30.
// This asserts they actually narrow the listing, because the one way they can
// break leaves no trace on the page.
//
// The facets travel as mToken ADDRESSES — /base/moonwell's `?supply=` /
// `?borrow=` params, carried to /api/moonwell-base/positions as `supplyAssets`
// / `borrowAssets`, renamed there to rails-server's `supplyMarkets` /
// `borrowMarkets`. Three renames, and none of them fails loudly: rails-server
// DROPS a facet value that is not an address and serves the unfiltered set
// (measured — `supplyMarkets=notanaddress` answers the same 86,872 as no filter
// at all). So a broken facet returns 200, well-formed rows, and a page that
// looks entirely normal while filtering nothing. A check that asserts a status
// code, or that the response parses, passes on a facet that is doing nothing.
//
// Hence both halves below: the filtered total must be STRICTLY smaller, and
// every row returned must actually hold the asset. The second is what catches a
// value arriving in the wrong shape, since a fail-open count on its own just
// looks like "this filter is unselective".
//
// The market addresses are read from /api/moonwell-base/markets rather than
// written down here — the same reason lib/moonwell-base/asset-catalog.ts writes
// no market down, and it keeps this check working when governance lists the
// twenty-second market.
//
// Usage: BASE=http://localhost:3000 node scripts/verify/verify-moonwell-base-asset-facets.mjs

const BASE = process.env.BASE ?? "http://localhost:3000";
const POSITIONS = `${BASE}/api/moonwell-base/positions`;
const MARKETS = `${BASE}/api/moonwell-base/markets`;

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else {
    console.log("  FAIL:", msg);
    failures++;
  }
}

async function positions(qs) {
  const res = await fetch(`${POSITIONS}?${qs}`);
  const json = await res.json();
  if (!json.success) throw new Error(`${qs} -> ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// The proxy shapes a row into `supplies` (mTokensRaw) and `borrows` (amountRaw).
const legs = (row, side) => (side === "supply" ? (row.supplies ?? []) : (row.borrows ?? []));
const rawOf = (leg, side) => BigInt((side === "supply" ? leg.mTokensRaw : leg.amountRaw) ?? "0");
const holdsAny = (row, addrs, side) =>
  legs(row, side).some((l) => addrs.includes(l.market.toLowerCase()) && rawOf(l, side) > 0n);

const pick = (markets, symbol) => {
  const m = markets.find((x) => x.symbol === symbol);
  if (!m) throw new Error(`roster has no ${symbol} market`);
  return m.market.toLowerCase();
};

console.log("Moonwell Base asset facets\n");

const roster = await (await fetch(MARKETS)).json();
const markets = roster.markets ?? [];
assert(markets.length > 0, `roster serves ${markets.length} markets at block ${roster.block}`);
assert(
  new Set(markets.map((m) => m.market)).size === markets.length,
  "every roster entry is a distinct mToken address (the only key unique on this deployment)",
);

// Symbols chosen for depth, not for being special — any three liquid markets do.
const CBBTC = pick(markets, "cbBTC");
const WETH = pick(markets, "WETH");
const USDC = pick(markets, "USDC");

// `status=` (empty) means all statuses — the facet is measured against the whole
// book, not against the listing's resting open-only view.
const all = await positions("limit=20&status=");
const total = all.pagination.total;
console.log(`  (unfiltered: ${total.toLocaleString()} positions)`);

const supply1 = await positions(`limit=20&status=&supplyAssets=${CBBTC}`);
assert(
  supply1.pagination.total < total,
  `supply=cbBTC narrows the book: ${supply1.pagination.total.toLocaleString()} < ${total.toLocaleString()}`,
);
assert(
  supply1.data.length > 0 && supply1.data.every((r) => holdsAny(r, [CBBTC], "supply")),
  `every supply=cbBTC row holds a positive cbBTC mToken balance (${supply1.data.length} rows)`,
);

const borrow1 = await positions(`limit=20&status=&borrowAssets=${USDC}`);
assert(
  borrow1.pagination.total < total,
  `borrow=USDC narrows the book: ${borrow1.pagination.total.toLocaleString()} < ${total.toLocaleString()}`,
);
assert(
  borrow1.data.length > 0 && borrow1.data.every((r) => holdsAny(r, [USDC], "borrow")),
  `every borrow=USDC row carries positive USDC debt (${borrow1.data.length} rows)`,
);

const supply2 = await positions(`limit=20&status=&supplyAssets=${WETH}`);
const either = await positions(`limit=20&status=&supplyAssets=${CBBTC},${WETH}`);
assert(
  either.pagination.total >= supply1.pagination.total && either.pagination.total >= supply2.pagination.total,
  `a facet is OR within itself: cbBTC+WETH ${either.pagination.total.toLocaleString()} >= cbBTC ${supply1.pagination.total.toLocaleString()} and WETH ${supply2.pagination.total.toLocaleString()}`,
);
assert(
  either.data.every((r) => holdsAny(r, [CBBTC, WETH], "supply")),
  "every cbBTC+WETH row holds at least one of the two",
);

const both = await positions(`limit=20&status=&supplyAssets=${CBBTC}&borrowAssets=${USDC}`);
assert(
  both.pagination.total <= supply1.pagination.total && both.pagination.total <= borrow1.pagination.total,
  `the two facets are AND across each other: ${both.pagination.total.toLocaleString()} <= ${supply1.pagination.total.toLocaleString()} and ${borrow1.pagination.total.toLocaleString()}`,
);
assert(
  both.data.every((r) => holdsAny(r, [CBBTC], "supply") && holdsAny(r, [USDC], "borrow")),
  `every crossed row both supplies cbBTC and owes USDC (${both.data.length} rows)`,
);

// A value the backend cannot read is dropped, not rejected. Pinning that here
// states the failure mode the assertions above are shaped around, so a future
// reader knows why they are inequalities rather than status checks.
const junk = await positions("limit=1&status=&supplyAssets=notanaddress");
assert(
  junk.pagination.total === total,
  `an unreadable facet value fails OPEN (serves ${junk.pagination.total.toLocaleString()}, the unfiltered book) — which is why this file asserts counts, never status codes`,
);

// The page's own URL grammar, and the roster's reach into it: a chip restored
// from a shared URL must render its SYMBOL server-side, not the raw address.
const page = await (await fetch(`${BASE}/base/moonwell?supply=${CBBTC}`)).text();
assert(/Supplying:\s*cbBTC/.test(page), "?supply=<address> renders a server-side chip labelled cbBTC");
// The visible count is rendered from the seeded props rather than baked into
// the markup, so the SSR claim to check is the seed itself: page.tsx fetched
// the FILTERED slice, and keyed it under a URL that carries the facet. If the
// key omitted `supply=`, the client would treat the seed as stale and refetch —
// a silent double fetch rather than a visible fault.
const seeded = new RegExp(`initialTotal\\\\*":${supply1.pagination.total}\\b`).test(page);
assert(seeded, `the SSR seed carries the filtered total (${supply1.pagination.total.toLocaleString()})`);
assert(
  new RegExp(`initialKey\\\\*":\\\\*"supply=${CBBTC}`).test(page),
  "the SSR seed is keyed under a URL that carries the facet",
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
