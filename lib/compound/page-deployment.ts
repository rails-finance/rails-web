// A Compound V3 deployment as the wallet page draws it
// (components/protocol/compound/compound-wallet-page.tsx). Base was first
// (lib/compound-base/page-deployment.ts); Arbitrum reads the same page with
// its own routes, store and words (lib/compound-arbitrum/page-deployment.ts).
// Client-safe.

import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import type { CaptureSource } from "@/lib/shared/capture-source";
import type { CometDeployment } from "@/lib/compound/asset-catalog";
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
  /** A market's timeline with no events, by what the history rests on. */
  emptyNotWhole: string;
  /** The wallet holds something in the market and a whole history names it
   *  in no event; `index` where the store or index answered. */
  heldNoEvent: (index: boolean) => string;
  emptyMarket: string;
  untouchedTitle: string;
  /** `n` is how many markets were asked. */
  untouchedBody: (n: number | undefined) => string;
  emptyNowTitle: string;
  /** After "All N markets were asked, and none holds…": whether it ever did. */
  emptyNowHistory: { loading: string; notWhole: string; failed: string };
  /** "Base’s" in the line above the sections. */
  chainPossessive: string;
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
  /** What the coverage footer says was read. */
  sourceLabel: string;
  /** The CSV file names' prefix. */
  csvPrefix: string;
  /** The history can be served as rows with folders (`?group=1`). */
  grouped: boolean;
  /** A history that did not come from the index is asked again for a while,
   *  for its balances (Base's sweep). */
  askIndexAgain: boolean;
  /** What the rows say in place of a balance the history does not carry,
   *  when the page does not ask again. */
  balanceRead: CompoundBalanceRead;
  /** Which capture answered, read from the coverage. */
  captureSourceOf: (coverage: ChainTimelineCoverage | undefined) => CaptureSource;
  /** When the history counts as the whole life: the card's lifetime figures,
   *  the flows panel and "never touched" wait for it. */
  wholeOf: (coverage: ChainTimelineCoverage) => boolean;
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
