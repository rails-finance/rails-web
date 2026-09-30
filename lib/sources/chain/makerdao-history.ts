// Two historic MakerDAO reads for the vault page, both by chain call at a mined
// block, so every answer is kept in process memory and the routes cache it at
// the edge.
//
// 1. An ilk's risk state at a block: Vat.ilks (spot, dust), Spotter.ilks (mat)
//    and Spotter.par, three eth_calls batched into one request. The OSM price is the Spotter's
//    poke inverted (spot = price / par / mat), the same arithmetic the index
//    uses for a liquidation's price (server migration 111) and the live card
//    uses at head (makerdao-position.ts).
//
// 2. How a liquidation's auction ran. The grab's transaction carries the Dog's
//    Bark for this urn (ilk, urn, ink, art, due, clip, id) and the Clipper's
//    Kick (tab, lot). The auction's purchases are the Clipper's Take logs for
//    that id (Take(id, max, price, owe, tab, lot, usr): tab and lot are what
//    remains after the purchase). When a take brings tab to zero with lot left,
//    the Clipper sends that lot back to the urn (vat.flux); when lot reaches zero
//    first, the tab left is the shortfall. Dog.sol / Clipper.sol, makerdao/dss.
//    A transaction with no Bark for the urn is an older Cat/Flipper liquidation,
//    answered as not read. Calls: the receipt, one eth_getLogs over the clip
//    filtered by id, one block header, one eth_call for mat.
//
// SERVER-ONLY (ALCHEMY_URL via ./rpc).

import { decodeEventLog, formatUnits, getAddress, parseAbi, stringToHex } from "viem";
import { alchemyClient, chainBatchClient } from "./rpc";
import { MAKER_ADDRESSES, isLseIlk } from "@/lib/makerdao/asset-catalog";
import { readPriceCap } from "./makerdao-lse-oracle";
import type {
  MakerAuctionRead,
  MakerAuctionTake,
  MakerIlkAt,
  MakerIlkAtResponse,
} from "@/lib/makerdao/chain-history-types";

const RAY = BigInt(10) ** BigInt(27);

const VAT_ABI = parseAbi([
  "function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
]);
const SPOTTER_ABI = parseAbi([
  "function ilks(bytes32) view returns (address pip, uint256 mat)",
  "function par() view returns (uint256)",
]);
const AUCTION_ABI = parseAbi([
  "event Bark(bytes32 indexed ilk, address indexed urn, uint256 ink, uint256 art, uint256 due, address clip, uint256 indexed id)",
  "event Kick(uint256 indexed id, uint256 top, uint256 tab, uint256 lot, address indexed usr, address indexed kpr, uint256 coin)",
  "event Take(uint256 indexed id, uint256 max, uint256 price, uint256 owe, uint256 tab, uint256 lot, address indexed usr)",
]);
const TAKE_EVENT = AUCTION_ABI[2];

/** At most this many blocks per ilk-at request. */
export const MAKER_ILK_AT_MAX_BLOCKS = 60;

const ilkCache = new Map<string, Promise<MakerIlkAt>>();

async function readIlkAtOnce(ilk: string, block: number): Promise<MakerIlkAt> {
  const ilkB = stringToHex(ilk, { size: 32 });
  const vat = getAddress(MAKER_ADDRESSES.VAT);
  const spotter = getAddress(MAKER_ADDRESSES.SPOTTER);
  // Three plain eth_calls, batched into one HTTP request: Multicall3 is not
  // deployed before block 14,353,601, and most vault histories start earlier.
  const client = chainBatchClient();
  const blockNumber = BigInt(block);
  const [vatIlk, spotIlk, par] = await Promise.all([
    client.readContract({ address: vat, abi: VAT_ABI, functionName: "ilks", args: [ilkB], blockNumber }),
    client.readContract({ address: spotter, abi: SPOTTER_ABI, functionName: "ilks", args: [ilkB], blockNumber }),
    client.readContract({ address: spotter, abi: SPOTTER_ABI, functionName: "par", blockNumber }),
  ]);
  const spot = vatIlk[2];
  const dust = vatIlk[4];
  const mat = spotIlk[1];
  const priceUsd =
    mat > BigInt(0) && spot > BigInt(0) ? Number(formatUnits((((spot * par) / RAY) * mat) / RAY, 27)) : null;
  // LockStake: the pip is a capped wrapper; say what the cap and the OSM were.
  const priceCap = isLseIlk(ilk) ? await readPriceCap(client, spotIlk[0], blockNumber) : null;
  return {
    block,
    priceUsd,
    ...(priceCap ? { priceCap } : {}),
    mat: mat > BigInt(0) ? Number(formatUnits(mat, 27)) : null,
    dustDai: Number(formatUnits(dust, 45)),
  };
}

function readIlkAt(ilk: string, block: number): Promise<MakerIlkAt> {
  const key = `${ilk}:${block}`;
  let p = ilkCache.get(key);
  if (!p) {
    p = readIlkAtOnce(ilk, block);
    p.catch(() => ilkCache.delete(key));
    ilkCache.set(key, p);
  }
  return p;
}

