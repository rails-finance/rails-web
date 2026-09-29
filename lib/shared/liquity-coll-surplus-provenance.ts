// Receipts for the terminal Trove card's "Claimable collateral" figure and its
// USD — the collateral surplus a liquidation left in the branch's
// CollSurplusPool, read at the head (lib/sources/chain/liquity-coll-surplus.ts).
// Shared by every Liquity-family explorer.

import type { Provenance } from "@/components/shared/provenance";
import type { LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";
import { formatNum, formatUsd } from "@/lib/shared/format-event";
import type { CollSurplusClaimContext } from "@/lib/shared/types/event-shape";

/** The line under a terminal card's "Claimable collateral": where it is and
 *  whose. The Explanation says how to claim it. */
export const CLAIMABLE_WHERE = "In the surplus pool, for the owner to claim";

export function collSurplusClaimableProv(s: LiquityTroveSurplus, symbol: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `Claimable collateral — the ${symbol} left over after the liquidation had covered the Trove's debt and penalty. The branch's CollSurplusPool holds it until the owner claims it through BorrowerOperations.claimCollateral().`,
    contract: { name: "CollSurplusPool", address: s.pool },
    via: `the liquidation's CollBalanceUpdated log for the owner, less the balance the pool held for them the block before; no claim since, and getCollateral(owner) at block ${s.blockNumber.toLocaleString("en-US")} still covers it`,
    source: { block: s.blockNumber },
    scaling: {
      raw: s.claimableRaw,
      from: "call",
      places: s.decimals,
      why: `${symbol} has ${s.decimals} decimals`,
    },
  };
}

export function collSurplusUsdProv(s: LiquityTroveSurplus, symbol: string, priceUsd: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Claimable collateral in USD — the ${symbol} still claimable, valued at the branch's oracle price.`,
    formula: "claimable collateral × oracle price",
    inputs: [
      { label: "claimable", value: `${formatNum(s.claimable, 4)} ${symbol}`, kind: "chain", pclass: "state" },
      { label: "oracle price", value: formatUsd(priceUsd), kind: "chain", pclass: "oracle" },
    ],
  };
}

export function collSurplusClaimedProv(s: LiquityTroveSurplus, symbol: string): Provenance {
  const when = s.claimed?.block != null ? ` at block ${s.claimed.block.toLocaleString("en-US")}` : "";
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `Surplus claimed — the ${symbol} the liquidation left in the branch's CollSurplusPool, which the owner has since claimed.`,
    contract: { name: "CollSurplusPool", address: s.pool },
    via: `the liquidation's CollBalanceUpdated log for the owner, less the balance the pool held for them the block before; a later CollBalanceUpdated(owner, 0)${when} is the claim`,
    ...(s.claimed?.txHash ? { source: { block: s.claimed.block ?? undefined, txHash: s.claimed.txHash } } : {}),
    scaling: { raw: s.surplusRaw, from: "call", places: s.decimals, why: `${symbol} has ${s.decimals} decimals` },
  };
}

// ── The claim row (lib/shared/liquity-coll-surplus-claim.ts) ─────────────────

type ClaimCoords = { txHash: string; blockNumber: number };

const creditWord = (d: CollSurplusClaimContext) => (d.creditKind === "redemption" ? "full redemption" : "liquidation");

/** This Trove's surplus, which the claim paid out. */
export function claimAmountProv(d: CollSurplusClaimContext, at: ClaimCoords): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `Collateral claimed for this Trove — the ${d.symbol} its ${creditWord(d)} credited to the owner in the CollSurplusPool, paid out by this claim.`,
    contract: { name: "CollSurplusPool", address: d.pool },
    via: `the ${creditWord(d)}'s CollBalanceUpdated log for the owner, less the balance the pool held for them the block before; CollBalanceUpdated(owner, 0) at block ${at.blockNumber.toLocaleString("en-US")} is the claim`,
    source: { block: at.blockNumber, txHash: at.txHash },
    scaling: { raw: d.amountRaw, from: "log", places: d.decimals, why: `${d.symbol} has ${d.decimals} decimals` },
  };
}

/** Everything the claim paid out: the owner's whole pool balance. */
export function claimPaidProv(d: CollSurplusClaimContext, at: ClaimCoords): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `Paid to the owner — their whole ${d.symbol} balance in the CollSurplusPool, which claimCollateral() pays out in one call.`,
    contract: { name: "CollSurplusPool", address: d.pool },
    via: `the owner's CollBalanceUpdated log before the claim's CollBalanceUpdated(owner, 0) at block ${at.blockNumber.toLocaleString("en-US")}`,
    source: { block: at.blockNumber, txHash: at.txHash },
    ...(d.paidRaw != null
      ? {
          scaling: {
            raw: d.paidRaw,
            from: "log" as const,
            places: d.decimals,
            why: `${d.symbol} has ${d.decimals} decimals`,
          },
        }
      : {}),
  };
}

/** The part of the payout other Troves of the same owner had credited. */
export function claimOthersProv(d: CollSurplusClaimContext, others: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary: `Other Troves' surplus — collateral the owner's other Troves had left in the same pool, paid out by the same claim.`,
    formula: "paid to the owner − this Trove's surplus",
    inputs: [
      {
        label: "paid to the owner",
        value: `${formatNum(d.paid ?? 0, 4)} ${d.symbol}`,
        kind: "chain",
        pclass: "emitted",
      },
      {
        label: "this Trove's surplus",
        value: `${formatNum(d.amount, 4)} ${d.symbol}`,
        kind: "chain",
        pclass: "emitted",
      },
      { label: "result", value: `${formatNum(others, 4)} ${d.symbol}`, kind: "derived" },
    ],
  };
}
