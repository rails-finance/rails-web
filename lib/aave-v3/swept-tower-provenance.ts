// Tower receipts for the WHOLE-LIFE V3-family lane on Base, as a factory.
// ----------------------------------------------------------------------------
// The Ethereum tower and the Base ones run the same arithmetic (chain-truth-
// tower.ts is shared), but they are not making the same claim, and the receipt
// is where that has to be said rather than glossed:
//
//   • The CURRENT balances here are a direct `balanceOf` on the reserve's
//     aToken / variableDebtToken at a pinned block. Ethereum's are the
//     scaled-balance reduction, which arrives at the same number by replaying
//     every flow against the reserve's liquidity index. Both are chain-derived;
//     only this one is a single read of the token that owes the balance, which
//     is why these carry the `state` class rather than `indexed`.
//   • The LIFETIME sums run over the wallet's whole life on the Pool, from the
//     Pool's first block — the lane serves a record the page has verified is
//     whole, or it withholds the lifetime layer entirely. That is what lets
//     these say "every event the Pool has recorded for this wallet" where the
//     Ethereum wording has to say "captured history".
//
// WHICH STORE ANSWERED IS NOT WHAT THESE SAY, and it used to be: the vias named
// a `live chunked eth_getLogs sweep`, which the route stopped always doing when
// the index learned to vouch for a whole Base history (app/api/chain/
// aave-v3-base/timeline/route.ts reads the index first and sweeps only when the
// index cannot vouch). A receipt that names the store is a custody claim that
// goes stale the moment the store changes, and it tells the reader nothing
// about the value (receipts grammar §3).
//
// A factory rather than a per-explorer module because only three things vary
// (the Pool's name, its address, and the block its history floors at) and there
// are four more forks queued behind Seamless. Reusing ETHEREUM's receipts here
// would have described a reduction that did not produce these numbers and
// pointed every "confirm it yourself" link at Etherscan for a Base transaction.
// Both read as correct until followed.

import type { Provenance } from "@/components/shared/provenance";
import type { AaveV3TowerVocabulary } from "./chain-truth-tower";
import { lifetimeFlowVerb } from "./event-provenance";
import type { V3Protocol } from "./protocol-name";

export interface SweptPoolIdentity {
  /** How a receipt names the Pool — "Seamless Pool", "Aave V3 Pool (Base)". */
  poolName: string;
  poolAddress: string;
  /** The protocol the prose names; Aave V3 when unstated. */
  protocol?: V3Protocol;
  /** The Pool's first block — the floor the wallet's history starts at. */
  deployBlock: number;
}

const at = (block?: number): string => (block != null ? ` at block ${block.toLocaleString("en-US")}` : "");

/** Build the five tower receipts for one whole-life V3-family Pool. */
export function makeSweptTowerVocabulary(id: SweptPoolIdentity): AaveV3TowerVocabulary {
  const contract = { name: id.poolName, address: id.poolAddress };
  const fromBlock = `from the Pool's first block, ${id.deployBlock.toLocaleString("en-US")}`;
  // The lifetime legs the tower actually sums, named in the order the debt
  // arithmetic applies them (chain-truth-tower.ts: borrowed − repaid −
  // liquidatedDebt − writtenOff). The write-off leg was missing from this
  // prose while the arithmetic subtracted it.
  const DEBT_LEGS = "every draw, less every repayment, the debt a liquidation covered and the debt the Pool wrote off";

  return {
    ...(id.protocol ? { protocol: id.protocol } : {}),
    supply: (symbol, block): Provenance => ({
      kind: "chain",
      pclass: "state",
      summary: `Supplied ${symbol} the position holds${at(block)} — the balance the reserve's aToken reports for this wallet at that block. The aToken's balance climbs with the reserve's liquidity index, so the interest earned since each deposit is inside this figure. It is the balance the Pool counts as collateral.`,
      contract,
      via: "aToken balanceOf at the pinned block",
    }),

    debt: (symbol, block): Provenance => ({
      kind: "chain",
      pclass: "state",
      summary: `Borrowed ${symbol} the position owes${at(block)} — the balance the reserve's variableDebtToken reports for this wallet at that block. The debt token's balance climbs with the reserve's borrow index, so the interest charged since each draw is inside this figure. It is the debt the Pool liquidates against.`,
      contract,
      via: "variableDebtToken balanceOf at the pinned block",
    }),

    lifetimeFlow: (flow, symbol): Provenance => ({
      kind: "chain-derived",
      pclass: "emitted",
      summary: `Lifetime ${flow} (${symbol}) — the sum of every ${symbol} amount this wallet's Pool events ${lifetimeFlowVerb(flow)}, across every event the Pool has recorded for it since its first block. Pool flows only: an aToken transfer hands the position to another account without a Pool flow, so it counts here as neither a deposit nor a withdrawal. The timeline draws it as a transfer.`,
      contract,
      via: `Σ amount across the wallet's Pool logs ${fromBlock}`,
    }),

    debtInterest: (symbol): Provenance => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `Accrued interest inside the ${symbol} debt — the balance the debt token reports now, less the principal its events account for: ${DEBT_LEGS}. The debt token's balance climbs with the reserve's borrow index and records nothing when it does, so what it says is owed above what the events moved is the interest. It shows only where the wallet's whole history is in hand and the subtraction lands inside its plausibility bounds.`,
      contract,
      via: `variableDebtToken balanceOf − Σ (borrow − repay − liquidation cover − written off) ${fromBlock}`,
      formula: "balanceOf − net principal",
      inputs: [
        { label: "balanceOf", kind: "chain", pclass: "state", note: "the debt the token reports now" },
        { label: "net principal", kind: "chain-derived", pclass: "emitted", note: "Σ over the wallet's Pool logs" },
      ],
    }),

    debtPrincipal: (symbol): Provenance => ({
      kind: "chain-derived",
      pclass: "emitted",
      summary: `Borrowed ${symbol} principal — ${DEBT_LEGS}, across every event the Pool has recorded for this wallet since its first block. The interest charged on top of it is the segment above this one.`,
      contract,
      via: `Σ (borrow − repay − liquidation cover − written off) ${fromBlock}`,
    }),
  };
}
