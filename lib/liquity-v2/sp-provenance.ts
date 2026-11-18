// Receipts for the Liquity V2 stability-pool deposit page: the branch pool's
// getters at head (the chain lane), the index's sums over a deposit's rows
// (rails-server migs 490 and 491), and one operation's fields from its log.
// The field meanings are rails-ops reference/liquity-v2-stability-pool-deposits.md.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import type { SpLiquidationsNote } from "@/lib/shared/market-note";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { LIQUITY_V2_SP_POOLS } from "./sp-catalog";
import type { SpBranch } from "./sp-routes";
import type { TxTrove } from "./tx-troves-words";

const VIA = "GET /api/chain/liquity-v2/stability-pool";

const pool = (b: SpBranch) => ({ name: `Liquity V2 ${b} StabilityPool`, address: LIQUITY_V2_SP_POOLS[b] });
const feed = (b: SpBranch) => ({
  name: `Liquity V2 ${b} PriceFeed`,
  address: LIQUITY_V2_BRANCHES[b.toLowerCase()].priceFeed,
});

const ask = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `To check: ask any Ethereum archive node for ${method} at the stamped block.`,
});

const GETTER: Record<
  "compounded" | "yieldGain" | "pendingColl" | "collGain",
  { method: string; summary: (coll: string) => string }
> = {
  compounded: {
    method: "getCompoundedBoldDeposit(depositor)",
    summary: () =>
      "Deposit now — the pool's getCompoundedBoldDeposit(depositor) at the latest block: the BOLD recorded at the last touch, less what liquidations have burned since.",
  },
  yieldGain: {
    method: "getDepositorYieldGainWithPending(depositor)",
    summary: () =>
      "BOLD yield pending — the pool's getDepositorYieldGainWithPending(depositor) at the latest block: the yield the branch's interest has paid the deposit since its last touch, the interest not yet minted included. The next touch pays it; what that touch does not claim joins the deposit.",
  },
  pendingColl: {
    method: "getDepositorCollGain(depositor) + stashedColl(depositor)",
    summary: (c) =>
      `${c} pending — the pool's getDepositorCollGain(depositor), the ${c} liquidations have paid the deposit since its last touch, plus stashedColl(depositor), the ${c} earlier touches left unclaimed, both at the latest block.`,
  },
  collGain: {
    method: "getDepositorCollGain(depositor)",
    summary: (c) =>
      `${c} paid in since last touch — the pool's getDepositorCollGain(depositor) at the latest block: the ${c} liquidations have paid the deposit since its last touch, which the next touch writes.`,
  },
};

export function spLiveProv(what: keyof typeof GETTER, branch: SpBranch): Provenance {
  const g = GETTER[what];
  return {
    kind: "chain",
    pclass: "state",
    verify: ask(g.method),
    summary: g.summary(branch),
    contract: pool(branch),
    via: `${VIA} · ${g.method} @ head`,
  };
}

/** The pending loss: the recorded deposit less the deposit now. */
export function spPendingLossProv(branch: SpBranch): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("deposits(depositor) and getCompoundedBoldDeposit(depositor)"),
    summary:
      "BOLD burned since the last touch — the pool's deposits(depositor), the deposit recorded at the last touch, less its getCompoundedBoldDeposit(depositor), both at the latest block. The next touch writes it as the operation's deposit loss.",
    contract: pool(branch),
    formula: "deposits(depositor) − getCompoundedBoldDeposit(depositor)",
    via: `${VIA} @ head`,
  };
}

/** The deposit's share of its pool: the two getters and the division. */
export function spPoolShareProv(branch: SpBranch, deposit: string, total: string, block: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("getCompoundedBoldDeposit(depositor) and getTotalBoldDeposits()"),
    summary: `Share of the pool — the deposit now over all the BOLD in the ${branch} Stability Pool, both at the stamped block.`,
    contract: pool(branch),
    source: { block },
    formula: "getCompoundedBoldDeposit(depositor) ÷ getTotalBoldDeposits()",
    inputs: [
      {
        label: "Deposit now, getCompoundedBoldDeposit(depositor), BOLD",
        value: deposit,
        kind: "chain",
        pclass: "state",
      },
      { label: "All deposits, getTotalBoldDeposits(), BOLD", value: total, kind: "chain", pclass: "state" },
    ],
    via: `${VIA} · getCompoundedBoldDeposit(depositor) ÷ getTotalBoldDeposits() @ head`,
  };
}

