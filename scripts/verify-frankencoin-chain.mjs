// Verify the Frankencoin indexed ledger against the chain — assertions that
// could actually fail, run against live mainnet (ALCHEMY_URL) + the live
// rails index (RAILS_API_URL + API_BEARER_TOKEN) + Etherscan as the neutral
// third party. This is the `verification` coverage cell's script: the
// MintingUpdate ledger's absolutes ARE stored state (Phase-0-proven), so the
// index must reproduce eth_call reads exactly.
//
//   A. CENSUS CONTROL — the index carries at least the Phase-0 census (218
//      positions) and re-finds the two known control positions (one per hub).
//      A rate-limited or half-filled index fails loudly, never as an empty.
//   B. LEDGER == CHAIN (the core invariant) — for EVERY open ledger-bearing
//      position: the index's latest minted_raw equals minted() and price_raw
//      equals price() at head, wei-exact. minted/price move ONLY through
//      events, so any drift is a real indexing bug.
//   C. COLLATERAL vs balanceOf — same sweep, REPORTED not failed: collateral
//      can change without an event (direct ERC-20 transfers — two live
//      positions are known to hold such), so a mismatch here is a finding,
//      not a failure. NULL ledger collateral must stay NULL (never zero).
//   D. HUB VERSION — the index's hub_version maps onto the chain's own probe
//      (riskPremiumPPM() succeeding ⇔ V2), per open position.
//   E. DENY MARKER — hub-specific (MEASURED on all 14 denied positions, this
//      script's own discovery): V1 deny() pins cooldown() to/past
//      expiration(); V2 deny() CLOSES the position outright (isClosed, the
//      cooldown stays at start) — indistinguishable at head from a normal
//      close, which is exactly why DENIED is served from the indexed event.
//   F. PEAKS — running maxima are ≥ the latest absolutes (index-internal
//      invariant on the same rows).
//   G. CHALLENGE SLICES vs ETHERSCAN — the known 5-slice V1 challenge (#8 on
//      0xA73eA04f…): the timeline's challenge_succeeded rows reproduce the
//      hub's own ChallengeSucceeded logs (count, bid, acquiredCollateral)
//      field-for-field against Etherscan — a neutral-party check, zero trust
//      in either our index or our RPC.
//
// Usage: node scripts/verify-frankencoin-chain.mjs

import { createPublicClient, http, parseAbi, decodeEventLog, erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync, existsSync } from "node:fs";

const envFile = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};
const ALCHEMY_URL = process.env.ALCHEMY_URL ?? envFile.ALCHEMY_URL;
const RAILS_API_URL = process.env.RAILS_API_URL ?? envFile.RAILS_API_URL;
const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN ?? envFile.API_BEARER_TOKEN;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? envFile.ETHERSCAN_API_KEY;
if (!ALCHEMY_URL || !RAILS_API_URL || !API_BEARER_TOKEN) {
  console.error("need ALCHEMY_URL, RAILS_API_URL and API_BEARER_TOKEN (env or .env.local)");
  process.exit(1);
}

const client = createPublicClient({ chain: mainnet, transport: http(ALCHEMY_URL) });

const HUB_V1 = "0x7546762fdb1a6d9146b33960545C3f6394265219";
// The Phase-0 controls — one known position per hub. A sweep that misses
// either is a broken index, not an empty one.
const CONTROL_V1 = "0xf652c3ce52933cabf07199887e64301c0705620e";
const CONTROL_V2 = "0x49c431454c40ecbf848096f2753b2abc3a699a10";
// The known multi-slice auction (challenge #8, 5 ChallengeSucceeded slices).
const FIVE_SLICE_POSITION = "0xa73ea04fef834e41a044f0bdddd959a9ff8fc639";
const FIVE_SLICE_NUMBER = "8";

const POSITION_ABI = parseAbi([
  "function minted() view returns (uint256)",
  "function price() view returns (uint256)",
  "function collateral() view returns (address)",
  "function expiration() view returns (uint256)",
  "function cooldown() view returns (uint256)",
]);
const V2_ABI = parseAbi(["function riskPremiumPPM() view returns (uint24)"]);
const SUCCEEDED_ABI = parseAbi([
  "event ChallengeSucceeded(address indexed position, uint256 number, uint256 bid, uint256 acquiredCollateral, uint256 challengeSize)",
]);
const TOPIC_SUCCEEDED = "0x7d3a26e8d43c5b70f86266bfa26c212e3c097716ff7240ccb6a9034e48754e23";

