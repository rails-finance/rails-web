// Aave V3 on Arbitrum as the shared position page draws it
// (components/protocol/aave-v3/aave-v3-pool-position-page.tsx). Two things set
// it apart from Base (rails-ops TO-DO-arbitrum-scoping.md §7 item 1):
//   • the history is one read of rails-server's store, served flat; nothing is
//     swept and there is no server replay for the lifetime flows;
//   • a whole life also needs the store's rows confirmed by a second chain
//     witness, so an unconfirmed or disputed history holds back the peaks,
//     the all-time interest, the lifetime flows and the "never touched" claim.

import type { AaveV3PoolPageDeployment } from "@/components/protocol/aave-v3/aave-v3-pool-position-page";
import {
  AAVE_V3_ARBITRUM_CHAIN_ID,
  AAVE_V3_ARBITRUM_FIRST_WRITE_OFF_BLOCK,
  AAVE_V3_ARBITRUM_POOL,
} from "./asset-catalog";
import { AAVE_V3_ARBITRUM_LIVE_CARD_DEPLOYMENT } from "./position-provenance";
import { aaveV3ArbitrumWholeLife } from "./whole-life";

export const AAVE_V3_ARBITRUM_PAGE: AaveV3PoolPageDeployment = {
  session: "aave-v3-arbitrum",
  chainId: AAVE_V3_ARBITRUM_CHAIN_ID,
  pool: {
    name: "Aave V3 Pool (Arbitrum)",
    address: AAVE_V3_ARBITRUM_POOL,
    positionRoute: "/api/chain/aave-v3-arbitrum/position",
  },
  routes: {
    timeline: "/api/chain/aave-v3-arbitrum/timeline",
    folder: null,
    prices: "/api/chain/aave-v3-arbitrum/oracle-prices",
    accountSwitches: "/api/chain/aave-v3-arbitrum/account-switches",
  },
  marketKey: "arbitrum",
  explorerDeployment: "arbitrum",
  marketName: "Arbitrum",
  sourceLabel: "the Aave V3 Pool on Arbitrum",
  card: AAVE_V3_ARBITRUM_LIVE_CARD_DEPLOYMENT,
  key: "aave-v3-arbitrum",
  flows: { family: "aave-v3-arbitrum", chainId: AAVE_V3_ARBITRUM_CHAIN_ID, routeless: true, noDailyStore: true },
  writeOff: { firstBlock: AAVE_V3_ARBITRUM_FIRST_WRITE_OFF_BLOCK, chain: "Arbitrum" },
  captureSourceOf: (coverage) => (coverage?.source === "tenderly" ? "tenderly" : "etherscan"),
  wholeOf: aaveV3ArbitrumWholeLife,
  flowsNeedWhole: true,
  words: {
    reading: "Reading this wallet’s history from Rails’ store of the Pool’s logs.",
    untouchedTitle: "This wallet has never touched Aave V3 on Arbitrum.",
    untouchedBody: "No supplied assets, no debt, and no events on the Pool between its first block and now.",
    emptyWhole: "This wallet has no Aave V3 activity on Arbitrum.",
    emptyNotWhole: "No events in the history read so far; the footer says what it rests on.",
    unavailable:
      "The history store isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Pool and is unaffected.",
    failed:
      "The history read failed. Reload to try again — the position above is read live from the Pool and is unaffected.",
    overBudget: (when) =>
      `This reader has asked for more histories than Rails’ store answers in a minute, so the timeline and the lifetime economics wait. The page asks again ${when}. The position above is read live from the Pool and is unaffected.`,
    emptyNotWholeState: {
      title: "Nothing is supplied or borrowed on this Pool.",
      body: "The history read so far holds no events for this wallet, and it is not yet confirmed against the chain, so Rails does not yet say whether this account was ever opened.",
    },
  },
};