const SUM: Record<string, (c: string) => string> = {
  deposited: () => "BOLD deposited — the sum of every DepositOperation's positive topUpOrWithdrawal on this deposit.",
  withdrawn: () => "BOLD withdrawn — the sum of every DepositOperation's negative topUpOrWithdrawal on this deposit.",
  burned: () =>
    "BOLD burned at touches — the sum of every DepositOperation's depositLossSinceLastOperation: the deposit liquidations used, written at the next touch.",
  kept: () =>
    "Yield kept — the sum of every DepositOperation's yieldGainSinceLastOperation less its yieldGainClaimed: the BOLD yield the touches added to the deposit.",
  recorded: () =>
    "Deposit at the last touch — the deposit before each operation, less its loss, plus its top-up or withdrawal and its yield kept, replayed from the first operation: the pool's deposits(depositor) after the last touch.",
  yieldGain: () => "BOLD yield paid at touches — the sum of every DepositOperation's yieldGainSinceLastOperation.",
  yieldClaimed: () => "BOLD yield claimed — the sum of every DepositOperation's yieldGainClaimed.",
  collGain: (c) => `${c} paid in at touches — the sum of every DepositOperation's ethGainSinceLastOperation.`,
  collClaimed: (c) =>
    `${c} claimed — the sum of every DepositOperation's ethGainClaimed, which includes the stash from earlier touches.`,
  stash: (c) =>
    `${c} stashed — the ${c} paid in at touches less what they sent, replayed from the first operation: the pool's stashedColl(depositor) after the last touch.`,
};

export function spSumProv(what: keyof typeof SUM, branch: SpBranch): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: SUM[what](branch),
    contract: pool(branch),
    via: "GET /api/liquity-v2/stability-pool/timeline · position",
  };
}

/** One operation's field, from its log. */
export function spTouchProv(summary: string, txHash: string, block: string, branch: SpBranch): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: pool(branch),
    source: { block, txHash },
  };
}

/** What a compounding touch kept: the BOLD yield it added to the deposit, or
 *  the collateral it stashed, each its log's gain less its claim. */
export function spCompoundProv(
  what: "yield" | "stash",
  txHash: string,
  block: string,
  branch: SpBranch,
  inputs: { since: string; claimed: string },
): Provenance {
  const y = what === "yield";
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary: y
      ? "BOLD yield added — the DepositOperation's yieldGainSinceLastOperation less its yieldGainClaimed: the yield this touch kept in the deposit."
      : `${branch} stashed — the DepositOperation's ethGainSinceLastOperation less its ethGainClaimed: the ${branch} this touch left in the pool for a later claim.`,
    formula: y ? "yieldGainSinceLastOperation − yieldGainClaimed" : "ethGainSinceLastOperation − ethGainClaimed",
    inputs: [
      {
        label: y ? "yieldGainSinceLastOperation" : "ethGainSinceLastOperation",
        value: inputs.since,
        kind: "chain",
        pclass: "emitted",
      },
      { label: y ? "yieldGainClaimed" : "ethGainClaimed", value: inputs.claimed, kind: "chain", pclass: "emitted" },
    ],
    contract: pool(branch),
    source: { block, txHash },
  };
}

/** The branch's collateral in USD at its PriceFeed, read with the deposit. */
export function spFeedProv(branch: SpBranch, stale: boolean): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: ask(stale ? "lastGoodPrice()" : "fetchPrice()"),
    summary: stale
      ? `${branch} in USD — the branch PriceFeed's lastGoodPrice() at the latest block: the price the branch's last operation fetched.`
      : `${branch} in USD — the branch PriceFeed's fetchPrice(), simulated at the latest block: the price the branch would liquidate and redeem at now.`,
    contract: feed(branch),
    via: `${VIA} · ${stale ? "lastGoodPrice()" : "fetchPrice()"} @ head`,
  };
}

// ── What each liquidation did to the deposit (/stability-pool/liquidations):
//    the branch pool's P, S and scale replayed over its Liquidation logs with
//    StabilityPool.sol's integer arithmetic, from the deposit's last touch's
//    snapshot. The collateral is valued at the Liquidation log's _price. ─────

const LIQ_VIA = "GET /api/liquity-v2/stability-pool/liquidations";

/** One liquidation: its block and transaction, for `source`. */
export interface SpLiqCoords {
  block: string;
  txHash: string;
}

const replay = (branch: SpBranch, summary: string, at: SpLiqCoords | null, extra: Partial<Provenance> = {}) =>
  ({
    kind: "derived",
    pclass: "indexed",
    summary,
    contract: pool(branch),
    via: LIQ_VIA,
    ...(at ? { source: { block: at.block, txHash: at.txHash } } : {}),
    ...extra,
  }) satisfies Provenance;

