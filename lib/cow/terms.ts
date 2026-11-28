// CoW's words, as data the shared components take (rails-ops ui-jobs 657,
// the owner's calls; terms recorded in reference/official-docs/cow.md).
// docs.cow.fi names the protocol "CoW Protocol", an order's signer its
// "owner", the ETH-selling contract "Eth-flow".

export const COW_TERMS = {
  /** The protocol's name (C11). */
  name: "CoW Protocol",
  /** The account card's identity (C5): the docs' contract-page word. */
  identity: "Owner",
  /** What the shared Prices control is for on a CoW page (C9). */
  pricesSubject: "wallet",
  /** The settlement contract, on CoW's own pages (receipts' contract leaf,
   *  explanation). Other families' party chips keep the shared entry in
   *  `lib/shared/known-infrastructure.ts`. */
  settlement: "CoW Protocol's settlement contract",
  /** Its on-chain name, beside the word on the receipt's contract leaf. */
  settlementContract: "GPv2Settlement",
  /** The Eth-flow contract (C6), in the docs' spelling. */
  ethFlow: "Eth-flow contract",
} as const;

/** The fee bullet (C2): the Trade log's feeAmount, in the sold token. */
export const cowFeeSentence = (amount: string) => `The trade's fee amount was ${amount}, paid in the sold token.`;

/** The count's one line on fills (C3), where the account explanation states the count. */
export const COW_FILLS_SENTENCE = "An order filled in parts makes one trade per part.";

/** The Aave position swap a trade served (ui-jobs 853): the explanation's sentence, whose
 *  phrase opens the swap's event (lib/cow/aave-totals.ts `cowSwapEventHref`). */
export const COW_AAVE_SWAP_WORDS = {
  family: { "aave-v3": "Aave V3", "aave-v4": "Aave V4" },
  /** The swap's kind with its article, as the sentence's phrase begins. */
  kind: {
    supply_from_swap: "a supply from a swap",
    collateral_swap: "a collateral swap",
    debt_swap: "a debt swap",
    repay_with_collateral: "a repay with collateral",
    withdraw_and_swap: "a withdraw and swap",
    leverage: "a leverage swap",
  } as Record<string, string>,
  /** Any other kind. */
  kindFallback: "a position swap",
  /** The sentence: "This trade was " + the linked phrase + ".". */
  lead: "This trade was ",
  /** The linked phrase, e.g. "a collateral swap on Aave V3". */
  phrase: (kind: string, family: "aave-v3" | "aave-v4"): string =>
    `${COW_AAVE_SWAP_WORDS.kind[kind] ?? COW_AAVE_SWAP_WORDS.kindFallback} on ${COW_AAVE_SWAP_WORDS.family[family]}`,
  /** The link's tooltip, before its arrow. */
  title: "This swap on the Aave position's timeline",
} as const;

/** The wallet page opened at one trade (`?at=`, lib/cow/landing.ts): the list starts there. */
export const COW_LANDING_WORDS = {
  /** Reads the first page again, the newest trade at the top. */
  newest: "Show the newest trades",
} as const;
