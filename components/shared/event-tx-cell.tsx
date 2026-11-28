"use client";

// T2's transaction cell, every family's (ui-jobs 878): the short hash, a
// LinkedValue (anatomy L14) to the transaction on the chain's explorer whose
// tooltip reads "Transaction 0x5c50…2060", then "View on Etherscan ↗"; under
// it the block, a BlockRef to the block's page there, with the block's
// receipt where the family passes one.

import { BlockRef } from "@/components/shared/block-ref";
import { LinkedValue } from "@/components/shared/linked-value";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { EventStatCellSpec } from "@/components/shared/event-cells";
import type { ChainId } from "@/lib/shared/chains";

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function txCell({
  txHash,
  block,
  chainId,
  info,
  key = "tx",
  label = "Transaction",
  sub,
}: {
  txHash: string;
  block: number | string;
  chainId: ChainId;
  /** The block's receipt. */
  info?: Provenance;
  /** CoW's cell is "settlement", headed "Settlement". */
  key?: string;
  label?: string;
  sub?: EventStatCellSpec["sub"];
}): EventStatCellSpec {
  const blockRef = <BlockRef block={Number(block)} chainId={chainId} size={12} />;
  return {
    kind: "stat",
    key,
    label,
    changed: false,
    value: {
      lines: [
        <LinkedValue
          key="tx"
          explorer={{ chainId, kind: "tx", value: txHash }}
          context={`Transaction ${short(txHash)}`}
          label={`Transaction ${short(txHash)}`}
          className="link-muted font-mono text-xs"
        >
          {short(txHash)} ↗
        </LinkedValue>,
        <span key="block" className="text-xs text-rb-500">
          Block{" "}
          {info ? (
            <Prov info={info} value={String(block)}>
              {blockRef}
            </Prov>
          ) : (
            blockRef
          )}
        </span>,
      ],
    },
    ...(sub ? { sub } : {}),
  };
}
