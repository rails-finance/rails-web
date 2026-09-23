"use client";

// WHICH Comet deployment is the surrounding page about?
// ----------------------------------------------------------------------------
// Every Compound V3 event card resolves its market's identity — the Comet proxy
// address the receipt names, the label, the base asset — from the slug the
// event context carries (`ctx.market`), through `marketOf()`. That lookup was
// hard-wired to the ETHEREUM roster, which was right for exactly one of the
// surfaces now rendering the cards.
//
// On Base it is wrong in the worst way: the slugs COLLIDE. Base's cUSDCv3 is
// keyed `usdc` like Ethereum's, so a Base event card would name Ethereum's
// Comet address in its receipt and render it as a Basescan link — a "verify it
// yourself" pointer at a contract that does not exist on that chain. Nothing
// about the rendered card would look wrong.
//
// So the roster is a property of the route, read from context exactly as the
// chain is (lib/shared/chain-context) and as the V3 Pool is for the Aave
// family (lib/aave-v3/pool-context). The default is Ethereum's deployment AND
// THE ETHEREUM PAGES MOUNT NO PROVIDER, so every existing card resolves the
// exact entry it resolved before this existed.

import { createContext, useContext, type ReactNode } from "react";
import { COMPOUND_DEPLOYMENT, marketOf, type CometDeployment, type CometMarket } from "./asset-catalog";

const CometDeploymentContext = createContext<CometDeployment>(COMPOUND_DEPLOYMENT);

export function CometDeploymentProvider({
  deployment,
  children,
}: {
  deployment: CometDeployment;
  children: ReactNode;
}) {
  return <CometDeploymentContext.Provider value={deployment}>{children}</CometDeploymentContext.Provider>;
}

/** Resolve a market slug against the deployment this page is about. Falls
 *  back to `marketOf`'s synthetic entry for a slug the roster has never seen,
 *  exactly as the Ethereum cards always have. */
export function useCometMarket(slug: string): CometMarket {
  const deployment = useContext(CometDeploymentContext);
  return deployment.markets.find((m) => m.key === slug) ?? marketOf(slug);
}
