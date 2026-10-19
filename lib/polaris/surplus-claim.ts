// A liquidated CDP's collateral surplus and what became of it: the state the
// card's surplus line and the liquidation row's explanation both say, and the
// receipts for their figures.
//
// The server (rails-server `/api/polaris/timeline`, top-level `surplus`)
// reads the market's CollSurplusPool: the liquidation credits the owner
// (`SurplusAccounted`), and a later `CollSurplusClaimed` pays the owner's whole
// balance. The pool keeps one balance per owner, so one claim can pay several
// credits; the claim's amount is then larger than this liquidation's credit.
// The timeline carries the owner's first claim after the credit, or null, and
// the block the pool has been read to (`scanned_to_block`). A null claim means
// "unclaimed" only where that block reaches the liquidation.

import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import type { PolarisSurplusContext } from "@/lib/shared/types/event-shape";
import { POLARIS_CHAIN_ID, type PolarisMarket } from "@/lib/polaris/asset-catalog";

/** Each market's own CollSurplusPool (`cdpManager.collSurplusPool()`). */
export const POLARIS_SURPLUS_POOL: Record<PolarisMarket, string> = {
  usdp: "0x7ee20c8ab2cc3a83fc688db395820efcb137d52d",
  goldp: "0xb651b6e343e6a8341d9ba1c32bbd291ccaeb8c7c",
};

export type PolarisSurplusState = "claimed" | "unclaimed" | "unread";

/** What the timeline says became of the surplus. No `surplus` field at all
 *  (an older server) reads as "unread". */
export function polarisSurplusState(s: PolarisSurplusContext | null | undefined): PolarisSurplusState {
  if (s?.claim) return "claimed";
  return s?.read ? "unclaimed" : "unread";
}

/** The header leg's label for the surplus, by what became of it. */
export function polarisSurplusLabel(s: PolarisSurplusContext | null | undefined): "Claimed" | "Claimable" | "Surplus" {
  const state = polarisSurplusState(s);
  return state === "claimed" ? "Claimed" : state === "unclaimed" ? "Claimable" : "Surplus";
}

/** The claim paid more than this liquidation's credit: other credits sat in
 *  the owner's balance, and a claim pays the whole balance. */
export function polarisClaimPaidWholeBalance(s: PolarisSurplusContext): boolean {
  if (!s.claim) return false;
  try {
    return BigInt(s.claim.amountRaw) > BigInt(s.creditRaw);
  } catch {
    return false;
  }
}

/** Where a surplus figure is read from: the liquidation's own coordinates. */
export interface PolarisSurplusCoords {
  market: PolarisMarket;
  cdpId: string;
  /** The liquidation's transaction and block. */
  txHash?: string;
  blockNumber?: number;
}

const poolOf = (market: PolarisMarket) => ({
  name: `Polaris ${market === "usdp" ? "USDp" : "GOLDp"} CollSurplusPool`,
  address: POLARIS_SURPLUS_POOL[market],
});

const API = "rails-server /api/polaris/timeline";

/** The credit: the pETH the liquidation left in the owner's balance in the
 *  market's CollSurplusPool. */
export function polarisSurplusCreditProv(coords: PolarisSurplusCoords, s: PolarisSurplusContext): Provenance {
  const state = polarisSurplusState(s);
  const blockPart = ` at block ${s.creditBlock.toLocaleString("en-US")}`;
  return {
    kind: "chain",
    pclass: "indexed",
    summary: `The pETH the liquidation credited to the owner in the market's CollSurplusPool${blockPart}: the SurplusAccounted log's amount, equal to the Liquidation log's \`_collSurplus\`. The index serves it as \`credit_amount\`.`,
    contract: poolOf(coords.market),
    via: `${API} · surplus.liquidations[].credit_amount (SurplusAccounted, owner ${s.owner})`,
    ...(coords.txHash
      ? {
          verify: {
            kind: "etherscan" as const,
            href: explorerUrl(POLARIS_CHAIN_ID, "tx-logs", coords.txHash),
            text: "Confirm in the tx event logs (Sepolia Etherscan)",
          },
        }
      : {}),
    source: { block: s.creditBlock, ...(coords.txHash ? { txHash: coords.txHash } : {}) },
    scaling: { raw: s.creditRaw, from: "log", places: 18, why: "pETH has 18 decimals" },
    inputs: [
      { label: "owner", value: s.owner, kind: "chain", note: "SurplusAccounted._owner" },
      ...(state === "claimed" && s.claim
        ? [
            {
              label: "claimed",
              value: `${s.claim.amount} pETH`,
              kind: "chain" as const,
              pclass: "indexed" as const,
              note: `surplus.liquidations[].claim_amount, block ${s.claim.block.toLocaleString("en-US")}`,
            },
          ]
        : [
            {
              label: "pool read to block",
              value: s.scannedToBlock.toLocaleString("en-US"),
              kind: "chain" as const,
              pclass: "indexed" as const,
              note: "surplus.scanned_to_block",
            },
          ]),
    ],
  };
}

/** The claim: when the owner's CollSurplusClaimed fired, from the log's block time. */
export function polarisSurplusClaimProv(coords: PolarisSurplusCoords, s: PolarisSurplusContext): Provenance | null {
  const c = s.claim;
  if (!c) return null;
  return {
    kind: "chain",
    pclass: "indexed",
    summary: `When the owner claimed: the block time of the pool's CollSurplusClaimed log at block ${c.block.toLocaleString("en-US")}, the owner's first claim after the credit. A claim pays the owner's whole balance in the pool. The index serves it as \`claim_timestamp\`.`,
    contract: poolOf(coords.market),
    via: `${API} · surplus.liquidations[].claim_timestamp, claim_tx_hash, claim_amount (CollSurplusClaimed)`,
    verify: {
      kind: "etherscan",
      href: explorerUrl(POLARIS_CHAIN_ID, "tx-logs", c.txHash),
      text: "Confirm in the tx event logs (Sepolia Etherscan)",
    },
    source: { block: c.block, txHash: c.txHash, timestamp: String(c.timestamp) },
    inputs: [
      { label: "claimed", value: `${c.amount} pETH`, kind: "chain", pclass: "indexed", note: "claim_amount" },
      { label: "tx", value: c.txHash, kind: "chain", note: "claim_tx_hash" },
      { label: "sender", value: c.from, kind: "chain", note: "claim_tx_from" },
    ],
  };
}

/** The read position of the pool, behind the liquidation: the state is not known. */
export function polarisSurplusUnreadProv(
  coords: PolarisSurplusCoords,
  s: PolarisSurplusContext | undefined,
): Provenance {
  return {
    kind: "chain",
    pclass: "indexed",
    summary:
      "Claim state not read yet. The pool's claims have been read only to a block before this liquidation. The index serves that block as `scanned_to_block`.",
    contract: poolOf(coords.market),
    via: `${API} · surplus.scanned_to_block`,
    inputs: [
      {
        label: "pool read to block",
        value: s ? s.scannedToBlock.toLocaleString("en-US") : "not served",
        kind: "chain",
        pclass: "indexed",
        note: "surplus.scanned_to_block",
      },
      ...(coords.blockNumber != null
        ? [
            {
              label: "liquidation block",
              value: coords.blockNumber.toLocaleString("en-US"),
              kind: "chain" as const,
              note: "Liquidation log",
            },
          ]
        : []),
    ],
  };
}
