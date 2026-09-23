// MakerDAO / Sky — Vat LogNote decoder (PROVEN against mainnet 2026-06-29).
//
// This is the reusable, source-of-truth decode core for onboarding MakerDAO. It
// is validated end-to-end against the defiexplore CSV for wallet
// 0x7d6149ad9a573a6e2ca6ebf7d4897c1b766841b4:
//   • CDP 31214 (ETH-C): 112 frob logs replayed → 217344.640615829088947147 ETH,
//     EXACT to 18 decimals vs the CSV terminal collateral.
//   • Debt art×rate reconciled to +0.007% (accrued interest since the snapshot).
//   • grab path verified on 2 real Dog liquidations (grab.dink === -Bark.ink,
//     grab.dart === -Bark.art, full precision).
//   • Owner attribution proven: cdpId → CdpManager.owns() = DSProxy → .owner() = EOA.
//
// WHY a custom decoder (not Sieve): the Vat emits frob/grab/fold via an ANONYMOUS
// LogNote whose topic0 is the 4-byte function selector LEFT-ALIGNED in 32 bytes
// (shl(224,...)). Sieve matches events by topic0 = keccak(signature) and its
// decoder asserts topic count = 1 + indexed params, so it CANNOT match these.
// History therefore comes from Etherscan getLogs (Alchemy free-tier caps getLogs
// at 10 blocks); Alchemy is used only for eth_call (per-ilk rate/mat/price).
//
// This module is intentionally framework-free: it exports pure decode helpers +
// an Etherscan log fetcher. Its live importer is lib/makerdao/asset-catalog.ts.
// The freeze-op populator that once wrote maker_* tables from these helpers
// (scripts/snapshot-makerdao-chain.mjs, on the retired frozen-`T` model) was
// deleted on 2026-09-10 with the other three snapshot scripts; the live
// explorer reads the indexed backend and the chain overlay instead.

import { toFunctionSelector, toEventSelector, pad } from "viem";

// ── Core MCD addresses (verify against changelog.makerdao.com chainlog) ──────
export const ADDR = {
  VAT: "0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b",
  CDP_MANAGER: "0x5ef30b9986345249bc32d8928b7ee64de9435e39",
  DOG: "0x135954d155898d42c90d2a57824c690e0c7bef1b",
  SPOTTER: "0x65c79fcb50ca1594b025960e539ed7a9a6d434a3",
  JUG: "0x19c0976f590d67707e62397c87829d896dc0f1f1",
};
export const VAT_DEPLOY_BLOCK = 8928152; // MCD launch, 2019-11-13

// ── Anonymous-LogNote topic0 = selector left-aligned in 32 bytes ─────────────
const noteTopic0 = (sig) => toFunctionSelector(sig) + "0".repeat(56);
export const TOPIC0 = {
  // frob(bytes32 i, address u, address v, address w, int dink, int dart)
  FROB: noteTopic0("frob(bytes32,address,address,address,int256,int256)"),
  // grab(bytes32 i, address u, address v, address w, int dink, int dart)
  GRAB: noteTopic0("grab(bytes32,address,address,address,int256,int256)"),
  // fold(bytes32 i, address u, int rate) — per-ilk rate accumulator delta
  FOLD: noteTopic0("fold(bytes32,address,int256)"),
};
// Typed events (normal topic0 = event-signature hash)
export const TOPIC0_BARK = toEventSelector("Bark(bytes32,address,uint256,uint256,uint256,address,uint256)");
export const TOPIC0_NEWCDP = toEventSelector("NewCdp(address,address,uint256)");

// ── Decode helpers ───────────────────────────────────────────────────────────
const RAY = 10n ** 27n;

/** int256 from a 32-byte hex word (two's complement). */
export function toInt256(hex64) {
  let v = BigInt("0x" + hex64);
  if (v >= 2n ** 255n) v -= 2n ** 256n;
  return v;
}

/** Decode (dink, dart) from a frob/grab LogNote `data` field.
 *  data = abi.encode(bytes payload); payload = first 224 bytes of calldata =
 *  [selector(4)][i(32)][u(32)][v(32)][w(32)][dink(32)][dart(32)].
 *  Skip 2 ABI words (offset + length = 128 hex chars); dink/dart at the offsets
 *  below (hex-char indices into the payload). Signed wad (1e18). */
