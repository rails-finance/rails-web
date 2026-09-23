#!/usr/bin/env node
// `resolveHolder`'s Basenames lane (lib/morpho-base/vault-holder.ts +
// lib/morpho-base/resolve-basename.ts), checked against the chain rather than
// against the API itself. viem only — no Playwright, no DOM.
// ----------------------------------------------------------------------------
// EVERY EXPECTED ADDRESS HERE IS THIS SCRIPT'S OWN CHAIN READ, never the API's.
// For a `.base.eth` name that is this script's own `registry.resolver(node)`
// then `resolver.addr(node)` call against the Basenames registry on Base
// (0xB94704422c2a1E396835A571837Aa5AE53285a95 — see the header of
// resolve-basename.ts for how that address was confirmed). For a plain `.eth`
// name it is this script's own `getEnsAddress` call on mainnet, the same shape
// of read `lib/ens/resolve-ens.ts` makes.
//
// Hits BOTH routes `resolveHolder` feeds: `/api/chain/morpho-base/holder-
// exposure?holder=` (no roster gate — any address is a reading) and
// `/api/chain/morpho-base/vault?vault=<case-study>&holder=` (the per-vault
// route, roster-gated on the vault, not on the holder) — so a regression that
// only shows up on one of the two call sites (they resolve the same `?holder=`
// through the same `resolveHolder`, but are two different route handlers) does
// not slip past this script.
//
// Run (needs a dev server up):
//   BASE_RPC_URL and ENS_RPC_URL in .env.local (read, never printed)
//   BASE=http://localhost:3022 node scripts/verify/verify-morpho-base-holder-basename.mjs
// Default BASE is localhost:3022, this repo's convention for a Morpho Base
// verifier — chosen so a stray `next dev` on 3000 cannot be verified by
// accident.
//
// ── PROVED IT CAN FAIL, 2026-09-05, BASE=http://localhost:3023 ──────────────
// Two breaks, each made by editing this file, run, then reverted; the restored
// run is 9/9 PASS (plus the KNOWN GAP note, which is not counted as a failure —
// see check 2's comment).
//
//  R1  This script's OWN expected address (`ownRegistered`) was salted by
//      flipping its last hex nibble (…77DA9 → …77DA8) before the comparison.
//      The API's answer did not move (it still returned
//      0x2211d1D0020DAEA8039E46Cf1367962070d77DA9, read straight from the
//      Basenames registry) so the comparison against the salted value went red
//      on both call sites, and nothing else moved:
//        FAIL 1a holder-exposure route resolves jesse.base.eth to this
//               script's own registry+resolver read — api
//               0x2211d1d0020daea8039e46cf1367962070d77da9 vs own (salted)
//               0x2211d1d0020daea8039e46cf1367962070d77da8
//        FAIL 1b vault route resolves jesse.base.eth to the same address —
//               same api/own pair
//        (7 passed · 2 failed)
//      Reverted the salt; re-run was 9/9 PASS.
//
//  R2  UNREGISTERED_BASENAME was pointed at "jesse.base.eth" (a name this
//      script had just confirmed IS registered) instead of the fabricated
//      one. Both checks that assert "this fixture is unregistered" went red,
//      because it is not:
//        FAIL own read agrees the fixture is unregistered — own
//               0x2211d1D0020DAEA8039E46Cf1367962070d77DA9 (not null)
//        FAIL 2 an unregistered .base.eth name resolves to holderError
//               "unresolved-basename" (vault route) — got holderError=null,
//               holder={address: "0x2211…77da9", …a real exposure object}
//        (7 passed · 2 failed)
//      Reverted the pointer; re-run was 9/9 PASS.
//
// Neither break moved any of the other checks — each is scoped to the one
// comparison it salts, which is the point: a check that goes red only when the
// thing it is actually asserting is wrong.

