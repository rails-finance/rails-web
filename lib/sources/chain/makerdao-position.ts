// Live MakerDAO vault state for the per-position chain overlay. A vault's
// collateral and debt are the Vat's own slots:
// `Vat.urns(ilk, urn)` returns (ink, art) DIRECTLY — a bucket-1 chain read, even
// more literal than reconstructing them from the deltas.
//
// EVERY READ IS PINNED TO ONE BLOCK, and the read says which. `getBlock()` runs
// FIRST and its number pins the multicalls that follow, so a vault's ink, art,
// rate, spot, duty and the ilk's own parameters are all the same instant's
// state rather than whatever block each call happened to land on — and
// `atBlock`/`blockTimestamp` name that instant. (The route used to leave
// `atBlock` at a hardcoded 0 whenever it read unpinned, which is why the card's
// "read at block" line was absent on a live read and why nothing could state
// how old the reading was.) A caller may still pass its own block; the
// timestamp then comes from that block's header.
//
// chain-state compliant by construction: every value here is a slot read or the
// §2 multiply (art × rate, ink × price). No health factor, no governance-modeled
// state — just the chain's own numbers.
//
// SERVER-ONLY (reads ALCHEMY_URL via lib/sources/chain/rpc).

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { MAKER_ADDRESSES, ilkToCollateralSymbol } from "@/lib/makerdao/asset-catalog";

const RAY = BigInt(10) ** BigInt(27);
const wad = (x: bigint): number => Number(x) / 1e18;

const CDP_MANAGER_ABI = parseAbi([
  "function urns(uint256) view returns (address)",
  "function owns(uint256) view returns (address)",
  "function ilks(uint256) view returns (bytes32)",
]);
const DSPROXY_ABI = parseAbi(["function owner() view returns (address)"]);
// Sky LockStake Engine v2 (decision 0013): engine urns are cdp-less — the urn
// address is the identity, urnOwners is the (transfer-free) owner record, and
// the ilk is the engine's own immutable.
const LOCKSTAKE_ENGINE_ABI = parseAbi([
  "function urnOwners(address) view returns (address)",
  "function ilk() view returns (bytes32)",
]);
const VAT_ABI = parseAbi([
  "function urns(bytes32, address) view returns (uint256 ink, uint256 art)",
  "function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
]);
const SPOTTER_ABI = parseAbi([
  "function ilks(bytes32) view returns (address pip, uint256 mat)",
  "function par() view returns (uint256)",
]);
const JUG_ABI = parseAbi([
  "function base() view returns (uint256)",
  "function ilks(bytes32) view returns (uint256 duty, uint256 rho)",
]);

const SECONDS_PER_YEAR = 31536000;

const bytes32ToStr = (b32: string): string => Buffer.from(b32.slice(2), "hex").toString("utf8").replace(/\0+$/, "");