export async function readMakerIlkAtBlocks(ilk: string, blocks: number[]): Promise<MakerIlkAtResponse> {
  const wanted = [...new Set(blocks)].sort((a, b) => a - b);
  const reads: Record<string, MakerIlkAt> = {};
  // Four at a time, as the f(x) event-state read does.
  for (let i = 0; i < wanted.length; i += 4) {
    const got = await Promise.all(wanted.slice(i, i + 4).map((b) => readIlkAt(ilk, b)));
    for (const g of got) reads[String(g.block)] = g;
  }
  return { ilk, reads };
}

const auctionCache = new Map<string, Promise<MakerAuctionRead>>();

async function readAuctionOnce(txHash: `0x${string}`, urn: string): Promise<MakerAuctionRead> {
  const client = alchemyClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const dog = MAKER_ADDRESSES.DOG.toLowerCase();
  const want = urn.toLowerCase();
  let bark: { ilk: `0x${string}`; ink: bigint; due: bigint; clip: string; id: bigint } | null = null;
  let kick: { tab: bigint; lot: bigint; clip: string } | null = null;
  for (const log of receipt.logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: AUCTION_ABI, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName === "Bark" && log.address.toLowerCase() === dog && decoded.args.urn.toLowerCase() === want) {
      bark = {
        ilk: decoded.args.ilk,
        ink: decoded.args.ink,
        due: decoded.args.due,
        clip: decoded.args.clip.toLowerCase(),
        id: decoded.args.id,
      };
    }
    if (decoded.eventName === "Kick" && decoded.args.usr.toLowerCase() === want) {
      kick = { tab: decoded.args.tab, lot: decoded.args.lot, clip: log.address.toLowerCase() };
    }
  }
  if (!bark || !kick || kick.clip !== bark.clip) return { kind: "not-read", txHash, urn: want };

  const block = Number(receipt.blockNumber);
  const clip = getAddress(bark.clip);
  const [takeLogs, spotIlk] = await Promise.all([
    client.getLogs({
      address: clip,
      event: TAKE_EVENT,
      args: { id: bark.id },
      fromBlock: receipt.blockNumber,
      toBlock: "latest",
    }),
    client.readContract({
      address: getAddress(MAKER_ADDRESSES.SPOTTER),
      abi: SPOTTER_ABI,
      functionName: "ilks",
      args: [bark.ilk],
      blockNumber: receipt.blockNumber,
    }),
  ]);

  const takes: MakerAuctionTake[] = [];
  let lotBefore = kick.lot;
  let raised = BigInt(0);
  let lastTab = kick.tab;
  let lastLot = kick.lot;
  let settledBlock: number | null = null;
  const ordered = [...takeLogs].sort(
    (a, b) => Number(a.blockNumber) - Number(b.blockNumber) || Number(a.logIndex) - Number(b.logIndex),
  );
  for (const t of ordered) {
    const a = t.args as { owe: bigint; price: bigint; tab: bigint; lot: bigint };
    const sold = lotBefore - a.lot;
    takes.push({
      block: Number(t.blockNumber),
      txHash: String(t.transactionHash),
      oweDai: formatUnits(a.owe, 45),
      soldInk: formatUnits(sold, 18),
      priceDai: Number(a.price) / 1e27,
    });
    raised += a.owe;
    lotBefore = a.lot;
    lastTab = a.tab;
    lastLot = a.lot;
    if (a.tab === BigInt(0) || a.lot === BigInt(0)) {
      settledBlock = Number(t.blockNumber);
      break;
    }
  }
  const settled = settledBlock != null;
  let settledAt: number | null = null;
  if (settledBlock != null) {
    const header = await client.getBlock({ blockNumber: BigInt(settledBlock) });
    settledAt = Number(header.timestamp);
  }
  const penalty = kick.tab - bark.due;
  return {
    kind: "clipper",
    txHash,
    urn: want,
    auctionId: bark.id.toString(),
    clip: bark.clip,
    block,
    lot: formatUnits(bark.ink, 18),
    dueDai: formatUnits(bark.due, 45),
    tabDai: formatUnits(kick.tab, 45),
    penaltyDai: formatUnits(penalty > BigInt(0) ? penalty : BigInt(0), 45),
    chop: bark.due > BigInt(0) ? Number(kick.tab) / Number(bark.due) : 0,
    mat: spotIlk[1] > BigInt(0) ? Number(formatUnits(spotIlk[1], 27)) : null,
    takes,
    raisedDai: formatUnits(raised, 45),
    soldInk: formatUnits(kick.lot - lastLot, 18),
    leftoverInk: settled && lastTab === BigInt(0) ? formatUnits(lastLot, 18) : "0",
    shortfallDai: settled && lastLot === BigInt(0) ? formatUnits(lastTab, 45) : "0",
    settled,
    settledBlock,
    settledAt,
  };
}

export function readMakerAuction(txHash: `0x${string}`, urn: string): Promise<MakerAuctionRead> {
  const key = `${txHash.toLowerCase()}:${urn.toLowerCase()}`;
  let p = auctionCache.get(key);
  if (!p) {
    p = readAuctionOnce(txHash, urn);
    // An auction still running has more takes to come: answer it, keep it
    // out of the cache.
    p.then((v) => {
      if (v.kind === "clipper" && !v.settled) auctionCache.delete(key);
    }).catch(() => auctionCache.delete(key));
    auctionCache.set(key, p);
  }
  return p;
}
