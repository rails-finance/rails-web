// Compound V3 on Base as the wallet page draws it (the shape is
// lib/compound/page-deployment.ts): the index when it vouches for the whole
// life and the sweep otherwise, served as rows with folders, and a swept
// answer asked again for its balances.

import type { CompoundPageDeployment } from "@/lib/compound/page-deployment";
import { compoundSweepWhole } from "@/lib/compound/page-deployment";
import { COMPOUND_BASE_READ_VOCABULARY, COMPOUND_SWEPT_VOCABULARY } from "@/lib/compound/swept-tower-provenance";
import { COMPOUND_BASE_DEPLOYMENT } from "./asset-catalog";

export const COMPOUND_BASE_PAGE: CompoundPageDeployment = {
  session: "compound-base",
  deployment: COMPOUND_BASE_DEPLOYMENT,
  explorerDeployment: "base",
  routes: {
    wallet: "/api/chain/compound-base/wallet",
    timeline: "/api/chain/compound-base/timeline",
    folder: "/api/chain/compound-base/timeline/folder",
    prices: "/api/chain/compound-base/oracle-prices",
  },
  walletHref: (wallet) => `/base/compound-v3/${wallet}`,
  sourceLabel: "the Compound V3 deployment on Base (all five Comets)",
  csvPrefix: "compound-base",
  grouped: true,
  askIndexAgain: true,
  balanceRead: "reading",
  // Until the response arrives it is the sweep, the default this explorer had
  // before it gained an index.
  captureSourceOf: (coverage) => (coverage?.source === "index" ? "index" : "sweep"),
  wholeOf: compoundSweepWhole,
  vocab: (baseAtChain) => (baseAtChain ? COMPOUND_BASE_READ_VOCABULARY : COMPOUND_SWEPT_VOCABULARY),
  words: {
    reading:
      "Reading this wallet’s whole history from the Comets’ logs — the sweep runs from the earliest market’s first block, so it takes a moment.",
    unavailable:
      "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Comet and is unaffected.",
    failed:
      "The history sweep failed. Reload to try again — the position above is read live from the Comet and is unaffected.",
    emptyNotWhole: "No events to show — the sweep could not read this wallet's history.",
    heldNoEvent: (index) =>
      index
        ? "The index holds every block and has no Comet event naming this account in this market — the balance arrived by a route the Comet logs without naming the account."
        : "The sweep read every block and found no Comet event naming this account in this market — the balance arrived by a route the Comet logs without naming the account.",
    emptyMarket: "This wallet has no Compound V3 activity in this market.",
    untouchedTitle: "This wallet has never touched Compound V3 on Base.",
    untouchedBody: (n) =>
      `All ${n} markets were asked and none holds a balance, a debt or collateral for this address — and no Comet has emitted an event naming it between the earliest market’s first block and now.`,
    emptyNowTitle: "This wallet holds nothing on Compound V3 Base right now.",
    emptyNowHistory: {
      loading: "Whether it ever did is still being read from the Comets' logs.",
      notWhole:
        "Whether it ever did could not be settled: the history sweep did not read every block. Reload to sweep again.",
      failed: "Whether it ever did is unknown: the history sweep could not run.",
    },
    chainPossessive: "Base’s",
  },
};
