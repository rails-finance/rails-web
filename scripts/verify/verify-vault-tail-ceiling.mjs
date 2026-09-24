// TIER 1'S CEILING IS A BODY SIZE — this script measures the body.
// ============================================================================
//
// `tailMaxRows(chainId)` in lib/shared/vault-holder-timeline.ts is the largest
// life Rails will build into a stored tail on that chain. It is not a taste: it
// is floor(6 MB / a measured stored row), rounded down to a thousand, where the
// 6 MB is a working bound inside the 8 MB JSON body the store's own route
// accepts (`express.json({ limit: "8mb" })` on `/api/vaults/positions`, in
// rails-server-onboarding `api/src/index.ts:137`).
//
// ⚠️ A THIRD LIMIT SITS IN FRONT OF THE STORE, and this script does not measure
// it: a tail reaches the store through this deployment's own tail route, a
// Vercel function, which refuses a request body above 4.5 MB. Until web
// ef516f31 the PUT was plain JSON and that limit, not the 6 MB, was the real
// ceiling (a Base build stopped at 4,514 of 8,771 rows); the body is gzipped
// now, about fivefold, and verify-base-vault-cold-build.mjs check 7 holds it.
//
// A figure derived from a measurement goes stale the moment the thing measured
// changes, and the row grammar (`VaultHolderEvent`, and each family's `extra`)
// is a thing that changes. So this script re-measures: it reads the largest
// tail each chain has actually STORED, back out of the production deployment's
// own proxy, divides its byte length by its row count, and asserts that a full
// ceiling's worth of those rows still fits.
//
// THE CEILINGS ARE RESTATED BELOW RATHER THAN IMPORTED. An expectation read out
// of the thing under test cannot catch a change to it: importing `tailMaxRows`
// would make this script agree with any figure that source held, including a
// wrong one. Restated, a row grammar that grows turns it red.
//
// WHAT IS MEASURED IS WHAT WOULD BE SENT. The stored body a GET answers with
// and the body `putVaultTail` offers are the same eleven fields under the same
// names (`WireTail`, in lib/api/fetch-vault-tail.ts) — chainId, vault, holder,
// loaderVersion, cutBlock, cutBalance, logsIn, logsOut, lane, storedAt, rows —
// so the GET body's length is the PUT body's length, and `JSON.stringify` of it
// is measured too, to say so rather than to assume it.
//
// It reads production over the network and nothing else: no .env.local, no
// chain lane, no dev server.
//
//   node scripts/verify/verify-vault-tail-ceiling.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-09 ──────────────────────────────────────────
//   A1  CEILING[1] raised to 20,000 in this script — the shape a chain-1 row
//       growing by half would take. 4/6. FAIL 2a and FAIL 3a: "20,000 rows ×
//       437.9 B = 8,757,073 B", over the 6,291,456 working bound and over the
//       store's own 8,388,608 as well.
//   A2  CEILING[8453] raised to 16,000. 4/6. FAIL 2b and FAIL 3b: "16,000 rows
//       × 548.9 B = 8,781,806 B". Chain 1 stayed green through it, which is the
//       half of the proof that says the two chains are judged apart.

const BASE = process.env.TAIL_BASE ?? "https://rails-web.vercel.app";

/** The two figures under test, restated. `tailMaxRows(chainId)` in
 *  lib/shared/vault-holder-timeline.ts. */
const CEILING = { 1: 14_000, 8453: 11_000 };

/** The loader version each chain's stored rows are keyed by —
 *  `AAVE_VAULT_TAIL_VERSION` and `MORPHO_BASE_VAULT_TAIL_VERSION`, restated for
 *  the same reason. A bump empties the store for that chain until pages have
 *  been opened again, which this script reports as a failure rather than a
 *  skip: with nothing stored there is no measurement, and no measurement is not
 *  a pass. */
const LOADER_VERSION = { 1: 3, 8453: 2 };

/** The working bound each ceiling was divided out of, and the store's own limit
 *  it sits inside. Both binary megabytes, as `express.json` reads them. */
const WORKING_LIMIT = 6 * 1024 * 1024;
const STORE_LIMIT = 8 * 1024 * 1024;

/** Positions known to have had a stored tail on 2026-09-09, largest first per
 *  chain. Every one is probed and the LARGEST that answers is the one measured,
 *  because a tail is a value the store may replace at a higher cut but is not
 *  obliged to hold forever, and one position going quiet must not silently
 *  lower the row this whole check rests on. */
const CANDIDATES = {
  1: [
    // waEthUSDC held by stkwaEthUSDC.v1 — 9,021 rows on the day.
    { vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e", holder: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6" },
    // waEthUSDT held by stkwaEthUSDT.v1 — 8,319 rows.
    { vault: "0x7bc3485026ac48b6cf9baf0a377477fff5703af8", holder: "0xa484ab92fe32b143aee7019fc1502b1daa522d31" },
    // waEthWETH held by 0xba13… — 6,941 rows.
    { vault: "0x0bfc9d54fc184518a81162f8fb99c2eaca081202", holder: "0xba1333333333a1ba1108e8412f11850a5c319ba9" },
    // waEthWETH held by 0xaafd… — 3,942 rows (F5).
    { vault: "0x0bfc9d54fc184518a81162f8fb99c2eaca081202", holder: "0xaafd07d53a7365d3e9fb6f3a3b09ec19676b73ce" },
  ],
  8453: [
    // The case-study MetaMorpho vault, its two largest stored holders.
    { vault: "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2", holder: "0x25c10987091f98bff0f48a5bd24d7b3bf3419c52" },
    { vault: "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2", holder: "0x211bc3a35a5aba59531e00703a2768e966154d18" },
    { vault: "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2", holder: "0xaffd3c3cd06cf499deddf78b26868018a93f2c31" },
  ],
};