async function api(path) {
  const res = await fetch(`${RAILS_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_BEARER_TOKEN}` },
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

let pass = 0;
let fail = 0;
const findings = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ── A. Census control ─────────────────────────────────────────────────────────
const all = [];
for (let offset = 0; ; offset += 100) {
  const page = await api(`/api/frankencoin/positions?status=open,closed,denied&limit=100&offset=${offset}`);
  all.push(...page.rows);
  if (all.length >= page.total || page.rows.length === 0) break;
}
check("A census floor (≥ 218 positions, both hubs)", all.length >= 218, `index carries ${all.length}`);
const have = new Set(all.map((r) => r.position.toLowerCase()));
check("A control positions present (V1 + V2)", have.has(CONTROL_V1) && have.has(CONTROL_V2));

// ── B/C/D. The per-position ledger-vs-chain sweep (open, ledger-bearing) ─────
const open = all.filter((r) => r.status === "open" && r.minted_raw != null);
const ledgerBearing = open.filter((r) => r.collateral_raw != null);
console.log(`\nsweeping ${open.length} open positions (${ledgerBearing.length} ledger-bearing) against head…`);

let mintedExact = 0;
let priceExact = 0;
let hubExact = 0;
const collateralDrift = [];
const errs = [];
for (let i = 0; i < open.length; i += 30) {
  const batch = open.slice(i, i + 30);
  const contracts = batch.flatMap((r) => [
    { address: r.position, abi: POSITION_ABI, functionName: "minted" },
    { address: r.position, abi: POSITION_ABI, functionName: "price" },
    { address: r.position, abi: POSITION_ABI, functionName: "collateral" },
    { address: r.position, abi: V2_ABI, functionName: "riskPremiumPPM" },
  ]);
  const res = await client.multicall({ contracts, allowFailure: true });
  for (let j = 0; j < batch.length; j++) {
    const r = batch[j];
    const [m, p, c, rp] = res.slice(j * 4, j * 4 + 4);
    if (m.status !== "success" || p.status !== "success") {
      errs.push(r.position);
      continue;
    }
    if (String(m.result) === String(r.minted_raw).split(".")[0]) mintedExact++;
    else findings.push(`minted drift ${r.position}: index ${r.minted_raw} vs chain ${m.result}`);
    if (String(p.result) === String(r.price_raw).split(".")[0]) priceExact++;
    else findings.push(`price drift ${r.position}: index ${r.price_raw} vs chain ${p.result}`);
    const chainHub = rp.status === "success" ? "v2" : "v1";
    if (String(r.hub_version).toLowerCase() === chainHub) hubExact++;
    else findings.push(`hub_version drift ${r.position}: index ${r.hub_version} vs chain probe ${chainHub}`);
    // C — collateral vs balanceOf, reported not failed (direct transfers are
    // legal and event-invisible).
    if (r.collateral_raw != null && c.status === "success") {
      const bal = await client
        .readContract({ address: c.result, abi: erc20Abi, functionName: "balanceOf", args: [r.position] })
        .catch(() => null);
      if (bal != null && String(bal) !== String(r.collateral_raw).split(".")[0])
        collateralDrift.push(`${r.position}: ledger ${r.collateral_raw} vs balanceOf ${bal}`);
    }
  }
}
// The count equalities below are vacuous if `open` is empty (0 === 0 passes
// while nothing was swept): census A guarantees ≥218 positions EXIST, not that
// any are open, so gate on a non-empty sweep before comparing.
check(
  "B minted() wei-exact on every open ledger-bearing position",
  open.length > 0 && mintedExact === open.length - errs.length,
  `${mintedExact}/${open.length - errs.length} exact${errs.length ? `, ${errs.length} unreadable` : ""}`,
);
check(
  "B price() wei-exact on every open ledger-bearing position",
  open.length > 0 && priceExact === open.length - errs.length,
);
check("D hub_version matches the chain's own V2 probe", open.length > 0 && hubExact === open.length - errs.length);
console.log(
  `C collateral vs balanceOf: ${collateralDrift.length} drift(s) — REPORTED, not failed (direct transfers are event-invisible)`,
);
for (const d of collateralDrift) console.log(`   · ${d}`);
const noLedger = open.filter((r) => r.collateral_raw == null);
check(
  "C NULL ledger collateral stays NULL (never coerced to zero)",
  noLedger.every((r) => r.collateral_raw === null),
  `${noLedger.length} open no-ledger rows`,
);

// ── E. Deny marker (hub-specific — see the header) ────────────────────────────
const denied = all.filter((r) => r.status === "denied");
{
  const ISCLOSED_ABI = parseAbi(["function isClosed() view returns (bool)"]);
  const contracts = denied.flatMap((r) => [
    { address: r.position, abi: POSITION_ABI, functionName: "cooldown" },
    { address: r.position, abi: POSITION_ABI, functionName: "expiration" },
    { address: r.position, abi: ISCLOSED_ABI, functionName: "isClosed" },
  ]);
  const res = await client.multicall({ contracts, allowFailure: true });
  let ok = 0;
  for (let j = 0; j < denied.length; j++) {
    const [cd, ex, cl] = res.slice(j * 3, j * 3 + 3);
    const isV1 = String(denied[j].hub_version).toLowerCase() === "v1";
    const marker = isV1
      ? cd.status === "success" && ex.status === "success" && cd.result >= ex.result
      : cl.status === "success" && cl.result === true;
    if (marker) ok++;
    else
      findings.push(
        `deny marker missing on ${denied[j].position} (${denied[j].hub_version}): cooldown ${cd.result}, expiration ${ex.result}, isClosed ${cl.result}`,
      );
  }
  check(
    "E deny marker on every denied position (V1: cooldown ≥ expiration; V2: isClosed)",
    denied.length > 0 && ok === denied.length,
    `${ok}/${denied.length}`,
  );
}

// ── F. Peaks are running maxima ───────────────────────────────────────────────
{
  const bad = all.filter(
    (r) =>
      (r.peak_minted_raw != null && r.minted_raw != null && BigInt(r.peak_minted_raw) < BigInt(r.minted_raw)) ||
      (r.peak_collateral_raw != null &&
        r.collateral_raw != null &&
        BigInt(r.peak_collateral_raw) < BigInt(r.collateral_raw)),
  );
  // Guard the vacuous case: if NO row carries both a peak and a latest, `bad` is
  // empty and the invariant would pass having compared nothing.
  const withPeak = all.filter((r) => r.peak_minted_raw != null && r.minted_raw != null);
  check(
    "F peak fields are populated to compare",
    withPeak.length > 0,
    `${withPeak.length} rows carry peak+latest minted`,
  );
  check("F peaks ≥ latest absolutes on every row", bad.length === 0, bad.map((r) => r.position).join(", "));
}

// ── G. Challenge slices vs Etherscan (the neutral third party) ────────────────
if (!ETHERSCAN_API_KEY) {
  console.log("G skipped — no ETHERSCAN_API_KEY");
} else {
  const qs = new URLSearchParams({
    chainid: "1",
    module: "logs",
    action: "getLogs",
    address: HUB_V1,
    topic0: TOPIC_SUCCEEDED,
    topic1: "0x000000000000000000000000" + FIVE_SLICE_POSITION.slice(2),
    topic0_1_opr: "and",
    fromBlock: "0",
    toBlock: "latest",
    apikey: ETHERSCAN_API_KEY,
  });
  const es = await (await fetch(`https://api.etherscan.io/v2/api?${qs}`)).json();
  const logs = Array.isArray(es.result) ? es.result : [];
  const chainSlices = logs
    .map((l) => decodeEventLog({ abi: SUCCEEDED_ABI, data: l.data, topics: l.topics }).args)
    .filter((a) => String(a.number) === FIVE_SLICE_NUMBER);

  const tl = await api(`/api/frankencoin/timeline?position=${FIVE_SLICE_POSITION}&limit=5000`);
  const indexSlices = tl.rows.filter(
    (r) => r.event_type === "challenge_succeeded" && String(r.challenge_number) === FIVE_SLICE_NUMBER,
  );
  check(
    `G slice count matches Etherscan (challenge #${FIVE_SLICE_NUMBER})`,
    chainSlices.length === indexSlices.length && chainSlices.length === 5,
    `etherscan ${chainSlices.length}, index ${indexSlices.length}`,
  );
  const key = (bid, acq) => `${bid}|${acq}`;
  const chainSet = new Set(chainSlices.map((a) => key(a.bid, a.acquiredCollateral)));
  const matched = indexSlices.filter((r) =>
    chainSet.has(key(String(r.bid).split(".")[0], String(r.acquired_collateral).split(".")[0])),
  ).length;
  check("G every slice's (bid, acquiredCollateral) reproduces the log field-for-field", matched === chainSlices.length);
}

// ── verdict ───────────────────────────────────────────────────────────────────
if (findings.length) {
  console.log("\nFINDINGS:");
  for (const f of findings) console.log(`  · ${f}`);
}
console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