export const spLiqProv = {
  boldLost: (b: SpBranch, at: SpLiqCoords) =>
    replay(
      b,
      "BOLD burned — the deposit's compounded BOLD before this liquidation less after it, replayed from the pool's P and scale at this Liquidation log.",
      at,
      { formula: "compounded before − compounded after" },
    ),
  collGained: (b: SpBranch, at: SpLiqCoords) =>
    replay(
      b,
      `${b} gained — the deposit's ${b} gain after this liquidation less before it, replayed from the pool's S at this Liquidation log.`,
      at,
      { formula: "collateral gain after − collateral gain before" },
    ),
  price: (b: SpBranch, at: SpLiqCoords) => ({
    kind: "chain" as const,
    pclass: "emitted" as const,
    summary: `${b} block price — the Liquidation log's _price: the BOLD per ${b} the branch liquidated at in this block.`,
    contract: { name: `Liquity V2 ${b} TroveManager`, address: LIQUITY_V2_BRANCHES[b.toLowerCase()].troveManager },
    source: { block: at.block, txHash: at.txHash },
    via: LIQ_VIA,
  }),
  value: (b: SpBranch, at: SpLiqCoords, coll: string, price: string) =>
    replay(
      b,
      `${b} gained, in BOLD — the ${b} this liquidation paid the deposit, valued at the liquidation's block price.`,
      at,
      {
        formula: `${b} gained × _price, rounded down to 18 decimals`,
        inputs: [
          { label: `${b} gained`, value: coll, kind: "derived", pclass: "indexed" },
          { label: `_price, BOLD per ${b}`, value: price, kind: "chain", pclass: "emitted" },
        ],
      },
    ),
  net: (b: SpBranch, at: SpLiqCoords, value: string, lost: string) =>
    replay(b, `Net, in BOLD — the ${b} gained valued at the liquidation's block price, less the BOLD burned.`, at, {
      formula: `${b} gained in BOLD − BOLD burned`,
      inputs: [
        { label: `${b} gained, in BOLD`, value, kind: "derived", pclass: "indexed" },
        { label: "BOLD burned", value: lost, kind: "derived", pclass: "indexed" },
      ],
    }),
  /** A stretch's sum of one column. */
  /** A column's sum over the period: between the two touches, or since the
   *  last touch for the open period. `column` is plural, `one` singular. */
  sum: (b: SpBranch, head: string, column: string, one: string, count: number, open = false) =>
    replay(
      b,
      `${head} — ${count === 1 ? `the 1 liquidation's ${one}` : `the sum of the ${count} liquidations' ${column}`} ${open ? "since the last touch" : "between the two touches"}.`,
      null,
      { formula: `Σ ${one}` },
    ),
  /** The closing touch's own figures, from its DepositOperation. */
  touchLoss: (b: SpBranch, txHash: string, block: string) =>
    spTouchProv(
      "BOLD burned at the touch — the closing DepositOperation's depositLossSinceLastOperation: the deposit liquidations used since the touch before.",
      txHash,
      block,
      b,
    ),
  touchGain: (b: SpBranch, txHash: string, block: string) =>
    spTouchProv(
      `${b} paid in at the touch — the closing DepositOperation's ethGainSinceLastOperation: the ${b} liquidations paid the deposit since the touch before.`,
      txHash,
      block,
      b,
    ),
  /** The open period's end: the newest block the index has read the pool to. */
  servedThru: (b: SpBranch, block: string) =>
    replay(
      b,
      "Latest block the index has read — the newest block the index has read the branch pool's touches and liquidations to: the route's served_thru_block.",
      null,
      { source: { block } },
    ),
  /** A compounding touch's deposit change, where a loss landed with it. */
  depositChange: (b: SpBranch, txHash: string, block: string, before: string, after: string) => ({
    kind: "derived" as const,
    pclass: "indexed" as const,
    summary:
      "Deposit change — the deposit after this touch less the deposit before it: the yield the touch kept less the loss since the last touch.",
    formula: "deposit after − deposit before",
    inputs: [
      { label: "deposit before", value: before, kind: "derived" as const, pclass: "indexed" as const },
      { label: "deposit after", value: after, kind: "derived" as const, pclass: "indexed" as const },
    ],
    contract: pool(b),
    source: { block, txHash },
    via: "GET /api/liquity-v2/stability-pool/timeline",
  }),
};

/** A closed period's figure, for a line that lists the note: the net, or,
 *  where no liquidation falls between the touches, the BOLD the closing touch
 *  wrote as burned. */
export function spLiquidationsNoteProv(note: SpLiquidationsNote): Provenance {
  const b = note.branch as SpBranch;
  const n = note.stretch.liquidations.length;
  const to = note.stretch.to;
  if (n === 0 && to) return spLiqProv.touchLoss(b, to.tx_hash, to.block_number);
  return spLiqProv.sum(b, "Net between the touches", "nets in BOLD", "net in BOLD", n);
}

/** A Trove the deposit's transaction acted on (ui-jobs 751): the branch
 *  TroveManager's TroveOperation logs for it in that transaction, each with
 *  its operation and its log index as stored. */
export function spTxTroveProv(t: TxTrove, idText: string, txHash: string): Provenance {
  const ops = t.ops.map((o) => `${o.operation} (${o.operation_enum}) at log index ${o.log_index}`).join(", ");
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `Trove ${idText} (${t.collateralType}) — the ${t.collateralType} TroveManager's TroveOperation ${t.ops.length === 1 ? "log" : "logs"} for this Trove in this transaction, by _operation: ${ops}.`,
    inputs: t.ops.map((o) => ({
      label: `TroveOperation _operation, log index ${o.log_index}`,
      value: `${o.operation} (${o.operation_enum})`,
      kind: "chain" as const,
      pclass: "emitted" as const,
    })),
    contract: { name: `Liquity V2 ${t.collateralType} TroveManager`, address: t.ops[0].contract_address },
    source: { block: t.ops[0].block_number, txHash },
    via: "GET /api/liquity-v2/tx/:hash/troves",
  };
}
