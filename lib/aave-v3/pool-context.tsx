"use client";

// WHICH V3-family Pool is the surrounding page about?
// ----------------------------------------------------------------------------
// Every Aave-V3-shaped explorer renders the same event cards, and each card's
// provenance receipt names the contract the value came from. That name and
// address were a module constant — Ethereum's Core Pool — which was right for
// exactly one of the surfaces now using them.
//
// It was already slightly wrong on Ethereum: a Prime or EtherFi position's
// receipts named the Core Pool's address, because the market is a query
// parameter and the vocabulary is a module. It became clearly wrong when the
// cards were reused on Base, where the receipt rendered Ethereum's Pool address
// as a BASESCAN link — a "verify it yourself" pointer at a contract that does
// not exist on that chain. And it would get worse with each fork added: a
// Seamless position's receipts would name Aave's Pool.
//
// So the Pool is a property of the route, read from context exactly as the
// chain is. The default is Ethereum's Core Pool AND THE ETHEREUM PAGE STILL
// SETS IT EXPLICITLY per market, which is what fixes the older inaccuracy
// rather than merely not adding to it.

import { createContext, useContext, type ReactNode } from "react";
import { AAVE_V3_POOL } from "./asset-catalog";
import type { V3Protocol } from "./protocol-name";

export interface V3PoolIdentity {
  /** How the receipt names it — "Aave V3 Pool", "Seamless Pool". */
  name: string;
  address: string;
  /** Which protocol the prose names — "Supplied … to Seamless", "How
   *  Seamless Positions Work". Absent means Aave V3 (lib/aave-v3/protocol-name.ts). */
  protocol?: V3Protocol;
  /** The route this page's live Pool read came through, for the receipts'
   *  custody line — "/api/chain/seamless/position". Ethereum's when absent. */
  positionRoute?: string;
}

const CORE: V3PoolIdentity = { name: "Aave V3 Pool", address: AAVE_V3_POOL };

const V3PoolContext = createContext<V3PoolIdentity>(CORE);

export function V3PoolProvider({ pool, children }: { pool: V3PoolIdentity; children: ReactNode }) {
  return <V3PoolContext.Provider value={pool}>{children}</V3PoolContext.Provider>;
}

/** The Pool this page's values came from; Ethereum's Core Pool by default. */
export function useV3Pool(): V3PoolIdentity {
  return useContext(V3PoolContext);
}
