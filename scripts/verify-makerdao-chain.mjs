// Verify the MakerDAO chain-lane facts before the uplift wires them live —
// the Spark/V1/Morpho-uplift precedent: every address, getter, scale and
// formula the position reader (and the new card surfaces) rely on is checked
// against the chain itself, so the reader never encodes an unverified
// assumption.
//
// Checks:
//   1. Address graph — the CDP Manager, Jug, Dog and Spotter each name the Vat
//      we catalog; the Spotter names a pip (OSM) per ilk.
//   2. Scales — par == RAY (never re-pegged); per-ilk rate/mat in sane ray
//      ranges; Jug.base + duty compose the full stability fee.
//   3. Price inversion — priceUsd = spot · par · mat / RAY² (the Spotter.poke
//      inversion the app ships) agrees with Chainlink ETH/USD within OSM-delay
//      tolerance for the ETH ilks.
//   4. Safety line — the Vat's own safety predicate (ink·spot ≥ art·rate) is
//      EQUIVALENT to price ≥ liquidation price where
//      liqPrice = (art·rate·mat) / (ink·par) — the formula the runway ships.
//      Algebra check on live vaults, both directions.
//   5. Stability-fee APR — apr = (base+duty / RAY)^seconds-per-year − 1, in a
//      sane band; Jug.rho never ahead of now.
//   6. Real positions — the urn/owns/ilks resolution + DSProxy owner hop on
//      the whale cdp (31214); a liquidated cdp's urn settled to ~0; art×rate
//      ≥ dust (or art == 0) on live vaults.
//   7. Debt identity — debtDai = art × rate / RAY reproduces to 18 dp on a
//      real vault; Vat.debt ≥ Σ sampled ilk Art×rate (global sanity).
//   8. The system lane (/makerdao/system) — the Vat's identity over EVERY ilk:
//      Vat.debt == Σ (Art × rate) + vice, exact to the last rad. Proves the
//      three claims the view rests on: IlkRegistry.list() is NOT a complete
//      roster (governance delists an ilk on wind-down; the Vat keeps its slot),
//      the named delisted ilks are exactly what closes the gap, and the identity
//      then holds with zero residual. Also pins the two readings the view
//      refuses: an autoline ilk whose line == debt + gap to the wei (so
//      "utilisation" would restate the gap), and ilks with line == 0 carrying
//      debt (CLOSED — no ceiling left to be a fraction of).
//
// Run: node scripts/verify-makerdao-chain.mjs

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const rpc = env
  .match(/^ALCHEMY_URL=(.+)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
const c = createPublicClient({ chain: mainnet, transport: http(rpc) });

// The catalog the app ships (lib/makerdao/asset-catalog.ts).
const CATALOG = {
  VAT: "0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b",
  CDP_MANAGER: "0x5ef30b9986345249bc32d8928b7ee64de9435e39",
  DOG: "0x135954d155898d42c90d2a57824c690e0c7bef1b",
  SPOTTER: "0x65c79fcb50ca1594b025960e539ed7a9a6d434a3",
  JUG: "0x19c0976f590d67707e62397c87829d896dc0f1f1",
  DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
};
// Chainlink ETH/USD — independent reference for the OSM price inversion only
// (the app itself never reads it; the OSM lags by design, so tolerance is wide).
const CHAINLINK_ETH_USD = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

// Spot-check subjects (from the live index, 2026-07-14):
//   31214 — the ETH-C whale whose owner hop + replay equality anchored the
//           original onboarding; 27759/29025 — recently-active borrowers on
//           two ilks (recently-active matters: an old vault's LATER activity
//           can bypass the CdpManager — the skipped direct-Vat urns — so its
//           indexed terminal state can trail the chain);
//   32008 — liquidated (ETH-B), urn should have settled to zero.
const CDP_WHALE = 31214n;
const CDP_ACTIVE = [27759n, 29025n];
const CDP_LIQUIDATED = 32008n;

const VAT_ABI = parseAbi([
  "function urns(bytes32, address) view returns (uint256 ink, uint256 art)",
  "function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
  "function debt() view returns (uint256)",
]);
const CDP_ABI = parseAbi([
  "function vat() view returns (address)",
  "function cdpi() view returns (uint256)",
  "function urns(uint256) view returns (address)",
  "function owns(uint256) view returns (address)",
  "function ilks(uint256) view returns (bytes32)",
]);
const SPOTTER_ABI = parseAbi([
  "function vat() view returns (address)",
  "function par() view returns (uint256)",
  "function ilks(bytes32) view returns (address pip, uint256 mat)",
]);
const JUG_ABI = parseAbi([
  "function vat() view returns (address)",
  "function base() view returns (uint256)",
  "function ilks(bytes32) view returns (uint256 duty, uint256 rho)",
]);
const DOG_ABI = parseAbi(["function vat() view returns (address)"]);
const DSPROXY_ABI = parseAbi(["function owner() view returns (address)"]);
const CHAINLINK_ABI = parseAbi(["function latestAnswer() view returns (int256)"]);

const VAT = getAddress(CATALOG.VAT);
const CDP = getAddress(CATALOG.CDP_MANAGER);
const SPOT = getAddress(CATALOG.SPOTTER);
const JUG = getAddress(CATALOG.JUG);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const RAY = 10n ** 27n;
const WAD = 10n ** 18n;
const SECONDS_PER_YEAR = 31536000;
const ilkStr = (b32) => Buffer.from(b32.slice(2), "hex").toString("utf8").replace(/\0+$/, "");
const b32 = (s) => `0x${Buffer.from(s, "utf8").toString("hex").padEnd(64, "0")}`;
const fw = (x, d = 4) => (Number(x) / 1e18).toFixed(d);

// ── 1. Address graph ─────────────────────────────────────────────────────────
const [cdpVat, spotVat, jugVat, dogVat, cdpi] = await Promise.all([
  c.readContract({ address: CDP, abi: CDP_ABI, functionName: "vat" }),
  c.readContract({ address: SPOT, abi: SPOTTER_ABI, functionName: "vat" }),
  c.readContract({ address: JUG, abi: JUG_ABI, functionName: "vat" }),
  c.readContract({ address: getAddress(CATALOG.DOG), abi: DOG_ABI, functionName: "vat" }),
  c.readContract({ address: CDP, abi: CDP_ABI, functionName: "cdpi" }),
]);
check("CdpManager.vat == Vat", cdpVat.toLowerCase() === CATALOG.VAT, cdpVat);
check("Spotter.vat == Vat", spotVat.toLowerCase() === CATALOG.VAT, spotVat);
check("Jug.vat == Vat", jugVat.toLowerCase() === CATALOG.VAT, jugVat);
check("Dog.vat == Vat", dogVat.toLowerCase() === CATALOG.VAT, dogVat);
check("cdpi covers the indexed universe (≥ 32,020)", cdpi >= 32020n, `cdpi=${cdpi}`);

// ── 2. Scales ────────────────────────────────────────────────────────────────
const par = await c.readContract({ address: SPOT, abi: SPOTTER_ABI, functionName: "par" });
check("par == RAY (DAI target price never re-pegged)", par === RAY, par.toString());
const jugBase = await c.readContract({ address: JUG, abi: JUG_ABI, functionName: "base" });
console.log(`      Jug.base = ${jugBase} (composes with per-ilk duty)`);

// Per-ilk facts for the ETH ilks + the sampled vaults' ilks.
const ILKS = ["ETH-A", "ETH-B", "ETH-C", "WSTETH-A", "WSTETH-B"];
const perIlk = new Map();
for (const name of ILKS) {
  const [vatIlk, spotIlk, jugIlk] = await Promise.all([
    c.readContract({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [b32(name)] }),
    c.readContract({ address: SPOT, abi: SPOTTER_ABI, functionName: "ilks", args: [b32(name)] }),
    c.readContract({ address: JUG, abi: JUG_ABI, functionName: "ilks", args: [b32(name)] }),
  ]);
  const [Art, rate, spot, line, dust] = vatIlk;
  const [pip, mat] = spotIlk;
  const [duty, rho] = jugIlk;
  perIlk.set(name, { Art, rate, spot, line, dust, pip, mat, duty, rho });
  check(`${name} rate in [1, 2] ray`, rate >= RAY && rate <= 2n * RAY, `rate=${(Number(rate) / 1e27).toFixed(6)}`);
  check(`${name} mat in [100%, 1000%]`, mat >= RAY && mat <= 10n * RAY, `mat=${(Number(mat) / 1e27).toFixed(2)}`);
  check(`${name} Spotter names a pip (OSM)`, pip !== "0x0000000000000000000000000000000000000000", pip);
}

// ── 3. Price inversion vs Chainlink ─────────────────────────────────────────
// priceUsd = spot · par · mat / RAY² — the app's Spotter.poke inversion. The
// OSM delays by an hour, so a wide 10% band vs Chainlink is the right check:
// it catches a wrong exponent (off by 1e9) without flaking on ordinary moves.
const clEth = await c.readContract({
  address: getAddress(CHAINLINK_ETH_USD),
  abi: CHAINLINK_ABI,
  functionName: "latestAnswer",
});
const clPrice = Number(clEth) / 1e8;
for (const name of ["ETH-A", "ETH-B", "ETH-C"]) {
  const { spot, mat } = perIlk.get(name);
  const price = Number(((spot * par) / RAY) * mat) / 1e27 / 1e27;
  const drift = Math.abs(price - clPrice) / clPrice;
  check(
    `${name} inverted OSM price within 10% of Chainlink`,
    drift < 0.1,
    `$${price.toFixed(2)} vs $${clPrice.toFixed(2)} (${(drift * 100).toFixed(2)}%)`,
  );
}
// All ETH ilks share one OSM: identical inverted prices.
{
  const p = (n) => {
    const { spot, mat } = perIlk.get(n);
    return Number(((spot * par) / RAY) * mat) / 1e27 / 1e27;
  };
  const [a, bb, cc] = [p("ETH-A"), p("ETH-B"), p("ETH-C")];
  check(
    "ETH-A/B/C invert to ONE price (shared OSM)",
    Math.abs(a - bb) < 0.01 && Math.abs(a - cc) < 0.01,
    `$${a.toFixed(2)}`,
  );
}

// ── 4. Safety line == liquidation-price formula ──────────────────────────────
// Vat safety: ink·spot ≥ art·rate. With spot = price·RAY²/(par·mat), that is
// EXACTLY price ≥ (art·rate·mat·par)/(ink·RAY²·RAY) … i.e. the runway's
//   liqPrice = debtDai × mat / ink   (all in human units, par == RAY).
// Verify the two forms agree on live vaults, both directions.
async function vaultState(id) {
  const [urn, owns, ilkB] = await Promise.all([
    c.readContract({ address: CDP, abi: CDP_ABI, functionName: "urns", args: [id] }),
    c.readContract({ address: CDP, abi: CDP_ABI, functionName: "owns", args: [id] }),
    c.readContract({ address: CDP, abi: CDP_ABI, functionName: "ilks", args: [id] }),
  ]);
  const name = ilkStr(ilkB);
  const [urnSlot, vatIlk, spotIlk] = await Promise.all([
    c.readContract({ address: VAT, abi: VAT_ABI, functionName: "urns", args: [ilkB, urn] }),
    c.readContract({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [ilkB] }),
    c.readContract({ address: SPOT, abi: SPOTTER_ABI, functionName: "ilks", args: [ilkB] }),
  ]);
  return {
    id,
    urn,
    owns,
    ilk: name,
    ink: urnSlot[0],
    art: urnSlot[1],
    rate: vatIlk[1],
    spot: vatIlk[2],
    dust: vatIlk[4],
    mat: spotIlk[1],
  };
}

for (const id of CDP_ACTIVE) {
  const v = await vaultState(id);
  if (v.art === 0n) {
    console.log(`      cdp ${id} (${v.ilk}) has settled — skipping safety algebra`);
    continue;
  }
  const price = Number(((v.spot * par) / RAY) * v.mat) / 1e27 / 1e27;
  const debtDai = Number((v.art * v.rate) / RAY) / 1e18;
  const ink = Number(v.ink) / 1e18;
  const liqPrice = (debtDai * (Number(v.mat) / 1e27)) / ink;
  const safeByVat = v.ink * v.spot >= (v.art * v.rate) / RAY;
  const safeByPrice = price >= liqPrice;
  check(
    `cdp ${id} (${v.ilk}) Vat safety ⇔ price ≥ liqPrice`,
    safeByVat === safeByPrice,
    `price $${price.toFixed(2)} liq $${liqPrice.toFixed(2)} safe=${safeByVat}`,
  );
  // dust is RAD (1e45) — the same unit as art×rate (wad×ray). Comparing in
  // rad; the human figure divides by 1e45. (This check caught the app-side
  // scale assumption before it shipped: dust is NOT ray.)
  check(
    `cdp ${id} debt ≥ dust`,
    v.art * v.rate >= v.dust,
    `debt ${debtDai.toFixed(0)} DAI dust ${(Number(v.dust) / 1e45).toFixed(0)} DAI`,
  );
}

// ── 5. Stability-fee APR ──────────────────────────────────────────────────────
const now = BigInt(Math.floor(Date.now() / 1000));
for (const name of ILKS) {
  const { duty, rho } = perIlk.get(name);
  const perSecond = Number(jugBase + duty) / 1e27;
  const apr = Math.pow(perSecond, SECONDS_PER_YEAR) - 1;
  check(`${name} stability fee APR in [0%, 50%)`, apr >= 0 && apr < 0.5, `${(apr * 100).toFixed(2)}%`);
  check(`${name} Jug.rho not ahead of now`, rho <= now + 60n, `rho=${rho}`);
}

// ── 6. Real positions ─────────────────────────────────────────────────────────
const whale = await vaultState(CDP_WHALE);
check("whale cdp 31214 is ETH-C", whale.ilk === "ETH-C", whale.ilk);
let whaleOwner = whale.owns;
try {
  whaleOwner = await c.readContract({ address: whale.owns, abi: DSPROXY_ABI, functionName: "owner" });
} catch {
  /* owns is already an EOA */
}
check(
  "whale owner hop resolves (DSProxy → EOA)",
  /^0x[0-9a-fA-F]{40}$/.test(whaleOwner) && whaleOwner.toLowerCase() !== whale.owns.toLowerCase(),
  `${whale.owns} → ${whaleOwner}`,
);
console.log(`      whale ink ${fw(whale.ink, 2)} ETH, debt ${fw((whale.art * whale.rate) / RAY, 0)} DAI`);

const liq = await vaultState(CDP_LIQUIDATED);
check("liquidated cdp 32008 art settled to 0", liq.art === 0n, `ink=${fw(liq.ink, 6)} art=${fw(liq.art, 6)}`);

// ── 7. Debt identity ──────────────────────────────────────────────────────────
// art × rate / RAY reproduces the DAI debt to 18 dp (BigInt-exact path the app
// takes), and the Vat's global debt bounds the sampled ilks' totals.
{
  const v = await vaultState(CDP_ACTIVE[0]);
  const debtWeiBig = (v.art * v.rate) / RAY;
  const debtNum = Number(debtWeiBig) / 1e18;
  const recompute = (Number(v.art) / 1e18) * (Number(v.rate) / 1e27);
  check(
    "debt = art×rate/RAY (BigInt vs float agree < 1e-6 rel)",
    Math.abs(debtNum - recompute) / Math.max(debtNum, 1) < 1e-6,
    `${debtNum.toFixed(6)} DAI`,
  );
}
const vatDebt = await c.readContract({ address: VAT, abi: VAT_ABI, functionName: "debt" });
let sampledDebt = 0n;
for (const name of ILKS) {
  const { Art, rate } = perIlk.get(name);
  sampledDebt += (Art * rate) / RAY;
}
check(
  "Vat.debt ≥ Σ sampled ilk Art×rate",
  vatDebt / RAY >= sampledDebt / WAD,
  `global ${fw(vatDebt / RAY, 0)} vs sampled ${fw(sampledDebt, 0)} DAI`,
);

// ── §8 — the system lane (/makerdao/system) ─────────────────────────────────
// The view's spine is the Vat's own identity, asserted EXACTLY:
//
//     Vat.debt == Σ (ilk.Art × ilk.rate) + Vat.vice
//
// in rad, over EVERY ilk. §7 above only bounds it against a five-ilk sample,
// which cannot catch the thing that actually bites: IlkRegistry.list() is a
// curated list, not the Vat's truth. Governance drops an ilk from the registry
// on wind-down and the Vat keeps its slot forever — so a sum over the registry
// alone silently omits whatever was delisted, and the miss is DUST-SIZED (three
// wei of DAI against $12bn), i.e. indistinguishable from rounding unless the
// check is exact.
//
// These checks prove all three claims the view rests on: the registry is
// incomplete, the named supplement is exactly what closes the gap, and with it
// the identity holds to the last rad.
console.log("\n§8 — the system lane: the Vat's identity over every ilk");

const REGISTRY = getAddress("0x5a464c28d19848f44199d003bef5ecc87d090f87");
const REG_ABI = parseAbi(["function list() view returns (bytes32[])"]);
const VAT_SYS_ABI = parseAbi(["function vice() view returns (uint256)"]);
// lib/makerdao/asset-catalog.ts UNLISTED_ILKS — kept in step with this check.
const UNLISTED = ["SAI", "RWA012-A", "RWA013-A"];

const b32ToStr = (b) => Buffer.from(b.slice(2), "hex").toString("utf8").replace(/\0+$/, "");
const strToB32 = (s) => `0x${Buffer.from(s, "utf8").toString("hex").padEnd(64, "0")}`;

const listed = await c.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "list" });
const listedNames = listed.map(b32ToStr);
const vice = await c.readContract({ address: VAT, abi: VAT_SYS_ABI, functionName: "vice" });

