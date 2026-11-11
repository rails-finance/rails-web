"use client";

// Focus mode (ui-jobs 557) on the Uniswap-family explorers on Base and
// Arbitrum (ui-jobs 568, 573, 575): a position page is gated by its two tokens
// (`AimGate`, as a vault or holding page is), and a wallet's rows keep the
// positions whose tokens are in focus. A pool's native side (address(0))
// counts as the chain's wrapped token, the address the token tables name.
// Imported by those explorers' route pages only.

import type { ReactNode } from "react";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { uniDeployment, type UniChainId, type UniProtocol } from "@/lib/uniswap/deployments";

const ZERO = "0x0000000000000000000000000000000000000000";

/** The focus keys of a pool's tokens on a chain. */
function tokenKeys(tokens: string[], protocol: UniProtocol, chain: UniChainId): string[] {
  const wrapped = uniDeployment(protocol, chain).wrapped.address;
  return tokens.map((t) => assetKey(chain, t.toLowerCase() === ZERO ? wrapped : t));
}

/** A position page, drawn only where one of its tokens is in focus. */
export function UniswapPositionFocus({
  tokens,
  protocol,
  chain,
  children,
}: {
  /** Null where the read did not answer: the page is not gated. */
  tokens: string[] | null;
  protocol: UniProtocol;
  chain: UniChainId;
  children: ReactNode;
}) {
  if (!tokens) return <>{children}</>;
  return (
    <AimGate keys={tokenKeys(tokens, protocol, chain)} chain={chain} what="This position">
      {children}
    </AimGate>
  );
}

/** A wallet's row, drawn only where one of its tokens is in focus. */
export function UniswapRowFocus({
  tokens,
  protocol,
  chain,
  children,
}: {
  tokens: string[];
  protocol: UniProtocol;
  chain: UniChainId;
  children: ReactNode;
}) {
  const scope = useAssetScope();
  if (!scope.ready) return <>{children}</>;
  return scope.matches(tokenKeys(tokens, protocol, chain), chain) ? <>{children}</> : null;
}
