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
  /** The Eth-flow contract (C6), in the docs' spelling. */
  ethFlow: "Eth-flow contract",
} as const;

/** The fee bullet (C2): the Trade log's feeAmount, in the sold token. */
export const cowFeeSentence = (amount: string) => `The trade's fee amount was ${amount}, paid in the sold token.`;

/** The count's one line on fills (C3), where the account explanation states the count. */
export const COW_FILLS_SENTENCE = "An order filled in parts makes one trade per part.";
