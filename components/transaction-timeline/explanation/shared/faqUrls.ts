export const FAQ_URLS = {
  LIQUIDATION_RESERVE: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-is-the-refundable-gas-deposit",
  USER_SET_RATES: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-are-user-set-rates",
  LTV_COLLATERAL_RATIO: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-i-decide-on-my-ltv",
  BORROWING_FEES:
    "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#are-there-any-other-fees-related-to-borrowing",
  LIQUIDATIONS: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
  REDEMPTIONS: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-are-redemptions",
  REDEMPTION_SELECTION:
    "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-happens-if-my-trove-gets-redeemed",
  DELEGATION: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-is-delegation-of-interest-rates",
  WHAT_IS_TROVE: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-is-a-trove",
  MINIMUM_DEBT: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#is-there-a-minimum-debt",
  COLLATERAL_TYPES: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-types-of-collateral-can-i-use",
  NFT_TROVES:
    "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-many-troves-loans-can-i-open-with-the-same-address",
} as const;

// Aave V4 link atoms — the canonical aave.com docs/help anchors used by the
// Learn-More ("?") modals on Aave surfaces. Kept separate from FAQ_URLS (which
// is Liquity-only) so each protocol's atoms stay self-contained.
export const AAVE_FAQ_URLS = {
  FAQ: "https://aave.com/faq",
  LIQUIDATIONS: "https://aave.com/help/borrowing/liquidations",
  SUPPLYING: "https://aave.com/help/depositing",
  BORROWING: "https://aave.com/help/borrowing",
  V4_POSITIONS: "https://aave.com/docs/aave-v4/positions",
  V4_LIQUIDATIONS: "https://aave.com/docs/aave-v4/positions/liquidations",
  // Hub/spoke architecture — used by the /aave-v4/hubs comparison surface.
  V4_DOCS: "https://aave.com/docs/aave-v4",
  V4_LIQUIDITY_MODEL: "https://aave.com/docs/aave-v4/liquidity",
  V4_ARCHITECTURE: "https://aave.com/blog/understanding-aave-v4s-architecture",
} as const;
