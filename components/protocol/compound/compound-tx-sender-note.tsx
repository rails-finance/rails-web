"use client";

// The third-party sentence on a Comet supply row, read against the chain. A
// row the owner neither signed nor funded is usually one of two things:
// a smart-account wallet (ERC-4337), whose transaction a bundler sends for it,
// or a supply routed through Compound's Bulker, which names itself as the
// funder. The transaction's receipt settles the first
// (app/api/chain/compound/tx-sender: a UserOperationEvent naming the
// account); the Bulker's address settles the second (lib/compound/bulkers.ts).

import { useEffect, useState } from "react";
import { LinkedAddress } from "@/components/shared/linked-address";
import { isCompoundBulker } from "@/lib/compound/bulkers";
import { BASE_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export function CompoundTxSenderNote({
  txHash,
  account,
  actor,
  funder,
  chainId,
  isBaseSupply,
}: {
  txHash?: string;
  account: string;
  /** The transaction's sender. */
  actor: string;
  /** The event's `from`: who provided the tokens. */
  funder: string;
  chainId?: ChainId;
  isBaseSupply: boolean;
}) {
  const [ownOp, setOwnOp] = useState(false);
  useEffect(() => {
    if (!txHash) return;
    const ac = new AbortController();
    const deployment = chainId === BASE_CHAIN_ID ? "base" : "ethereum";
    fetch(`/api/chain/compound/tx-sender?deployment=${deployment}&tx=${txHash}&account=${account}`, {
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { userOpSender: string | null } | null) => setOwnOp(!!d?.userOpSender))
      .catch(() => {});
    return () => ac.abort();
  }, [txHash, account, chainId]);

  const bulker = isCompoundBulker(funder, chainId);
  const tokens = bulker ? (
    <>
      . The tokens came through Compound&rsquo;s Bulker, <LinkedAddress address={funder} chainId={chainId} />, a
      contract that bundles Comet actions and wraps ETH into WETH before supplying it
    </>
  ) : funder === actor ? (
    <> and provided the tokens</>
  ) : (
    <>
      , and the tokens came from <LinkedAddress address={funder} chainId={chainId} />
    </>
  );

  if (ownOp) {
    return (
      <>
        The wallet is a smart account (ERC-4337): it signed this as a user operation, and{" "}
        <LinkedAddress address={actor} chainId={chainId} />, a bundler, sent it to the chain, so the owner acted here
        {tokens}.
      </>
    );
  }
  return (
    <>
      Another account, <LinkedAddress address={actor} chainId={chainId} />, sent this transaction{tokens}.{" "}
      {isBaseSupply ? "Anyone may repay or add to a Comet account" : "Anyone may add collateral to a Comet account"}{" "}
      without the owner&rsquo;s consent; taking value out needs the owner&rsquo;s authorisation, which the ? on this row
      explains.
    </>
  );
}
