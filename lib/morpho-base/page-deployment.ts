// Morpho Blue on Base as the wallet-first pages draw it (the shape is
// lib/morpho/page-deployment.ts). The strings and routes are the ones these
// pages carried before the lift.

import type { MorphoPageDeployment } from "@/lib/morpho/page-deployment";
import { morphoSweepWhole } from "@/lib/morpho/page-deployment";
import { MORPHO_BASE_CHAIN_ID } from "./asset-catalog";
import { morphoBasePositionHref, morphoBaseWalletHref } from "./routes";
import { MORPHO_BASE_POSITIONS_ROUTE } from "./list-filter-dimensions";

export const MORPHO_BASE_PAGE: MorphoPageDeployment = {
  session: "morpho-base",
  chainId: MORPHO_BASE_CHAIN_ID,
  routes: {
    wallet: "/api/chain/morpho-base/wallet",
    timeline: "/api/chain/morpho-base/timeline",
    folder: "/api/chain/morpho-base/timeline/folder",
  },
  walletHref: morphoBaseWalletHref,
  positionHref: morphoBasePositionHref,
  positionsRoute: MORPHO_BASE_POSITIONS_ROUTE,
  liveCustody:
    "read live from the Morpho singleton at the head block the card names, served by GET /api/chain/morpho-base/wallet",
  sourceLabel: "the Morpho Blue singleton on Base",
  name: "Morpho Blue on Base",
  explorerDeployment: "base",
  wholeOf: morphoSweepWhole,
  grouped: true,
  vaultHoldings: true,
  words: {
    reading:
      "Reading this wallet’s whole history from the singleton’s logs — the sweep runs from the contract’s first block, so it takes a moment.",
    untouchedTitle: "This wallet has never touched Morpho Blue on Base.",
    untouchedBody: (n) =>
      `All ${n} markets were asked and none holds anything for this address, and the singleton has emitted no event naming it between its first block and now.`,
    emptyNowTitle: "This wallet holds nothing on Morpho Blue Base right now.",
    notWholeWallet:
      "The sweep could not read every block of this wallet’s history, so the position cards and the lifetime economics are withheld — a principal or an “all time” over a partial history would be a figure this page cannot stand behind. Each position’s page shows the history that was read and says where it stopped:",
    unswept: (which) =>
      `${which} the wallet holds something in had no event naming it in the sweep, which should not happen — a holding cannot arrive without one.`,
    wholeCount:
      "from every event the singleton has emitted for this wallet since its first block. Open one for its economics and whole history.",
    unavailableWallet:
      "The history endpoint isn't answering, so the timelines and the lifetime economics are unavailable. The positions above are read live from the singleton and are unaffected.",
    failedWallet:
      "The history sweep failed. Reload to try again — the positions above are read live from the singleton and are unaffected.",
    notWholePosition:
      "The history below is what the sweep could read; the note under the list says where it stopped or what it missed. The position card and the lifetime economics are withheld until a sweep reads every block, because a principal or an “all time” over a partial history would be a figure this page cannot stand behind. The card above, where there is one, is read live from the singleton and is unaffected.",
    heldNoEvent:
      "The wallet holds this position now, but the sweep found no event naming it in this market — which should not happen, since a holding cannot arrive without one. The card is the live read alone.",
    noPositionWhole: ", and has emitted no event naming it in that market between its first block and now.",
    noPositionPartial: ", and the sweep read no event naming it there — though the sweep did not read every block.",
    unavailablePosition:
      "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The card, where there is one, is read live from the singleton and is unaffected.",
    failedPosition:
      "The history sweep failed. Reload to try again — the card, where there is one, is read live from the singleton and is unaffected.",
    emptyNotWhole: "No events to show — the sweep could not read this wallet's history.",
  },
};
