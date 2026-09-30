// The LockStake collateral type's price cap and the state of its auctions.
//
// LSEV2-SKY-A's pip is not an OSM: Spotter.ilks(LSEV2-SKY-A).pip is the
// chainlog's LOCKSTAKE_ORACLE (0x0C13…43Fd), a wrapper whose cap() is set by
// governance and whose osm() is PIP_SKY (0x5114…2D6F). It answers the lower of
// the two, so while the cap sits under the market the Vat values every urn at
// the cap. Read 2026-09-30: cap() = 0.025 since block 24,018,461 (15 Dec 2025,
// 0.04 before), while PIP_SKY stood between 0.057 and 0.085 at the urn rows.
//
// PIP_SKY's peek is whitelisted (bud); the wrapper is on the list, so the
// uncapped price is read as an eth_call from the wrapper's address.
//
// The auctions: Dog.ilks(ilk).clip is the ilk's Clipper, and Clipper.stopped()
// is its breaker (0 running, 1 no new auctions, 2 also no redo, 3 also no
// purchases). LOCKSTAKE_CLIP has read 3 since block 23,319,630 (8 Sep 2025).
//
// SERVER-ONLY.

import { getAddress, parseAbi, type PublicClient } from "viem";
import { MAKER_ADDRESSES } from "@/lib/makerdao/asset-catalog";

const WRAPPER_ABI = parseAbi(["function cap() view returns (uint256)", "function osm() view returns (address)"]);
const OSM_ABI = parseAbi(["function peek() view returns (bytes32, bool)"]);
const DOG_ABI = parseAbi([
  "function ilks(bytes32) view returns (address clip, uint256 chop, uint256 hole, uint256 dirt)",
]);
const CLIP_ABI = parseAbi(["function stopped() view returns (uint256)"]);

export interface MakerPriceCap {
  /** The wrapper's cap, USD. */
  capUsd: number;
  /** The OSM price behind the cap, USD; null when the peek did not answer. */
  oracleUsd: number | null;
}

/** The cap and the OSM behind it when `pip` is a capped wrapper; null for an
 *  ordinary OSM (no cap() to call). */
export async function readPriceCap(
  client: PublicClient,
  pip: `0x${string}`,
  blockNumber: bigint,
): Promise<MakerPriceCap | null> {
  let cap: bigint;
  let osm: `0x${string}`;
  try {
    [cap, osm] = await Promise.all([
      client.readContract({ address: pip, abi: WRAPPER_ABI, functionName: "cap", blockNumber }),
      client.readContract({ address: pip, abi: WRAPPER_ABI, functionName: "osm", blockNumber }),
    ]);
  } catch {
    return null;
  }
  let oracleUsd: number | null = null;
  try {
    const [val, has] = await client.readContract({
      address: osm,
      abi: OSM_ABI,
      functionName: "peek",
      account: pip,
      blockNumber,
    });
    if (has) oracleUsd = Number(BigInt(val)) / 1e18;
  } catch {
    /* stated as not read */
  }
  return { capUsd: Number(cap) / 1e18, oracleUsd };
}

export interface MakerAuctionTerms {
  /** The Clipper's breaker level (0–3). */
  stopped: number;
  /** The liquidation penalty as a multiplier (1.13 = 13%). */
  chop: number;
}

/** The ilk's auction terms: its Clipper's breaker and the Dog's penalty. Null
 *  when the read failed. */
export async function readAuctionStop(
  client: PublicClient,
  ilkB: `0x${string}`,
  blockNumber: bigint,
): Promise<MakerAuctionTerms | null> {
  try {
    const [clip, chop] = await client.readContract({
      address: getAddress(MAKER_ADDRESSES.DOG),
      abi: DOG_ABI,
      functionName: "ilks",
      args: [ilkB],
      blockNumber,
    });
    if (/^0x0{40}$/i.test(clip)) return null;
    const s = await client.readContract({ address: clip, abi: CLIP_ABI, functionName: "stopped", blockNumber });
    return { stopped: Number(s), chop: Number(chop) / 1e18 };
  } catch {
    return null;
  }
}

const ENGINE_ABI = parseAbi([
  "function fee() view returns (uint256)",
  "function urnFarms(address) view returns (address)",
  "function urnVoteDelegates(address) view returns (address)",
]);

export interface MakerLockstakeUrn {
  /** The engine's exit fee on SKY taken out, as a fraction (0.05 = 5%). */
  exitFee: number;
  /** The rewards farm the urn's SKY is staked in; null for none. */
  farm: string | null;
  /** The vote delegate the urn's SKY is delegated to; null for none. */
  voteDelegate: string | null;
}

/** A LockStake urn's engine settings: exit fee, farm and vote delegate. */
export async function readLockstakeUrn(
  client: PublicClient,
  urn: `0x${string}`,
  blockNumber: bigint,
): Promise<MakerLockstakeUrn | null> {
  const engine = getAddress(MAKER_ADDRESSES.LOCKSTAKE_ENGINE);
  try {
    const [fee, farm, del] = await Promise.all([
      client.readContract({ address: engine, abi: ENGINE_ABI, functionName: "fee", blockNumber }),
      client.readContract({ address: engine, abi: ENGINE_ABI, functionName: "urnFarms", args: [urn], blockNumber }),
      client.readContract({
        address: engine,
        abi: ENGINE_ABI,
        functionName: "urnVoteDelegates",
        args: [urn],
        blockNumber,
      }),
    ]);
    const none = (a: string) => (/^0x0{40}$/i.test(a) ? null : a.toLowerCase());
    return { exitFee: Number(fee) / 1e18, farm: none(farm), voteDelegate: none(del) };
  } catch {
    return null;
  }
}
