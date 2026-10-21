// A Compound V3 deployment as the wallet page draws it
// (components/protocol/compound/compound-wallet-page.tsx). Base was first
// (lib/compound-base/page-deployment.ts); Arbitrum reads the same page with
// its own routes, store and words (lib/compound-arbitrum/page-deployment.ts).
// Client-safe.

import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import type { CaptureSource } from "@/lib/shared/capture-source";
import type { CometDeployment, CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundTowerVocabulary } from "@/lib/compound/economics";
import type { CompoundDeploymentKey } from "@/lib/compound/deployments";
import type { CompoundCardLane } from "@/components/protocol/compound/compound-position-card";
import type { CompoundBalanceRead } from "@/components/protocol/compound/balance-read";

export interface CompoundPageWords {
  /** In flight: the history is being read. */
  reading: string;
  /** Under a market's timeline while the history did not answer. */
  unavailable: string;
  failed: string;
  /** A store that budgets a reader's whole-history reads (the Arbitrum
   *  lane) answered 429; the page asks again on a timer. `when` is "in 23
   *  seconds", or "shortly" once the count is out. */
  overBudget?: (when: string) => string;
  /** A market's timeline with no events, by what the history rests on. */
  emptyNotWhole: string;
  /** The wallet holds something in the market and a whole history names it
   *  in no event; `index` where the store or index answered. */
  heldNoEvent: (index: boolean) => string;
  emptyMarket: string;
  /** A market page whose Comet holds nothing for the wallet while the history
   *  cannot yet say whether it ever did. */
  emptyMarketNow?: string;
  untouchedTitle: string;
  /** `n` is how many markets were asked. */
  untouchedBody: (n: number | undefined) => string;
  emptyNowTitle: string;
  /** After "All N markets were asked, and none holds…": whether it ever did. */
  emptyNowHistory: { loading: string; notWhole: string; failed: string; overBudget?: (when: string) => string };
  /** "Base’s" in the line above the sections. */
  chainPossessive: string;
  /** A store that reads a wallet's history on its first request: while it
   *  reads, and once the page has stopped asking. */
  firstRead?: { reading: string; still: string };
}

export interface CompoundPageDeployment {
  session: "compound-base" | "compound-v3-arbitrum";
  deployment: CometDeployment;
  /** The event page adapter's and the flows panel's deployment name. */
  explorerDeployment: CompoundDeploymentKey;
  /** The client's routes: the Comet read, the history, a folder's members
   *  (null where the history is served flat) and the oracle prices. */
  routes: { wallet: string; timeline: string; folder: string | null; prices: string };
  walletHref: (wallet: string) => string;
  /** A deployment with a page per (market, wallet) names it here, and a
   *  card's ⋮ links there; without it the card links its section of the
   *  wallet page. */
  marketHref?: (market: string, wallet: string) => string;
  /** What the coverage footer says was read. */
  sourceLabel: string;
  /** The CSV file names' prefix. */
  csvPrefix: string;
  /** The history can be served as rows with folders (`?group=1`). */
  grouped: boolean;
  /** A history that did not come from the index is asked again for a while,
   *  for its balances (Base's sweep). */
  askIndexAgain: boolean;
  /** A history that is not yet the whole life (the store's confirmation
   *  pending) is asked again for a while, and the Lifetime flows panel waits
   *  for the whole life instead of stating a failed read. */
  askUntilWhole?: boolean;
  /** What the rows say in place of a balance the history does not carry,
   *  when the page does not ask again. */
  balanceRead: CompoundBalanceRead;
  /** Which capture answered, read from the coverage. */
  captureSourceOf: (coverage: ChainTimelineCoverage | undefined) => CaptureSource;
  /** When the history counts as the whole life: the card's lifetime figures,
   *  the flows panel and "never touched" wait for it. */
  wholeOf: (coverage: ChainTimelineCoverage) => boolean;
  /** When one market's rows are its whole life though the wallet's are not;
   *  unset, the flows panel takes `wholeOf` (rails-ops TO-DO-ui-jobs.md item
   *  415). */
  marketWholeOf?: (coverage: ChainTimelineCoverage, market: CometMarket) => boolean;
  /** The card's receipts for a market, by whether its last row was read at
   *  the chain. */
  vocab: (baseAtChain: boolean) => CompoundTowerVocabulary;
  /** The chain and capture the card's receipts name; Base leaves it unset. */
  lane?: CompoundCardLane;
  words: CompoundPageWords;
}

/** The sweep's rule: no holes, and the span reaching the first Comet's block. */
export const compoundSweepWhole = (coverage: ChainTimelineCoverage): boolean =>
  coverage.gaps.length === 0 && coverage.fromDeployment === true;

/** The sweep's rule for one market. The coverage is the wallet's, and its
 *  span is one query over every Comet: a market whose Comet's first block sits
 *  at or above the span's start, with no hole at or above that block, has all
 *  its rows read though an older Comet's history starts at a horizon or holds
 *  a hole (rails-ops TO-DO-ui-jobs.md item 415). */
export const compoundMarketSweepWhole = (coverage: ChainTimelineCoverage, market: CometMarket): boolean => {
  if (compoundSweepWhole(coverage)) return true;
  const first = market.deployBlock;
  return first != null && coverage.fromBlock <= first && coverage.gaps.every((g) => g.to < first);
};
