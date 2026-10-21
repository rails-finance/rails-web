// Morpho Blue on Arbitrum as the wallet-first pages draw it (the shape is
// lib/morpho/page-deployment.ts). Two things set it apart from Base (rails-ops
// TO-DO-arbitrum-scoping.md item 13):
//   • the history is one read of rails-server's store, served flat; nothing is
//     swept and there are no folders;
//   • a whole life also needs the store's rows confirmed by a second chain
//     witness, so an unconfirmed or disputed history holds back the position
//     cards, the lifetime flows and the "never touched" claim.

import type { MorphoPageDeployment } from "@/lib/morpho/page-deployment";
import { MORPHO_ARBITRUM_CHAIN_ID } from "./asset-catalog";
import { morphoArbitrumPositionHref, morphoArbitrumWalletHref } from "./routes";
import { morphoArbitrumWholeLife } from "./whole-life";

export const MORPHO_ARBITRUM_PAGE: MorphoPageDeployment = {
  session: "morpho-arbitrum",
  chainId: MORPHO_ARBITRUM_CHAIN_ID,
  routes: {
    wallet: "/api/chain/morpho-arbitrum/wallet",
    timeline: "/api/chain/morpho-arbitrum/timeline",
    folder: null,
  },
  walletHref: morphoArbitrumWalletHref,
  positionHref: morphoArbitrumPositionHref,
  positionsRoute: "/api/chain/morpho-arbitrum/wallet",
  liveCustody:
    "read live from the Morpho singleton at the block the card names, served by GET /api/chain/morpho-arbitrum/wallet",
  sourceLabel: "the Morpho Blue singleton on Arbitrum",
  name: "Morpho Blue on Arbitrum",
  explorerDeployment: "arbitrum",
  wholeOf: morphoArbitrumWholeLife,
  grouped: false,
  askUntilWhole: true,
  vaultHoldings: false,
  words: {
    reading: "Reading this wallet’s history from Rails’ store of the singleton’s logs.",
    untouchedTitle: "This wallet has never touched Morpho Blue on Arbitrum.",
    untouchedBody: (n) =>
      `All ${n} markets were asked and none holds anything for this address, and the singleton has emitted no event naming it between its first block and now.`,
    emptyNowTitle: "This wallet holds nothing on Morpho Blue Arbitrum right now.",
    notWholeWallet:
      "This wallet’s history is not yet confirmed against the chain, so the position cards and the lifetime economics wait for it. Each position’s page shows the history read so far, and the line under its timeline says how far the check has reached:",
    unswept: (which) =>
      `${which} the wallet holds something in had no event naming it in the history read, which should not happen — a holding cannot arrive without one.`,
    wholeCount:
      "from every event the singleton has emitted for this wallet since its first block, confirmed against the chain. Open one for its economics and whole history.",
    unavailableWallet:
      "The history store isn't answering, so the timelines and the lifetime economics are unavailable. The positions above are read live from the singleton and are unaffected.",
    failedWallet:
      "The history read failed. Reload to try again — the positions above are read live from the singleton and are unaffected.",
    overBudgetWallet: (when) =>
      `This reader has asked for more histories than Rails’ store answers in a minute, so the timelines and the lifetime economics wait. The page asks again ${when}. The positions above are read live from the singleton and are unaffected.`,
    notWholePosition:
      "The history below is what Rails’ store holds, not yet confirmed against the chain; the line under the list says how far the check has reached. The position card and the lifetime economics wait for it. The card above, where there is one, is read live from the singleton and is unaffected.",
    heldNoEvent:
      "The wallet holds this position now, but the history read has no event naming it in this market — which should not happen, since a holding cannot arrive without one. The card is the live read alone.",
    noPositionWhole: ", and has emitted no event naming it in that market between its first block and now.",
    noPositionPartial: ", and the history read so far has no event naming it there; that history is not yet confirmed.",
    unavailablePosition:
      "The history store isn't answering, so the timeline and the lifetime economics are unavailable. The card, where there is one, is read live from the singleton and is unaffected.",
    failedPosition:
      "The history read failed. Reload to try again — the card, where there is one, is read live from the singleton and is unaffected.",
    overBudgetPosition: (when) =>
      `This reader has asked for more histories than Rails’ store answers in a minute, so the timeline and the lifetime economics wait. The page asks again ${when}. The card, where there is one, is read live from the singleton and is unaffected.`,
    emptyNotWhole: "No events in the history read so far; the line under the list says what it rests on.",
    firstRead: {
      reading:
        "Rails is reading this wallet’s history for the first time, from the singleton’s logs. That takes a minute or two, and the page asks again until it lands.",
      still: "Rails is still reading this wallet’s history for the first time. Reload in a minute to see it.",
    },
  },
};
