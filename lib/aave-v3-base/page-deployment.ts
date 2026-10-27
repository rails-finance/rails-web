// Aave V3 on Base as the shared position page draws it
// (components/protocol/aave-v3/aave-v3-pool-position-page.tsx): the Pool, its
// routes, its keys and its words.

import type { AaveV3PoolPageDeployment } from "@/components/protocol/aave-v3/aave-v3-pool-position-page";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_POOL } from "./asset-catalog";
import { AAVE_V3_BASE_LIVE_CARD_DEPLOYMENT } from "./position-provenance";
import { AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK } from "./write-off-gap";

export const AAVE_V3_BASE_PAGE: AaveV3PoolPageDeployment = {
  session: "aave-v3-base",
  chainId: AAVE_V3_BASE_CHAIN_ID,
  pool: { name: "Aave V3 Pool (Base)", address: AAVE_V3_BASE_POOL, positionRoute: "/api/chain/aave-v3-base/position" },
  routes: {
    timeline: "/api/chain/aave-v3-base/timeline",
    folder: "/api/chain/aave-v3-base/timeline/folder",
    prices: "/api/chain/aave-v3-base/oracle-prices",
    accountSwitches: "/api/chain/aave-v3-base/account-switches",
  },
  marketKey: "base",
  explorerDeployment: "base",
  marketName: "Base",
  sourceLabel: "the Aave V3 Pool on Base",
  card: AAVE_V3_BASE_LIVE_CARD_DEPLOYMENT,
  key: "aave-v3-base",
  flows: {
    family: "aave-v3-base",
    health: {
      market: "base",
      source: { oracle: "the Pool's oracle", pool: "the Pool", chain: AAVE_V3_BASE_CHAIN_ID },
    },
  },
  writeOff: { firstBlock: AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK, chain: "Base" },
  // The route serves the index when it can vouch for the whole life and sweeps
  // the chain otherwise; the receipts' custody line names the one that answered.
  captureSourceOf: (coverage) => (coverage?.source === "index" ? "index" : "sweep"),
  // No holes inside the span, AND the span reaching the Pool's own first block.
  wholeOf: (coverage) => coverage.gaps.length === 0 && coverage.fromDeployment === true,
  words: {
    reading:
      "Reading this wallet’s whole history from the Pool’s logs — the sweep runs from the Pool’s first block, so it takes a moment.",
    untouchedTitle: "This wallet has never touched Aave V3 on Base.",
    untouchedBody: "No supplied assets, no debt, and no events on the Pool between its first block and now.",
    emptyWhole: "This wallet has no Aave V3 activity on Base.",
    emptyNotWhole: "No events to show — the sweep could not read this wallet's history.",
    unavailable:
      "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Pool and is unaffected.",
    failed:
      "The history sweep failed. Reload to try again — the position above is read live from the Pool and is unaffected.",
  },
};
