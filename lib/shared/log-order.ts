// The order of logs within a block, where a change log meets an account's
// events (rails-ops architecture/data-source-architecture.md, "Change logs
// and account events: by block, transaction and log"; Miles, 29 Oct 2026).
// ----------------------------------------------------------------------------
// rails-server's change-log routes answer each log's transaction index
// (`transactionIndex`) and its place in the transaction (`logIndex`), as the
// mainnet Sieve keeps them; an account event from a node or the index
// carries the block's logIndex and its transaction's index. Ordered by block,
// then transaction, then logIndex, both read the same: the chain's order.
// Within one transaction the two logIndexes are compared only where the rows
// are of one kind (a change log and an account's switch never share a
// transaction: a configurator answers only the protocol's admins, a switch
// is the account's own call).
//
// A row without a transactionIndex (an answer cached before the field) is
// ordered by block and logIndex alone, as before.
//
// Pure.

export interface LogPlace {
  block: number;
  /** The transaction's index in the block. */
  transactionIndex?: number;
  logIndex: number;
}

/** Negative where `a` came first. */
export function logOrder(a: LogPlace, b: LogPlace): number {
  return (
    a.block - b.block ||
    (a.transactionIndex != null && b.transactionIndex != null ? a.transactionIndex - b.transactionIndex : 0) ||
    a.logIndex - b.logIndex
  );
}
