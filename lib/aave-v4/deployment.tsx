"use client";

// Which Aave V4 deployment a page is describing — Ethereum (the four hubs,
// thirteen spokes) or Base (the Equities hub's Mag7 spoke). The explorer's
// components are shared; what differs between the two is where they read
// (the api root and the oracle route), which roster session they file under,
// where their links go and which chain an explorer link names. One object,
// provided by the route's layout, defaulting to Ethereum so every existing
// surface is unchanged. Same seam as lib/aave-v3/card-deployment.tsx.

import { createContext, useContext, type ReactNode } from "react";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import {
  AAVE_V4_API_ROOT,
  AAVE_V4_BASE_API_ROOT,
  AAVE_V4_BASE_ORACLE_ROUTE,
  AAVE_V4_ORACLE_ROUTE,
} from "@/lib/aave-v4/deployment-routes";

export interface AaveV4Deployment {
  key: "ethereum" | "base";
  chainId: ChainId;
  /** The roster session the wallet pill, bookmarks and back links file under. */
  session: SessionProtocol;
  /** e.g. "/api/aave-v4" — the fetchers append /timeline, /positions, … */
  apiRoot: string;
  /** The on-chain oracle map's route. */
  oracleRoute: string;
  /** The explorer's own route, e.g. "/ethereum/aave-v4". */
  basePath: string;
  /** Words that name the network in copy where it matters ("on Base"). */
  networkPhrase: string;
}

export const ETHEREUM_AAVE_V4: AaveV4Deployment = {
  key: "ethereum",
  chainId: MAINNET_CHAIN_ID,
  session: "aave-v4",
  apiRoot: AAVE_V4_API_ROOT,
  oracleRoute: AAVE_V4_ORACLE_ROUTE,
  basePath: "/ethereum/aave-v4",
  networkPhrase: "on Ethereum",
};

export const BASE_AAVE_V4: AaveV4Deployment = {
  key: "base",
  chainId: BASE_CHAIN_ID,
  session: "aave-v4-base",
  apiRoot: AAVE_V4_BASE_API_ROOT,
  oracleRoute: AAVE_V4_BASE_ORACLE_ROUTE,
  basePath: "/base/aave-v4",
  networkPhrase: "on Base",
};

const Ctx = createContext<AaveV4Deployment>(ETHEREUM_AAVE_V4);

export function AaveV4DeploymentProvider({ value, children }: { value: AaveV4Deployment; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAaveV4Deployment(): AaveV4Deployment {
  return useContext(Ctx);
}
