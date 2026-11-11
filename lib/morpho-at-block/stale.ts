// The roster's answer when rails-server's markets read did not answer: the
// shared roster draws its failed-read line for `chainStale`.

import type { MorphoMarketsChainResponse } from "@/lib/sources/chain/morpho-markets";

export const STALE_MARKETS: MorphoMarketsChainResponse = {
  blockNumber: 0,
  totalsSource: "chain",
  censusBlock: 0,
  groups: [],
  summary: {
    total: 0,
    funded: 0,
    borrowed: 0,
    idleCapital: 0,
    neverFunded: 0,
    idleMarkets: 0,
    loanTokens: 0,
    lltvs: [],
  },
  chainStale: true,
};
