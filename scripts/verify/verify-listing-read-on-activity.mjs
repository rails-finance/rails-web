#!/usr/bin/env node
// A position LISTING exists to find a position, not to rank the protocol by
// liquidation risk (rails-ops decision 0018). This script reads the seven
// lending listings that carry a lifecycle status and asserts the three things
// that decision changed — two on the web side, one on the server.
// ----------------------------------------------------------------------------
//   1  the route answers a page of rows;
//   2  every row's `status` is open / closed / liquidated / unread — an account
//      the chain has not been read for is "unread", never "closed";
//   3  `?status=closed` narrows to closed rows only (an unread row must never
//      surface under the closed facet);
//   4  on a Base lane, a row read at `chainBlock` is read at or after the
//      account's own newest event (`lastBlockNumber`), or it is unread. One
//      tick of lag is expected, so the count behind is INFO and only more than
//      half a page behind is a FAIL;
//   5  no row carries a `healthFactor` key at all — not null, not present.
//      The server stopped emitting it (rails-server-onboarding f967c43) and the
//      web row builders stopped computing it; a row that names the key again
//      is a regression on whichever side put it back. Read on both the first
//      page and the closed-facet page.
//
// Fixtures are derived from the responses — nothing is pasted in. Each lane's
// row grammar names the two blocks differently, so ROW maps them, and names
// where a health factor would sit if one crept back:
//   aave-v3-base / seamless / aave-v3 : chainBlock · lastBlockNumber · healthFactor
//   moonwell-base                     : chainBlock · lastBlockNumber · healthFactor
//   compound-base                     : current.block · lastBlockNumber · healthFactor
//   morpho-base                       : listed.block · activity.lastBlock · listed.healthFactor
//   spark                             : (no chain block on the row) · healthFactor
//
//   BASE=http://localhost:3762 node scripts/verify/verify-listing-read-on-activity.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-10 ──────────────────────────────────────────
//   "open" removed from ALLOWED → FAIL 2 on every lane naming the rows;
//   the facet check pointed at ?status=open → FAIL 3 ("5 of 5 rows not closed").
//   Check 5, same day: a mutated copy with HF_KEY = "status" (a key every row
//   carries) → FAIL 5 on all seven lanes ("10 of 10 rows carry a status key");
//   and the real check against production still on web build e643b64f (whose
//   Aave V3 / Spark builders re-emitted the four keys as null and whose
//   morpho-base route computed listed.healthFactor) → FAIL 5 on aave-v3-base,
//   seamless, morpho-base, aave-v3 and spark; PASS on moonwell-base and
//   compound-base; 33/33 against a local dev server carrying the removal.

const BASE = process.env.BASE ?? "http://localhost:3762";
const PAGE = 5;
const ALLOWED = new Set(["open", "closed", "liquidated", "unread"]);
/** The key check 5 asserts is absent from every row (top level, or under
 *  `listed` on morpho-base). */
const HF_KEY = "healthFactor";

const LANES = [
  { route: "/api/aave-v3-base/positions", base: true },
  { route: "/api/seamless/positions", base: true },
  { route: "/api/moonwell-base/positions", base: true },
  { route: "/api/compound-base/positions", base: true },
  { route: "/api/morpho-base/positions", base: true },
  { route: "/api/aave-v3/positions", base: false },
  { route: "/api/spark/positions", base: false },
];

let passes = 0;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);
const n = (v) => Number(v).toLocaleString("en-US");

/** The rows of one listing page, whatever envelope the lane answers in. */
async function page(route, qs) {
  const res = await fetch(`${BASE}${route}?${qs}`, { cache: "no-store" });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const body = await res.json();
  const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body.data) ? body.data : null;
  if (!rows) return { error: "no rows array in the answer" };
  return { rows };
}

/** One row in the shape every check below reads. Absent fields stay null.
 *  `hasHf` is key PRESENCE — a null value is still the key. */
const ROW = (r) => ({
  status: r.status ?? null,
  chainBlock: r.chainBlock ?? r.listed?.block ?? r.current?.block ?? null,
  lastBlock: r.lastBlockNumber ?? r.activity?.lastBlock ?? null,
  hasHf: HF_KEY in r || (r.listed != null && typeof r.listed === "object" && HF_KEY in r.listed),
});

const label = (route) => route.replace("/api/", "").replace("/positions", "");

console.log(`Listing status and read-block checks — against ${BASE}\n`);

for (const lane of LANES) {
  const name = label(lane.route);
  const first = await page(lane.route, `limit=${PAGE}`);
  check(
    `1  ${name}: the listing answers a page`,
    !first.error && first.rows.length > 0,
    first.error ?? `${first.rows?.length ?? 0} rows`,
  );
  if (first.error || first.rows.length === 0) continue;
  const rows = first.rows.map(ROW);

  // 2 — status is one of the four words, or the lane carries none at all.
  const bad = rows.filter((r) => r.status != null && !ALLOWED.has(r.status));
  const none = rows.filter((r) => r.status == null).length;
  check(
    `2  ${name}: every status is open / closed / liquidated / unread`,
    bad.length === 0,
    bad.length
      ? `unexpected: ${[...new Set(bad.map((r) => String(r.status)))].join(", ")}`
      : none
        ? `${none} rows carry no status`
        : "",
  );

  // 3 — the closed facet holds: nothing unread (or open) is shown as closed.
  const closed = await page(lane.route, `status=closed&limit=${PAGE}`);
  const closedRows = closed.error ? [] : closed.rows.map(ROW);
  if (closed.error) {
    check(`3  ${name}: ?status=closed answers`, false, closed.error);
  } else {
    const notClosed = closedRows.filter((r) => r.status !== "closed");
    check(
      `3  ${name}: ?status=closed serves closed rows only`,
      notClosed.length === 0,
      notClosed.length
        ? `${notClosed.length} of ${closed.rows.length} rows not closed (${[...new Set(notClosed.map((r) => String(r.status)))].join(", ")})`
        : `${closed.rows.length} rows`,
    );
  }

  // 4 — a Base row's read block is at or after its own newest event, or unread.
  if (lane.base) {
    const paired = rows.filter((r) => r.chainBlock != null && r.lastBlock != null);
    const behind = paired.filter((r) => r.status !== "unread" && r.chainBlock < r.lastBlock);
    info(
      `4  ${name}: rows read before their newest event`,
      `${behind.length} of ${paired.length} paired rows (${rows.length - paired.length} rows name no read block)`,
    );
    check(
      `4  ${name}: at most half a page is read behind its newest event`,
      behind.length <= rows.length / 2,
      behind.length ? behind.map((r) => `${n(r.chainBlock)} < ${n(r.lastBlock)}`).join("; ") : "",
    );
  }

  // 5 — no row names a health factor, on either page read.
  const all = [...rows, ...closedRows];
  const withHf = all.filter((r) => r.hasHf).length;
  check(
    `5  ${name}: no row carries a ${HF_KEY} key`,
    withHf === 0,
    withHf ? `${withHf} of ${all.length} rows carry a ${HF_KEY} key` : `${all.length} rows`,
  );
  console.log("");
}

console.log(`${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
