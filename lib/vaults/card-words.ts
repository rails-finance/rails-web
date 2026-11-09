// The vault card's "?" modals and the stat read-mores, per family (rails-ops
// ui-jobs 407, V2 and V3; standards/prose-limits-and-zones.md §2.2, a modal of
// at most 200 words). The (i) bullets are built from figures, in each family's
// page view.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MORPHO_VAULT_DOCS = { label: "docs.morpho.org: Vaults", url: "https://docs.morpho.org/learn/concepts/vault/" };
const MORPHO_MARKET_DOCS = { label: "docs.morpho.org: Markets", url: "https://docs.morpho.org/learn/concepts/market/" };
const AAVE_DOCS = {
  sgho: { label: "aave.com: Savings GHO", url: "https://aave.com/docs/ecosystem/gho/sgho" },
  stata: { label: "aave.com: Static aTokens", url: "https://aave.com/docs/aave-v3/smart-contracts/tokenization" },
  "umbrella-stake": { label: "aave.com: Umbrella", url: "https://aave.com/docs/aave-v3/umbrella" },
} as const;

const YIELD_CONCEPT = {
  bold: "Yield",
  text: "the share price's change over 30 days from Rails's daily reads, annualised simply. Fees taken inside the share are in it; rewards paid outside it are not.",
};

export const STEWARD_TIP = {
  curator: "The address that chooses which markets the vault lends to, and their caps.",
  owner: "The vault names no curator, so its owner chooses the markets and their caps.",
  umbrella: "The stake token's owner: the one address that can slash it.",
  roleManager: "The address that hands out every role over the vault, from adding a strategy to shutting it down.",
} as const;

export const SHARES_ISSUED_TIP = "Every share of the vault in existence.";

export const morphoVaultCardContent = (): LearnMoreContent => ({
  title: "How a MetaMorpho vault works",
  intro:
    "A MetaMorpho vault pools one asset and lends it across the Morpho Blue markets its curator chooses. A holder owns shares, and a share converts to more of the asset as those markets pay interest.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Curator and owner",
      text: "the curator sets which markets the vault may lend to and each one's cap; the owner can replace the curator and sets the fee.",
    },
    {
      bold: "Two readings of one book",
      text: "total assets adds each market's interest up to this block, while Morpho Blue books interest only when a market is touched, so the allocated sum trails it.",
    },
    {
      bold: "Lost assets",
      text: "on a V1.1 vault, assets that no market holds after a loss. The share price is not lowered for them.",
    },
    YIELD_CONCEPT,
  ],
  links: [MORPHO_VAULT_DOCS, MORPHO_MARKET_DOCS],
});

export const morphoVaultAssetsContent = (): LearnMoreContent => ({
  title: "Where a MetaMorpho vault's assets are",
  intro:
    "The vault supplies its asset to the Morpho Blue markets in its withdraw queue, listed here in the queue's order. A withdrawal takes from them in that order.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Idle market",
      text: "a market with no collateral token, no oracle and no interest-rate model: where the vault holds cash inside Blue.",
    },
    {
      bold: "Amount",
      text: "what the vault's supply shares in the market convert to, as Morpho Blue last settled the market.",
    },
    { bold: "Share of this vault", text: "a market's amount over the sum across the queue." },
    { bold: "The band", text: "a market holding 2% or more draws on its own; the rest share the last segment." },
  ],
  links: [MORPHO_MARKET_DOCS],
});

export function aaveVaultCardContent(family: "sgho" | "stata" | "umbrella-stake"): LearnMoreContent {
  const intro =
    family === "sgho"
      ? "Savings GHO takes GHO and issues shares that convert to more GHO over time. An index the vault stores sets the conversion, and Aave governance sets the rate the index moves at."
      : family === "stata"
        ? "A static aToken wraps an Aave V3 supply position in shares whose count does not change. The aToken it holds earns the reserve's interest, so a share converts to more of the asset over time."
        : "An Umbrella stake token takes a deposit and stands behind one Aave V3 reserve. If that reserve runs a deficit, the token's owner can slash the stake to cover it.";
  const details =
    family === "sgho"
      ? [
          {
            bold: "Target rate",
            text: "the rate the index moves at, in basis points, as governance set it. A setting the next vote can change.",
          },
          {
            bold: "Two figures",
            text: "total assets is what the index says the shares are worth; the GHO the contract holds is its token balance. Withdrawals are clamped to the balance.",
          },
          {
            bold: "Deposit cap",
            text: "the most the vault takes; remaining capacity is the room left under it.",
          },
          YIELD_CONCEPT,
        ]
      : family === "stata"
        ? [
            {
              bold: "Wraps",
              text: "the aToken the wrapper holds. Its balance grows with the reserve's liquidity index.",
            },
            {
              bold: "Rewards",
              text: "incentives the Aave market pays on the aToken are claimed outside the share and are not in its price.",
            },
            YIELD_CONCEPT,
          ]
        : [
            {
              bold: "Cooldown, then a window",
              text: "a holder starts a cooldown, waits it out, then has the unstake window to redeem. Outside the window, nothing is redeemable.",
            },
            {
              bold: "Slashable",
              text: "the most a slashing may take, from the contract's configuration.",
            },
            {
              bold: "Rewards",
              text: "Umbrella pays rewards outside the share; they are not in its price or its yield.",
            },
            YIELD_CONCEPT,
          ];
  return {
    title:
      family === "sgho"
        ? "How Savings GHO works"
        : family === "stata"
          ? "How a static aToken works"
          : "How an Umbrella stake token works",
    intro,
    detailsHeading: "Key concepts:",
    details,
    links: [AAVE_DOCS[family]],
  };
}

