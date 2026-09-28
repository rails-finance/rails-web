// Receipts for the terminal Trove card's "Claimable collateral" figure and its
// USD — the collateral surplus a liquidation left in the branch's
// CollSurplusPool, read at the head (lib/sources/chain/liquity-coll-surplus.ts).
// Shared by every Liquity-family explorer.

import type { Provenance } from "@/components/shared/provenance";
import type { LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";
import { formatNum, formatUsd } from "@/lib/shared/format-event";

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
