// A Morpho Blue deployment as the wallet-first pages draw it: the wallet page
// (components/protocol/morpho/morpho-wallet-page.tsx), the position page
// beneath it (morpho-market-position-page.tsx) and the position section
// (components/protocol/morpho-base/position-section.tsx). Base was first
// (lib/morpho-base/page-deployment.ts); Arbitrum reads the same pages with its
// own routes, store and words (lib/morpho-arbitrum/page-deployment.ts).
// Client-safe.

import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import type { ChainId } from "@/lib/shared/chains";

export interface MorphoPageWords {
  /** In flight: the history is being read. */
  reading: string;
  untouchedTitle: string;
  /** `n` is how many markets were asked. */
  untouchedBody: (n: string) => string;
  emptyNowTitle: string;
  /** The wallet page's lead-in to the plain market links when the history is
   *  not a whole life. */
  notWholeWallet: string;
  /** How a held market with no event in the history is introduced. */
  unswept: (which: string) => string;
  /** After the position count, when the history is a whole life. */
  wholeCount: string;
  unavailableWallet: string;
  failedWallet: string;
  /** A store that budgets a reader's whole-history reads (the Arbitrum
   *  lane) answered 429; the page asks again on a timer. `when` is "in 23
   *  seconds", or "shortly" once the count is out. */
  overBudgetWallet?: (when: string) => string;
  /** The position page's note above a history that is not a whole life. */
  notWholePosition: string;
  heldNoEvent: string;
  /** After "The singleton holds nothing for it there now". */
  noPositionWhole: string;
  noPositionPartial: string;
  unavailablePosition: string;
  failedPosition: string;
  /** The position page's twin of `overBudgetWallet`. */
  overBudgetPosition?: (when: string) => string;
  /** The timeline's empty line when the history is not a whole life. */
  emptyNotWhole: string;
  /** A store that reads a wallet's history on its first request: while it
   *  reads, and once the page has stopped asking. */
  firstRead?: { reading: string; still: string };
}

export interface MorphoPageDeployment {
  session: "morpho-base" | "morpho-arbitrum";
  chainId: ChainId;
  /** The client's routes: the slot read, the history, and a folder's members
   *  (null where the history is served flat). */
  routes: { wallet: string; timeline: string; folder: string | null };
  walletHref: (wallet: string) => string;
  positionHref: (wallet: string, marketId: string) => string;
  /** The listing route the live card's receipts name. */
  positionsRoute: string;
  /** The live card's custody line. */
  liveCustody: string;
  /** The contract the timeline footer names. */
  sourceLabel: string;
  /** "Morpho Blue on Base": the flows panel's name. */
  name: string;
  /** The event page adapter's deployment (lib/morpho/explorer.ts). */
  explorerDeployment: "base" | "arbitrum";
  /** When the history counts as the whole life: the shared card, the flows
   *  panel and "never touched" wait for it. */
  wholeOf: (coverage: ChainTimelineCoverage) => boolean;
  /** The history can be served as rows with folders (`?group=1`). */
  grouped: boolean;
  /** A history that is not yet the whole life (the store's confirmation
   *  pending) is asked again for a while. */
  askUntilWhole?: boolean;
  /** The wallet page asks whether the address holds MetaMorpho shares. */
  vaultHoldings: boolean;
  words: MorphoPageWords;
}

/** The sweep's rule: no holes, and the span reaching the contract's first block. */
export const morphoSweepWhole = (coverage: ChainTimelineCoverage): boolean =>
  coverage.gaps.length === 0 && coverage.fromDeployment === true;