export function aaveVaultAssetsContent(family: "sgho" | "stata" | "umbrella-stake"): LearnMoreContent {
  return {
    title: "Where the assets are",
    intro:
      family === "sgho"
        ? "Savings GHO holds GHO in the contract. The table states that balance beside total assets, which the index sets."
        : family === "stata"
          ? "A static aToken holds one aToken, a supply position in the Aave V3 Core market."
          : "The stake token holds its asset. Where that asset is a static aToken, one more hop reaches the reserve it covers.",
    detailsHeading: "Key concepts:",
    details: [
      { bold: "Amount", text: "how much of the asset the vault holds there." },
      { bold: "Share of this vault", text: "the amount over the vault's total assets." },
      ...(family === "umbrella-stake"
        ? [
            {
              bold: "The hop",
              text: "what one share of the wrapper converts to in the reserve's asset.",
            },
          ]
        : []),
    ],
    links: [AAVE_DOCS[family]],
  };
}

export const yearnVaultCardContent = (): LearnMoreContent => ({
  title: "How a Yearn V3 vault works",
  intro:
    "A Yearn V3 vault takes one token, keeps part of it idle for withdrawals and lends the rest to strategies. A holder owns shares, and a share converts to more of the token as strategies report gains.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Roles",
      text: "the role manager hands out every power over the vault; the accountant charges its fees when a strategy reports.",
    },
    {
      bold: "Profit unlock",
      text: "a reported gain reaches the share price over this window, so the price climbs smoothly. A loss lands at once.",
    },
    {
      bold: "Endorsed",
      text: "Yearn's Registry endorses the vault. Anyone may deploy from the factory, so the address identifies the vault.",
    },
    YIELD_CONCEPT,
  ],
});

export const yearnVaultAssetsContent = (): LearnMoreContent => ({
  title: "Where a Yearn V3 vault's assets are",
  intro:
    "The vault keeps an idle balance and lends the rest to the strategies in its default queue. A withdrawal takes the idle balance first, then the strategies in this order.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Amount",
      text: "the debt the vault records against a strategy, updated when the strategy reports.",
    },
    { bold: "Cap", text: "the most the vault may lend that strategy, set by the role manager." },
    {
      bold: "Outside the queue",
      text: "a strategy taken out of the queue keeps its debt until the vault pulls it back.",
    },
    { bold: "Share of this vault", text: "a row's amount over the vault's total assets." },
  ],
});

const MAPLE_DOCS = { label: "docs.maple.finance: Lenders", url: "https://docs.maple.finance" };

/** The Steward's tip on a Maple pool: its pool delegate. */
export const MAPLE_DELEGATE_TIP =
  "The pool delegate runs the pool's lending: it funds and calls loans, and marks a loan as impaired.";

export const maplePoolCardContent = (): LearnMoreContent => ({
  title: "How a Maple pool works",
  intro:
    "A Maple pool takes one stablecoin and lends it to institutional borrowers against collateral that custodians hold off the chain. A lender owns shares, and a share converts to more of the asset as borrowers pay interest.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Pool delegate",
      text: "the manager that runs the pool's lending: it funds loans, calls open-term loans and marks a loan as impaired.",
    },
    {
      bold: "Exit rate",
      text: "what one share pays on withdrawal. It equals the share price unless a loan is marked as impaired; then a lender who exits takes a part of the mark.",
    },
    {
      bold: "Withdrawal queue",
      text: "withdrawals wait in a queue, first in, first out, and are paid from the cash in the pool as it allows.",
    },
    {
      bold: "Yield",
      text: "Rails keeps no daily share-price series for Maple pools, so the card states no yield figure.",
    },
  ],
  links: [MAPLE_DOCS],
});