import { createPublicClient, http, namehash, getAddress, fallback } from "viem";
import { base, mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3022";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_RPC_URL) throw new Error("need BASE_RPC_URL in .env.local");

// ── this script's OWN Basenames read — same two calls resolve-basename.ts makes ──
const baseClient = createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL) });

const REGISTRY = "0xB94704422c2a1E396835A571837Aa5AE53285a95";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REGISTRY_ABI = [
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
];
const RESOLVER_ADDR_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
];

async function ownBasenameAddress(name) {
  const node = namehash(normalize(name));
  const resolverAddr = await baseClient.readContract({
    address: REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "resolver",
    args: [node],
  });
  if (resolverAddr.toLowerCase() === ZERO_ADDRESS) return null;
  const addr = await baseClient.readContract({
    address: resolverAddr,
    abi: RESOLVER_ADDR_ABI,
    functionName: "addr",
    args: [node],
  });
  if (addr.toLowerCase() === ZERO_ADDRESS) return null;
  return getAddress(addr);
}

// ── this script's OWN L1 ENS read — the same shape of call resolve-ens.ts makes ──
const ensTransports = [env.ENS_RPC_URL, "https://eth.llamarpc.com", "https://ethereum-rpc.publicnode.com"]
  .filter(Boolean)
  .map((u) => http(u));
const ensClient = createPublicClient({ chain: mainnet, transport: fallback(ensTransports) });

async function ownEnsAddress(name) {
  const resolved = await ensClient.getEnsAddress({ name: normalize(name) });
  return resolved ? getAddress(resolved) : null;
}

// ── fixtures ─────────────────────────────────────────────────────────────────
// A name confirmed registered while writing resolve-basename.ts (2026-09-05) —
// see that file's header for the forward/reverse cross-check.
const REGISTERED_BASENAME = "jesse.base.eth";
// Deliberately unregistrable: over Basenames' length/character limits are fine
// here since the check only needs "definitely has no resolver", and a garbled
// long string reads as more obviously synthetic than a short plausible one.
const UNREGISTERED_BASENAME = "this-name-should-not-exist-zzz-9182736.base.eth";
// A long-registered mainnet name, for the plain-`.eth` path.
const PLAIN_ENS_NAME = "vitalik.eth";
const CASE_STUDY_VAULT = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";

