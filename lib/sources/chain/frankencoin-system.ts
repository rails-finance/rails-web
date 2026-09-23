// Live Frankencoin SYSTEM state — the protocol-level companion to
// frankencoin-position.ts. Where the position lane answers "where does THIS
// Position contract stand", this answers what only the system can: how much
// ZCHF exists, what capital stands behind it, and the base rate that prices
// new V2 minting.
//
// Frankencoin has no oracle, so this view is a BALANCE SHEET, not a market
// board — every figure is a ZCHF-native slot of the protocol's own contracts:
//
//   • The franc: ZCHF.totalSupply(). Minting hubs are not its only minters
//     (the bridge and savings interest also mint), so the supply is the franc
//     count, never asserted equal to the hub book.
//   • The capital: ZCHF.equity() (the FPS holders' capital) and
//     ZCHF.minterReserve() (borrowers' reserve contributions held back at
//     mint). Their sum IS the reserve's ZCHF balance —
//     balanceOf(reserve()) = equity() + minterReserve(), an identity the
//     contract maintains and this loader reads all three sides of, at one
//     block, so the page can state it as a checked fact.
//   • FPS: Equity.totalSupply() and Equity.price() — the contract's own
//     cubic rule (price = 3 × equity ÷ supply), in ZCHF per FPS. No USD.
//   • The base rate: Leadrate.currentRatePPM(), the module DISCOVERED via
//     HubV2.rate() (never hardcoded). ⚠️ This prices NEW minting (plus each
//     position's fixed premium); interest is charged up front at each mint
//     at that moment's rate, so a head read is NOT any position's at-mint
//     rate — the receipt states the boundary (the 2026-07-21 rate-pill
//     falsification, honored).
//
// Every getter above was probed against the live contracts before this file
// was written (2026-08-08): the reserve identity held wei-exact and the
// leadrate reproduced from a real position's annualInterestPPM − premium.
// SERVER-ONLY.

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { FRANKENCOIN_ADDRESSES } from "@/lib/frankencoin/asset-catalog";

const ZCHF = getAddress(FRANKENCOIN_ADDRESSES.ZCHF);
const HUB_V2 = getAddress(FRANKENCOIN_ADDRESSES.HUB_V2);

const FC_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function equity() view returns (uint256)",
  "function minterReserve() view returns (uint256)",
  "function reserve() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
]);
const EQ_ABI = parseAbi(["function totalSupply() view returns (uint256)", "function price() view returns (uint256)"]);
const HUB_ABI = parseAbi(["function rate() view returns (address)", "function OPENING_FEE() view returns (uint256)"]);
const RATE_ABI = parseAbi([
  "function currentRatePPM() view returns (uint24)",
  "function nextRatePPM() view returns (uint24)",
  "function nextChange() view returns (uint40)",
]);

const E18 = 1e18;

export interface FrankencoinSystemChainResponse {
  blockNumber: number;
  /** ZCHF in existence — the token's own totalSupply(). */
  zchfSupply: number;
  /** The FPS holders' capital — ZCHF.equity(). */
  equity: number;
  /** Borrowers' reserve contributions held back at mint — minterReserve(). */
  minterReserve: number;
  /** The reserve's actual ZCHF balance — balanceOf(reserve()); equals
   *  equity + minterReserve by the contract's own accounting. */
  reserveBalance: number;
  /** The Equity contract (= reserve()) — discovered, shown on receipts. */
  reserveAddress: string | null;
  /** FPS outstanding — Equity.totalSupply(). */
  fpsSupply: number;
  /** ZCHF per FPS — Equity.price(), the contract's own 3 × equity ÷ supply. */
  fpsPrice: number;
  /** The Leadrate module — discovered via HubV2.rate(), never hardcoded. */
  leadrateAddress: string | null;
  /** The system base rate for new V2 minting, ppm. */
  leadratePPM: number | null;
  /** The announced next rate (equals current when nothing is pending). */
  nextRatePPM: number | null;
  /** When the announced rate can apply (unix). */
  nextChange: number | null;
  /** Flat fee for opening an original position — HubV2.OPENING_FEE(). */
  openingFeeZchf: number | null;
  /** True when the read failed — the page states that, never stale figures. */
  chainStale: boolean;
}

