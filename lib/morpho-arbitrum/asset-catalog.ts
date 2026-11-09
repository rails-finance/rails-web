// Morpho Blue on Arbitrum One — the deployment's identity (rails-ops
// TO-DO-arbitrum-scoping.md item 13, Phase 0, read on Tenderly's Arbitrum
// gateway 2026-10-19). Small on purpose: client components import it, and the
// 258-market census beside it (market-catalog.ts) stays on the server.
//
// Unlike Ethereum and Base, Blue on Arbitrum is not at the 0xBBBB… vanity
// address: Etherscan's getcontractcreation names 0x6c24…8F5e, created by a
// CREATE2 deployer in tx 0x886ea901…f66e.

import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";

/** The Morpho Blue singleton on Arbitrum One. */
export const MORPHO_ARBITRUM_BLUE = "0x6c247b1f6182318877311737bac0844baa518f5e" as const;

/** The Adaptive Curve IRM; `MORPHO()` answers the singleton above. */
export const MORPHO_ARBITRUM_IRM = "0x66f30587fb8d4206918deb78eca7d5ebbafd06da" as const;

/** The MetaMorpho V1.1 factory (block 296,447,195; 111 CreateMetaMorpho logs
 *  at Phase 0). No V1.0 factory is listed for Arbitrum. */
export const MORPHO_ARBITRUM_METAMORPHO_FACTORY = "0x878988f5f561081deea117717052164ea1ef0c82" as const;

/** The chain every address here lives on. */
export const MORPHO_ARBITRUM_CHAIN_ID = ARBITRUM_CHAIN_ID;

/** The singleton's creation block (2025-01-17). The history rails-server
 *  serves runs from here, which is what lets it claim a whole life. */
export const MORPHO_ARBITRUM_DEPLOY_BLOCK = 296_446_593;