export const maplePoolAssetsContent = (): LearnMoreContent => ({
  title: "Where a Maple pool's assets are",
  intro:
    "The pool keeps some cash, which pays withdrawals, and lends the rest through two loan books and any other strategy it uses. Together they make the pool's total assets.",
  detailsHeading: "Key concepts:",
  details: [
    { bold: "Liquid now", text: "the asset in the pool, the only part a withdrawal can be paid from at once." },
    { bold: "Fixed-term loans", text: "loans that run to a maturity date: principal and the interest accrued so far." },
    {
      bold: "Open-term loans",
      text: "loans with no maturity, which the pool delegate can call for repayment with notice.",
    },
    { bold: "Other strategies", text: "on-chain strategies the pool lends through, apart from its loans." },
    {
      bold: "Collateral",
      text: "custodians hold the loans' collateral off the chain. The chain records the loan book as Maple keeps it.",
    },
    { bold: "Share of this vault", text: "a row's amount over the pool's total assets." },
  ],
  links: [MAPLE_DOCS],
});

/** "Supplied by vaults" on a market or reserve page: the "?" per family. */
export function suppliedByContent(family: "morpho" | "aave"): LearnMoreContent {
  return family === "morpho"
    ? {
        title: "Vaults in this market",
        intro:
          "A MetaMorpho vault lends one asset through the Morpho Blue markets in its withdraw queue. These are the vaults on Rails's MetaMorpho roster whose queue names this market.",
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Amount",
            text: "what the vault's supply in this market converts to, as Morpho Blue last settled the market.",
          },
          {
            bold: "Steward",
            text: "the curator, which chooses the vault's markets and caps; the owner where no curator is named.",
          },
          {
            bold: "A vault at zero",
            text: "a market can sit in a queue with nothing supplied: the curator may supply it later.",
          },
        ],
        links: [MORPHO_VAULT_DOCS],
      }
    : {
        title: "Vaults over this reserve",
        intro:
          "A static aToken wraps a supply position in this reserve. An Umbrella stake stands behind it: its owner can slash the stake to cover a deficit on the reserve.",
        detailsHeading: "Key concepts:",
        details: [
          { bold: "Amount", text: "the wrapper's total assets; for a stake, what it holds in the reserve's asset." },
          {
            bold: "Counted twice",
            text: "a stake over a static aToken holds the wrapper's shares, so its amount is also inside the wrapper's row.",
          },
          { bold: "Steward", text: "a stake's owner. A static aToken names none." },
        ],
        links: [AAVE_DOCS.stata, AAVE_DOCS["umbrella-stake"]],
      };
}

/** The holder pages' position card's "?" (V8, ui-jobs 553), every family. */
export const vaultPlainHoldingContent = (
  assetSymbol: string,
  shareSymbol: string,
  rewards: string,
): LearnMoreContent => ({
  title: "What a holding is",
  intro: `A holding is one address's ${shareSymbol} in one vault. The vault's shares grow in ${assetSymbol} as the vault earns, so the card counts everything in ${assetSymbol}.`,
  detailsHeading: "The figures:",
  details: [
    {
      bold: "Put in",
      text: `every deposit, and every share received from another address at its worth that day.`,
    },
    {
      bold: "Taken out",
      text: `every withdrawal, and every share sent to another address at its worth that day.`,
    },
    { bold: "Worth now", text: `what the shares convert to in ${assetSymbol} at the card's read.` },
    {
      bold: "Profit or loss",
      text: `worth now plus what was taken out, minus what was put in. ${rewards[0].toUpperCase()}${rewards.slice(1)} are left out. Where one of the amounts could not be read, no figure is stated.`,
    },
    { bold: "The line", text: `the holding's worth at one read a day, from its first day to the card's read.` },
  ],
  extraParagraphs: ["These are readings of the past. Nothing here is a forecast or annualised."],
});

/** The rewards each family pays outside the share, which Earned leaves out. */
export const HOLDING_REWARDS: Record<"morpho" | "sgho" | "stata" | "umbrella-stake" | "yearn", string> = {
  morpho: "rewards paid outside the share, such as MORPHO,",
  sgho: "rewards paid outside the share",
  stata: "incentives claimed outside the share",
  "umbrella-stake": "Umbrella's rewards, paid outside the share,",
  yearn: "gauge rewards paid outside the share",
};
