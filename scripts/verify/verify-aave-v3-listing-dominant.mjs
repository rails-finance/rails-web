// The Aave V3 listings name the right main asset, and no row claims collateral
// it did not read (rails-ops TO-DO-ui-jobs §132). Also the Base timeline
// route's lifetime carries the classifier's legs (§134).
// ----------------------------------------------------------------------------
// Against BASE (dev.rails.finance unless set; lib/host.mjs sends the bypass
// header), per listing — /api/aave-v3/positions and /api/aave-v3-base/positions,
// the first 100 rows:
//
//   1. dominantDebtSymbol / dominantSupplySymbol is the side's largest reserve
//      by oracle USD (row.priceByAddress) where every reserve on that side is
//      priced, else by whole-token amount. Raw units are never compared.
//   2. No reserve row with no supply balance carries `isCollateral`, and no
//      peak row does.
//
// Then, for up to WALLETS Base rows whose reserves include a supply, the
// timeline route (/api/chain/aave-v3-base/timeline) answers a `lifetime`
// whose entries are numbers on every leg they carry, and where an entry
// names a classifier leg (transferredIn, swappedOut, …) it is a positive
// number. The offline proof of the counting is
// verify-aave-v3-lifetime-bigint.mjs ("legs the classifier counts").
//
// Run:  node scripts/verify/verify-aave-v3-listing-dominant.mjs
//       BASE=http://localhost:3000 node scripts/verify/verify-aave-v3-listing-dominant.mjs

import { BASE, hostFetch } from "./lib/host.mjs";

const LISTINGS = ["/api/aave-v3/positions", "/api/aave-v3-base/positions"];
const WALLETS = Number(process.env.WALLETS ?? 6);
const EXTRA_LEGS = [
  "soldToRepay",
  "withdrawnSwapped",
  "swappedOut",
  "transferredIn",
  "transferredOut",
  "swappedIn",
  "repaidBySwap",
  "treasuryFee",
];

let checks = 0;
let failures = 0;
function assert(cond, msg) {
  checks++;
  if (cond) console.log("  ok:", msg);
  else {
    failures++;
    console.log("  FAIL:", msg);
  }
}

const scaled = (raw, decimals) => Number(BigInt(raw)) / 10 ** decimals;

/** The side's dominant reserve by the listing's rule. */
function expected(row, side) {
  const key = side === "debt" ? "debtBalanceRaw" : "supplyBalanceRaw";
  const held = row.reserves.filter((r) => BigInt(r[key]) > 0n);
  if (held.length === 0) return null;
  const price = (r) => row.priceByAddress?.[r.address.toLowerCase()];
  const allPriced = held.every((r) => typeof price(r) === "number");
  const value = (r) => scaled(r[key], r.decimals) * (allPriced ? price(r) : 1);
  return held.reduce((best, r) => (value(r) > value(best) ? r : best));
}

async function json(path) {
  const res = await hostFetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.json();
}

const baseWallets = [];
for (const path of LISTINGS) {
  console.log(`\n${path}`);
  let body;
  try {
    body = await json(`${path}?limit=100`);
  } catch (e) {
    assert(false, `the listing answers (${e.message})`);
    continue;
  }
  const rows = body.rows ?? [];
  assert(rows.length > 0, `${rows.length} rows`);
  let multiDebt = 0;
  let multiSupply = 0;
  const wrong = [];
  let debtOnly = 0;
  const flagged = [];
  for (const row of rows) {
    for (const side of ["debt", "supply"]) {
      const held = row.reserves.filter((r) => BigInt(side === "debt" ? r.debtBalanceRaw : r.supplyBalanceRaw) > 0n);
      if (held.length < 2) continue;
      if (side === "debt") multiDebt++;
      else multiSupply++;
      const want = expected(row, side);
      const got = side === "debt" ? row.dominantDebtAddress : row.dominantSupplyAddress;
      if (want && got?.toLowerCase() !== want.address.toLowerCase())
        wrong.push(
          `${row.wallet} ${side}: ${side === "debt" ? row.dominantDebtSymbol : row.dominantSupplySymbol} over ${want.symbol}`,
        );
    }
    for (const r of row.reserves) {
      if (BigInt(r.supplyBalanceRaw) > 0n) continue;
      debtOnly++;
      if ("isCollateral" in r) flagged.push(`${row.wallet} ${r.symbol}`);
    }
    for (const r of row.peakReserves ?? []) if ("isCollateral" in r) flagged.push(`${row.wallet} peak ${r.symbol}`);
    if (path.includes("base") && row.reserves.length > 0) baseWallets.push(row.wallet);
  }
  assert(
    wrong.length === 0,
    `the dominant asset is the largest by USD on ${multiDebt} multi-debt and ${multiSupply} multi-supply rows` +
      (wrong.length ? ` — ${wrong.slice(0, 5).join("; ")}` : ""),
  );
  assert(
    flagged.length === 0,
    `none of ${debtOnly} reserve rows with no supply, nor a peak row, carries isCollateral` +
      (flagged.length ? ` — ${flagged.slice(0, 5).join("; ")}` : ""),
  );
}

console.log(`\n/api/chain/aave-v3-base/timeline lifetime (${Math.min(WALLETS, baseWallets.length)} wallets)`);
for (const wallet of baseWallets.slice(0, WALLETS)) {
  let body;
  try {
    body = await json(`/api/chain/aave-v3-base/timeline?wallet=${wallet}`);
  } catch (e) {
    assert(false, `${wallet} answers (${e.message})`);
    continue;
  }
  const bad = [];
  const named = new Set();
  for (const f of body.lifetime ?? []) {
    for (const leg of EXTRA_LEGS) {
      if (!(leg in f)) continue;
      named.add(leg);
      if (!(typeof f[leg] === "number" && f[leg] > 0)) bad.push(`${f.symbol}.${leg}=${f[leg]}`);
    }
  }
  // A drawn transfer outside a liquidation, or a drawn swap, needs its leg.
  const events = body.events ?? [];
  const liqTxs = new Set(
    events.filter((e) => e.context?.data?.eventType === "liquidation").map((e) => e.txHash?.toLowerCase()),
  );
  const kindOf = (e) => e.context?.data?.eventType;
  const plain = (e) => !liqTxs.has(e.txHash?.toLowerCase());
  if (events.some((e) => kindOf(e) === "transfer_in" && plain(e)) && !named.has("transferredIn"))
    bad.push("a transfer in is drawn and transferredIn is absent");
  if (
    events.some((e) => kindOf(e) === "swap") &&
    ![...named].some((l) => l !== "transferredIn" && l !== "transferredOut")
  )
    bad.push("a swap is drawn and no swap leg is present");
  assert(
    bad.length === 0 && Array.isArray(body.lifetime),
    `${wallet}: ${body.lifetime?.length ?? 0} lifetime entries; classifier legs ${[...named].join(", ") || "none on this wallet"}` +
      (bad.length ? ` — ${bad.join("; ")}` : ""),
  );
}

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures > 0 || checks === 0 ? 1 : 0);