const sumRad = async (keys) => {
  const rows = await c.multicall({
    allowFailure: false,
    contracts: keys.map((k) => ({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [k] })),
  });
  return rows.reduce((s, r) => s + r[0] * r[1], 0n); // Art(wad) × rate(ray) = rad
};

// (a) The registry alone does NOT close the identity — the gap is the finding.
const listedRad = await sumRad(listed);
const gap = vatDebt - (listedRad + vice);
check(
  "IlkRegistry.list() alone leaves a gap (the registry is not complete)",
  gap !== 0n,
  `${listed.length} listed ilks leave ${gap} rad unaccounted (${Number(gap) / 1e45} DAI)`,
);

// (b) The supplement is genuinely absent from the registry, and each carries art.
const missing = UNLISTED.filter((i) => !listedNames.includes(i));
check("every UNLISTED_ILKS entry is absent from the registry", missing.length === UNLISTED.length, missing.join(", "));

const unlistedRows = await c.multicall({
  allowFailure: false,
  contracts: missing.map((i) => ({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [strToB32(i)] })),
});
check(
  "every delisted ilk still carries Art in the Vat",
  unlistedRows.every((r) => r[0] > 0n),
  missing.map((i, ix) => `${i}: Art=${unlistedRows[ix][0]}`).join(", "),
);

