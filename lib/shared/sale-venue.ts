// The registry contracts whose transfer out may be a sale (rails-ops
// TO-DO-ui-jobs 438): a router or a settlement contract pays the bought token
// back in the same transaction. The reading of the receipt is
// lib/shared/tx-legs.ts.

import type { ChainId } from "@/lib/shared/chains";
import { getProtocolContract, type ProtocolContract } from "@/lib/shared/known-infrastructure";

const SALE_KINDS: ReadonlySet<ProtocolContract["kind"]> = new Set(["router", "settlement"]);

/** The contract a transfer out went to, where its kind qualifies the row for
 *  a receipt read; undefined for every other counterparty, which makes no
 *  read. */
export function saleVenue(counterparty: string | null | undefined, chainId: ChainId): ProtocolContract | undefined {
  const named = getProtocolContract(counterparty, chainId);
  return named && SALE_KINDS.has(named.kind) ? named : undefined;
}