export function decodeFrobGrab(dataHex) {
  const payload = (dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex).slice(128);
  return {
    dink: toInt256(payload.slice(264, 328)), // bytes [132:164]
    dart: toInt256(payload.slice(328, 392)), // bytes [164:196]
  };
}

/** Decode a Dog Bark log → { ilk, urn, ink, art, due, auctionId }.
 *  indexed: ilk(topic1), urn(topic2), id(topic3); data = [ink][art][due][clip]. */
export function decodeBark(log) {
  const d = log.data.slice(2);
  return {
    ilk: bytes32ToStr(log.topics[1]),
    urn: "0x" + log.topics[2].slice(26),
    ink: BigInt("0x" + d.slice(0, 64)),
    art: BigInt("0x" + d.slice(64, 128)),
    due: BigInt("0x" + d.slice(128, 192)),
    auctionId: BigInt(log.topics[3]).toString(),
  };
}

/** ilk bytes32 → human string (e.g. "ETH-C"). */
export function bytes32ToStr(b32) {
  return Buffer.from(b32.slice(2), "hex").toString("utf8").replace(/\0+$/, "");
}

/** DAI debt (wad) from normalized art (wad) × ilk rate (ray). */
export function daiFromArt(artWad, rateRay) {
  return (artWad * rateRay) / RAY;
}

// ── Etherscan log fetch (handles wide ranges; free-tier safe via paging) ─────
/** Fetch all logs for (address, topic0[, topic2]) via Etherscan V2, paged.
 *  Pass urn (address) to filter frob/grab by their arg2 (u) = topic2.
 *  `toBlock` pins the scan to the frozen instant T (default "latest"). */
export async function fetchLogs({ apiKey, address, topic0, urn, fromBlock = VAT_DEPLOY_BLOCK, toBlock = "latest" }) {
  const out = [];
  let page = 1;
  const urnFilter = urn ? `&topic2=${pad(urn, { size: 32 }).toLowerCase()}&topic0_2_opr=and` : "";
  for (;;) {
    await new Promise((r) => setTimeout(r, 350)); // 3 req/s free-tier throttle
    const url =
      `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs` +
      `&address=${address}&topic0=${topic0}${urnFilter}` +
      `&fromBlock=${fromBlock}&toBlock=${toBlock}&page=${page}&offset=1000&apikey=${apiKey}`;
    const r = await (await fetch(url)).json();
    if (r.status === "1" && Array.isArray(r.result)) {
      out.push(...r.result);
      if (r.result.length < 1000) break;
      page++;
    } else break; // "No records found" or error
  }
  return out;
}

// ── Minimal ABIs for the eth_call lane (Alchemy) ─────────────────────────────
export const CDP_MANAGER_ABI = [
  {
    name: "urns",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "owns",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "ilks",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
];
export const DSPROXY_ABI = [
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
export const VAT_ABI = [
  {
    name: "ilks",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "Art", type: "uint256" },
      { name: "rate", type: "uint256" },
      { name: "spot", type: "uint256" },
      { name: "line", type: "uint256" },
      { name: "dust", type: "uint256" },
    ],
  },
];
export const SPOTTER_ABI = [
  {
    name: "ilks",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "pip", type: "address" },
      { name: "mat", type: "uint256" },
    ],
  },
];

/** Resolve a CDP's true EOA owner: owns() returns the DSProxy; hop to .owner().
 *  Returns { urn, ilk, proxy, owner }. */
export async function resolveOwner(client, cdpId) {
  const id = BigInt(cdpId);
  const [urn, owns, ilkB] = await Promise.all([
    client.readContract({ address: ADDR.CDP_MANAGER, abi: CDP_MANAGER_ABI, functionName: "urns", args: [id] }),
    client.readContract({ address: ADDR.CDP_MANAGER, abi: CDP_MANAGER_ABI, functionName: "owns", args: [id] }),
    client.readContract({ address: ADDR.CDP_MANAGER, abi: CDP_MANAGER_ABI, functionName: "ilks", args: [id] }),
  ]);
  let owner = owns;
  try {
    owner = await client.readContract({ address: owns, abi: DSPROXY_ABI, functionName: "owner", args: [] });
  } catch {
    /* owns is already an EOA (no proxy) */
  }
  return { urn, ilk: bytes32ToStr(ilkB), ilkBytes: ilkB, proxy: owns, owner };
}