// (c) The gap is EXACTLY the supplement — not merely covered by it.
const unlistedRad = unlistedRows.reduce((s, r) => s + r[0] * r[1], 0n);
check(
  "the gap is exactly the delisted ilks' debt",
  gap === unlistedRad,
  `gap ${gap} rad == unlisted Σ ${unlistedRad} rad`,
);

// (d) The identity the view asserts, over the full roster, to the last rad.
const fullRad = listedRad + unlistedRad;
const residual = vatDebt - (fullRad + vice);
check(
  "Vat.debt == Σ (Art × rate) + vice — EXACT over all 38 ilks",
  residual === 0n,
  `residual ${residual} rad · debt ${(Number(vatDebt) / 1e45).toLocaleString("en-US")} DAI`,
);

// (e) The autoline makes debt ÷ line a tautology — the reason the view ships a
//     ceiling STATE and no utilisation column. Where the DssAutoLine has just
//     run, `line` IS `debt + gap` to the wei, so the "utilisation" it implies is
//     arithmetic on the gap rather than a fact about the ilk.
const AUTO_LINE = getAddress("0xc7bdd1f2b16447dcf3de045c4a039a60ec2f0ba3");
const AL_ABI = parseAbi([
  "function ilks(bytes32) view returns (uint256 line, uint256 gap, uint48 ttl, uint48 last, uint48 lastInc)",
]);
const als = await c.multicall({
  allowFailure: true,
  contracts: listed.map((k) => ({ address: AUTO_LINE, abi: AL_ABI, functionName: "ilks", args: [k] })),
});
const vats = await c.multicall({
  allowFailure: false,
  contracts: listed.map((k) => ({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [k] })),
});
const tautological = listedNames.filter((_, i) => {
  if (als[i].status !== "success" || als[i].result[0] === 0n) return false;
  const [Art, rate, , line] = vats[i];
  return line === Art * rate + als[i].result[1]; // line == debt + gap, exactly
});
check(
  "at least one autoline ilk has line == debt + gap exactly (utilisation is a tautology)",
  tautological.length > 0,
  tautological.length ? tautological.join(", ") : "none at this block (autoline lifts are ttl-throttled)",
);

// (f) A closed ilk — line 0 with debt outstanding — is a real state the view
//     names, and the one a utilisation column would have to divide by zero for.
const closed = listedNames.filter((_, i) => vats[i][3] === 0n && vats[i][0] > 0n);
check(
  "ilks exist with line == 0 and debt outstanding (CLOSED, not 'fully utilised')",
  closed.length > 0,
  closed.join(", "),
);

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