let failures = 0;
let passes = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};

const n = (v) => Math.round(v).toLocaleString("en-US");

/** One stored tail, measured. Null where the store holds nothing for this key
 *  (404) or did not answer — both are reported by the caller. */
async function measure(chainId, { vault, holder }) {
  const url =
    `${BASE}/api/vaults/positions/tail?chain=${chainId}&vault=${vault}` +
    `&holder=${holder}&loaderVersion=${LOADER_VERSION[chainId]}`;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (error) {
    return { vault, holder, error: String(error?.message ?? error) };
  }
  if (res.status === 404) return { vault, holder, error: "nothing stored (404)" };
  if (!res.ok) return { vault, holder, error: `HTTP ${res.status} ${res.statusText}` };

  const text = await res.text();
  const stored = Buffer.byteLength(text, "utf8");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { vault, holder, error: "the store's answer was not JSON" };
  }
  const rows = Array.isArray(body.rows) ? body.rows.length : 0;
  if (rows === 0) return { vault, holder, error: "a stored tail with no rows" };

  // The PUT-shaped body, re-serialised from the same eleven fields. It is the
  // same grammar, so it should be the same length; the two are printed apart so
  // that a day when they are NOT can be seen rather than assumed away.
  const wire = {
    chainId: body.chainId,
    vault: body.vault,
    holder: body.holder,
    loaderVersion: body.loaderVersion,
    cutBlock: body.cutBlock,
    cutBalance: body.cutBalance,
    logsIn: body.logsIn,
    logsOut: body.logsOut,
    lane: body.lane,
    storedAt: body.storedAt,
    rows: body.rows,
  };
  const put = Buffer.byteLength(JSON.stringify(wire), "utf8");
  return { vault, holder, rows, stored, put, bytesPerRow: put / rows, cut: body.cutBlock, storedAt: body.storedAt };
}

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

console.log(`Vault tail ceiling — measured against ${BASE}\n`);

const measured = {};
for (const chainId of [1, 8453]) {
  const label = chainId === 1 ? "chain 1" : "Base";
  const results = [];
  for (const candidate of CANDIDATES[chainId]) results.push(await measure(chainId, candidate));

  const read = results.filter((r) => r.rows);
  for (const r of results.filter((r) => r.error))
    console.log(`      ${label} ${short(r.vault)}/${short(r.holder)}: ${r.error}`);

  const largest = read.sort((a, b) => b.rows - a.rows)[0] ?? null;
  measured[chainId] = largest;

  check(
    `1${chainId === 1 ? "a" : "b"}  ${label}: a stored tail answered and could be measured`,
    largest != null,
    largest
      ? `${short(largest.vault)}/${short(largest.holder)} — ${n(largest.rows)} rows, ` +
          `${n(largest.put)} bytes, ${largest.bytesPerRow.toFixed(1)} B/row, cut ${n(largest.cut)}, stored ${largest.storedAt}`
      : `none of the ${CANDIDATES[chainId].length} candidate positions had a stored tail — ` +
          `no measurement was made, so nothing below is proved`,
  );
  if (largest && largest.stored !== largest.put)
    console.log(
      `      ${label}: the stored body is ${n(largest.stored)} bytes and the PUT-shaped one ${n(largest.put)} — ` +
        `the two grammars have parted, and the PUT figure is the one measured`,
    );
}

console.log("");

for (const chainId of [1, 8453]) {
  const label = chainId === 1 ? "chain 1" : "Base";
  const suffix = chainId === 1 ? "a" : "b";
  const m = measured[chainId];
  const ceiling = CEILING[chainId];
  if (!m) {
    check(`2${suffix}  ${label}: a ceiling's worth of rows is inside the 6 MB working bound`, false, "not measured");
    check(`3${suffix}  ${label}: a ceiling's worth of rows is inside the store's 8 MB limit`, false, "not measured");
    continue;
  }
  const worst = ceiling * m.bytesPerRow;
  check(
    `2${suffix}  ${label}: a ceiling's worth of rows is inside the 6 MB working bound`,
    worst <= WORKING_LIMIT,
    `${n(ceiling)} rows × ${m.bytesPerRow.toFixed(1)} B = ${n(worst)} B, against ${n(WORKING_LIMIT)}`,
  );
  check(
    `3${suffix}  ${label}: a ceiling's worth of rows is inside the store's 8 MB limit`,
    worst <= STORE_LIMIT,
    `${n(ceiling)} rows × ${m.bytesPerRow.toFixed(1)} B = ${n(worst)} B, against ${n(STORE_LIMIT)}`,
  );
  // Not a check: the figure the measurement would set TODAY. A ceiling below it
  // is merely conservative and a ceiling above it is what 2 and 3 catch, so
  // this is here to be read rather than to be passed.
  const implied = Math.floor(Math.floor(WORKING_LIMIT / m.bytesPerRow) / 1000) * 1000;
  console.log(
    `      ${label}: today's measurement would set ${n(implied)}; the ceiling in force is ${n(ceiling)}` +
      `${implied === ceiling ? " — the same figure" : ""}`,
  );
}

console.log(`\n${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
