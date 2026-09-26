// A Transmuter claim that landed before maturity, split into its parts.
// ----------------------------------------------------------------------------
// A stake converts in equal parts every block from its start block to its
// maturity block. A claim before maturity pays out the converted part in vault
// shares; of the part that had not converted, the Transmuter keeps its early
// exit fee and hands the rest back as the synthetic. `PositionClaimed` emits
// only the payout and the part handed back, so the two other figures here are
// arithmetic over logged values:
//
//   unconverted = staked × (maturity − claim block) ÷ (maturity − start block)
//   converted   = staked − unconverted
//   exit fee    = unconverted − handed back
//
// Integer division, as the contract does it. Checked against every early claim
// on the three lines (2026-09-27): the fee comes out at 1.0000% of the
// unconverted part on all eight Ethereum claims, and within rounding of 1% on
// Base's two dust claims. A negative fee would mean the rule does not hold for
// that claim, and then nothing here is stated.

import type { AlchemixTransmuterPositionSummary } from "@/types/api/alchemix";

export interface TransmuterEarlyClaim {
  claimBlock: number;
  startBlock: number;
  maturationBlock: number;
  /** Blocks between the claim and maturity. */
  blocksEarly: number;
  /** The share of the term that had passed at the claim, 0 to 1. */
  termPassed: number;
  stakedRaw: string;
  unconvertedRaw: string;
  convertedRaw: string;
  returnedRaw: string;
  exitFeeRaw: string;
  /** The fee as a share of the unconverted part, 0 to 1. */
  exitFeeShare: number;
}

const int = (raw: string) => BigInt(raw.split(".")[0]);

export function transmuterEarlyClaim(p: AlchemixTransmuterPositionSummary): TransmuterEarlyClaim | null {
  const c = p.claim;
  if (!c?.unclaimed) return null;
  const { startBlock, maturationBlock } = p.maturity;
  const claimBlock = c.blockNumber;
  const term = maturationBlock - startBlock;
  if (claimBlock >= maturationBlock || term <= 0) return null;
  const staked = int(p.staked.raw);
  const returned = int(c.unclaimed.raw);
  const unconverted = (staked * BigInt(maturationBlock - claimBlock)) / BigInt(term);
  const fee = unconverted - returned;
  if (fee < BigInt(0)) return null;
  return {
    claimBlock,
    startBlock,
    maturationBlock,
    blocksEarly: maturationBlock - claimBlock,
    termPassed: (claimBlock - startBlock) / term,
    stakedRaw: staked.toString(),
    unconvertedRaw: unconverted.toString(),
    convertedRaw: (staked - unconverted).toString(),
    returnedRaw: returned.toString(),
    exitFeeRaw: fee.toString(),
    exitFeeShare: unconverted > BigInt(0) ? Number(fee) / Number(unconverted) : 0,
  };
}