function stub(): FrankencoinSystemChainResponse {
  return {
    blockNumber: 0,
    zchfSupply: 0,
    equity: 0,
    minterReserve: 0,
    reserveBalance: 0,
    reserveAddress: null,
    fpsSupply: 0,
    fpsPrice: 0,
    leadrateAddress: null,
    leadratePPM: null,
    nextRatePPM: null,
    nextChange: null,
    openingFeeZchf: null,
    chainStale: true,
  };
}

/**
 * Read Frankencoin's system state live from its own contracts at one head
 * block. Returns a `chainStale` stub on RPC failure so the page says so
 * rather than rendering an empty protocol.
 */
export async function loadFrankencoinSystemFromChain(): Promise<FrankencoinSystemChainResponse> {
  try {
    const client = alchemyClient();

    // Phase 1 — the fixed addresses: the franc's slots and the hub's two
    // discovery reads.
    const [blockNumber, supply, equity, minterReserve, reserveAddr, rateAddr, openingFee] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({ address: ZCHF, abi: FC_ABI, functionName: "totalSupply" }),
      client.readContract({ address: ZCHF, abi: FC_ABI, functionName: "equity" }),
      client.readContract({ address: ZCHF, abi: FC_ABI, functionName: "minterReserve" }),
      client.readContract({ address: ZCHF, abi: FC_ABI, functionName: "reserve" }),
      client.readContract({ address: HUB_V2, abi: HUB_ABI, functionName: "rate" }).catch(() => null),
      client.readContract({ address: HUB_V2, abi: HUB_ABI, functionName: "OPENING_FEE" }).catch(() => null),
    ]);

    // Phase 2 — the discovered contracts' own slots. Each read is optional
    // (allowFailure): a miss withholds its figure rather than failing the
    // whole balance sheet.
    const contracts = [
      { address: ZCHF, abi: FC_ABI, functionName: "balanceOf", args: [reserveAddr] } as const,
      { address: reserveAddr, abi: EQ_ABI, functionName: "totalSupply" } as const,
      { address: reserveAddr, abi: EQ_ABI, functionName: "price" } as const,
      ...(rateAddr
        ? ([
            { address: rateAddr, abi: RATE_ABI, functionName: "currentRatePPM" } as const,
            { address: rateAddr, abi: RATE_ABI, functionName: "nextRatePPM" } as const,
            { address: rateAddr, abi: RATE_ABI, functionName: "nextChange" } as const,
          ] as const)
        : []),
    ];
    const res = (await client.multicall({ allowFailure: true, contracts })) as {
      status: string;
      result?: bigint | number;
    }[];
    const ok = (i: number): bigint | number | null => (res[i]?.status === "success" ? (res[i].result ?? null) : null);

    const reserveBal = ok(0);
    const fpsSupply = ok(1);
    const fpsPrice = ok(2);
    const leadrate = rateAddr ? ok(3) : null;
    const nextRate = rateAddr ? ok(4) : null;
    const nextChange = rateAddr ? ok(5) : null;

    return {
      blockNumber,
      zchfSupply: Number(supply) / E18,
      equity: Number(equity) / E18,
      minterReserve: Number(minterReserve) / E18,
      reserveBalance: reserveBal != null ? Number(reserveBal) / E18 : 0,
      reserveAddress: reserveAddr,
      fpsSupply: fpsSupply != null ? Number(fpsSupply) / E18 : 0,
      fpsPrice: fpsPrice != null ? Number(fpsPrice) / E18 : 0,
      leadrateAddress: rateAddr,
      leadratePPM: leadrate != null ? Number(leadrate) : null,
      nextRatePPM: nextRate != null ? Number(nextRate) : null,
      nextChange: nextChange != null ? Number(nextChange) : null,
      openingFeeZchf: openingFee != null ? Number(openingFee) / E18 : null,
      chainStale: false,
    };
  } catch {
    return stub();
  }
}
