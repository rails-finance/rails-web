// Verify the LlamaLend explorer's chain claims against the live contracts —
// self-contained, chain-only (eth_call at head; no index, no app imports).
// Each check can FAIL; a green run asserts:
//
//   A. CENSUS CLOSES — the discovered controller count equals the factories'
//      own counters (oneway market_count + crvusd n_collaterals + v2
//      market_count), and every controller resolves amm/collateral/borrowed.
//   B. BAND EXACTNESS — the frontend's integer p_oracle_up port (ln_int +
//      solmate expWad, re-implemented HERE independently) reproduces the
//      AMMs' own p_oracle_up(n)/p_oracle_down(n) reads BigInt-exact, across
//      markets spanning A and ticks including negatives.
//   C. SOFT-LIQ CROSS-CHECK — on every live in-soft-liquidation position of
//      the busiest controllers, AMM.get_sum_xy(user).x equals
//      Controller.user_state(user).stablecoin to the wei (the anti-synthesis
//      identity the receipts cite).
//   D. DECIMALS — every live market's collateral decimals() answers on chain
//      (the 8/6-dp collaterals are real; nothing may default to 18), and the
//      non-crvUSD-borrowed markets are enumerated (the USD carve-out's
//      subjects).
//   E. CLOSED-POSITION SHAPE — a never-opened address reads user_state
//      [0,0,0,N] (debt 0 ⇒ "no live loan"; stale ticks never render).
//
// Usage: node scripts/verify-llamalend-chain.mjs   (reads ALCHEMY_URL from .env.local)

import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, keccak256, toHex } from "viem";
import { mainnet } from "viem/chains";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const ALCHEMY_URL = envText
  .match(/^ALCHEMY_URL=(.*)$/m)?.[1]
  ?.trim()
  .replace(/^"|"$/g, "");
if (!ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");
const client = createPublicClient({
  chain: mainnet,
  transport: http(ALCHEMY_URL, { batch: { batchSize: 512, wait: 30 } }),
});

const ONEWAY = "0xeA6876DDE9e3467564acBeE1Ed5bac88783205E0";
const CRVUSD_FACTORY = "0xc9332fdcb1c491dcc683bae86fe3cb70360738bc";
const V2_FACTORY = "0x8f6B56EC5ddF1F2691a1059f1D3cd97Ac9EaB0bd";
const CRVUSD = "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e";

const abis = {
  oneway: parseAbi([
    "function market_count() view returns (uint256)",
    "function controllers(uint256) view returns (address)",
    "function amms(uint256) view returns (address)",
    "function borrowed_tokens(uint256) view returns (address)",
    "function collateral_tokens(uint256) view returns (address)",
  ]),
  crvusd: parseAbi([
    "function n_collaterals() view returns (uint256)",
    "function controllers(uint256) view returns (address)",
    "function amms(uint256) view returns (address)",
    "function collaterals(uint256) view returns (address)",
  ]),
  v2: parseAbi(["function market_count() view returns (uint256)"]),
  controller: parseAbi([
    "function amm() view returns (address)",
    "function n_loans() view returns (uint256)",
    "function loans(uint256) view returns (address)",
    "function user_state(address) view returns (uint256[4])",
  ]),
  amm: parseAbi([
    "function A() view returns (uint256)",
    "function get_base_price() view returns (uint256)",
    "function p_oracle_up(int256) view returns (uint256)",
    "function p_oracle_down(int256) view returns (uint256)",
    "function get_sum_xy(address) view returns (uint256[2])",
  ]),
  erc20: parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]),
};

// ── independent re-implementation of the deployed band math ────────────────
const UINT = 1n << 256n,
  INT_MAX = (1n << 255n) - 1n,
  E18 = 10n ** 18n;