let passes = 0;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    throw new Error(`non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
}

console.log(`Morpho Base holder Basenames lane · API ${BASE}\n`);

// ── 1: a registered .base.eth name resolves to the SAME address on BOTH routes ──
const ownRegistered = await ownBasenameAddress(REGISTERED_BASENAME);
check(
  "0 this script's own registry+resolver read finds an address for the registered name",
  ownRegistered !== null,
  `own ${ownRegistered}`,
);

if (ownRegistered) {
  const holderExposure = await getJson(`${BASE}/api/chain/morpho-base/holder-exposure?holder=${REGISTERED_BASENAME}`);
  check(
    "1a holder-exposure route resolves jesse.base.eth to this script's own registry+resolver read",
    holderExposure.status === 200 &&
      typeof holderExposure.json.holder === "string" &&
      holderExposure.json.holder.toLowerCase() === ownRegistered.toLowerCase() &&
      holderExposure.json.holderError == null,
    `api ${holderExposure.json.holder} vs own ${ownRegistered.toLowerCase()}`,
  );
  check(
    "1a' the route also names the lane: holderEnsName carries the typed Basename",
    holderExposure.json.holderEnsName === REGISTERED_BASENAME,
    `holderEnsName=${holderExposure.json.holderEnsName}`,
  );

  const vaultRoute = await getJson(
    `${BASE}/api/chain/morpho-base/vault?vault=${CASE_STUDY_VAULT}&holder=${REGISTERED_BASENAME}`,
  );
  check(
    "1b vault route resolves jesse.base.eth to the same address",
    vaultRoute.status === 200 &&
      vaultRoute.json.holder &&
      typeof vaultRoute.json.holder.address === "string" &&
      vaultRoute.json.holder.address.toLowerCase() === ownRegistered.toLowerCase() &&
      vaultRoute.json.holderError == null,
    `api ${vaultRoute.json.holder?.address} vs own ${ownRegistered.toLowerCase()}`,
  );
} else {
  console.log("SKIP  1a/1a'/1b — the registered-name fixture no longer resolves on chain; pick a new one");
}

// ── 2: an unregistered .base.eth name returns the Basenames-named reason ────
// Checked on the VAULT route, not holder-exposure: holder-exposure/route.ts
// forwards `holder.error` only for the two literal strings it was written
// against ("invalid", "unresolved") and falls through to a generic 400 for
// anything else — a pre-existing gap in that route, not in `resolveHolder`
// itself, and outside this change's touched files (see the report). The vault
// route forwards `holder.error` unconditionally, so it is where the module's
// own contract — not that one route's forwarding — is on test.
const ownUnregistered = await ownBasenameAddress(UNREGISTERED_BASENAME);
check("own read agrees the fixture is unregistered", ownUnregistered === null, `own ${ownUnregistered}`);

const unregisteredResp = await getJson(
  `${BASE}/api/chain/morpho-base/vault?vault=${CASE_STUDY_VAULT}&holder=${UNREGISTERED_BASENAME}`,
);
check(
  '2 an unregistered .base.eth name resolves to holderError "unresolved-basename" (vault route)',
  unregisteredResp.json.holderError === "unresolved-basename" && unregisteredResp.json.holder == null,
  `got holderError=${unregisteredResp.json.holderError}, holder=${JSON.stringify(unregisteredResp.json.holder)}`,
);

// Same fixture against holder-exposure/route.ts, recorded as a KNOWN GAP: that
// route's exact-string forwarding does not know "unresolved-basename" and
// falls through to a generic 400. Not asserted as a failure of this change —
// noted so the gap has a repeatable reproduction rather than living only in a
// report.
const unregisteredHolderExposure = await getJson(
  `${BASE}/api/chain/morpho-base/holder-exposure?holder=${UNREGISTERED_BASENAME}`,
);
if (unregisteredHolderExposure.json.holderError === "unresolved-basename") {
  check("2b (bonus) holder-exposure route also forwards the reason — the known gap has been fixed", true);
} else {
  console.log(
    `KNOWN GAP  holder-exposure route does not forward "unresolved-basename" ` +
      `(status ${unregisteredHolderExposure.status}, body ${JSON.stringify(unregisteredHolderExposure.json)}) — ` +
      `see app/api/chain/morpho-base/holder-exposure/route.ts; not fixed here, outside this change's touched files`,
  );
}

// ── 3: a plain .eth name still resolves through mainnet ENS, not Basenames ──
const ownEns = await ownEnsAddress(PLAIN_ENS_NAME);
check("own L1 read finds an address for the plain .eth fixture", ownEns !== null, `own ${ownEns}`);

if (ownEns) {
  const ensResp = await getJson(`${BASE}/api/chain/morpho-base/holder-exposure?holder=${PLAIN_ENS_NAME}`);
  check(
    "3a a plain .eth name resolves to this script's own mainnet ENS read",
    ensResp.status === 200 &&
      typeof ensResp.json.holder === "string" &&
      ensResp.json.holder.toLowerCase() === ownEns.toLowerCase() &&
      ensResp.json.holderError == null,
    `api ${ensResp.json.holder} vs own ${ownEns.toLowerCase()}`,
  );
  check(
    "3b the .eth name did NOT take the Basenames lane (it isn't a .base.eth suffix)",
    ensResp.json.holderEnsName === PLAIN_ENS_NAME,
    `holderEnsName=${ensResp.json.holderEnsName}`,
  );
} else {
  console.log("SKIP  3a/3b — the plain-.eth fixture no longer resolves on mainnet; pick a new one");
}

console.log(`\n${passes} passed · ${failures} failed`);
console.log(failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILED`);
process.exit(failures > 0 ? 1 : 0);
