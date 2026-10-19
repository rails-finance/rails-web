// Compound V3 on Arbitrum as the wallet page draws it (the shape is
// lib/compound/page-deployment.ts). Two things set it apart from Base
// (rails-ops TO-DO-arbitrum-scoping.md item 12):
//   • the history is one read of rails-server's store, served flat; nothing is
//     swept, there are no folders and the rows carry no balance with interest;
//   • a whole life also needs the store's rows confirmed by a second chain
//     witness, so an unconfirmed or disputed history holds back the card's
//     lifetime figures, the lifetime flows and the "never touched" claim.

import type { CompoundPageDeployment } from "@/lib/compound/page-deployment";
import { COMPOUND_ARBITRUM_VOCABULARY } from "@/lib/compound/swept-tower-provenance";
import { COMPOUND_ARBITRUM_CHAIN_ID, COMPOUND_ARBITRUM_DEPLOYMENT } from "./asset-catalog";
import { compoundArbitrumWalletHref } from "./routes";
import { compoundArbitrumWholeLife } from "./whole-life";

export const COMPOUND_ARBITRUM_PAGE: CompoundPageDeployment = {
  session: "compound-v3-arbitrum",
  deployment: COMPOUND_ARBITRUM_DEPLOYMENT,
  explorerDeployment: "arbitrum",
  routes: {
    wallet: "/api/chain/compound-arbitrum/wallet",
    timeline: "/api/chain/compound-arbitrum/timeline",
    folder: null,
    prices: "/api/chain/compound-arbitrum/oracle-prices",
  },
  walletHref: compoundArbitrumWalletHref,
  sourceLabel: "the Compound V3 deployment on Arbitrum (all four Comets)",
  csvPrefix: "compound-arbitrum",
  grouped: false,
  askIndexAgain: false,
  askUntilWhole: true,
  balanceRead: "absent",
  captureSourceOf: (coverage) => (coverage?.source === "tenderly" ? "tenderly" : "etherscan"),
  wholeOf: compoundArbitrumWholeLife,
  vocab: () => COMPOUND_ARBITRUM_VOCABULARY,
  lane: { chainId: COMPOUND_ARBITRUM_CHAIN_ID },
  words: {
    reading: "Reading this wallet’s history from Rails’ store of the Comets’ logs.",
    unavailable:
      "The history store isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Comet and is unaffected.",
    failed:
      "The history read failed. Reload to try again — the position above is read live from the Comet and is unaffected.",
    emptyNotWhole: "No events in the history read so far; the footer says what it rests on.",
    heldNoEvent: () =>
      "The store's history is confirmed and has no Comet event naming this account in this market — the balance arrived by a route the Comet logs without naming the account.",
    emptyMarket: "This wallet has no Compound V3 activity in this market.",
    untouchedTitle: "This wallet has never touched Compound V3 on Arbitrum.",
    untouchedBody: (n) =>
      `All ${n} markets were asked and none holds a balance, a debt or collateral for this address — and no Comet has emitted an event naming it between the first Comet’s creation block and now.`,
    emptyNowTitle: "This wallet holds nothing on Compound V3 Arbitrum right now.",
    emptyNowHistory: {
      loading: "Whether it ever did is still being read from Rails’ store of the Comets’ logs.",
      notWhole:
        "Whether it ever did waits on the history: what the store holds is not yet confirmed against the chain.",
      failed: "Whether it ever did is unknown: the history store did not answer.",
    },
    chainPossessive: "Arbitrum’s",
    firstRead: {
      reading:
        "Rails is reading this wallet’s history for the first time, from the Comets’ logs. That takes a minute or two, and the page asks again until it lands.",
      still: "Rails is still reading this wallet’s history for the first time. Reload in a minute to see it.",
    },
  },
};