const wrapU = (x) => ((x %= UINT), x < 0n ? x + UINT : x);
const wrapI = (x) => ((x = wrapU(x)), x > INT_MAX ? x - UINT : x);
function ln_int(x) {
  let res = 0n;
  for (let i = 0n; i < 8n; i++) {
    const t = 2n ** (7n - i),
      p = 2n ** t;
    if (x >= p * E18) {
      x /= p;
      res += t * E18;
    }
  }
  let d = E18;
  for (let i = 0; i < 59; i++) {
    if (x >= 2n * E18) {
      res += d;
      x /= 2n;
    }
    x = (x * x) / E18;
    d /= 2n;
  }
  return (res * E18) / 1442695040888963328n;
}
function pUp(n, LAR, basePrice) {
  const iMul = (a, b) => wrapI(a * b),
    iAdd = (a, b) => wrapI(a + b),
    iSub = (a, b) => wrapI(a - b),
    sdiv = (a, b) => a / b;
  const power = iMul(-n, LAR);
  let x = sdiv(iMul(power, 1n << 96n), E18);
  const k = sdiv(iAdd(sdiv(iMul(x, 1n << 96n), 54916777467707473351141471128n), 1n << 95n), 1n << 96n);
  x = iSub(x, iMul(k, 54916777467707473351141471128n));
  let y = iAdd(x, 1346386616545796478920950773328n);
  y = iAdd(sdiv(iMul(y, x), 1n << 96n), 57155421227552351082224309758442n);
  let p = iSub(iAdd(y, x), 94201549194550492254356042504812n);
  p = iAdd(sdiv(iMul(p, y), 1n << 96n), 28719021644029726153956944680412240n);
  p = iAdd(iMul(p, x), 4385272521454847904659076985693276n * (1n << 96n));
  let q = iSub(x, 2855989394907223263936484059900n);
  q = iAdd(sdiv(iMul(q, x), 1n << 96n), 50020603652535783019961831881945n);
  q = iSub(sdiv(iMul(q, x), 1n << 96n), 533845033583426703283633433725380n);
  q = iAdd(sdiv(iMul(q, x), 1n << 96n), 3604857256930695427073651918091429n);
  q = iSub(sdiv(iMul(q, x), 1n << 96n), 14423608567350463180887372962807573n);
  q = iAdd(sdiv(iMul(q, x), 1n << 96n), 26449188498355588339934803723976023n);
  let e = wrapU(sdiv(p, q) * 3822833074963236453042738258902158003155416615667n);
  const sh = k - 195n;
  e = sh >= 0n ? wrapU(e << sh) : e >> -sh;
  return (basePrice * e) / E18;
}

const pin = await client.getBlockNumber();
console.log(`pinned block: ${pin}`);
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ✅" : "  ❌ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── A. census closes ─────────────────────────────────────────────────────────
console.log("\nA. factory census");
const [nOneway, nCrvusd, nV2] = await Promise.all([
  client.readContract({ address: ONEWAY, abi: abis.oneway, functionName: "market_count", blockNumber: pin }),
  client.readContract({ address: CRVUSD_FACTORY, abi: abis.crvusd, functionName: "n_collaterals", blockNumber: pin }),
  client.readContract({ address: V2_FACTORY, abi: abis.v2, functionName: "market_count", blockNumber: pin }),
]);
console.log(`  oneway=${nOneway} crvusd=${nCrvusd} v2=${nV2}`);

const owReads = await client.multicall({
  contracts: [...Array(Number(nOneway)).keys()].flatMap((i) => [
    { address: ONEWAY, abi: abis.oneway, functionName: "controllers", args: [BigInt(i)] },
    { address: ONEWAY, abi: abis.oneway, functionName: "amms", args: [BigInt(i)] },
    { address: ONEWAY, abi: abis.oneway, functionName: "borrowed_tokens", args: [BigInt(i)] },
    { address: ONEWAY, abi: abis.oneway, functionName: "collateral_tokens", args: [BigInt(i)] },
  ]),
  blockNumber: pin,
});
const cuReads = await client.multicall({
  contracts: [...Array(Number(nCrvusd)).keys()].flatMap((i) => [
    { address: CRVUSD_FACTORY, abi: abis.crvusd, functionName: "controllers", args: [BigInt(i)] },
    { address: CRVUSD_FACTORY, abi: abis.crvusd, functionName: "amms", args: [BigInt(i)] },
    { address: CRVUSD_FACTORY, abi: abis.crvusd, functionName: "collaterals", args: [BigInt(i)] },
  ]),
  blockNumber: pin,
});
check(Number(nOneway) > 0 && owReads.every((r) => r.status === "success"), `all ${nOneway} oneway markets resolve`);
check(Number(nCrvusd) > 0 && cuReads.every((r) => r.status === "success"), `all ${nCrvusd} crvusd markets resolve`);

const markets = [];
for (let i = 0; i < Number(nOneway); i++)
  markets.push({
    factory: "oneway",
    i,
    controller: owReads[i * 4].result,
    amm: owReads[i * 4 + 1].result,
    borrowed: owReads[i * 4 + 2].result,
    collateral: owReads[i * 4 + 3].result,
  });
