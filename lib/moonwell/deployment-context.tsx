"use client";

// WHICH Moonwell deployment is the surrounding page about?
// ----------------------------------------------------------------------------
// Every Moonwell explorer renders the same event cards, and each card's
// provenance receipt names the contract the value came from — the market's
// mToken — and links the transaction on a block explorer. Both were resolved
// through a module constant: the Ethereum catalog for the mToken, Etherscan
// for the link. That was right for exactly one of the two deployments now
// using the cards.
//
// On Base the catalog knows none of the markets (there are twenty-one, and
// governance keeps listing more, so nothing is written down — the market KEY
// is the mToken address itself), which left every receipt naming the zero
// address as its contract; and the verify link pointed a Base transaction at
// Etherscan, a "confirm it yourself" that confirms nothing. So the deployment
// is a property of the route, read from context exactly as the chain is, and
// it answers the one question the cards ask: given a market key, which
// receipt token and which contract is that?
//
// The default is Ethereum's catalog AND THE ETHEREUM PAGE MOUNTS NO PROVIDER,
// so every existing receipt renders what it rendered before this existed.

import { createContext, useContext, type ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useChainId } from "@/lib/shared/chain-context";
import type { SessionProtocol } from "@/lib/shared/sessions";
import type { MoonwellBorrowAmount, MoonwellSupplyAmount } from "@/lib/sources/api/moonwell-positions";
import { MOONWELL_ADDRESSES, MOONWELL_MARKET_BY_KEY } from "./asset-catalog";
import {
  avgBorrowRateProv,
  borrowRateProv,
  moonwellInterestCaptionProv,
  moonwellUsdProvOnchain,
  peakDebtProv,
  peakSupplyProv,
  positionDebtProv,
  positionSupplyCurrentProv,
  positionSupplyPrincipalProv,
  type MoonwellCoords,
} from "./event-provenance";
import { MOONWELL_ETHEREUM_LANE, moonwellLiveDebtProv } from "./position-provenance";

/** The receipts behind the POSITION CARD's figures — where each number on the
 *  card face came from on this deployment. Ethereum's describe the index's
 *  replay upgraded by the page's live reads; a Base lender's describe live
 *  reads pinned to a block and a sweep of the chain's own logs. The card is
 *  deployment-blind and asks these instead of importing either. */
export interface MoonwellCardReceipts {
  supply: (r: MoonwellSupplyAmount, market: MoonwellMarketIdentity) => Provenance;
  debt: (r: MoonwellBorrowAmount, market: MoonwellMarketIdentity) => Provenance;
  usd: (what: string) => Provenance;
  interest: (side: "supply" | "debt", live?: boolean) => Provenance;
  borrowRate: (symbol?: string) => Provenance;
  avgBorrowRate: () => Provenance;
  peakSupply: (symbol: string) => Provenance;
  peakDebt: (symbol: string) => Provenance;
}

export interface MoonwellMarketIdentity {
  /** The receipt token's label — "mWETH". */
  mSymbol: string;
  /** The market's mToken contract, when the deployment can name it. */
  mtoken?: string;
}

export interface MoonwellDeploymentIdentity {
  /** The session the wallet pill filters and bookmarks under. */
  session: SessionProtocol;
  /** This deployment's Comptroller — the contract the account verdict and
   *  the capacity line cite. */
  comptroller: { name: string; address: string };
  /** The route the page's live position read came through, for the receipts'
   *  custody line. */
  positionRoute: string;
  /** The WETH Router that proxies native-ETH flows on this deployment. */
  router: string;
  /** Resolve a market key, as events and position rows carry it, to its
   *  identity. `symbol` is the underlying's display symbol, for a label when
   *  the key alone cannot give one. */
  market: (key: string, symbol?: string) => MoonwellMarketIdentity;
  /** The position card's receipts on this deployment. */
  card: MoonwellCardReceipts;
}

/** Ethereum: four fixed markets, keyed by the index's own tags; the card's
 *  figures are the index's replay, the debt upgraded to the live read. */
export const MOONWELL_ETHEREUM_IDENTITY: MoonwellDeploymentIdentity = {
  session: "moonwell",
  comptroller: MOONWELL_ETHEREUM_LANE.comptroller,
  positionRoute: MOONWELL_ETHEREUM_LANE.positionRoute,
  router: MOONWELL_ADDRESSES.WETH_ROUTER,
  market: (key, symbol) => {
    const m = MOONWELL_MARKET_BY_KEY[key];
    return m ? { mSymbol: m.mSymbol, mtoken: m.mtoken } : { mSymbol: `m${symbol ?? key.toUpperCase()}` };
  },
  card: {
    supply: (r, m) =>
      r.current != null ? positionSupplyCurrentProv(r.symbol, m.mSymbol) : positionSupplyPrincipalProv(r.symbol),
    debt: (r, m) => (r.live ? moonwellLiveDebtProv(r.symbol, m.mSymbol, m.mtoken) : positionDebtProv(r.symbol)),
    usd: moonwellUsdProvOnchain,
    interest: moonwellInterestCaptionProv,
    borrowRate: borrowRateProv,
    avgBorrowRate: avgBorrowRateProv,
    peakSupply: peakSupplyProv,
    peakDebt: peakDebtProv,
  },
};

const MoonwellDeploymentContext = createContext<MoonwellDeploymentIdentity>(MOONWELL_ETHEREUM_IDENTITY);

export function MoonwellDeploymentProvider({
  value,
  children,
}: {
  value: MoonwellDeploymentIdentity;
  children: ReactNode;
}) {
  return <MoonwellDeploymentContext.Provider value={value}>{children}</MoonwellDeploymentContext.Provider>;
}

/** The deployment this page's values came from; Ethereum's by default. */
export function useMoonwellDeployment(): MoonwellDeploymentIdentity {
  return useContext(MoonwellDeploymentContext);
}

/** The receipt coordinates every Moonwell card builds — the market's identity
 *  from this deployment, and the chain, capture source and router the
 *  surrounding page declares. One place, so the four card components cannot
 *  drift on which facts a receipt carries. */
export function useMoonwellCoords(p: {
  market: string;
  symbol?: string;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
}): MoonwellCoords {
  const dep = useMoonwellDeployment();
  const chainId = useChainId();
  const source = useCaptureSource();
  const id = dep.market(p.market, p.symbol);
  return {
    txHash: p.txHash,
    blockNumber: p.blockNumber,
    mtoken: id.mtoken,
    marketLabel: id.mSymbol,
    account: p.wallet,
    chainId,
    source,
    router: dep.router,
  };
}
