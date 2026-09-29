// A Liquity-family Trove's collateral-surplus claim as a timeline row.
//
// The index records the credit (the liquidation, or on Liquity V1 also a full
// redemption) but not the claim: BorrowerOperations.claimCollateral() empties
// the owner's CollSurplusPool balance and emits nothing on the TroveManager.
// The coll-surplus read (lib/sources/chain/liquity-coll-surplus.ts) finds the
// claim's CollBalanceUpdated(owner, 0) log; this turns that answer into one
// event the page adds to its list before the timeline hook, so the row is
// numbered, filtered ("Claim collateral"), grouped and exported with the rest.
//
// The pool keeps one balance per owner, so one claim can pay out several
// Troves. The row states this Trove's own credited amount; `paid` carries the
// whole payout so the card can say when the claim covered other Troves too.

import type { BaseActivityEvent, CollSurplusClaimContext } from "@/lib/shared/types/event-shape";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import type { CollSurplusClaim } from "@/lib/sources/chain/liquity-coll-surplus";
import { shiftDecimal } from "@/components/shared/provenance";

/** The fields of a surplus read the row needs (the V2-family and V1 hooks'
 *  shapes both carry them). */
export interface ClaimSource {
  surplus: number;
  surplusRaw: string;
  /** Liquity V1's read leaves it out: ETH, 18. */
  decimals?: number;
  pool: string;
  claimed: CollSurplusClaim | null;
}

export function collSurplusClaimEvent(args: {
  source: ClaimSource | null | undefined;
  family: CollSurplusClaimContext["family"];
  protocolName: string;
  chainId: ChainId;
  symbol: string;
  owner: string | null | undefined;
  creditTx: string | null | undefined;
  creditKind: CollSurplusClaimContext["creditKind"];
  creditAt: number | null;
}): BaseActivityEvent | null {
  const { source, owner, creditTx } = args;
  const c = source?.claimed;
  // A claim no log dated (the provider refused the range) has no place on the
  // timeline; the card and the Explanation still say it was claimed.
  if (!source || !c || c.txHash == null || c.block == null || c.timestamp == null || !owner || !creditTx) return null;
  const paidRaw = c.paidRaw ?? null;
  const decimals = source.decimals ?? 18;
  const data: CollSurplusClaimContext = {
    family: args.family,
    protocolName: args.protocolName,
    symbol: args.symbol,
    decimals,
    pool: source.pool,
    owner: owner.toLowerCase(),
    amount: source.surplus,
    amountRaw: source.surplusRaw,
    paid: paidRaw != null ? Number(shiftDecimal(paidRaw, decimals)) : null,
    paidRaw,
    creditTx,
    creditKind: args.creditKind,
    creditAt: args.creditAt,
  };
  return {
    id: `${c.txHash}_${c.logIndex ?? 0}`,
    txHash: c.txHash,
    blockNumber: c.block,
    timestamp: c.timestamp,
    wallet: owner.toLowerCase(),
    actionType: "claimCollateral",
    actionLabel: "Claim collateral",
    flows: [
      {
        token: "",
        tokenSymbol: args.symbol,
        tokenDecimals: decimals,
        amount: source.surplusRaw,
        amountFormatted: source.surplus,
        direction: "in",
        counterparty: source.pool,
      },
    ],
    etherscanUrl: `${chainMeta(args.chainId).explorerBase}/tx/${c.txHash}`,
    context: { protocol: "liquity-coll-surplus-claim", data },
  };
}

/** Whether the claim also paid out other Troves' surplus (more than dust
 *  above this Trove's own amount). */
export function claimCoveredOthers(d: CollSurplusClaimContext): boolean {
  if (d.paidRaw == null) return false;
  const others = BigInt(d.paidRaw) - BigInt(d.amountRaw);
  // Dust: below a millionth of a token.
  const dust = BigInt(10) ** BigInt(Math.max(d.decimals - 6, 0));
  return others > dust;
}

/** The other Troves' part of the payout, in token units and as an integer. */
export function claimOthers(d: CollSurplusClaimContext): { value: number; raw: string } | null {
  if (!claimCoveredOthers(d) || d.paidRaw == null) return null;
  const raw = (BigInt(d.paidRaw) - BigInt(d.amountRaw)).toString();
  return { value: Number(shiftDecimal(raw, d.decimals)), raw };
}

/** The claim row's action cell in a Markdown export. */
export function claimMarkdownLabel(d: CollSurplusClaimContext): string {
  const amt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  const others = claimOthers(d);
  return (
    `Claim collateral: ${amt(d.amount)} ${d.symbol}` +
    (others && d.paid != null ? ` (one claim of ${amt(d.paid)} ${d.symbol} with other Troves' surplus)` : "")
  );
}