for (let i = 0; i < Number(nCrvusd); i++)
  markets.push({
    factory: "crvusd",
    i,
    controller: cuReads[i * 3].result,
    amm: cuReads[i * 3 + 1].result,
    borrowed: CRVUSD,
    collateral: cuReads[i * 3 + 2].result,
  });
// markets.length is built by pushing exactly nOneway+nCrvusd entries, so the
// count equality alone is a tautology — assert every pushed controller/amm is a
// real non-zero address (a failed factory read leaves them undefined/zero).
const ZERO = "0x0000000000000000000000000000000000000000";
check(
  markets.length === Number(nOneway) + Number(nCrvusd) &&
    markets.length > 0 &&
    markets.every((m) => m.controller && m.controller !== ZERO && m.amm && m.amm !== ZERO),
  `V1 controllers + AMMs all resolve to non-zero addresses (${Number(nOneway) + Number(nCrvusd)} markets)`,
  String(markets.length),
);

// V2: markets(i) struct → classify address words (controllers(i) reverts).
const marketsSel = keccak256(toHex("markets(uint256)")).slice(0, 10);
let v2Controllers = 0;
for (let i = 0n; i < nV2; i++) {
  const { data: ret } = await client.call({
    to: V2_FACTORY,
    data: marketsSel + i.toString(16).padStart(64, "0"),
    blockNumber: pin,
  });
  const words = [];
  for (let w = 0; w * 64 + 64 <= ret.length - 2; w++) {
    const word = ret.slice(2 + w * 64, 2 + (w + 1) * 64);
    if (/^0{24}[0-9a-f]{40}$/i.test(word) && !/^0+$/.test(word)) words.push("0x" + word.slice(24));
  }
  // Controller = amm() answers, A() reverts (the AMM), asset() reverts (the
  // ERC-4626 Vault — which ALSO answers amm(), hence the three-way probe).
  const assetAbi = parseAbi(["function asset() view returns (address)"]);
  const probe = await client.multicall({
    contracts: words.flatMap((a) => [
      { address: a, abi: abis.controller, functionName: "amm" },
      { address: a, abi: abis.amm, functionName: "A" },
      { address: a, abi: assetAbi, functionName: "asset" },
    ]),
    blockNumber: pin,
  });
  const ctrl = words.filter(
    (_, wi) =>
      probe[wi * 3].status === "success" &&
      probe[wi * 3 + 1].status !== "success" &&
      probe[wi * 3 + 2].status !== "success",
  );
  if (ctrl.length === 1) v2Controllers++;
}
check(
  Number(nV2) > 0 && v2Controllers === Number(nV2),
  `every V2 markets(i) struct yields exactly one controller`,
  `${v2Controllers}/${nV2}`,
);

// ── B. band exactness across A and signed ticks ─────────────────────────────
console.log("\nB. band exactness (independent port vs the AMM's own reads)");
const aReads = await client.multicall({
  contracts: markets.map((m) => ({ address: m.amm, abi: abis.amm, functionName: "A" })),
  blockNumber: pin,
});
markets.forEach((m, i) => (m.A = aReads[i].status === "success" ? aReads[i].result : null));
const byA = new Map();
for (const m of markets) if (m.A != null && !byA.has(String(m.A))) byA.set(String(m.A), m);
const picks = [...byA.values()].filter((m) => [10n, 30n, 100n, 200n, 285n, 500n].includes(m.A) || byA.size <= 6);
const NS = [-50n, -3n, -1n, 0n, 1n, 17n, 123n, 300n];
let bandTotal = 0,
  bandExact = 0;
for (const m of picks.slice(0, 6)) {
  const basePrice = await client.readContract({
    address: m.amm,
    abi: abis.amm,
    functionName: "get_base_price",
    blockNumber: pin,
  });
  const LAR = ln_int((E18 * m.A) / (m.A - 1n));
  const reads = await client.multicall({
    contracts: NS.flatMap((n) => [
      { address: m.amm, abi: abis.amm, functionName: "p_oracle_up", args: [n] },
      { address: m.amm, abi: abis.amm, functionName: "p_oracle_down", args: [n] },
    ]),
    blockNumber: pin,
  });
  NS.forEach((n, i) => {
    const up = reads[i * 2],
      down = reads[i * 2 + 1];
    if (up.status !== "success") return;
    bandTotal += 2;
    if (pUp(n, LAR, basePrice) === up.result) bandExact++;
    if (down.status === "success" && pUp(n + 1n, LAR, basePrice) === down.result) bandExact++;
  });
}
check(
  bandTotal > 0 && bandExact === bandTotal,
  `p_oracle_up/p_oracle_down BigInt-exact`,
  `${bandExact}/${bandTotal} across A ∈ {${picks
    .slice(0, 6)
    .map((m) => m.A)
    .join(", ")}}`,
);