export interface MakerVaultState {
  /** CdpManager id — null for LockStake engine urns (urn-addressed). */
  cdpId: string | null;
  /** LockStake engine urn (decision 0013). */
  lse: boolean;
  urn: string;
  ilk: string;
  collateralSymbol: string;
  owner: string;
  /** The block every read below was taken at — the chain head when the caller
   *  named none. Never 0 on a successful read. */
  atBlock: number;
  /** That block's own header timestamp, Unix seconds. Lets a surface date the
   *  reading (the live market note's later end) instead of only numbering it. */
  blockTimestamp: number;
  /** Collateral `ink` — Vat.urns slot (chain-direct). */
  ink: number;
  inkRaw: string;
  /** Normalized debt `art` — Vat.urns slot (chain-direct). */
  art: number;
  artRaw: string;
  /** Stability-fee accumulator `rate` (ray, raw). */
  rate: string;
  /** Current DAI debt = art × rate (the §2 multiply). */
  debtDai: number;
  /** Liquidation ratio `mat` (ray, raw) — carried for the (toggleable) ratio layer. */
  mat: string;
  /** Liquidation ratio as a plain multiplier (1.45 = 145%) — mat / RAY. */
  matRatio: number | null;
  /** OSM USD price for the ilk, derived from spot × mat (charter §3). */
  priceUsd: number | null;
  /** Collateral USD = ink × price (§3 overlay). */
  collateralUsd: number | null;
  /** Collateral price at which the Vat safety line (ink·spot ≥ art·rate) is
   *  crossed = debtDai × mat ÷ ink. Algebraically EQUIVALENT to the Vat's own
   *  predicate (verify-makerdao-chain.mjs §4), so this is the contract's line,
   *  not a client model. Null while the vault has no debt. */
  liquidationPriceUsd: number | null;
  /** Stability fee APR = ((Jug.base + duty) / RAY)^seconds-per-year − 1 — the
   *  ilk's live per-second rate compounded to a year. Null if the Jug read
   *  failed. */
  stabilityFeeApr: number | null;
  /** The ilk's minimum vault debt (`dust`, RAD → DAI). RAD (1e45), NOT ray —
   *  the scale the verify script caught. */
  dustDai: number | null;
  /** The ilk's debt ceiling (`line`, RAD → DAI). */
  lineDai: number | null;
  /** The ilk's total normalized debt share of the ceiling — Art × rate (DAI). */
  ilkDebtDai: number | null;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** Read a vault's state from chain at ONE block. `vaultId` is a CDP Manager id,
 *  or a urn ADDRESS for LockStake engine urns (decision 0013 — cdp-less;
 *  resolved via the engine's own urnOwners/ilk reads). `atBlock` pins the
 *  eth_calls to a named past block; omit it and the head is resolved first and
 *  pins them instead — never left unpinned, so the reads cannot straddle two
 *  blocks and the answer always names the block it came from. Returns null for
 *  an unknown / never-opened cdp or a non-engine urn address. */
export async function loadMakerVaultStateFromChain(vaultId: string, atBlock?: number): Promise<MakerVaultState | null> {
  const isCdp = /^\d+$/.test(vaultId);
  const isUrnAddr = /^0x[0-9a-fA-F]{40}$/.test(vaultId);
  if (!isCdp && !isUrnAddr) return null;
  const client = alchemyClient();
  // FIRST, and before any state read: the block everything below is pinned to,
  // with its own header timestamp. A caller's named block is resolved the same
  // way, so `blockTimestamp` is that block's header either way.
  const head = await client.getBlock(atBlock != null ? { blockNumber: BigInt(atBlock) } : {});
  const blk = { blockNumber: head.number };

  let urn: `0x${string}`;
  let ilkB: `0x${string}`;
  let owner: string;
  let cdpId: string | null;
  let lse: boolean;

  if (isCdp) {
    const id = BigInt(vaultId);
    const cdpManager = getAddress(MAKER_ADDRESSES.CDP_MANAGER);
    const [u, owns, i] = await client.multicall({
      allowFailure: false,
      contracts: [
        { address: cdpManager, abi: CDP_MANAGER_ABI, functionName: "urns", args: [id] },
        { address: cdpManager, abi: CDP_MANAGER_ABI, functionName: "owns", args: [id] },
        { address: cdpManager, abi: CDP_MANAGER_ABI, functionName: "ilks", args: [id] },
      ],
      ...blk,
    });
    if (!u || u === ZERO_ADDR) return null;
    urn = u;
    ilkB = i;
    cdpId = vaultId;
    lse = false;
    owner = owns;
    try {
      owner = await client.readContract({ address: owns, abi: DSPROXY_ABI, functionName: "owner", args: [], ...blk });
    } catch {
      /* owns is already an EOA */
    }
  } else {
    // A urn address: the LockStake engine's own owner record is the resolver —
    // urnOwners(urn) is nonzero exactly for engine-minted urns. Owner is the
    // acting address directly (no DSProxy hop, no transfers).
    const engine = getAddress(MAKER_ADDRESSES.LOCKSTAKE_ENGINE);
    const [o, i] = await client.multicall({
      allowFailure: false,
      contracts: [
        { address: engine, abi: LOCKSTAKE_ENGINE_ABI, functionName: "urnOwners", args: [getAddress(vaultId)] },
        { address: engine, abi: LOCKSTAKE_ENGINE_ABI, functionName: "ilk", args: [] },
      ],
      ...blk,
    });
    if (!o || o === ZERO_ADDR) return null;
    urn = vaultId as `0x${string}`;
    ilkB = i;
    owner = o;
    cdpId = null;
    lse = true;
  }

  const [urnSlot, vatIlk, spotIlk, par, jugBase, jugIlk] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: getAddress(MAKER_ADDRESSES.VAT), abi: VAT_ABI, functionName: "urns", args: [ilkB, urn] },
      { address: getAddress(MAKER_ADDRESSES.VAT), abi: VAT_ABI, functionName: "ilks", args: [ilkB] },
      { address: getAddress(MAKER_ADDRESSES.SPOTTER), abi: SPOTTER_ABI, functionName: "ilks", args: [ilkB] },
      { address: getAddress(MAKER_ADDRESSES.SPOTTER), abi: SPOTTER_ABI, functionName: "par", args: [] },
      { address: getAddress(MAKER_ADDRESSES.JUG), abi: JUG_ABI, functionName: "base", args: [] },
      { address: getAddress(MAKER_ADDRESSES.JUG), abi: JUG_ABI, functionName: "ilks", args: [ilkB] },
    ],
    ...blk,
  });

  const ink = urnSlot[0];
  const art = urnSlot[1];
  const ilkArt = vatIlk[0];
  const rate = vatIlk[1];
  const spot = vatIlk[2];
  const line = vatIlk[3];
  const dust = vatIlk[4];
  const mat = spotIlk[1];
  const duty = jugIlk[0];
  // OSM price (§3): invert Spotter.poke, which sets spot = rdiv(rdiv(price·1e9,
  // par), mat) — so P0 (ray, 1e27 = $1) = spot · par · mat / RAY² and the USD
  // price is P0 / 1e27.
  const priceUsd = mat > BigInt(0) ? Number(((spot * par) / RAY) * mat) / 1e27 / 1e27 : null;
  const inkNum = wad(ink);
  const debtDai = Number((art * rate) / RAY) / 1e18;
  const matRatio = mat > BigInt(0) ? Number(mat) / 1e27 : null;
  // Stability fee: (base + duty) is the ilk's live per-second rate in ray;
  // compounding it over a year gives the APR the card captions.
  const perSecond = Number(jugBase + duty) / 1e27;
  const stabilityFeeApr = perSecond >= 1 ? Math.pow(perSecond, SECONDS_PER_YEAR) - 1 : null;
  const ilk = bytes32ToStr(ilkB);

  return {
    cdpId,
    lse,
    urn: urn.toLowerCase(),
    ilk,
    collateralSymbol: ilkToCollateralSymbol(ilk),
    owner: owner.toLowerCase(),
    atBlock: Number(head.number),
    blockTimestamp: Number(head.timestamp),
    ink: inkNum,
    inkRaw: ink.toString(),
    art: wad(art),
    artRaw: art.toString(),
    rate: rate.toString(),
    debtDai,
    mat: mat.toString(),
    matRatio,
    priceUsd,
    collateralUsd: priceUsd != null ? inkNum * priceUsd : null,
    // The Vat's own safety line, restated as a price (equivalence verified in
    // verify-makerdao-chain.mjs §4). par == RAY so the human form is exactly
    // debtDai × mat ÷ ink.
    liquidationPriceUsd: matRatio != null && inkNum > 0 && debtDai > 0 ? (debtDai * matRatio) / inkNum : null,
    stabilityFeeApr,
    // dust / line are RAD (1e45) — NOT ray (the verify script caught this).
    dustDai: Number(dust) / 1e45,
    lineDai: Number(line) / 1e45,
    ilkDebtDai: Number((ilkArt * rate) / RAY) / 1e18,
  };
}