// ── C. soft-liq cross-check on live positions ────────────────────────────────
console.log("\nC. soft-liquidation cross-check (get_sum_xy.x ≡ user_state.stablecoin)");
const nLoansReads = await client.multicall({
  contracts: markets.map((m) => ({ address: m.controller, abi: abis.controller, functionName: "n_loans" })),
  blockNumber: pin,
});
markets.forEach((m, i) => (m.nLoans = nLoansReads[i].status === "success" ? Number(nLoansReads[i].result) : 0));
const busy = [...markets].sort((a, b) => b.nLoans - a.nLoans).slice(0, 6);
let live = 0,
  softliq = 0,
  xyExact = 0;
for (const m of busy) {
  const users = await client.multicall({
    contracts: [...Array(m.nLoans).keys()].map((i) => ({
      address: m.controller,
      abi: abis.controller,
      functionName: "loans",
      args: [BigInt(i)],
    })),
    blockNumber: pin,
  });
  const addrs = users.filter((r) => r.status === "success").map((r) => r.result);
  const states = await client.multicall({
    contracts: addrs.map((u) => ({
      address: m.controller,
      abi: abis.controller,
      functionName: "user_state",
      args: [u],
    })),
    blockNumber: pin,
  });
  const inSl = [];
  addrs.forEach((u, i) => {
    if (states[i].status !== "success") return;
    const [, stable, debt] = states[i].result;
    live++;
    if (debt > 0n && stable > 0n) inSl.push({ user: u, stable });
  });
  if (inSl.length > 0) {
    const xy = await client.multicall({
      contracts: inSl.map((s) => ({ address: m.amm, abi: abis.amm, functionName: "get_sum_xy", args: [s.user] })),
      blockNumber: pin,
    });
    inSl.forEach((s, i) => {
      softliq++;
      if (xy[i].status === "success" && xy[i].result[0] === s.stable) xyExact++;
    });
  }
}
console.log(`  live positions swept: ${live}; in soft-liq now: ${softliq}`);
check(
  softliq > 0 && xyExact === softliq,
  `cross-check wei-exact on every in-soft-liq position`,
  `${xyExact}/${softliq}`,
);

// ── D. decimals resolve; non-crvUSD borrows enumerated ───────────────────────
console.log("\nD. decimals + the non-crvUSD carve-out");
const tokens = [...new Set(markets.flatMap((m) => [m.collateral.toLowerCase(), m.borrowed.toLowerCase()]))];
const decReads = await client.multicall({
  contracts: tokens.map((t) => ({ address: t, abi: abis.erc20, functionName: "decimals" })),
  blockNumber: pin,
});
const unresolved = tokens.filter((_, i) => decReads[i].status !== "success");
check(
  tokens.length > 0 && unresolved.length === 0,
  `every market token answers decimals() on chain`,
  unresolved.join(", ") || `${tokens.length} tokens`,
);
const non18 = tokens.filter((_, i) => decReads[i].status === "success" && Number(decReads[i].result) !== 18);
check(
  non18.length > 0,
  `non-18-decimal tokens exist on the roster (the default-18 trap is real)`,
  `${non18.length} tokens`,
);
const nonCrvusd = markets.filter((m) => m.borrowed.toLowerCase() !== CRVUSD.toLowerCase());
console.log(
  `  markets borrowing something other than crvUSD: ${nonCrvusd.length} (${nonCrvusd.map((m) => `${m.factory}#${m.i}`).join(", ")})`,
);
check(
  nonCrvusd.every((m) => m.factory === "oneway"),
  "every non-crvUSD borrow is a oneway market",
);

// ── E. closed-position shape ─────────────────────────────────────────────────
console.log("\nE. closed/never-opened shape");
const control = markets.find((m) => m.nLoans > 0);
const dead = "0x000000000000000000000000000000000000dEaD";
const us = await client.readContract({
  address: control.controller,
  abi: abis.controller,
  functionName: "user_state",
  args: [dead],
  blockNumber: pin,
});
check(us[0] === 0n && us[1] === 0n && us[2] === 0n, `never-opened user_state reads [0,0,0,N]`, `[${us.map(String)}]`);

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
