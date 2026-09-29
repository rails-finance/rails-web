import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import { POLARIS_APP_LINK, POLARIS_DOC_LINKS } from "@/lib/polaris/docs-links";
import type { CurveEventType } from "@/lib/shared/types/protocols/curve";
import type { UniswapEventType } from "@/lib/shared/types/protocols/uniswap";
import { getSpokeMeta, ARCHETYPE_GLOSS, SPOKE_DOC_LINKS } from "@/lib/aave-v4/spoke-meta";
import { HUB_TIER_LABEL, type HubTier } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { SEAMLESS_DOCS_URL, v3Brand, v3Possessive, type V3Protocol } from "@/lib/aave-v3/protocol-name";
import { FAQ_URLS, AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { ALCHEMIX_DOCS } from "@/lib/alchemix/learn-more";
import type { VaultPositionFamily } from "@/lib/aave-vaults/vault-position";
import { indefiniteArticle } from "@/lib/utils/format";

// ── CoW Protocol ─────────────────────────────────────────────────────────────

// ── Liquity — Redemptions ────────────────────────────────────────────────────

export function liquityRedemptionContent(collateralType?: string, interestRate?: number): LearnMoreContent {
  const rateNote =
    interestRate != null
      ? ` This Trove's ${interestRate}% rate was among the lowest in the ${collateralType ?? "collateral"} branch at redemption time.`
      : "";

  return {
    title: "How Redemptions Work",
    intro: `Redemptions allow BOLD holders to exchange BOLD for collateral at face value ($1 per BOLD). This mechanism helps maintain BOLD's USD peg \u2014 if BOLD trades below $1, arbitrageurs (typically automated bots) profit by buying cheap BOLD and redeeming it for $1 worth of collateral. Troves are redeemed in ascending order of interest rates (lowest first).${rateNote}`,
    video: {
      label: "9 min video",
      url: "https://www.youtube.com/watch?v=CQVmjFx987A",
      description:
        "Watch this video on redemptions from Liquity to understand how they work and how to manage redemption risk.",
    },
    links: [
      {
        label: "What are redemptions?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-are-redemptions",
      },
      {
        label: "What happens if my Trove gets redeemed?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-happens-if-my-trove-gets-redeemed",
      },
      {
        label: "How can I stay protected?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#how-can-i-stay-protected",
      },
      {
        label: "Is there a redemption fee?",
        url: "https://docs.liquity.org/v2-faq/redemptions-and-delegation#is-there-a-redemption-fee",
      },
    ],
  };
}

// ── Liquity — Liquidations ───────────────────────────────────────────────────

export function liquityLiquidationContent(collateralType?: string): LearnMoreContent {
  const isETH = collateralType === "WETH" || collateralType === "ETH";
  const minCR = isETH ? "110%" : "120%";
  const maxLTV = isETH ? "90.91%" : "83.33%";

  return {
    title: "How Liquidations Work",
    intro: `Troves become eligible for liquidation when the collateral ratio falls below the minimum threshold (${minCR} for ${collateralType ?? "this collateral"}, equivalent to a maximum ${maxLTV} LTV). Once eligible, anyone can trigger a liquidation transaction.`,
    extraParagraphs: [
      "If the Stability Pool has sufficient BOLD, it absorbs the debt and receives the collateral. Otherwise, debt and collateral are redistributed proportionally to other active borrowers in the same market.",
      "Liquidators receive a 5% incentive on the debt cleared, plus a gas compensation of 0.0375 WETH. Any remaining collateral above what is needed to cover debt + penalty is claimable by the original borrower as surplus.",
    ],
    links: [
      {
        label: "How do liquidations work?",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
      },
      {
        label: "What is the liquidation threshold?",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
      },
      {
        label: "How does the Stability Pool work?",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
      },
    ],
  };
}

// ── Liquity — Open Trove / Borrowing ─────────────────────────────────────────

export function liquityOpenTroveContent(): LearnMoreContent {
  return {
    title: "How Borrowing Works",
    intro:
      "Liquity V2 allows users to borrow BOLD (a decentralized stablecoin) by depositing collateral into a Trove. The Trove is represented by an NFT that provides full control over the position. The interest rate set at opening determines redemption risk \u2014 higher rates provide better protection against redemptions but cost more over time.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral ratio",
        text: "the value of the collateral relative to the debt. Must stay above the liquidation threshold.",
      },
      {
        bold: "Interest rate",
        // Static copy with no per-trove context, and this modal also serves
        // openTroveAndJoinBatch — a Trove that opened straight into a batch.
        // The sentence has to hold for that reader too, so it names the
        // delegation route rather than asserting the borrower alone sets it.
        text: "the borrower sets the rate, or delegates it to a batch manager. Lower rates save money but increase redemption risk.",
      },
      {
        bold: "Upfront fee",
        text: "a one-time borrowing fee equivalent to 7 days of average interest, deducted from the borrowed amount.",
      },
      {
        bold: "Liquidation reserve",
        text: "0.0375 ETH set aside to incentivise liquidators. Refunded when the Trove is closed.",
      },
    ],
    video: {
      label: "video guide",
      url: "https://www.youtube.com/watch?v=o1miCKLIPYs",
      description: "Learn how to borrow on Liquity and manage a Trove effectively.",
    },
    links: [
      { label: "What is a Trove?", url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-is-a-trove" },
      {
        label: "Understanding borrowing fees",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#are-there-any-other-fees-related-to-borrowing",
      },
      {
        label: "What is the liquidation reserve?",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-is-the-refundable-gas-deposit",
      },
      {
        label: "How user-set interest rates work",
        url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#what-are-user-set-rates",
      },
    ],
  };
}

// ── Liquity — Live position panel (the trove summary's "?" FAQ) ──────────────
//
// Panel-scoped FAQ for the live trove position card. It consolidates the
// per-bullet "learn more" chain icons that used to sit inline on each
// explanation row into a single standardised "?" modal. Content is keyed to
// what THIS panel surfaces — collateral ratio, interest/delegation, redemption
// exposure, and trove-NFT ownership — so the questions answer the obvious
// "what does this number mean?" without repeating the borrowing/liquidation/
// redemption EVENT modals. Quick Links point at the canonical Liquity docs.
export function liquityPositionContent(opts: {
  collateralType: string;
  status: "open" | "closed" | "liquidated";
  isBatched?: boolean;
}): LearnMoreContent {
  const { collateralType, status, isBatched } = opts;
  const isETH = collateralType === "WETH" || collateralType === "ETH";
  const minCR = isETH ? "110%" : "120%";

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This trove was liquidated when its collateral ratio fell below the minimum threshold. The panel above reconstructs its final state — peak debt, collateral, and how long it stayed open.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Liquidation threshold",
          text: `a trove is liquidated once its collateral ratio drops below ${minCR} for ${collateralType}. Anyone can trigger the liquidation.`,
        },
        {
          bold: "Trove NFT",
          text: "ownership of a trove is an ERC-721 NFT. One address can hold many troves, each a separate position.",
        },
      ],
      links: [
        { label: "How do liquidations work?", url: FAQ_URLS.LIQUIDATIONS },
        { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
      ],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This trove has been closed and its debt fully repaid. The panel above shows its lifetime peaks — the most debt and collateral it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing a trove",
          text: "repaying all debt returns all the collateral to the owner, refunds the 0.0375 ETH liquidation reserve paid apart from it at open, and burns the trove NFT.",
        },
        {
          bold: "Trove NFT",
          text: "ownership of a trove is an ERC-721 NFT. One address can hold many troves, each a separate position.",
        },
      ],
      links: [
        { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
        { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
      ],
    };
  }

  // Open trove — the live, interactive case.
  const details: LearnMoreContent["details"] = [
    {
      bold: "Collateral ratio",
      text: `the collateral's USD value relative to the debt. It must stay above ${minCR} for ${collateralType} or the trove can be liquidated.`,
    },
  ];
  if (isBatched) {
    details.push({
      bold: "Interest delegation",
      text: "a batch manager sets this trove's rate and charges a management fee on top of the interest, both accruing to the debt.",
    });
  } else {
    details.push({
      bold: "Interest rate",
      text: "the borrower sets the rate. Lower rates cost less but sit earlier in the redemption queue.",
    });
  }
  details.push(
    {
      bold: "Redemption exposure",
      text: "a redemption exchanges BOLD for collateral at $1 of face value per BOLD, sweeping each branch's queue from the lowest user-set interest rate upward. Debt at the same or lower rate is redeemed first — the debt-in-front figure is how much shields this trove. A redeemed trove gives up collateral worth the debt it sheds: it deleverages, but its net value is preserved.",
    },
    {
      bold: "Branch scoping",
      text: `each collateral type is its own branch with its own redemption queue. A redemption is split across branches in proportion to each branch's unbacked debt, so the queue this trove stands in is the ${collateralType} branch's own.`,
    },
    {
      bold: "Trove NFT",
      text: "ownership of a trove is an ERC-721 NFT. One address can hold many troves, each a separate position.",
    },
  );

  const links: LearnMoreContent["links"] = [
    { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
  ];
  if (isBatched) {
    links.push({ label: "What is interest-rate delegation?", url: FAQ_URLS.DELEGATION });
  } else {
    links.push({ label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES });
  }
  links.push(
    { label: "What happens if my trove gets redeemed?", url: FAQ_URLS.REDEMPTION_SELECTION },
    { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
  );

  return {
    title: "About This Position",
    intro:
      "This panel explains the trove's live state in plain language — what backs the debt, what it costs to hold, and how exposed it is to redemption.",
    detailsHeading: "Key concepts:",
    details,
    links,
  };
}

// ── Liquity — Economics panel ────────────────────────────────────────────────
//
// State-explainer for the trove economics panel (carry cost + lifetime debt/
// collateral flows). Scoped to what that panel shows, distinct from the
// position panel's "About this position".
export function liquityEconomicsContent(opts: { isBatched?: boolean } = {}): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel breaks down what the trove costs to carry and traces every unit of debt and collateral that has flowed through it over its lifetime.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Carrying cost",
        text: opts.isBatched
          ? "the interest plus the delegate's management fee that accrue to the debt each day and year."
          : "the interest that accrues to the debt each day and year at the trove's chosen rate.",
      },
      {
        bold: "Upfront fee",
        text: "a one-time borrowing fee taken when debt is drawn, equivalent to about 7 days of average interest.",
      },
      {
        bold: "Lifetime flows",
        text: "the towers decompose everything that ever moved through the trove — deposited, withdrawn, borrowed, repaid, redeemed, liquidated.",
      },
      {
        bold: "Redemption outcome",
        text: "a redemption clears debt at $1 face and takes collateral for it at the oracle price of that moment. The first figure sets the debt cleared against the collateral's value at each redemption's own price; the second reprices the same collateral at today's price. A rise in the collateral since makes the second figure larger, a fall makes it smaller.",
      },
      {
        bold: "Liquidation reserve",
        text: "0.0375 ETH held back at open to pay liquidators, refunded when the trove closes.",
      },
    ],
    links: [
      { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
      { label: "Are there other borrowing fees?", url: FAQ_URLS.BORROWING_FEES },
      { label: "What is the liquidation reserve?", url: FAQ_URLS.LIQUIDATION_RESERVE },
      opts.isBatched
        ? { label: "What is interest-rate delegation?", url: FAQ_URLS.DELEGATION }
        : { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
    ],
  };
}

// ── Liquity — Event-card modals (process events) ─────────────────────────────
//
// One content function per mechanic, mapped from operation types by the event
// explainer's resolver. Process-event titles read "How … works"; each follows
// the slot grammar (Intro → Key Concepts → Quick Links) with no instance
// numbers. See learn-more-modal-grammar.md.

export function liquityCloseTroveContent(): LearnMoreContent {
  return {
    title: "How Closing a Trove Works",
    intro:
      "Closing a trove repays its entire debt and returns the collateral, ending the position. The trove's NFT is burned once it closes.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Full repayment",
        text: "closing requires repaying the whole debt — principal plus accrued interest — in BOLD.",
      },
      {
        bold: "Liquidation reserve",
        text: "the 0.0375 ETH gas reserve set aside when the trove opened is refunded on close.",
      },
      {
        bold: "Trove NFT",
        text: "the NFT representing the position is burned when the trove closes, freeing the slot.",
      },
    ],
    links: [
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
      { label: "What is the liquidation reserve?", url: FAQ_URLS.LIQUIDATION_RESERVE },
      { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
    ],
  };
}

export function liquityAdjustTroveContent(): LearnMoreContent {
  return {
    title: "How Adjusting a Trove Works",
    intro:
      "An adjustment changes a trove's collateral or debt without closing it — adding or withdrawing collateral, or borrowing or repaying BOLD.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral changes",
        text: "depositing more collateral raises the collateral ratio; withdrawing collateral lowers it.",
      },
      {
        bold: "Debt changes",
        text: "borrowing more BOLD increases the debt and may incur a one-time borrowing fee; repaying reduces it.",
      },
      {
        bold: "Collateral ratio",
        text: "every adjustment must leave the trove above its minimum collateral ratio, or it will revert.",
      },
    ],
    links: [
      { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
      { label: "Are there other borrowing fees?", url: FAQ_URLS.BORROWING_FEES },
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
    ],
  };
}

// A trove's rate is controlled either by the borrower directly or, when the
// trove is delegated to a batch manager, by that delegate (it sets one shared
// rate across its batch). `delegated`/`delegateName` come from the position in
// view so the copy names who actually controls THIS trove's rate, rather than
// asserting only the borrower can — see feedback-position-copy-voice.
export function liquityInterestRateContent(opts?: { delegated?: boolean; delegateName?: string }): LearnMoreContent {
  const delegated = opts?.delegated ?? false;
  const delegateLabel = opts?.delegateName ? `the ${opts.delegateName} delegate` : "a batch-manager delegate";
  return {
    title: "How Interest Rates Work",
    intro: delegated
      ? `Each trove carries an annual interest rate that accrues continuously to its debt. This trove's rate is managed by ${delegateLabel} the borrower appointed, which sets one shared rate across a group of troves; the borrower can take back direct control by removing the trove from the batch.`
      : "Each trove carries an annual interest rate that accrues continuously to its debt. The borrower can change the rate at any time, or delegate that to a batch manager that runs one shared rate for a group of troves.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Who sets the rate",
        text: delegated
          ? "the appointed delegate sets the rate on the borrower's behalf, until the borrower leaves the batch. Lower rates cost less but sit earlier in the redemption queue."
          : "the borrower sets the rate, or delegates it to a batch manager. Lower rates cost less but sit earlier in the redemption queue.",
      },
      {
        bold: "Continuous accrual",
        text: "interest compounds onto the principal over time rather than being charged upfront.",
      },
      {
        bold: "Premium on change",
        text: "changing the rate soon after the last adjustment can incur an upfront premium, discouraging rate-gaming.",
      },
    ],
    links: [
      { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
      { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
    ],
  };
}

export function liquityDelegationContent(): LearnMoreContent {
  return {
    title: "How Interest Delegation Works",
    intro:
      "A trove can delegate interest-rate management to a batch manager — a delegate that sets one shared rate for a group of troves and charges a management fee.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Batch manager",
        text: "a delegate that sets a single interest rate applied to every trove in its batch.",
      },
      {
        bold: "Management fee",
        text: "an annual fee, on top of the interest, that accrues to the debt as the delegate's compensation.",
      },
      {
        bold: "Joining & leaving",
        text: "a trove can join or exit a batch at any time; leaving returns rate control to the owner.",
      },
    ],
    links: [
      { label: "What is interest-rate delegation?", url: FAQ_URLS.DELEGATION },
      { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
    ],
  };
}

export function liquityTransferContent(): LearnMoreContent {
  return {
    title: "How Trove Transfers Work",
    intro: "A trove is an ERC-721 NFT, so its ownership can be transferred to another wallet like any other token.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Trove NFT",
        text: "ownership of the position is a transferable NFT — whoever holds it controls the trove.",
      },
      {
        bold: "Transfer effects",
        text: "transferring the NFT hands full control of the collateral and debt to the new owner.",
      },
      {
        bold: "Multiple troves",
        text: "one address can hold many troves, each a separate NFT and position.",
      },
    ],
    links: [
      { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
    ],
  };
}

// Generic Liquity fallback — guarantees the "never empty" floor for any trove
// event without a dedicated modal. Wired as the resolver's default.
export function liquityEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Liquity V2 Troves Work",
    intro:
      "Liquity V2 lets a borrower take out BOLD against collateral in a trove — a self-custodied position represented by an NFT.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Trove",
        text: "the borrowing position — collateral in, BOLD out, with a collateral ratio to keep above the threshold.",
      },
      {
        bold: "Interest rate",
        text: "a user-set rate that accrues to the debt and sets the trove's place in the redemption queue.",
      },
      {
        bold: "Redemptions",
        text: "BOLD can be redeemed for collateral at face value, starting with the lowest-rate troves.",
      },
    ],
    links: [
      { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
      { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
      { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
    ],
  };
}

// Generic Aave V4 fallback — the "never empty" floor for any Aave event without
// a dedicated modal (supply / withdraw / borrow / repay / collateral_toggle).
// P2 will replace these with mechanic-specific content.
export function aaveV4EventFallbackContent(): LearnMoreContent {
  return {
    title: "How Aave V4 Positions Work",
    intro:
      "Aave V4 lets a user supply assets as collateral and borrow against them inside an isolated spoke, where one shared health factor governs the whole position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supply & collateral",
        text: "supplied assets earn interest and, when enabled, back the borrowing.",
      },
      {
        bold: "Borrowing & health factor",
        text: "borrowing draws against the collateral; the health factor measures how safely the debt is covered.",
      },
      {
        bold: "Hub & spoke",
        text: "each spoke isolates risk — one shared health factor inside, fully independent between spokes.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

// ── Aave V4 — Event-card modals (process events) ─────────────────────────────
//
// Mechanic-specific content mapped from event types by the event explainer's
// resolver. Same slot grammar as the Liquity event modals.

export function aaveV4SupplyContent(): LearnMoreContent {
  return {
    title: "How Supplying Works",
    intro:
      "Supplying deposits an asset into a spoke, where it earns interest and — if enabled as collateral — can back borrowing. Withdrawing reverses it.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supplied balance",
        text: "the deposit, which accrues supply interest continuously and stays withdrawable unless it's backing a borrow.",
      },
      {
        bold: "Collateral toggle",
        text: "each supplied asset can be switched on or off as collateral; only collateral-enabled supply supports borrowing.",
      },
      {
        bold: "Withdrawing",
        text: "any supply not currently needed to keep borrows covered can be withdrawn.",
      },
      {
        bold: "Position managers",
        text: "contracts an owner can approve to act on a position for them. A manager that supplies or repays pays with its own funds, so it needs only that approval; one that withdraws or borrows sends the tokens to itself, so it also needs an allowance the owner grants per asset. Governance activates each manager, and the owner can revoke one at any time.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

export function aaveV4WithdrawContent(): LearnMoreContent {
  return {
    title: "How Withdrawing Works",
    intro:
      "Withdrawing takes supplied assets, with the interest they have earned, out of a spoke and back to the wallet. A withdrawal can name an amount or take the whole balance.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Health factor",
        text: "with a borrow open, withdrawing collateral lowers the health factor. The spoke allows it while the factor stays at or above 1; a factor close to 1 leaves the position near liquidation.",
      },
      {
        bold: "Supply with no debt against it",
        text: "a supply that backs no borrow, or one not enabled as collateral, can be withdrawn in full.",
      },
      {
        bold: "Risk premium",
        text: "withdrawing collateral while a borrow is open is a risk-increasing action, so the spoke recalculates the position's risk premium.",
      },
      {
        bold: "Paused reserves",
        text: "a reserve that governance has paused cannot be withdrawn from until it is unpaused.",
      },
      {
        bold: "Position managers",
        text: "a manager the owner has approved can withdraw for them; because the tokens go to the manager, it also needs an allowance the owner grants for that asset.",
      },
    ],
    links: [
      { label: "Withdrawing on Aave V4", url: "https://aave.com/docs/aave-v4/positions/withdraw" },
      { label: "Position managers", url: "https://aave.com/docs/aave-v4/positions/managers" },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}

export function aaveV4BorrowContent(): LearnMoreContent {
  return {
    title: "How Borrowing Works",
    intro:
      "Borrowing draws an asset against the supplied collateral within a spoke. Repaying returns the asset and frees up that collateral.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowing power",
        text: "each collateral counts at its collateral factor, one figure per asset that sets both how much can be borrowed and where liquidation starts, so a borrow can take the health factor down to 1.",
      },
      {
        bold: "Health factor",
        text: "borrowing lowers the health factor; if it falls below 1 the position can be liquidated.",
      },
      {
        bold: "Borrow interest",
        text: "debt accrues interest continuously at the asset's borrow rate until it's repaid.",
      },
      {
        bold: "What moves the rate",
        text: "the hub that lends the asset sets its borrow rate from how much of its supply is borrowed: the rate rises slowly up to a target share and steeply past it, so every borrow, repay, supply and withdrawal on that hub moves it. Aave V4 can add a per-user risk premium on top, scaled by the quality of the collateral, recalculated on each borrow and withdrawal; every position Rails has read carries a zero premium.",
      },
      {
        bold: "Position managers",
        text: "a contract the owner has approved can borrow for them. Because the borrowed tokens go to the manager, it also needs an allowance the owner grants for that asset; governance activates each manager, and the owner can revoke one at any time.",
      },
    ],
    links: [
      { label: "Borrowing on Aave V4", url: "https://aave.com/docs/aave-v4/positions/borrow" },
      { label: "Position managers", url: "https://aave.com/docs/aave-v4/positions/managers" },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}

export function aaveV4RepayContent(): LearnMoreContent {
  return {
    title: "How Repaying Works",
    intro:
      "Repaying returns borrowed tokens to the spoke, which lowers the debt, raises the health factor and frees collateral for withdrawal or further borrowing.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Partial or full",
        text: "any amount can be repaid at any time; repaying the full amount clears that asset's debt, including the interest it has accrued.",
      },
      {
        bold: "Interest",
        text: "debt grows with interest every block, so the amount owed at repayment is more than was borrowed. Whatever is left after a partial repay keeps accruing at the asset's borrow rate.",
      },
      {
        bold: "Repaying for someone else",
        text: "a position manager the owner has approved can repay the owner's debt with its own tokens. It needs no per-asset allowance, since no value leaves the position.",
      },
      {
        bold: "Token approval",
        text: "the repaying account first approves the spoke to take the tokens, in a separate transaction or with a signed permit.",
      },
    ],
    links: [
      { label: "Repaying on Aave V4", url: "https://aave.com/docs/aave-v4/positions/repay" },
      { label: "Position managers", url: "https://aave.com/docs/aave-v4/positions/managers" },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}

export function aaveV4CollateralToggleContent(): LearnMoreContent {
  return {
    title: "How Collateral Works",
    intro:
      "Each supplied asset can be enabled or disabled as collateral. Only enabled assets back borrowing and count toward the health factor.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral toggle",
        text: "turning an asset on lets it back borrows; turning it off removes it from borrowing power.",
      },
      {
        bold: "Health-factor impact",
        text: "disabling collateral lowers the health factor, so it's blocked if doing so would leave the position unsafe.",
      },
      {
        bold: "Isolated per spoke",
        text: "collateral only backs borrows within the same spoke — spokes never share risk.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

// Generic Aave position-panel fallback — the "never empty" floor for the spoke
// position panel when a spoke has no editorial metadata. State-explainer, so
// titled "About this position".
export function aaveV4PositionFallbackContent(): LearnMoreContent {
  return {
    title: "About This Position",
    intro:
      "This panel explains an Aave V4 position in plain language — what's supplied as collateral, what's borrowed against it, and how safely the debt is covered.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supply & collateral",
        text: "supplied assets earn interest and, when enabled, back the borrowing.",
      },
      {
        bold: "Health factor",
        text: "measures how safely the debt is covered; below 1.0 the position can be liquidated.",
      },
      {
        bold: "Hub & spoke",
        text: "each spoke isolates risk — one shared health factor inside, fully independent between spokes.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

// ── Aave V4 — Economics panel ────────────────────────────────────────────────
//
// State-explainer for the spoke economics section (lifetime towers + price
// runways + health factor). Scoped to that section, distinct from the position
// panel's "About this position".
//
// Layer-2 modal: it explains how the economics section works *in general* and
// must read identically on every position — so it takes no per-position arguments
// and never branches on live state (e.g. whether this wallet currently carries
// debt). A supply-only position simply doesn't render the runway sub-section; the
// modal still teaches what it shows. See learn-more-modal-grammar.md §1.
/** The Lifetime flows modal. Rows the panel can show only when the position
 *  has them (supply interest, liquidations) are named only then. */
export function aaveV4EconomicsContent(
  has: { supplyInterest?: boolean; liquidations?: boolean } = {},
): LearnMoreContent {
  const details: LearnMoreContent["details"] = [
    {
      bold: "Collateral tower",
      text: `what was deposited${has.supplyInterest ? " plus the interest it earned" : ""}, set against what left: withdrawals${has.liquidations ? " and collateral seized in liquidations" : ""}. What remains is the collateral held today.`,
    },
    {
      bold: "Debt tower",
      text: `what was borrowed plus the interest it accrued, set against what was repaid${has.liquidations ? " and what liquidators repaid" : ""}. What remains is the debt owed today.`,
    },
    {
      bold: "Interest",
      text: "no event moves it: balances grow every block, so interest is what a balance holds beyond the amounts its events moved.",
    },
  ];
  if (has.liquidations) {
    details.push({
      bold: "Liquidation cost",
      text: "a liquidator takes collateral worth more than the debt it repays. The difference is the liquidation bonus, and it is what a liquidation costs the borrower.",
    });
  }
  return {
    title: "About Lifetime Flows",
    intro:
      "This panel totals every token that has moved into and out of a position over its life, as two towers: collateral on one side, debt on the other.",
    detailsHeading: "Key concepts:",
    details,
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Liquidations in Aave V4", url: "https://aave.com/docs/aave-v4/positions/liquidations" },
    ],
  };
}

// ── Aave V4 — Spoke architecture ─────────────────────────────────────────────

// Generic, per-spoke-type explainer for the Aave V4 Hub & Spoke model. The copy
// is keyed purely by spoke name (archetype, hub mapping, narrative) and carries
// nothing about the wallet's position, so it belongs in the shared Learn-More
// modal rather than inline on the card. Returns null for spokes without
// editorial metadata so the caller can omit the "?" affordance.
export function aaveV4SpokeContent(spokeName: string): LearnMoreContent | null {
  const meta = getSpokeMeta(spokeName);
  if (!meta) return null;

  const hub = (h: HubTier) => HUB_TIER_LABEL[h];
  const sameHub = meta.borrowHubs.length === 1 && meta.borrowHubs[0] === meta.collateralHub;
  const hubMapping = sameHub
    ? `Here ${hub(meta.collateralHub)} is the hub and ${meta.name} the spoke: collateral supplied to ${meta.name} and what it lends both sit in the ${hub(meta.collateralHub)} hub.`
    : `Here ${meta.name} is the spoke: its collateral sits in the ${hub(meta.collateralHub)} hub, and it borrows from the ${meta.borrowHubs.map(hub).join(" and ")} hub${meta.borrowHubs.length > 1 ? "s" : ""}.`;

  const extraParagraphs = [ARCHETYPE_GLOSS[meta.archetype], ...meta.narrative];
  if (meta.rateNote) extraParagraphs.push(meta.rateNote);

  return {
    title: `How the ${meta.name} Spoke Works`,
    intro: `Aave V4 splits lending in two. A hub holds the pooled tokens and sets their interest rates; a spoke is the market you use, with its own list of collateral, its own risk settings and its own health factor, and it draws tokens from a hub up to a limit the hub sets. ${hubMapping}`,
    extraParagraphs,
    links: meta.links ?? SPOKE_DOC_LINKS,
  };
}

// ── Aave V4 — Liquidations ───────────────────────────────────────────────────

// Generic explainer for Aave V4 liquidations. The mechanism is identical across
// every spoke and hub, so this carries nothing wallet-specific; an optional
// spokeName only adds the shared "which spoke this touched" framing (still the
// same for every wallet on that spoke). Reused by every liquidation event card.
export function aaveV4LiquidationContent(spokeName?: string): LearnMoreContent {
  const meta = spokeName ? getSpokeMeta(spokeName) : null;
  const marketNote = meta
    ? ` This liquidation happened on the ${meta.name} spoke — under Aave V4's Hub & Spoke model it only touches collateral and debt inside that spoke, so positions on other spokes are unaffected.`
    : " Under Aave V4's Hub & Spoke model a liquidation only touches collateral and debt inside the affected spoke, so positions on other spokes are unaffected.";

  return {
    title: "How Liquidations Work",
    intro:
      "An Aave V4 position becomes eligible for liquidation when its health factor falls below 1.0 — the point where the borrowed value, measured against each collateral asset's liquidation threshold, is no longer sufficiently covered. Once eligible, anyone (in practice, automated liquidator bots) can step in.",
    extraParagraphs: [
      "A liquidator repays part of the outstanding debt and, in return, receives the same value of the borrower's collateral plus a liquidation bonus, so the collateral seized is worth more than the debt repaid. The bonus follows a Dutch auction: the lower the health factor, the higher the bonus, up to a maximum each Spoke sets per collateral asset. It is the liquidator's incentive and the borrower's penalty." +
        marketNote,
      "A liquidator repays only enough to bring the health factor back to a healthy level, with one exception: if a partial liquidation would leave less than $1,000 of debt in the reserve being repaid, the liquidator must repay all of that reserve's debt.",
      "Health factor = (collateral value × each asset's liquidation threshold) ÷ total debt. To stay safe, keep it comfortably above 1.0 by holding more collateral or carrying less debt; falling collateral prices or rising debt both push it down.",
    ],
    links: [
      { label: "Health factor & liquidations", url: "https://aave.com/help/borrowing/liquidations" },
      { label: "Liquidations in Aave V4", url: "https://aave.com/docs/aave-v4/positions/liquidations" },
      { label: "Aave FAQ", url: "https://aave.com/faq" },
    ],
  };
}

// ── Curve ────────────────────────────────────────────────────────────────────

// ── Uniswap V3 ───────────────────────────────────────────────────────────────

// ── Stability Pool ──────────────────────────────────────────────────────────

// ── Governance ───────────────────────────────────────────────────────────────

// ── Vaults ───────────────────────────────────────────────────────────────────

// Page-level explainer for the cross-hub comparison surface (/aave-v4/hubs).
// Layer-2 mechanic only — no snapshot numbers, so it reads identically on any
// block. Concepts mirror what the band + table actually show: hubs, spokes,
// credit lines / utilisation, and the LT range.
export function aaveV4HubsContent(): LearnMoreContent {
  return {
    title: "How hubs and spokes work",
    intro:
      "Aave V4 splits lending into Liquidity Hubs — the shared pools that hold supplied assets and set each market's caps and rates — and Spokes, the markets people supply to and borrow from. A Spoke draws liquidity from a Hub over a credit line, and can hold lines to more than one Hub.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Liquidity Hub",
        text: "the pool that custodies supplied assets and backs borrowing. Separate hubs (Core, Plus, Prime, Global Dollar) don't co-mingle liquidity.",
      },
      {
        bold: "Spoke",
        text: "a market users interact with, drawing from a Hub. One spoke can draw from more than one — Bluechip keeps its collateral in Prime and borrows from both Prime and Core.",
      },
      {
        bold: "Credit line & utilisation",
        text: "the cap a Hub grants a Spoke to draw an asset; utilisation is how much of that line is currently drawn.",
      },
      {
        bold: "Liquidation threshold (LT)",
        text: "the share of an asset's value borrowable against it before liquidation; shown as a range when spokes set it differently.",
      },
    ],
    links: [
      { label: "Aave V4 architecture", url: AAVE_FAQ_URLS.V4_ARCHITECTURE },
      { label: "Hubs & liquidity model", url: AAVE_FAQ_URLS.V4_LIQUIDITY_MODEL },
      { label: "Aave V4 docs", url: AAVE_FAQ_URLS.V4_DOCS },
    ],
  };
}

// Page-level explainer for Aave V4 on Base's hub page (/base/aave-v4/hubs):
// one hub, one spoke, the reserves' parameters and the stock feeds' hours.
// Mechanics only, no snapshot numbers.
export function aaveV4BaseHubContent(): LearnMoreContent {
  return {
    title: "How the Equities hub works",
    intro:
      "Aave V4 on Base has one Liquidity Hub, the Equities hub, holding one USDC reserve, and one Spoke drawing from it, Mag7. Seven Coinbase tokenized stocks are supplied to the Spoke as collateral and USDC is borrowed against them; the stocks cannot themselves be borrowed.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral factor",
        text: "the share of a stock's value that counts toward the health factor. A position's health factor is its collateral, each asset weighted by its factor, divided by its debt; below 1.0 it can be liquidated.",
      },
      {
        bold: "Supply cap and credit line",
        text: "the hub caps how much of each asset the Spoke may add (the supply cap) and how much USDC it may draw (the credit line), in whole tokens.",
      },
      {
        bold: "Stock prices",
        text: "each stock's price is a Chainlink feed that publishes from Sunday 20:00 ET to Friday 20:00 ET and holds its last value outside those hours; the Aave market itself stays open, so a weekend price can be days old. Rails states when each price was published.",
      },
      {
        bold: "Paused reserve",
        text: "a split or other corporate action pauses the stock's reserve until the token's multiplier is updated. Dividends are reinvested into the token. Coinbase can also pause a stock at its token registry, which holds the stock's price feed at its last value; the Spoke does not read that flag, so the reserve stays open at the held price. Rails reads both and states each.",
      },
    ],
    links: [
      { label: "Coinbase tokenized stocks on Aave V4", url: "https://aave.com/blog/coinbase-tokenized-stocks" },
      { label: "Aave V4 docs", url: "https://aave.com/docs/aave-v4" },
      { label: "ARFC: deploy Aave V4 on Base", url: "https://governance.aave.com/t/arfc-deploy-aave-v4-on-base/25427" },
    ],
  };
}

// Page-level explainer for the V3-family market-overview surfaces
// (/aave-v3/market, /spark/market) — the single-market counterpart of
// aaveV4HubsContent. Layer-2 mechanics only, no snapshot numbers, so it reads
// identically on any block. Concepts mirror what the band and the reserve list
// show: reserves, rates and the kink, LTV, LT, bonus, caps, closed states, price.
export function aaveMarketOverviewContent(market: "aave-v3" | "aave-v3-base" | "seamless" | "spark"): LearnMoreContent {
  const spark = market === "spark";
  const onBase = market === "aave-v3-base";
  const seamless = market === "seamless";
  const name = spark ? "SparkLend" : seamless ? "Seamless" : "Aave V3";
  return {
    title: "How the market overview works",
    intro: seamless
      ? "Seamless is a single Aave-V3-architecture market on Base: one Pool holding every reserve, with all of a wallet's supplied assets cross-collateralised under one health factor. It is a fork rather than an Aave deployment, with its own contracts, its own risk parameters and its own oracle. Every one of its reserves has been frozen since April 2025, which closes the market to new supplies and new borrows while leaving interest, repayment, withdrawal and liquidation working exactly as before. This page reads each reserve's size, rates and risk parameters from that Pool and prices them with the oracle it liquidates with."
      : spark
        ? "SparkLend is a single Aave-V3-architecture market: one Pool holding every reserve, with all of a wallet's supplied assets cross-collateralised under one health factor. This page reads each reserve's size, rates and risk parameters live from that Pool and prices them with SparkLend's own oracle."
        : onBase
          ? "Aave V3 on Base is one Pool holding every reserve, with all of a wallet's supplied assets cross-collateralised under one health factor. It is a separate deployment from Aave V3 on Ethereum — its own reserves, its own risk parameters, its own oracle — so a wallet's position on one says nothing about its position on the other. This page reads each reserve's size, rates and risk parameters from that Pool and prices them with the oracle it liquidates with."
          : "Aave V3 Core is one Pool holding every reserve, with all of a wallet's supplied assets cross-collateralised under one health factor. This page reads each reserve's size, rates and risk parameters live from that Pool and prices them with Aave's own oracle.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Reserve",
        text: `one listed asset in the Pool: its supplied balance (the aToken supply), its variable debt, and the governance-set risk parameters that apply market-wide.`,
      },
      {
        bold: "Utilisation & rates",
        text: spark
          ? "utilisation is borrowed ÷ supplied per reserve. Most SparkLend rates follow a utilisation curve; DAI is the exception — its borrow rate is set by Sky governance (the D3M policy rate), not by utilisation."
          : "utilisation is borrowed ÷ supplied per reserve; the interest-rate curve prices borrowing from it, and suppliers earn the borrow interest net of the reserve factor.",
      },
      {
        bold: "Utilisation bar",
        text: "the blue fill is utilisation, and the tick is the reserve's kink: the utilisation at which its interest-rate strategy makes borrowing steeply more expensive. A reserve whose strategy names no kink has no tick.",
      },
      {
        bold: "Loan-to-value (LTV)",
        text: "the most a wallet can borrow against a reserve, as a share of its value. At 0 the reserve backs no new borrowing, though positions that hold it still count it toward their liquidation threshold; an eMode category can lend it a loan-to-value of its own, and the row then says it is 0 outside eMode.",
      },
      {
        bold: "Liquidation threshold (LT)",
        text: "the share of a reserve's value that counts toward covering debt; a reserve with no LT can be borrowed but not used as collateral. Where an eMode category judges the reserve by a different threshold, that figure follows.",
      },
      {
        bold: "Liquidation bonus",
        text: "the extra collateral a liquidator receives, as a share of the debt they repay.",
      },
      {
        bold: "Caps used",
        text: spark
          ? "how much of each side's cap is in use: supply (the aToken supply plus interest owed to the treasury, which the Pool counts) and borrow. SparkLend's CapAutomator keeps each live cap a short step above use and raises it automatically up to a governance-set maximum, so use is measured against that maximum; where the automator holds no setting for a reserve, against the live cap. A cap of one token closes that side, and the largest value the field can hold means no cap."
          : "how much of each side's cap is in use: supply (the aToken supply plus interest owed to the treasury, which the Pool counts) and borrow. Governance closes a side by setting its cap to one whole token, which reads as closed; a cap of 0 means no cap.",
      },
      {
        bold: "Closed to new business",
        text: "a reserve that is frozen or paused, has borrowing switched off, has a side capped at one token, or has a loan-to-value of 0 while still counting as collateral. The summary counts each such reserve once, however many of these apply.",
      },
      {
        bold: "Oracle price",
        text: `USD comes from ${name}'s own IAaveOracle — the same prices the Pool liquidates with, not an off-chain feed.`,
      },
      ...(seamless
        ? [
            {
              bold: "Frozen",
              text: "a bit in the reserve's own configuration word. A frozen reserve accepts no new supply and no new borrow, but keeps accruing interest and stays liquidatable — so a frozen market's rates and thresholds are live and enforced rather than historical. All eighteen here were frozen in one block.",
            },
          ]
        : []),
    ],
    links: seamless
      ? [
          { label: "Seamless docs", url: SEAMLESS_DOCS_URL },
          { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
          { label: "Borrowing", url: AAVE_FAQ_URLS.BORROWING },
        ]
      : spark
        ? [
            { label: "SparkLend docs", url: "https://docs.spark.fi/products/sparklend" },
            { label: "Spark FAQ", url: "https://docs.spark.fi/faq" },
          ]
        : onBase
          ? [
              { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
              { label: "Borrowing", url: AAVE_FAQ_URLS.BORROWING },
              { label: "Aave on Base", url: "https://app.aave.com/markets/?marketName=proto_base_v3" },
            ]
          : [
              { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
              { label: "Borrowing", url: AAVE_FAQ_URLS.BORROWING },
              { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
            ],
  };
}

// ── Aave V3 — Event-card modals ──────────────────────────────────────────────
//
// Mirrors the V4 event modals, but for V3's single-Pool model: one cross-
// collateralised account per wallet (no spokes / isolation), so the mechanics
// talk about the whole account sharing one health factor rather than per-spoke
// isolation. Mapped from event types by the V3 event explainer's resolver.
//
// Shared with Seamless (an Aave V3 fork on Base): the same machine, so the
// same mechanics prose — only the protocol's name and the docs it points at
// change. `protocol` defaults to Aave V3 so every existing caller reads
// byte-for-byte what it read before.

/** The modal's links for this protocol. Aave's help pages explain the
 *  mechanics a fork inherits, so a fork keeps the mechanic links and swaps
 *  the general "Aave FAQ" for its own docs, first — the market overview's
 *  precedent (aaveMarketOverviewContent). */
function v3ModalLinks(protocol: V3Protocol, links: { label: string; url: string }[]): { label: string; url: string }[] {
  if (protocol === "Aave V3") return links;
  return [{ label: `${protocol} docs`, url: SEAMLESS_DOCS_URL }, ...links.filter((l) => l.label !== "Aave FAQ")];
}

export function aaveV3SupplyWithdrawContent(
  eventType: "supply" | "withdraw",
  protocol: V3Protocol = "Aave V3",
): LearnMoreContent {
  const pool = `${v3Possessive(protocol, "'")} Pool`;
  if (eventType === "withdraw")
    return {
      title: "How Withdrawing Works",
      intro: `Withdrawing returns supplied assets from ${pool} to a wallet, burning the matching aTokens. It can go only as far as the collateral left keeps any debt covered.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Interest comes with it",
          text: "the supplied balance includes the supply interest earned so far, so more can come out than went in.",
        },
        {
          bold: "Health factor",
          text: "withdrawing collateral lowers the account's health factor. The Pool refuses a withdrawal that would leave it below 1.0; one that leaves it just above is allowed, and a later price fall can then make the account liquidatable.",
        },
        {
          bold: "Only the owner",
          text: "a withdrawal takes the sender's own aTokens, so no other account can withdraw from this position. The tokens can be sent to any address.",
        },
        {
          bold: "Available liquidity",
          text: "the asset has to be in the Pool to leave it: when most of a reserve is borrowed, a withdrawal can wait until borrowers repay or new supply arrives.",
        },
      ],
      links: v3ModalLinks(protocol, [
        { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
        { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
        { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
      ]),
    };
  return {
    title: "How Supplying Works",
    intro: `Supplying deposits an asset into ${pool}, which mints aTokens for it. The deposit earns the variable supply rate and, while it is on as collateral, backs borrowing.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supplied balance",
        text: "the aToken balance grows with the supply rate, so the deposit accrues interest without a transaction.",
      },
      {
        bold: "Collateral on or off",
        text: "each supplied asset is on or off as collateral for the account. On a first supply of an asset that can back borrowing, the Pool switches it on in the same transaction; the owner can switch it off while the debt stays covered.",
      },
      {
        bold: "One account",
        text: `${protocol} pools every asset on as collateral into one account per wallet and market: all of it backs all of the account's borrowing, under one health factor.`,
      },
      {
        bold: "Supplying for someone else",
        text: "anyone can supply on behalf of any account; the deposit belongs to that account and needs nothing from its owner.",
      },
    ],
    links: v3ModalLinks(protocol, [
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
  };
}

export function aaveV3BorrowRepayContent(
  eventType: "borrow" | "repay",
  protocol: V3Protocol = "Aave V3",
): LearnMoreContent {
  if (eventType === "repay")
    return {
      title: "How Repaying Works",
      intro:
        "Repaying returns borrowed tokens to the Pool, burning the matching debt tokens. The debt falls, the health factor rises, and collateral is freed to withdraw or borrow against.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Partial or full",
          text: "any amount can be repaid at any time; repaying the whole balance clears that asset's debt, interest included.",
        },
        {
          bold: "Interest",
          text: "debt grows with the variable borrow rate every block, so the amount owed at repayment is more than was borrowed. What is left after a partial repay keeps accruing.",
        },
        {
          bold: "Repaying with aTokens",
          text: "a debt can be repaid with supplied tokens of the same asset, burning those aTokens instead of taking tokens from the wallet.",
        },
        {
          bold: "Repaying for someone else",
          text: "anyone can repay any account's debt; it needs nothing from the owner.",
        },
      ],
      links: v3ModalLinks(protocol, [
        { label: "Borrowing assets", url: AAVE_FAQ_URLS.BORROWING },
        { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
        { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
      ]),
    };
  return {
    title: "How Borrowing Works",
    intro:
      "Borrowing draws an asset from the Pool against the account's collateral, minting debt tokens that accrue variable borrow interest until repaid.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowing power",
        text: "the account can borrow up to its collateral's value times each asset's loan-to-value (LTV). The liquidation threshold, a little higher, is where it becomes liquidatable.",
      },
      {
        bold: "One shared health factor",
        text: "the account has one health factor across all its collateral and debt; borrowing lowers it, and below 1.0 the account can be liquidated.",
      },
      {
        bold: "Variable borrow interest",
        text: "the rate moves with how much of the reserve is borrowed, and applies to the whole debt while it lasts.",
      },
      {
        bold: "Borrowing for someone else",
        text: "credit delegation: the owner approves another account on the asset's debt token for an amount they set, and that account can then borrow against the owner's collateral. The debt is the owner's.",
      },
    ],
    links: v3ModalLinks(protocol, [
      { label: "Borrowing assets", url: AAVE_FAQ_URLS.BORROWING },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
  };
}

export function aaveV3LiquidationContent(protocol: V3Protocol = "Aave V3"): LearnMoreContent {
  const aave = protocol === "Aave V3";
  const account = aave ? "An Aave V3 account" : `A ${protocol} account`;
  return {
    title: "How Liquidations Work",
    intro: `${account} can be liquidated when its health factor falls below 1.0: its collateral, each asset counted up to its liquidation threshold, no longer covers its debt. Anyone can then liquidate it; in practice automated bots do.`,
    extraParagraphs: [
      "A liquidator repays some of one debt asset and takes one collateral asset in return, worth the debt repaid plus the collateral asset's liquidation bonus, which governance sets per asset. The bonus is the liquidator's reward and the borrower's cost. A share of it, the liquidation protocol fee, goes to the treasury as aTokens in the same transaction.",
      aave
        ? "One liquidation may repay up to half of the account's total debt. It may repay all of the debt asset when the health factor is at or below 0.95, or when the account's position in the debt or the collateral asset is worth under $2,000. The account stays open, and it can be liquidated again while its health factor is below 1.0."
        : `One liquidation may repay up to half of the debt asset it repays, or all of it when the health factor is below 0.95. The account stays open, and it can be liquidated again while its health factor is below 1.0.`,
      "Health factor = (collateral value × each asset's liquidation threshold) ÷ total debt. More collateral or less debt keeps it above 1.0.",
    ],
    links: v3ModalLinks(protocol, [
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
  };
}

export function aaveV3BadDebtContent(protocol: V3Protocol = "Aave V3"): LearnMoreContent {
  const brand = v3Brand(protocol);
  const isAave = protocol === "Aave V3";
  return {
    title: "How Bad Debt Is Written Off",
    intro: `A liquidation can seize the last of an account's collateral while some of its debt is still outstanding. Nothing is left for a liquidator to take in return for repaying that remainder, so no one will. ${brand} does not leave it on the account: in the same transaction it burns the remaining debt tokens and records the amount as a deficit on the reserve.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Not a repayment",
        text: "no one paid the written-off amount. The borrower's debt on that reserve is cleared and the reserve carries the shortfall.",
      },
      {
        bold: "Who absorbs it",
        text: isAave
          ? "the reserve's deficit is covered by Aave's Umbrella safety module and the DAO treasury, not by charging other borrowers."
          : `the reserve's deficit is covered from ${brand}'s own reserves, not by charging other borrowers.`,
      },
      {
        bold: "Why it happens",
        text: "a fast price move, or a thin and volatile collateral, can carry a position past the point where the seized collateral still covers the debt before liquidators reach it.",
      },
      {
        bold: "Recorded on chain",
        text: "the Pool emits one DeficitCreated event per reserve written off. This row is that event, and it sits beside the liquidation that triggered it.",
      },
    ],
    links: v3ModalLinks(protocol, [
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
  };
}

export function aaveV3TransferContent(protocol: V3Protocol = "Aave V3"): LearnMoreContent {
  return {
    title: "How Position Transfers Work",
    intro: `Supplied balances on ${protocol} live as aTokens — ERC-20s that can move between accounts like any token. Transferring aTokens hands a supplied position (or part of one) to another account without withdrawing to a wallet and re-supplying. Custody changes hands; the tokens never leave the Pool.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Not a deposit or withdrawal",
        text: "a transfer is a change of custody, so the lifetime flows give it a separate row from supplied and withdrawn. Two transfers count as something else: one to the WETH gateway is a withdrawal to ETH (the gateway withdraws it in the same transaction), and a liquidation's protocol fee to the treasury counts with the collateral the liquidation took.",
      },
      {
        bold: "Two accounts, one move",
        text: "the same on-chain transfer shows as an out-leg on the sender and an in-leg on the recipient; each account's running balance stays exact because both legs are replayed.",
      },
      {
        bold: "Health still enforced",
        text: "the Pool blocks any transfer that would leave the sender's remaining collateral unable to cover its debt — the sender's health factor must stay above 1.0 after the move.",
      },
      {
        bold: "Interest rides along",
        text: "aTokens are interest-bearing: the amount shown is the underlying the transferred aTokens were worth at that moment, and it keeps earning the supply rate in the new account.",
      },
    ],
    links: v3ModalLinks(protocol, [
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
  };
}

/** Official sources for the swap modals: Aave's help page on withdrawing
 *  (the app's withdraw-and-switch), and the adapters' source in Aave's own
 *  periphery repository. */
const AAVE_V3_SWAP_SOURCES = {
  WITHDRAW_HELP: "https://aave.com/help/supplying/withdraw-tokens",
  REPAY_ADAPTER:
    "https://github.com/aave/aave-v3-periphery/blob/master/contracts/adapters/paraswap/ParaSwapRepayAdapter.sol",
  WITHDRAW_SWAP_ADAPTER:
    "https://github.com/aave/aave-v3-periphery/blob/master/contracts/adapters/paraswap/ParaSwapWithdrawSwapAdapter.sol",
  LIQUIDITY_SWAP_ADAPTER:
    "https://github.com/aave/aave-v3-periphery/blob/master/contracts/adapters/paraswap/ParaSwapLiquiditySwapAdapter.sol",
  DEBT_SWAP_ADAPTER: "https://github.com/bgd-labs/aave-debt-swap",
} as const;

export function aaveV3RepayWithCollateralContent(): LearnMoreContent {
  return {
    title: "How Repaying with Collateral Works",
    intro:
      "Repaying with collateral pays a debt with the account's own supplied collateral instead of tokens from the wallet: in one transaction, part of the collateral is withdrawn, swapped for the debt asset, and used to repay.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One transaction",
        text: "Aave's repay adapter takes the owner's supplied collateral (the owner approves it first), withdraws it, swaps it through ParaSwap for the debt asset and repays. Where taking the collateral first would leave the account unhealthy, it repays first with a flash loan, a loan taken and returned inside the same transaction, and pays that back from the swap.",
      },
      {
        bold: "Leftover supplied back",
        text: "the swap is sized with room for price movement. Collateral the swap did not use is supplied back to the account in the same transaction, so what left the position is the amount taken less that return.",
      },
      {
        bold: "Health factor",
        text: "the debt and the collateral both fall. When the debt falls by more, relative to each asset's liquidation threshold, the health factor rises, which is why it is used to pull an account back from the liquidation line without new funds.",
      },
      {
        bold: "Cost",
        text: "the swap's price and slippage, and a flash-loan fee where one is used, are paid out of the collateral sold.",
      },
    ],
    links: [
      { label: "ParaSwap repay adapter (Aave source)", url: AAVE_V3_SWAP_SOURCES.REPAY_ADAPTER },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

/** How a swap reached the market: an Aave ParaSwap adapter, or a CoW Protocol
 *  order (the Aave app's one-order contract). */
export type AaveV3SwapVenue = "paraswap" | "cow";

export function aaveV3CollateralSwapContent(venue: AaveV3SwapVenue = "paraswap"): LearnMoreContent {
  const para = venue === "paraswap";
  return {
    title: "How a Collateral Swap Works",
    intro:
      "A collateral swap trades one supplied asset for another without either leaving the position: in one transaction, part of a supplied balance is withdrawn, swapped, and the asset bought is supplied back to the same account.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One transaction",
        text: para
          ? "Aave's liquidity swap adapter takes the owner's aTokens (the owner approves it or signs a permit), withdraws the underlying, sells it through ParaSwap and supplies what it bought on the owner's behalf. Where the account needs that collateral to stay healthy while it moves, the adapter can use a flash loan, a loan taken and returned inside the same transaction, repaid from the owner's aTokens."
          : "The owner signs a CoW Protocol order. CoW Protocol's settlement takes the owner's aTokens (directly, or through a one-order contract the Aave app creates), sells them, and the asset bought is supplied back to the account.",
      },
      {
        bold: "Slippage",
        text: para
          ? "the owner sets how much of the new asset must arrive at least (minAmountToReceive); the swap reverts if the trade would deliver less. The price and slippage of the trade are paid out of the asset sold."
          : "the order names the least the owner accepts for the asset sold; it settles at that or better, or not at all.",
      },
      {
        bold: "Health factor",
        text: "the debt does not move, and the collateral's value changes only by the trade's cost, so the health factor moves little. It moves more where the two assets have different liquidation thresholds: the new asset's threshold replaces the old one's for the amount swapped.",
      },
      {
        bold: "Why do it",
        text: "to change which asset backs the debt without repaying it: to move into an asset with a higher supply rate or loan-to-value, to change exposure (out of BTC into a stablecoin, or back), or to leave an asset whose settings governance is changing.",
      },
    ],
    links: [
      ...(para
        ? [{ label: "ParaSwap liquidity swap adapter (Aave source)", url: AAVE_V3_SWAP_SOURCES.LIQUIDITY_SWAP_ADAPTER }]
        : []),
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

export function aaveV3DebtSwapContent(venue: AaveV3SwapVenue = "paraswap"): LearnMoreContent {
  const para = venue === "paraswap";
  return {
    title: "How a Debt Swap Works",
    intro:
      "A debt swap changes which asset the position owes: in one transaction a new debt is opened in another asset, swapped for the old debt's asset, and used to repay the old debt. The collateral does not move.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One transaction",
        text: para
          ? "Aave's debt swap adapter opens the new debt in the owner's name with a flash loan that stays open as variable debt (the owner gives it credit delegation for that asset, usually by a signed permit), buys exactly the old debt's asset through ParaSwap, and repays the old debt with it."
          : "The owner signs a CoW Protocol order; a one-order contract the Aave app creates borrows the new asset on the owner's behalf, sells it in CoW Protocol's settlement for the old debt's asset and repays the old debt.",
      },
      {
        bold: "Borrowed to fund it, returned unused",
        text: para
          ? "the trade buys an exact amount, so the adapter borrows a little more of the new asset than the trade is expected to need (the owner's slippage allowance, capped by maxNewDebtAmount). What the trade did not use repays part of the new debt at once, so the new debt that stays is what was borrowed less that return."
          : "the order names the most of the new asset the owner will sell; what the settlement did not use is not borrowed.",
      },
      {
        bold: "Health factor",
        text: para
          ? "the new debt is worth about what the old debt was, plus the trade's cost, so the health factor moves little at the time. Where the account is close to its borrowing limit, the adapter can also flash-borrow collateral for the length of the transaction so the Pool accepts the new debt."
          : "the new debt is worth about what the old debt was, plus the trade's cost, so the health factor moves little at the time.",
      },
      {
        bold: "What it changes",
        text: "the position now owes the new asset. Its dollar value follows that asset's price from here: owing BTC in place of a stablecoin means the debt, and with it the health factor, moves with BTC, and the variable rate is the new asset's.",
      },
      {
        bold: "Why do it",
        text: "to move to a lower borrow rate, to take a view on prices (owing an asset the owner expects to fall), or to hedge collateral held in the same asset.",
      },
    ],
    links: [
      ...(para
        ? [{ label: "ParaSwap debt swap adapter (Aave source)", url: AAVE_V3_SWAP_SOURCES.DEBT_SWAP_ADAPTER }]
        : []),
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

export function aaveV3WithdrawAndSwapContent(): LearnMoreContent {
  return {
    title: "How Withdraw and Swap Works",
    intro:
      "Withdraw and swap takes supplied tokens out of the Pool and swaps them for another token in one transaction; the Aave app calls it withdrawing and switching. The swapped tokens go to the wallet, outside the position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One transaction",
        text: "Aave's withdraw swap adapter takes the owner's supplied tokens (the owner approves it to), withdraws them from the Pool, swaps them through ParaSwap and sends the result to the owner.",
      },
      {
        bold: "A withdrawal first",
        text: "for the position it is a withdrawal: the supplied balance falls, and the Pool refuses it if the health factor would end below 1.0.",
      },
      {
        bold: "Cost",
        text: "the swap's price and slippage decide how much of the new token arrives.",
      },
    ],
    links: [
      { label: "Withdrawing (Aave help)", url: AAVE_V3_SWAP_SOURCES.WITHDRAW_HELP },
      { label: "ParaSwap withdraw swap adapter (Aave source)", url: AAVE_V3_SWAP_SOURCES.WITHDRAW_SWAP_ADAPTER },
    ],
  };
}

export function aaveV3EventFallbackContent(protocol: V3Protocol = "Aave V3"): LearnMoreContent {
  return {
    title: `How ${protocol} Positions Work`,
    intro: `${protocol} lets a wallet supply assets as collateral and borrow against them inside one cross-collateralised account, where a single shared health factor governs the whole position.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supply & collateral",
        text: "supplied assets earn interest and, unless disabled, back the account's borrowing as collateral.",
      },
      {
        bold: "Borrowing & health factor",
        text: "borrowing draws against the pooled collateral; the health factor measures how safely the combined debt is covered.",
      },
      {
        bold: "One pooled account",
        text: "all of a wallet's supply and debt in one market share one account and one health factor.",
      },
    ],
    links: v3ModalLinks(protocol, [
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Borrowing assets", url: AAVE_FAQ_URLS.BORROWING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
  };
}

// ── Spark (SparkLend) — Event-card modals ────────────────────────────────────
//
// SparkLend is an Aave V3 fork with the same single-Pool, cross-collateralised
// account model, so these mirror the V3 modals — reworded for Spark's own
// mechanics: the sDAI-centric collateral set (raw DAI's liquidation threshold
// is an on-chain epsilon — effectively not collateral), the Sky-governed DAI
// borrow rate (the D3M policy rate, not a utilization curve), and Spark's own
// docs as the links. URLs verified against docs.spark.fi 2026-07-12.

const SPARK_DOC_URLS = {
  SPARKLEND: "https://docs.spark.fi/products/sparklend",
  LIQUIDATIONS: "https://docs.spark.fi/products/sparklend/guides/liquidations",
  FAQ: "https://docs.spark.fi/faq",
} as const;

export function sparkSupplyWithdrawContent(eventType: "supply" | "withdraw"): LearnMoreContent {
  const supplying = eventType === "supply";
  return {
    title: supplying ? "How Supplying Works" : "How Withdrawing Works",
    intro: supplying
      ? "Supplying deposits an asset into SparkLend's Pool, where it earns the variable supply rate and — unless turned off — backs borrowing as collateral. Withdrawing reverses it."
      : "Withdrawing returns supplied assets from SparkLend's Pool to the wallet. It can only go as far as the remaining collateral keeps any outstanding debt covered.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supplied balance",
        text: "the deposit, which accrues supply interest continuously and stays withdrawable unless it's needed to keep a borrow covered.",
      },
      {
        bold: "Cross-collateralisation",
        text: "SparkLend pools every supplied asset into one account per wallet — all of it backs all of the account's borrowing, under one shared health factor.",
      },
      {
        bold: supplying ? "As collateral" : "Effect on health",
        text: supplying
          ? "supplied assets count as collateral unless disabled — with one Spark-specific exception: raw DAI's liquidation threshold is set to an on-chain epsilon (0.01%), so DAI deposits earn interest but effectively don't back borrowing; sDAI does."
          : "withdrawing removes collateral, so the account's health factor falls — the Pool blocks any withdrawal that would push it below 1.0.",
      },
    ],
    links: [
      { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
      { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
    ],
  };
}

export function sparkBorrowRepayContent(eventType: "borrow" | "repay"): LearnMoreContent {
  const borrowing = eventType === "borrow";
  return {
    title: borrowing ? "How Borrowing Works" : "How Repaying Works",
    intro: borrowing
      ? "Borrowing draws an asset against the account's supplied collateral, accruing variable borrow interest until it's repaid."
      : "Repaying returns borrowed assets to the Pool, clearing debt and raising the account's health factor — moving it away from the liquidation line.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowing power",
        text: "how much can be borrowed depends on the collateral's value weighted by each asset's loan-to-value and liquidation threshold.",
      },
      {
        bold: "One shared health factor",
        text: "the whole cross-collateralised account has a single health factor; borrowing lowers it, repaying raises it, and below 1.0 the account can be liquidated.",
      },
      {
        bold: "Variable borrow interest",
        text: "debt accrues interest continuously at the reserve's variable borrow rate. Most reserves price off pool utilisation; DAI is the exception — its rate is a flat policy rate set by Sky governance through the D3M credit line, so it moves with governance votes, not utilisation.",
      },
    ],
    links: [
      { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
      { label: "Liquidations", url: SPARK_DOC_URLS.LIQUIDATIONS },
      { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
    ],
  };
}

export function sparkLiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro:
      "A SparkLend account becomes eligible for liquidation when its health factor falls below 1.0 — the point where its borrowed value, measured against each collateral asset's liquidation threshold, is no longer sufficiently covered. Once eligible, anyone (in practice, automated liquidator bots) can step in.",
    extraParagraphs: [
      "A liquidator repays part of the account's outstanding debt and, in return, receives an equivalent value of its collateral plus a liquidation bonus — so the collateral seized is worth more than the debt cleared. That bonus is the liquidator's incentive and the borrower's effective penalty. Because SparkLend pools everything into one cross-collateralised account, the liquidator can take any of the account's collateral assets, not just one in isolation.",
      "SparkLend liquidates only partially — enough to nudge the health factor back above 1.0 — rather than closing the whole position at once. Health factor = (collateral value × each asset's liquidation threshold) ÷ total debt; keep it comfortably above 1.0 by holding more collateral or carrying less debt.",
    ],
    links: [
      { label: "Liquidations", url: SPARK_DOC_URLS.LIQUIDATIONS },
      { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
    ],
  };
}

export function sparkTransferContent(): LearnMoreContent {
  return {
    title: "How Position Transfers Work",
    intro:
      "Supplied balances on SparkLend live as spTokens — ERC-20s that can move between accounts like any token. Transferring spTokens hands a supplied position (or part of one) to another account without withdrawing to a wallet and re-supplying. Custody changes hands; the tokens never leave the Pool.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Not a deposit or withdrawal",
        text: "a transfer is a change of custody, not new capital arriving or leaving — so this explorer counts it on its own line rather than merging it into supplied/withdrawn, which stay true to real Pool flows.",
      },
      {
        bold: "Two accounts, one move",
        text: "the same on-chain transfer shows as an out-leg on the sender and an in-leg on the recipient; each account's running balance stays exact because both legs are replayed.",
      },
      {
        bold: "Health still enforced",
        text: "the Pool blocks any transfer that would leave the sender's remaining collateral unable to cover its debt — the sender's health factor must stay above 1.0 after the move.",
      },
      {
        bold: "Interest rides along",
        text: "spTokens are interest-bearing: the amount shown is the underlying the transferred spTokens were worth at that moment, and it keeps earning the supply rate in the new account.",
      },
    ],
    links: [
      { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
      { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
    ],
  };
}

export function sparkEventFallbackContent(): LearnMoreContent {
  return {
    title: "How SparkLend Positions Work",
    intro:
      "SparkLend (an Aave V3 fork built by Spark) lets a wallet supply assets as collateral and borrow against them inside one cross-collateralised account, where a single shared health factor governs the whole position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supply & collateral",
        text: "supplied assets earn interest and, unless disabled, back the account's borrowing as collateral (raw DAI is the exception — its threshold is an on-chain epsilon; sDAI carries the real collateral role).",
      },
      {
        bold: "Borrowing & health factor",
        text: "borrowing draws against the pooled collateral; the health factor measures how safely the combined debt is covered.",
      },
      {
        bold: "One pooled account",
        text: "all of a wallet's supply and debt share one account and one health factor on a single mainnet Pool.",
      },
    ],
    links: [
      { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
      { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
    ],
  };
}

// ── Moonwell (Ethereum L1) — Event-card modals ───────────────────────────────
//
// Moonwell's Ethereum deployment is a Compound v2 fork: four fixed mToken
// markets (mWETH / mUSDC / mUSDT / mcbBTC) cross-collateralised through one
// Comptroller, per-timestamp accrual, a Chainlink oracle wrapper. The modals
// ground the Compound-v2 mechanics — receipt mTokens, the exchange rate, the
// Comptroller's account liquidity — in Moonwell's own terms.

const MOONWELL_DOC_URL = "https://docs.moonwell.fi";

export function moonwellSupplyWithdrawContent(eventType: "mint" | "redeem"): LearnMoreContent {
  const supplying = eventType === "mint";
  return {
    title: supplying ? "How Supplying Works" : "How Withdrawing Works",
    intro: supplying
      ? "Supplying deposits an asset into a Moonwell market and mints mTokens — a transferable receipt token — in exchange. The deposit earns the market's supply rate and (via the Comptroller) backs borrowing as collateral."
      : "Withdrawing burns mTokens and returns the underlying asset to the wallet. It can only go as far as the remaining collateral keeps any outstanding debt covered.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "mTokens & the exchange rate",
        text: "each market's mToken is a receipt: balance × the market's exchange rate = the underlying claim. The exchange rate only rises as interest accrues, so a fixed mToken balance is worth ever more underlying — that is how supply interest is paid.",
      },
      {
        bold: "Cross-collateralisation",
        text: "the Comptroller pools every entered market into one account per wallet — supplied value across markets backs borrowing across markets, weighted by each market's collateral factor.",
      },
      {
        bold: supplying ? "Transferable positions" : "Effect on liquidity",
        text: supplying
          ? "mTokens are ordinary ERC-20s: transferring them transfers the deposit (and its collateral role) without any mint or redeem — the timeline shows such moves as Received / Sent."
          : "withdrawing removes collateral, so the account's borrowing headroom (the Comptroller's account liquidity) falls — the market blocks any withdrawal that would leave debt uncovered.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

/** Which Moonwell deployment the modal speaks for — the collateral factors and
 *  the market roster are the deployment's own, not the protocol's. */
export type MoonwellDeploymentName = "ethereum" | "base";

export function moonwellBorrowRepayContent(
  eventType: "borrow" | "repay",
  deployment: MoonwellDeploymentName = "ethereum",
): LearnMoreContent {
  const borrowing = eventType === "borrow";
  return {
    title: borrowing ? "How Borrowing Works" : "How Repaying Works",
    intro: borrowing
      ? "Borrowing draws an asset against the account's supplied collateral, accruing interest continuously — Moonwell accrues per second (per-timestamp)."
      : "Repaying returns borrowed assets to the market, clearing debt and restoring the account's borrowing headroom.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowing power",
        text:
          deployment === "base"
            ? "how much can be borrowed depends on the supplied value weighted by each market's collateral factor — set by governance per market, and shown on the position card as the Comptroller states it."
            : "how much can be borrowed depends on the supplied value weighted by each market's collateral factor (0.80 for WETH and cbBTC, 0.85 for USDC and USDT, as set by governance).",
      },
      {
        bold: "Account liquidity",
        text: "the Comptroller tracks one liquidity figure across the whole account; when it turns to shortfall, the account can be liquidated.",
      },
      {
        bold: "The emitted debt figure",
        text: "every borrow and repay event carries the borrower's total debt after it (accountBorrows) — the contract's own reckoning, interest included to that moment. The timeline shows that figure verbatim.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

export function moonwellTransferContent(direction: "transfer_in" | "transfer_out"): LearnMoreContent {
  const incoming = direction === "transfer_in";
  return {
    title: incoming ? "How Receiving mTokens Works" : "How Sending mTokens Works",
    intro:
      "mTokens are ordinary ERC-20 tokens, so a Moonwell deposit can change hands without touching the market: transferring mTokens transfers the underlying claim — and its collateral role — to the recipient.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The claim moves with the token",
        text: "the recipient's mToken balance × the market's exchange rate becomes their underlying claim; the sender gives that claim up. No mint or redeem event fires.",
      },
      {
        bold: "Collateral implications",
        text: "the market blocks transfers that would leave the sender's outstanding debt uncovered — collateral can't walk away from a borrow.",
      },
      {
        bold: incoming ? "Positions can start here" : "Positions can end here",
        text: incoming
          ? "a wallet that never supplied can still hold a position — received mTokens are a deposit like any other."
          : "a wallet can exit by sending its mTokens — the position continues under the new owner.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

export function moonwellLiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro:
      "A Moonwell account becomes eligible for liquidation when the Comptroller's account liquidity turns to shortfall — its borrowed value is no longer covered by the collateral-factor-weighted supplied value. Once eligible, anyone (in practice, automated liquidator bots) can step in.",
    extraParagraphs: [
      "A liquidator repays part of the account's debt (up to the close factor, 50% per liquidation) and, in return, seizes the borrower's mTokens in a collateral market of the liquidator's choosing — worth the repaid debt plus a 10% liquidation incentive. The seize is an mToken transfer from borrower to liquidator, so it shows on the collateral market's balance lane too.",
      "Liquidation is partial and repeatable: each one clears at most half the debt, nudging the account back toward solvency rather than closing it outright.",
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

export function moonwellEventFallbackContent(deployment: MoonwellDeploymentName = "ethereum"): LearnMoreContent {
  return {
    title: "How Moonwell Positions Work",
    intro: `Moonwell on ${deployment === "base" ? "Base" : "Ethereum"} is a Compound v2 fork: a wallet supplies assets into mToken markets (receiving transferable mToken receipts) and borrows against them, with the Comptroller pooling everything into one cross-collateralised account.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "mTokens",
        text: "each market's receipt token — balance × exchange rate = the underlying claim, and the rate's growth is the supply interest.",
      },
      {
        bold: "Borrowing & account liquidity",
        text: "borrowing draws against the collateral-factor-weighted supplied value; the Comptroller's account liquidity measures the headroom, and shortfall means liquidatable.",
      },
      deployment === "base"
        ? {
            bold: "Twenty-one markets",
            text: "the Comptroller lists twenty-one markets on Base, where Moonwell has run since August 2023 — governance-gated to grow, and identified by address rather than symbol (two of them answer to mUSDC).",
          }
        : {
            bold: "Four markets",
            text: "WETH, USDC, USDT and cbBTC — a deliberately small launch set (live on Ethereum since May 2026), governance-gated to grow.",
          },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

// ── Compound V2 (Ethereum L1) — Event-card modals ────────────────────────────
//
// Original Compound V2: twenty governance-listed cToken markets cross-
// collateralised through one Comptroller, per-BLOCK interest accrual, a
// wound-down roster with six years of history. The modals ground the same
// mechanics Moonwell inherited — receipt cTokens, the exchange rate, the
// Comptroller's account liquidity — plus what Moonwell has never exercised:
// partial liquidations (close factor 50%) and the named seizure legs,
// including the protocol's own burned cut (protocolSeizeShare).

const COMPOUND_V2_DOC_URL = "https://docs.compound.finance/v2/";

export function compoundV2SupplyWithdrawContent(eventType: "mint" | "redeem"): LearnMoreContent {
  const supplying = eventType === "mint";
  return {
    title: supplying ? "How Supplying Works" : "How Withdrawing Works",
    intro: supplying
      ? "Supplying deposits an asset into a Compound V2 market and mints cTokens — a transferable receipt token — in exchange. The deposit earns the market's supply rate and, once the market is entered, backs borrowing as collateral."
      : "Withdrawing burns cTokens and returns the underlying asset to the wallet. It can only go as far as the remaining collateral keeps any outstanding debt covered.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "cTokens & the exchange rate",
        text: "each market's cToken is a receipt: balance × the market's exchange rate = the underlying claim. The exchange rate only rises as interest accrues, so a fixed cToken balance is worth ever more underlying — that is how supply interest is paid.",
      },
      {
        bold: "Cross-collateralisation",
        text: "the Comptroller pools every entered market into one account per wallet — supplied value across markets backs borrowing across markets, weighted by each market's collateral factor. Eight of the twenty markets have collateral disabled entirely (a zero factor): supply there earns but backs nothing.",
      },
      {
        bold: supplying ? "Transferable positions" : "Effect on liquidity",
        text: supplying
          ? "cTokens are ordinary ERC-20s: transferring them transfers the deposit (and its collateral role) without any mint or redeem — the timeline shows such moves as Received / Sent."
          : "withdrawing removes collateral, so the account's borrowing headroom (the Comptroller's account liquidity) falls — the market blocks any withdrawal that would leave debt uncovered.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}

export function compoundV2BorrowRepayContent(eventType: "borrow" | "repay"): LearnMoreContent {
  const borrowing = eventType === "borrow";
  return {
    title: borrowing ? "How Borrowing Works" : "How Repaying Works",
    intro: borrowing
      ? "Borrowing draws an asset against the account's supplied collateral, accruing interest every block — Compound V2 accrues per block, and each market's own interest rate model sets the rate from utilisation."
      : "Repaying returns borrowed assets to the market, clearing debt and restoring the account's borrowing headroom. A repay can be made by a third party — on the cETH market, the Maximillion helper fronts native-ETH repays.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowing power",
        text: "how much can be borrowed depends on the supplied value in ENTERED markets, weighted by each market's governance-set collateral factor. Supplying alone does not enter a market.",
      },
      {
        bold: "Account liquidity",
        text: "the Comptroller tracks one liquidity figure across the whole account (getAccountLiquidity); when it turns to shortfall, the account can be liquidated.",
      },
      {
        bold: "The emitted debt figure",
        text: "every borrow and repay event carries the borrower's total debt after it (accountBorrows) — the contract's own reckoning, interest included to that moment. The gap between one event's debt-after and the next event's debt-before is the interest that accrued between them.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}

export function compoundV2TransferContent(direction: "transfer_in" | "transfer_out"): LearnMoreContent {
  const incoming = direction === "transfer_in";
  return {
    title: incoming ? "How Receiving cTokens Works" : "How Sending cTokens Works",
    intro:
      "cTokens are ordinary ERC-20 tokens, so a Compound V2 deposit can change hands without touching the market: transferring cTokens transfers the underlying claim — and its collateral role — to the recipient.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The claim moves with the token",
        text: "the recipient's cToken balance × the market's exchange rate becomes their underlying claim; the sender gives that claim up. No mint or redeem event fires.",
      },
      {
        bold: "Collateral implications",
        text: "the market blocks transfers that would leave the sender's outstanding debt uncovered — collateral can't walk away from a borrow.",
      },
      {
        bold: incoming ? "Positions can start here" : "Positions can end here",
        text: incoming
          ? "a wallet that never supplied can still hold a position — received cTokens are a deposit like any other."
          : "a wallet can exit by sending its cTokens — the position continues under the new owner. Nothing stops a send to the cToken contract or to the zero address either; such tokens are gone from the sender.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}

export function compoundV2LiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro:
      "A Compound V2 account becomes eligible for liquidation when the Comptroller's account liquidity turns to shortfall — its borrowed value is no longer covered by the collateral-factor-weighted supplied value. Once eligible, anyone (in practice, automated liquidator bots) can step in.",
    extraParagraphs: [
      "A liquidator repays part of the account's debt — at most the close factor, 50% of one borrowed market per liquidation — and in return seizes the borrower's cTokens in a collateral market of the liquidator's choosing, worth the repaid debt plus the liquidation incentive. The seizure splits in two: most goes to the liquidator, and the protocol keeps its own share (protocolSeizeShare, 2.8%), burned out of the borrower's balance.",
      "Liquidation is partial and repeatable, and borrowers commonly survive it: Compound V2's 26,639 liquidations land on 5,864 distinct borrowers — about 4.5 each. An account liquidated years ago can still be open today; the timeline shows each liquidation as one event in the account's life.",
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}

export function compoundV2SeizeContent(kind: "seize_out" | "seize_in" | "seize_burn"): LearnMoreContent {
  return {
    title:
      kind === "seize_in"
        ? "How Seized Collateral Arrives"
        : kind === "seize_burn"
          ? "The Protocol's Seize Share"
          : "How Collateral Seizure Works",
    intro:
      kind === "seize_out"
        ? "When a liquidator repays part of an account's debt, the protocol moves collateral-market cTokens out of the borrower's balance. This is a seizure — collateral being taken under the protocol's liquidation rules — not a transfer the borrower made."
        : kind === "seize_in"
          ? "The cTokens a liquidator receives for repaying part of an underwater account's debt — the liquidator's side of a seizure, worth the repaid debt plus the liquidation incentive."
          : "Every seizure splits in two: the liquidator's share, and the protocol's own cut (protocolSeizeShare, 2.8%) — transferred from the borrower to the cToken contract and burned out of total supply. The tokens cease to exist; no wallet receives them.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One seizure, two legs",
        text: "the LiquidateBorrow event's seizeTokens is the SUM of the liquidator's leg and the protocol's burned cut — reading only the liquidator's leg understates what the borrower lost.",
      },
      {
        bold: "cTokens, not underlying",
        text: "a seizure moves the receipt tokens; the seized value follows the collateral market's exchange rate like any other cToken holding.",
      },
      {
        bold: "Partial by design",
        text: "the close factor caps each liquidation at half of one borrowed market, so an account often survives — seizures appear alongside continued activity.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}

export function compoundV2EventFallbackContent(): LearnMoreContent {
  return {
    title: "How Compound V2 Positions Work",
    intro:
      "Compound V2 is the original pooled-lending protocol: a wallet supplies assets into cToken markets (receiving transferable cToken receipts) and borrows against them, with the Comptroller pooling everything into one cross-collateralised account.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "cTokens",
        text: "each market's receipt token — balance × exchange rate = the underlying claim, and the rate's growth is the supply interest.",
      },
      {
        bold: "Borrowing & account liquidity",
        text: "borrowing draws against the collateral-factor-weighted supplied value in entered markets; the Comptroller's account liquidity measures the headroom, and shortfall means liquidatable.",
      },
      {
        bold: "A wound-down roster",
        text: "twenty markets listed across six years, no more coming — governance is winding the protocol down, and much of what remains is parked supply.",
      },
    ],
    links: [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }],
  };
}

// ── Dolomite (Ethereum L1) — Event-card modals ───────────────────────────────
//
// A hard fork of dYdX Solo Margin: one core contract, markets keyed by
// numeric id, and the position grain is Account.Info = (owner, accountNumber)
// — cross-margin within an account number, isolated across them. The core has
// no Borrow action (a negative balance IS debt), interest accrues per second
// into a per-market index (par × index = tokens), and liquidations move four
// balances in one event across the borrower's and the liquidator's accounts.

const DOLOMITE_DOC_URL = "https://docs.dolomite.io/";

export function dolomiteDepositWithdrawContent(eventType: "deposit" | "withdraw"): LearnMoreContent {
  const depositing = eventType === "deposit";
  return {
    title: depositing ? "How Depositing Works" : "How Withdrawing Works",
    intro: depositing
      ? "Depositing moves tokens into one of the account's Dolomite balances. If the balance was negative — a negative balance IS debt here — the deposit repays it first; past zero it becomes a lending balance earning the market's rate."
      : "Withdrawing moves tokens out of a Dolomite balance. A withdrawal can push a balance BELOW zero — that is how borrowing happens: there is no separate Borrow action, only balances allowed to go negative against the account's collateral.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Par and the index",
        text: "the core stores each balance as par — a scaled figure. Par × the market's interest index = the token amount, and the index grows per second, so a fixed par is worth ever more (or, on the debt side, owes ever more). Interest lives entirely in the index.",
      },
      {
        bold: "One account, one risk pool",
        text: "every balance under one account number cross-margins: positive balances back negative ones, judged together against the margin requirement. Different account numbers of the same owner are fully isolated.",
      },
      {
        bold: depositing ? "Repay by depositing" : "Borrow by withdrawing",
        text: depositing
          ? "a deposit into a negative balance is a repayment — the timeline shows one deposit whose balance crosses toward zero."
          : "a withdrawal past zero opens debt at the market's borrow rate; markets flagged as closing accept no new debt.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteTransferContent(direction: "transfer_in" | "transfer_out"): LearnMoreContent {
  const incoming = direction === "transfer_in";
  return {
    title: incoming ? "How Receiving a Transfer Works" : "How Sending a Transfer Works",
    intro:
      "Transfers move balances between two Dolomite accounts — Account.Info pairs — without any tokens leaving the protocol. Most commonly the two sides are the SAME owner: the Dolomite Balance (account 0) funding an isolated Borrow Position, or a position paying back out.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Opening a Borrow Position",
        text: "an isolated position starts life as a transfer from the owner's Dolomite Balance into a fresh account number — collateral first, then a withdrawal or trade takes the balance negative.",
      },
      {
        bold: "Isolation moves with the balance",
        text: incoming
          ? "once received, the balance counts toward THIS account's collateral and margin — and only this account's."
          : "once sent, the balance stops backing this account's debt; the core blocks any transfer that would leave the sender under-collateralised.",
      },
      {
        bold: "Two legs, one log",
        text: "one transfer event carries both accounts' balance updates; each account's timeline shows its own leg.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteTradeContent(): LearnMoreContent {
  return {
    title: "How Trades Work",
    intro:
      "A trade (the core's Sell action) swaps one of the account's balances for another through an exchange wrapper — two markets move in one event: the taker side leaves the account, the maker side arrives.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Leverage in one step",
        text: "a trade can push the taker balance below zero — selling borrowed funds. That is how a leveraged position opens here: no Borrow event, just a balance crossing zero inside a trade.",
      },
      {
        bold: "Two legs, one log",
        text: "the event carries a balance update per market; the timeline shows each as its own row (spent / received), both traced to the same transaction.",
      },
      {
        bold: "Margin checked after",
        text: "whatever the trade does, the account must end above its margin requirement or the operation reverts.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteLiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro:
      "An account becomes liquidatable when its adjusted collateral value falls below the margin requirement times its adjusted debt — the requirement being the global 117.65% minimum scaled up by each market's margin premium (multiplicatively), or the account's own risk override (111.11% on the LST/ETH category) where one applies.",
    extraParagraphs: [
      "A liquidator repays part of the account's debt from their own Dolomite balances and takes collateral worth that repayment plus the liquidation spread (5% globally, scaled by per-market spread premiums; 4% under the risk override). One liquidation event moves FOUR balances: the borrower's debt and collateral, and the liquidator's payout and receipt — each account's timeline shows its own two legs.",
      "Liquidation is partial and repeatable: it clears what the liquidator chooses to repay, and the account continues with whatever remains. The timeline shows each liquidation as an event in the account's life.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Vaporization",
        text: "an account can run out of collateral before its debt is cleared, leaving a shortfall no liquidation can seize against. Vaporization writes that remaining debt off, covered by the core's excess token balances.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Dolomite Positions Work",
    intro:
      "Dolomite on Ethereum is a hard fork of dYdX Solo Margin: one core contract holds every market, and a position is an account — an (owner, account number) pair. Balances may go negative, and a negative balance IS the debt; there is no separate Borrow action.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Par × index",
        text: "balances are stored scaled (par); the per-market interest index — accruing per second — carries all interest. Par × index is the token amount.",
      },
      {
        bold: "Cross-margin within, isolated across",
        text: "all balances under one account number back each other; different account numbers of one owner are independently margined and independently liquidated. Account 0 is the owner's Dolomite Balance; other numbers are isolated Borrow Positions.",
      },
      {
        bold: "The risk ladder",
        text: "the global 117.65% minimum collateralisation scales up multiplicatively with each market's margin premium — and some accounts (LST/ETH pairs) instead carry the protocol's own override: 111.11%, premiums skipped.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

// ── LlamaLend (Curve, Ethereum) — Event-card modals ──────────────────────────
//
// Curve's LLAMMA lending: each Controller is an isolated market (one
// collateral, one borrowed token), and the collateral sits in the market's
// AMM across a BAND of prices. Liquidation is two-stage: SOFT — the AMM
// converts collateral to the borrowed token while the price is inside the
// bands (a state, no event; the swaps reverse and their losses stay) — then
// HARD — a Liquidate, in full or in part, once health goes negative.

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

export function llamalendBorrowContent(kind: "borrow" | "add_collateral"): LearnMoreContent {
  const borrowing = kind === "borrow";
  return {
    title: borrowing ? "How Borrowing Works" : "How Adding Collateral Works",
    intro: borrowing
      ? "Borrowing deposits collateral into the market's AMM, spread across a number of price bands the borrower picks (4 to 50), and draws the borrowed token against it. The more debt against the collateral, the closer the bands sit below the current price."
      : "Adding collateral deposits more of the collateral token into the position's bands without changing the debt. The extra collateral moves the bands further below the current price.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral lives in an AMM",
        text: "the collateral is liquidity in the market's AMM (LLAMMA), placed across a set of adjacent price bands whose number the borrower chose at opening. That placement is what makes soft-liquidation possible.",
      },
      {
        bold: "The bands are the risk range",
        text: "soft-liquidation begins at the top price of the highest band and completes at the bottom price of the lowest.",
      },
      {
        bold: "Band prices rise with interest",
        text: "each band's price is scaled by the same multiplier that grows the debt, so the same bands price higher as time passes.",
      },
      {
        bold: "A",
        text: "the market's band width: each band spans about 1/A of its price (1% at A = 100).",
      },
      {
        bold: "Loan discount",
        text: "sets how much can be borrowed: the most a loan may draw is what its bands would hold with the price through their bottom, less this discount.",
      },
      {
        bold: "Liquidation discount",
        text: "sets when health reaches 0: health takes this smaller discount off the same value before comparing it with the debt, so a new loan starts above 0.",
      },
      {
        bold: "Isolated markets",
        text: "each market has one collateral and one borrowed token; positions in different markets never share collateral and are liquidated independently.",
      },
    ],
    extraParagraphs: [
      "If the price falls into the bands, soft-liquidation starts: the AMM sells collateral for the borrowed token as the price falls and buys it back as the price rises, and the owner keeps the position. If health falls below 0, hard liquidation becomes possible: a liquidator repays the debt and takes what the position holds. The owner receives nothing from a hard liquidation and keeps the tokens they borrowed.",
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendRepayContent(kind: "repay" | "remove_collateral"): LearnMoreContent {
  const repaying = kind === "repay";
  return {
    title: repaying ? "How Repaying Works" : "How Removing Collateral Works",
    intro: repaying
      ? "Repaying returns borrowed tokens to the market and lowers the debt; a full repay closes the loan and returns the collateral. Outside soft-liquidation, less debt moves the bands further below the current price; inside it, the bands stay where they are."
      : "Removing collateral withdraws part of the position's collateral from its bands. It is only possible while the position is not in soft-liquidation, and it moves the bands closer to the current price.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Debt accrues per second",
        text: "the market's rate policy sets a per-second rate; the debt figure in any event is the total owed at that block, interest included.",
      },
      {
        bold: "Bands move on every change",
        text: "each borrow, repay or collateral change outside soft-liquidation places the bands again, and the event records where. Band prices also rise over time with the market's interest.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendLiquidationContent(self: boolean): LearnMoreContent {
  return {
    title: self ? "How Self-Liquidation Works" : "How Hard Liquidation Works",
    intro: self
      ? "A borrower whose position is partly converted can settle it themselves: self-liquidation repays the debt using the already-converted borrowed tokens plus a top-up, and withdraws whatever collateral remains. It is a normal close from soft-liquidation, with no third party."
      : "Hard liquidation needs health below 0. Health falls as the price moves down through the bands, as interest adds to the debt, and with each loss on the AMM's sales. Anyone may then liquidate the position, in full or in part: the position's converted tokens go toward the debt, the liquidator pays the rest and receives the collateral, and any converted tokens above the debt. The owner receives nothing and keeps what they borrowed. The owner, or an address the owner approved, may liquidate at any health.",
    extraParagraphs: [
      "Soft-liquidation comes first: while the oracle price is inside the position's bands, the AMM sells its collateral for the borrowed token as the price falls and buys it back as the price rises, with no event and no liquidator. The swap reverses; the losses do not. The converted amount can be read from the chain up to the liquidating block.",
      "The market logs a repay alongside every liquidation with the same amounts; the timeline shows the pair as one liquidation event.",
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendEventFallbackContent(): LearnMoreContent {
  return {
    title: "How LlamaLend Positions Work",
    intro:
      "LlamaLend is Curve's lending system. A position is one borrower in one market; each market is isolated, and its collateral sits in an AMM across a range of price bands, so liquidation is a range the price moves through.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Soft-liquidation is a state",
        text: "inside the bands the AMM converts collateral to the borrowed token, and back as the price recovers; each round trip loses a little collateral. The converted amount appears in no event; it is read from the chain.",
      },
      {
        bold: "Hard liquidation is an event",
        text: "once health goes negative, a liquidation clears the debt, in full or in part, and takes the balances it covers.",
      },
      {
        bold: "Most markets borrow crvUSD",
        text: "a $-pegged stable, so those markets' figures read as dollars; a few markets borrow WETH, tBTC or other tokens and stay in their own units.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

// ── f(x) Protocol V2 ─────────────────────────────────────────────────────────
// Leveraged xPOSITIONs against wstETH/WBTC, minting fxUSD. Positions live as
// shares in a tick tree; funding and socialized rebalances reshape them with
// no per-position events — the explorer's settled lane (the pool's own
// getPosition view) carries current state, and these explainers say why.

// docs.fx.aladdin.club stopped resolving (checked 2026-08-09); the protocol's
// docs live on its GitBook now.
const FX_DOC_URL = "https://fxprotocol.gitbook.io/fx-docs";

export function fxOperateContent(kind: "open" | "reopen" | "adjust" | "close"): LearnMoreContent {
  const intro =
    kind === "open" || kind === "reopen"
      ? "Opening a position deposits collateral into one of f(x)'s pools (wstETH or WBTC) and mints fxUSD debt against it, creating a leveraged long held as an ERC-721 position NFT."
      : kind === "close"
        ? "Closing repays the position's remaining fxUSD debt and withdraws its collateral, emptying the position. The final repay amount settles whatever the debt really was at that block — including every socialized adjustment accrued since the last touch."
        : "Adjusting moves a position's collateral and/or fxUSD debt in one operation — deposits, withdrawals, borrows and repays are all the same Operate call with signed deltas.";
  return {
    title:
      kind === "open" || kind === "reopen"
        ? "How Opening Works"
        : kind === "close"
          ? "How Closing Works"
          : "How Adjusting Works",
    intro,
    ...(kind === "reopen"
      ? {
          extraParagraphs: [
            "Closing or liquidating a position empties it but does not burn the NFT: the owner keeps it, and the pool's ownerOf still answers for it. A later deposit to the same id funds it again, as a new loan on the same NFT. The timeline numbers the loans, and this row starts the next one; nothing from the previous loan carries into it.",
          ],
        }
      : {}),
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are tick-tree shares",
        text: "a position's stored value is a share count in the pool's tick tree, not a fixed amount — the pool's own getPosition view resolves shares through the tick and funding indices to the real collateral and debt at any block.",
      },
      {
        bold: "Funding costs",
        text: "leverage is financed through Aave: the pool passes Aave's borrow rate through as a continuous funding charge on collateral, with no per-position event — it simply shows up in the settled reading.",
      },
      {
        bold: "Two unit systems",
        text: "operation amounts are in the collateral token as transferred (wstETH / WBTC); the pool's settled amounts are rate-normalized (stETH-equivalent for the wstETH pool). The receipts name which is which.",
      },
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

export function fxLiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations & Rebalances Work",
    intro:
      "f(x) positions sit in ticks: buckets of positions with nearly the same debt ratio. When a tick's debt ratio reaches the pool's rebalance line, a keeper can rebalance it; when it reaches the higher liquidation line, a keeper can liquidate. The pool judges both at the oracle's min price, which is at or below the anchor price the rows' ratios are read at. Keepers are any address that calls the manager; they are paid by the bonus. Since March 2025 a liquidation runs from the pool's top tick down, and the manager logs one event for the whole run; a rebalance can target one tick or run the same way.",
    extraParagraphs: [
      "A rebalance repays part of the tick's fxUSD debt and takes collateral worth that debt plus the rebalance bonus, bringing the tick back to the rebalance line. Every position in the tick loses collateral and debt in proportion and stays open. The position has no event of its own for it; the timeline places the rebalance on its history and reads the position before and after.",
      "A liquidation repays the position's debt and takes collateral worth it plus the liquidation bonus. Collateral beyond that stays in the position for the owner. When the collateral cannot cover the debt and the bonus, the liquidator takes all of it, and the debt it did not cover is added to every other position in the pool through the pool's debt index.",
      "Of each bonus the protocol keeps a share (getLiquidationExpenseRatio: 10% on both pools in September 2026), so the collateral the keeper receives is less than what the position lost. The owner keeps the fxUSD they borrowed.",
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

export function fxTransferContent(): LearnMoreContent {
  return {
    title: "How Position Ownership Works",
    intro:
      "f(x) V2 positions are ERC-721 tokens minted by the pool contract — the pool is the NFT. Holding the token is owning the position: only the account holding it when the manager is called can withdraw collateral or borrow against it (anyone may add collateral or repay), and it transfers like any NFT. A contract the holder approves, such as f(x)'s router or limit-order manager, can hold it for one transaction and hand it back.",
    extraParagraphs: [
      "A Transfer log moves only the holder record — the position's collateral, debt and tick are untouched. The explorer replays these logs into ownership eras, so each historic event is judged against the owner in force at its block, not the current holder.",
      "The mint (a Transfer from the zero address) is the position's birth record. A handful of positions were minted via a path that emits no Operate event — for those, the mint transfer is the only dated record of their creation, and their state lives entirely in the settled lane.",
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

export function fxEventFallbackContent(): LearnMoreContent {
  return {
    title: "How f(x) Positions Work",
    intro:
      "f(x) V2 splits yield-bearing collateral into fxUSD (a stable token) and leveraged xPOSITIONs. A position deposits wstETH or WBTC, mints fxUSD against it, and pays a funding rate routed through Aave.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The tick tree",
        text: "positions are grouped by debt ratio into ticks; protocol-level rebalances and redemptions operate on whole ticks at once, socializing the adjustment across every position inside.",
      },
      {
        bold: "Settled state",
        text: "because socialized changes emit no per-position events, current collateral and debt are read from the pool contract's own getPosition view — the same math the protocol itself uses — at a named block.",
      },
      {
        bold: "fxUSD",
        text: "the debt token positions mint; its peg is defended by the rebalance machinery and the stability pool, and the explorer renders amounts in fxUSD, not assumed dollars.",
      },
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

// ── Liquity V1 (LUSD) ────────────────────────────────────────────────────────
// The original, frozen 2021 Liquity: interest-free ETH-collateralised troves.
// Docs live under docs.liquity.org/liquity-v1 (URLs verified 2026-09-29); the
// rules on adjustments, closing, redemption and Recovery Mode liquidation are
// the contracts' (liquity/dev, BorrowerOperations.sol and TroveManager.sol).

const LIQUITY_V1_FAQ = {
  BORROWING: "https://docs.liquity.org/liquity-v1/faq/borrowing",
  REDEMPTIONS: "https://docs.liquity.org/liquity-v1/faq/lusd-redemptions",
  LIQUIDATIONS: "https://docs.liquity.org/liquity-v1/faq/stability-pool-and-liquidations",
  RECOVERY_MODE: "https://docs.liquity.org/liquity-v1/faq/recovery-mode",
  GENERAL: "https://docs.liquity.org/liquity-v1/faq/general",
} as const;

const LIQUITY_V1_SRC = {
  BORROWER_OPERATIONS: "https://github.com/liquity/dev/blob/main/packages/contracts/contracts/BorrowerOperations.sol",
  TROVE_MANAGER: "https://github.com/liquity/dev/blob/main/packages/contracts/contracts/TroveManager.sol",
} as const;

const V1_SRC = {
  borrowing: { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
  redemptions: { label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS },
  liquidations: { label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
  recovery: { label: "Recovery Mode FAQ", url: LIQUITY_V1_FAQ.RECOVERY_MODE },
  general: { label: "Liquity V1 FAQ", url: LIQUITY_V1_FAQ.GENERAL },
  bo: { label: "BorrowerOperations contract", url: LIQUITY_V1_SRC.BORROWER_OPERATIONS },
  tm: { label: "TroveManager contract", url: LIQUITY_V1_SRC.TROVE_MANAGER },
} satisfies Record<string, LearnMoreLink>;

/** The 200 LUSD liquidation reserve, stated the same way on every modal. */
const V1_RESERVE_DETAIL = {
  bold: "Liquidation reserve",
  text: "200 LUSD of every Trove's debt is minted to the reserve pool (Liquity's gas pool) when it opens. It stays part of the debt: closing repays the debt less 200 LUSD and the reserve is burned; a full redemption burns it too; a liquidation pays it to the liquidator.",
  sources: [V1_SRC.borrowing, V1_SRC.bo],
};

/** Recovery Mode in full: the info modal. The liquidation modal gives it its
 *  own section. */
const V1_RECOVERY_DETAIL = {
  bold: "Recovery Mode",
  text: "when the total collateral ratio of all Troves falls below 150%, the system enters Recovery Mode. While it lasts, no collateral can be withdrawn, new debt needs the Trove to end at 150% or more and at a higher ratio than before, closing a Trove is blocked, the borrowing fee is zero, and any Trove below the system's total ratio can be liquidated.",
  sources: [V1_SRC.recovery, V1_SRC.bo],
};

/** Recovery Mode on an owner's act: what it is, and where its full rules
 *  are. The act's own rule under Recovery Mode is in the modal's steps. */
const V1_RECOVERY_SHORT = {
  bold: "Recovery Mode",
  text: "the state the system enters when the total collateral ratio of all Troves falls below 150%. Its full rules are under How Liquidation Works.",
  sources: [V1_SRC.recovery],
};

export function liquityV1OpenContent(): LearnMoreContent {
  return {
    title: "How Opening a Trove Works",
    intro:
      "A Liquity V1 Trove holds ETH as collateral and mints LUSD, a dollar stablecoin, against it. There is no interest: the debt changes only when the owner borrows or repays, or when a redemption or liquidation reaches the Trove.",
    stepsHeading: "Opening a Trove:",
    steps: [
      "The owner deposits ETH and chooses how much LUSD to receive; at least 1,800 LUSD, so the debt starts at 2,000 LUSD or more.",
      "The debt is the LUSD received, plus a one-time borrowing fee (0.5% to 5%, usually 0.5%), plus the 200 LUSD liquidation reserve.",
      "The collateral ratio (ETH value ÷ debt) must be at least 110%, and the opening cannot pull the system's total ratio below 150%. In Recovery Mode a new Trove needs 150%.",
      "One address holds one Trove. After it closes, the same address can open another.",
    ],
    detailsHeading: "Key concepts:",
    details: [V1_RESERVE_DETAIL, V1_RECOVERY_SHORT],
    links: [V1_SRC.borrowing, V1_SRC.general],
  };
}

export type LiquityV1AdjustModalKind = "add" | "withdraw" | "borrow" | "repay";

export function liquityV1AdjustContent(kind: LiquityV1AdjustModalKind): LearnMoreContent {
  switch (kind) {
    case "add":
      return {
        title: "How Adding Collateral Works",
        intro:
          "Adding ETH to a Trove raises its collateral ratio and moves it back in the redemption queue, which is ordered from the lowest ratio up. It needs no LUSD and charges no fee.",
        stepsHeading: "Limits:",
        steps: [
          "There are none: collateral can be added at any time, including in Recovery Mode.",
          "The same transaction can also borrow or repay LUSD; each part follows its own rules.",
        ],
        detailsHeading: "Key concepts:",
        details: [V1_RECOVERY_SHORT],
        links: [V1_SRC.borrowing, V1_SRC.redemptions],
      };
    case "withdraw":
      return {
        title: "How Withdrawing Collateral Works",
        intro:
          "Withdrawing sends ETH from the Trove back to the owner. It lowers the collateral ratio, so the protocol checks the result before letting it through.",
        stepsHeading: "Limits:",
        steps: [
          "The Trove's collateral ratio after the withdrawal must be 110% or more at the current ETH price.",
          "The withdrawal cannot pull the system's total collateral ratio below 150%.",
          "In Recovery Mode no collateral can be withdrawn at all.",
          "Repaying LUSD in the same transaction counts toward the ratio, so a withdrawal and a repayment can go together.",
        ],
        detailsHeading: "Key concepts:",
        details: [V1_RECOVERY_SHORT],
        links: [V1_SRC.borrowing, V1_SRC.recovery, V1_SRC.bo],
      };
    case "borrow":
      return {
        title: "How Borrowing More Works",
        intro:
          "Borrowing more mints new LUSD to the owner against the Trove's existing collateral. The debt rises by the LUSD received plus a one-time borrowing fee.",
        stepsHeading: "Limits and cost:",
        steps: [
          "The fee is 0.5% to 5% of the LUSD received. It sits at 0.5% unless recent redemptions have raised it, and falls back over the following hours.",
          "The Trove's collateral ratio after the draw must be 110% or more, and the system's total ratio must stay at 150% or more.",
          "In Recovery Mode the fee is zero, but new debt needs the Trove to end at 150% or more and at a higher ratio than before, so it has to come with added collateral.",
          "Adding ETH in the same transaction counts toward the ratio.",
        ],
        detailsHeading: "Key concepts:",
        details: [V1_RECOVERY_SHORT],
        links: [V1_SRC.borrowing, V1_SRC.recovery, V1_SRC.bo],
      };
    case "repay":
      return {
        title: "How Repaying Works",
        intro:
          "Repaying burns LUSD from the owner's wallet and lowers the Trove's debt by the same amount. It raises the collateral ratio and costs no fee.",
        stepsHeading: "Limits:",
        steps: [
          "A partial repayment must leave at least 2,000 LUSD of debt (1,800 plus the 200 LUSD reserve). To go lower, the owner closes the Trove.",
          "Repaying is allowed at any time, including in Recovery Mode.",
        ],
        detailsHeading: "Key concepts:",
        details: [V1_RESERVE_DETAIL],
        links: [V1_SRC.borrowing, V1_SRC.bo],
      };
  }
}

export function liquityV1CloseContent(): LearnMoreContent {
  return {
    title: "How Closing a Trove Works",
    intro:
      "Closing repays the Trove's debt and returns all of its ETH to the owner in one transaction. The owner pays the debt less the 200 LUSD liquidation reserve; the reserve pool burns those 200 LUSD, which cancels the rest.",
    stepsHeading: "Limits:",
    steps: [
      "The owner needs the debt less 200 LUSD in their wallet. A 2,000 LUSD debt takes 1,800 LUSD to close.",
      "A Trove cannot be closed while the system is in Recovery Mode, when closing would pull the system's total ratio below 150%, or when it is the last open Trove.",
      "Once closed, the address can open a new Trove, which starts a new life on this explorer.",
    ],
    detailsHeading: "Key concepts:",
    details: [V1_RESERVE_DETAIL],
    links: [V1_SRC.borrowing, V1_SRC.bo],
  };
}

export function liquityV1RedemptionContent(): LearnMoreContent {
  return {
    title: "How Redemptions Work",
    intro:
      "Anyone holding LUSD can swap it for ETH at $1 per LUSD, at the protocol's ETH price. The LUSD cancels debt in the Troves with the lowest collateral ratios at the time, ranked across all open Troves, whatever their level. This is what holds LUSD at a dollar when it trades below.",
    stepsHeading: "What happens to a redeemed Trove:",
    steps: [
      "The redeemer's LUSD cancels part of the Trove's debt, and ETH worth the same number of dollars leaves the Trove to the redeemer.",
      "Because debt and collateral fall by the same dollar amount, the Trove's collateral ratio goes up.",
      "If the redemption cancels the whole debt, the redeemer pays for all of it except the 200 LUSD reserve, which the reserve pool burns. The Trove closes, and its remaining ETH moves to a surplus pool, where the owner claims it.",
      "Troves below 110% are skipped; liquidation deals with those.",
    ],
    extraParagraphs: [
      "At the redemption price the owner neither gains nor loses: the debt cancelled equals the value of the ETH taken. What changes is exposure: the owner no longer holds that ETH, so a later rise in the ETH price passes them by.",
      "The redeemer pays a redemption fee (0.5% plus a base rate that rises with recent redemptions) out of the ETH they receive. The Trove does not pay it.",
    ],
    links: [V1_SRC.redemptions, V1_SRC.tm],
  };
}

export function liquityV1LiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidation Works",
    intro:
      "Anyone can liquidate a Trove whose collateral ratio is below 110%. The whole Trove closes: its debt is cleared and its ETH is taken, and the owner keeps the LUSD they borrowed but gets no ETH back.",
    stepsHeading: "Where the debt and the ETH go:",
    steps: [
      "The Stability Pool pays first. It holds LUSD deposited by anyone; the liquidation burns the Trove's debt out of those deposits and hands the Trove's ETH to the depositors. Since the Trove was worth up to 110% of its debt, depositors gain up to about 10%.",
      "If the Stability Pool holds too little LUSD, the debt it cannot cover, with the matching ETH, is shared out to every other open Trove in proportion to its collateral. Each takes its share on its next transaction.",
      "The liquidator is paid the Trove's 200 LUSD liquidation reserve and 0.5% of its ETH, which covers the gas of calling it.",
    ],
    detailsHeading: "Recovery Mode:",
    details: [
      {
        bold: "When it starts",
        text: "when the total collateral ratio of all Troves together falls below 150%. It ends when that ratio is back at 150% or more.",
        sources: [V1_SRC.recovery],
      },
      {
        bold: "Who can be liquidated",
        text: "any Trove whose ratio is below the system's total ratio, which is under 150% in this state. A Trove between 110% and that ratio can be liquidated when the Stability Pool can cover its whole debt; it loses collateral worth 110% of the debt, and the rest goes to a surplus pool for the owner to claim.",
        sources: [V1_SRC.recovery, V1_SRC.tm],
      },
      {
        bold: "What it restricts",
        text: "no collateral withdrawals, no closing, and new debt only when the Trove ends at 150% or more and at a higher ratio than before. The borrowing fee drops to zero to draw in new collateral.",
        sources: [V1_SRC.recovery, V1_SRC.bo],
      },
      {
        bold: "Staying safe",
        text: "a Trove at 150% or more cannot be liquidated in Recovery Mode. Adding ETH or repaying LUSD raises the ratio.",
        sources: [V1_SRC.recovery],
      },
    ],
    links: [V1_SRC.liquidations, V1_SRC.recovery, V1_SRC.tm],
  };
}

export function liquityV1EventFallbackContent(): LearnMoreContent {
  return {
    title: "How Liquity V1 Troves Work",
    intro:
      "Liquity V1 lends LUSD against ETH with no interest: one Trove per address, a 110% minimum collateral ratio, redemptions that reach the lowest-ratio Troves first, and a Stability Pool that absorbs liquidations.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "No interest",
        text: "the debt changes only through borrowing, repaying, redemptions and liquidations. Each draw pays a one-time fee of 0.5% to 5%.",
        sources: [V1_SRC.borrowing],
      },
      {
        bold: "110% minimum ratio",
        text: "below it the Trove can be liquidated.",
        sources: [V1_SRC.borrowing],
      },
      {
        bold: "Redemptions",
        text: "LUSD holders swap LUSD for ETH at $1 against the lowest-ratio Troves, which holds LUSD at a dollar.",
        sources: [V1_SRC.redemptions],
      },
      V1_RESERVE_DETAIL,
      V1_RECOVERY_DETAIL,
    ],
    links: [V1_SRC.general, V1_SRC.borrowing],
  };
}

/** The /info page's "About Liquity V1": the protocol and its terms, with sources. */
export function liquityV1AboutContent(): LearnMoreContent {
  return {
    title: "About Liquity V1",
    intro:
      "Liquity V1 is a borrowing protocol on Ethereum, launched in 2021 and not upgradeable. Borrowers lock ETH and mint LUSD against it, with no interest. Four mechanisms keep LUSD backed: a minimum collateral ratio, liquidation into the Stability Pool, redemptions, and Recovery Mode.",
    detailsHeading: "Terms:",
    details: [
      {
        bold: "Trove",
        text: "one borrower's loan: the ETH they deposited and the LUSD debt against it. One address holds one Trove at a time; each Trove it opens after closing one is a new life on this explorer.",
        sources: [V1_SRC.borrowing],
      },
      {
        bold: "LUSD",
        text: "the dollar stablecoin a Trove mints. Anyone can redeem LUSD for $1 of ETH from the Troves, which keeps its price near a dollar.",
        sources: [V1_SRC.general],
      },
      {
        bold: "Collateral ratio",
        text: "the ETH's dollar value at the protocol's price, divided by the LUSD debt. Below 110% a Trove can be liquidated.",
        sources: [V1_SRC.borrowing],
      },
      {
        bold: "Stability Pool",
        text: "a pool of LUSD deposited by anyone. When a Trove is liquidated, the pool's LUSD clears its debt and the depositors receive its ETH, worth up to 10% more than the LUSD they gave up.",
        sources: [V1_SRC.liquidations],
      },
      {
        bold: "Redemption",
        text: "swapping LUSD for ETH at $1 per LUSD. The LUSD cancels debt in the lowest-ratio Troves first, and ETH of equal value leaves them to the redeemer.",
        sources: [V1_SRC.redemptions],
      },
      {
        bold: "Recovery Mode",
        text: "the state the system enters when the total collateral ratio of all Troves falls below 150%. Troves below the system ratio can then be liquidated, and withdrawals and new debt are restricted until the ratio recovers.",
        sources: [V1_SRC.recovery],
      },
      {
        bold: "Fees",
        text: "a one-time borrowing fee on each draw (0.5% to 5%) and a redemption fee paid by redeemers. Both rise after redemptions and fall back over time.",
        sources: [V1_SRC.borrowing, V1_SRC.redemptions],
      },
      V1_RESERVE_DETAIL,
    ],
    links: [V1_SRC.general, V1_SRC.borrowing, V1_SRC.liquidations, V1_SRC.recovery],
  };
}

// ── Compound V3 (Comet) — Event-card modals ──────────────────────────────────
//
// Comet's model differs from the Aave family in three load-bearing ways the
// modals must carry: (1) each market lends/borrows exactly ONE base asset and
// the account's base balance is SIGNED — the same Supply operation repays debt
// first and then lends, the same Withdraw spends the balance and then borrows;
// (2) collateral is a separate, non-earning stack priced by per-asset borrow /
// liquidate collateral factors; (3) liquidation is an ABSORB — the protocol
// itself takes the collateral and clears the WHOLE debt, crediting back the
// collateral's value minus a penalty in the base asset (not a partial
// third-party nudge). URLs verified against docs.compound.finance 2026-07-13.

const COMPOUND_DOC_URLS = {
  OVERVIEW: "https://docs.compound.finance/",
  COLLATERAL_BORROWING: "https://docs.compound.finance/collateral-and-borrowing/",
  LIQUIDATION: "https://docs.compound.finance/liquidation/",
  INTEREST_RATES: "https://docs.compound.finance/interest-rates/",
} as const;

export function compoundBaseContent(eventType: "supply" | "withdraw"): LearnMoreContent {
  const supplying = eventType === "supply";
  return {
    title: supplying ? "How Supplying the Base Asset Works" : "How Withdrawing & Borrowing Work",
    intro: supplying
      ? "Each Compound V3 market lends and borrows exactly one base asset, and an account's base balance is signed. Supplying base pushes that balance up: it repays any outstanding debt first, and whatever remains is lent out, earning the supply rate."
      : "Withdrawing base pulls the signed balance down: it spends the account's own lent balance first, and anything past zero is a borrow — Compound V3 has no separate borrow operation.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One signed balance",
        text: "positive base is lending (earning the supply rate), negative base is borrowing (paying the borrow rate) — the same account slot, so supply and repay are one operation, as are withdraw and borrow.",
      },
      {
        bold: "Interest accrues in place",
        text: "the balance itself grows (lending) or deepens (borrowing) continuously at the market's per-second rate, which moves with pool utilization.",
      },
      {
        bold: supplying ? "Earning vs collateral" : "Backed by collateral",
        text: supplying
          ? "the lent base earns interest but is NOT collateral — borrowing is backed only by the separate collateral stack."
          : "borrowing must stay under the account's borrow capacity: each collateral asset's value counts up to its borrow collateral factor.",
      },
    ],
    links: [
      { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
      { label: "Interest rates", url: COMPOUND_DOC_URLS.INTEREST_RATES },
    ],
  };
}

export function compoundCollateralContent(eventType: "supply_collateral" | "withdraw_collateral"): LearnMoreContent {
  const supplying = eventType === "supply_collateral";
  return {
    title: supplying ? "How Collateral Works" : "How Withdrawing Collateral Works",
    intro: supplying
      ? "Compound V3 collateral is a separate stack from the base balance: multiple assets, each held at its exact amount (collateral earns nothing), backing the account's base borrowing."
      : "Withdrawing collateral shrinks the stack that backs the account's borrowing. The market blocks any withdrawal that would leave outstanding debt over the account's borrow capacity.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Two factors per asset",
        text: "each collateral asset carries a governance-set borrow collateral factor (how much can be borrowed against it) and a higher liquidate collateral factor (where liquidation starts) — the gap between them is the account's safety margin.",
      },
      {
        bold: "Non-earning",
        text: "unlike the Aave family, Comet collateral accrues no interest — its amount only changes when the account moves it or a liquidation absorbs it, so the event replay is exact.",
      },
      {
        bold: "Deprecated assets",
        text: "governance retires a collateral asset by setting its borrow factor to 0 — it still counts toward the liquidation line but backs no new borrowing.",
      },
    ],
    links: [
      { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
      { label: "Compound V3 docs", url: COMPOUND_DOC_URLS.OVERVIEW },
    ],
  };
}

export function compoundLiquidationContent(): LearnMoreContent {
  return {
    title: "How Absorb (Liquidation) Works",
    intro:
      "A Compound V3 account becomes absorbable when its debt exceeds the sum of each collateral asset's value weighted by its liquidate collateral factor. Liquidation is then an ABSORB: the protocol itself takes over the account, rather than a third party repaying part of the debt.",
    extraParagraphs: [
      "On absorb, the protocol seizes the account's collateral and clears its entire base debt in one step. The account is credited the collateral's oracle value minus each asset's liquidation penalty (1 − liquidationFactor), paid in the base asset — so an absorbed account can come out of liquidation holding a small positive base balance.",
      "The seized collateral then belongs to the protocol, which sells it to liquidators at a discount (buyCollateral) to recapitalize its reserves. Keep the account healthy by holding the debt under the liquidate-factor-weighted collateral value — the health factor shown here is exactly that ratio, and 1.0 is the contract's own isLiquidatable line.",
    ],
    links: [
      { label: "Liquidation", url: COMPOUND_DOC_URLS.LIQUIDATION },
      { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
    ],
  };
}

export function compoundTransferContent(collateral: boolean): LearnMoreContent {
  return {
    title: "How Position Transfers Work",
    intro: collateral
      ? "Compound V3 lets an account move its collateral straight to another account inside the same market (transferAsset), without withdrawing to a wallet and re-supplying. Custody changes hands; the tokens never leave the Comet contract."
      : "A Compound V3 base position is an ERC20 balance, so it can be transferred to another account directly. The signed base balance moves between accounts without a supply or a withdraw.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Not a deposit or withdrawal",
        text: "a transfer is a change of custody — so this explorer counts it on its own line rather than merging it into deposited/withdrawn, which stay true to real supplies.",
      },
      {
        bold: "Two accounts, one move",
        text: "the same on-chain transfer shows as an out-leg on the sender and an in-leg on the recipient; each account's running balance stays exact because both legs are replayed.",
      },
      {
        bold: collateral ? "Health still enforced" : "Base is fungible",
        text: collateral
          ? "the market blocks a collateral transfer that would leave the sender's remaining debt under-collateralized — collateral the position still needs cannot be transferred away."
          : "positive base is a lending position; transferring it hands the lent balance (and the supply interest it earns) to the recipient.",
      },
    ],
    links: [
      { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
      { label: "Compound V3 docs", url: COMPOUND_DOC_URLS.OVERVIEW },
    ],
  };
}

export function compoundEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Compound V3 Positions Work",
    intro:
      "Compound V3 (Comet) runs one market per base asset. A wallet's position in a market is a signed base balance — positive is lending, negative is borrowing — plus a separate stack of non-earning collateral that backs the borrowing.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Signed base",
        text: "supply and repay are one operation (pushing the balance up), as are withdraw and borrow (pulling it down past zero).",
      },
      {
        bold: "Collateral factors",
        text: "each collateral asset backs borrowing up to its borrow factor and becomes absorbable past its liquidate factor, at the market's own oracle prices.",
      },
      {
        bold: "Absorb liquidation",
        text: "the protocol itself absorbs an unhealthy account — seizing the collateral, clearing the whole debt, and crediting back the difference minus a penalty.",
      },
    ],
    links: [
      { label: "Compound V3 docs", url: COMPOUND_DOC_URLS.OVERVIEW },
      { label: "Liquidation", url: COMPOUND_DOC_URLS.LIQUIDATION },
    ],
  };
}

// ── Morpho Blue — isolated markets, borrowing, liquidation ──────────────────

const MORPHO_DOC_URLS = {
  OVERVIEW: "https://docs.morpho.org/",
  MARKET: "https://docs.morpho.org/learn/concepts/market/",
  LIQUIDATION: "https://docs.morpho.org/learn/concepts/liquidation/",
  IRM: "https://docs.morpho.org/learn/concepts/irm/",
  VAULT: "https://docs.morpho.org/learn/concepts/vault/",
  MECHANICS: "https://docs.morpho.org/developers/borrow/concepts/market-mechanics",
  HEALTH: "https://docs.morpho.org/developers/borrow/concepts/ltv/",
  CONTRACT: "https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol",
} as const;

/** What the vault-exposure lookup on /base/morpho/vaults/<vault> computes, and —
 *  the reason this modal exists — what it does NOT. The page's central figure is
 *  an attribution, and an attribution presented without its own definition reads
 *  as a statement about where one depositor's money went. It is not one. */
export function morphoVaultExposureContent(): LearnMoreContent {
  return {
    title: "About attributed exposure",
    intro:
      "A MetaMorpho vault pools its depositors' assets and a curator allocates the pool across Morpho Blue markets. This page takes one address's share of the vault and applies it to each market the vault supplies, at one block read from chain.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Proportional, not fund-tracing",
        text: "vault shares are fungible and the deposits were pooled before the curator allocated them, so no on-chain fact ties a particular deposit to a particular market. Two addresses holding equal shares carry equal figures here, whatever they deposited and whenever.",
      },
      {
        bold: "What each row is",
        text: "the address's shares over the vault's total shares, applied to the assets the vault's own supply position in that market converts to, floored to whole units of the asset.",
      },
      {
        bold: "Two readings of the same holdings",
        text: "the vault's own total extrapolates each market's interest to the block's timestamp; the market totals the rows are built from are what Morpho Blue last settled, because Blue accrues only when a market is touched. The difference between them is stated on the page as its own figure.",
      },
      {
        bold: "One block",
        text: "every figure is read at the block the page names. A share balance, a curator's allocation and a market's totals all move; nothing here is a running total or a projection past that block.",
      },
      {
        bold: "What the address is",
        text: "the page reads the address's own code at the same block and states what it found: no code at all (an externally owned account), a Safe, an ERC-4626 vault, or a proxy to another contract, whose address is printed. A contract holding shares holds them for its own holders, and the figures are attributed to the address either way.",
      },
      {
        bold: "An address is not a person",
        text: "a computed stake belongs to an address. Nothing on this page identifies who controls it unless the address carries a name of its own.",
      },
    ],
    links: [
      { label: "docs.morpho.org — Vaults", url: MORPHO_DOC_URLS.VAULT },
      { label: "docs.morpho.org — Markets", url: MORPHO_DOC_URLS.MARKET },
      { label: "docs.morpho.org — Overview", url: MORPHO_DOC_URLS.OVERVIEW },
    ],
  };
}

// Each link names where it goes: the docs site or the contract's repository.
const MORPHO_DOCS_HOST = "docs.morpho.org";
const MORPHO_CONTRACT_LABEL = "github.com/morpho-org — Morpho.sol";
const MORPHO_LINKS = {
  mechanics: { label: `${MORPHO_DOCS_HOST} — Market mechanics`, url: MORPHO_DOC_URLS.MECHANICS },
  health: { label: `${MORPHO_DOCS_HOST} — Collateral, LTV & Health`, url: MORPHO_DOC_URLS.HEALTH },
  liquidation: { label: `${MORPHO_DOCS_HOST} — Liquidation`, url: MORPHO_DOC_URLS.LIQUIDATION },
  irm: { label: `${MORPHO_DOCS_HOST} — Interest rate model`, url: MORPHO_DOC_URLS.IRM },
  markets: { label: `${MORPHO_DOCS_HOST} — Markets`, url: MORPHO_DOC_URLS.MARKET },
  contract: { label: MORPHO_CONTRACT_LABEL, url: MORPHO_DOC_URLS.CONTRACT },
};

/** A claim's source, linked: a docs page above, or a Morpho Blue contract
 *  function (the contract's source, where the function is written). */
const MORPHO_SOURCE: Record<string, LearnMoreLink> = {
  "Market mechanics": MORPHO_LINKS.mechanics,
  "Collateral, LTV & Health": MORPHO_LINKS.health,
  "Liquidation on Morpho": MORPHO_LINKS.liquidation,
  "Interest rate model": MORPHO_LINKS.irm,
  "Morpho markets": MORPHO_LINKS.markets,
};
const morphoSources = (...labels: string[]): LearnMoreLink[] =>
  labels.map(
    (l) =>
      MORPHO_SOURCE[l] ??
      (l.startsWith("Morpho Blue contract")
        ? { label: l.replace("Morpho Blue contract", MORPHO_CONTRACT_LABEL), url: MORPHO_DOC_URLS.CONTRACT }
        : { label: `${MORPHO_DOCS_HOST} — ${l}`, url: MORPHO_DOC_URLS.OVERVIEW }),
  );

/** One modal per Morpho event kind. Each claim names its source in brackets:
 *  a page of the Morpho docs (linked below it) or the Morpho Blue contract. */
export function morphoMarketContent(
  eventType: "borrow" | "repay" | "supply_collateral" | "withdraw_collateral",
): LearnMoreContent {
  switch (eventType) {
    case "supply_collateral":
      return {
        title: "How Adding Collateral Works",
        intro:
          "Adding collateral deposits one asset into one Morpho market, where it backs borrowing of that market's loan asset.",
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "It earns nothing",
            text: "collateral in Morpho does not earn yield, so it is held as a plain amount rather than as shares.",
            sources: morphoSources("Market mechanics"),
          },
          {
            bold: "One market only",
            text: "it backs only this market's loan and is not shared with any other market.",
            sources: morphoSources("Collateral, LTV & Health"),
          },
          {
            bold: "Health factor",
            text: "health factor = collateral value in the loan token × LLTV ÷ debt, so more collateral raises it and lowers the LTV.",
            sources: morphoSources("Liquidation on Morpho"),
          },
          {
            bold: "Valued by the market's oracle",
            text: "the market's own oracle prices the collateral in the loan asset.",
            sources: morphoSources("Morpho markets"),
          },
          {
            bold: "Anyone can add",
            text: "adding collateral for another address needs no permission from it.",
            sources: morphoSources("Morpho Blue contract, supplyCollateral"),
          },
        ],
        links: [
          MORPHO_LINKS.mechanics,
          MORPHO_LINKS.health,
          MORPHO_LINKS.liquidation,
          MORPHO_LINKS.markets,
          MORPHO_LINKS.contract,
        ],
      };
    case "withdraw_collateral":
      return {
        title: "How Removing Collateral Works",
        intro:
          "Removing collateral takes some or all of it out of the market. With no debt, any amount can be withdrawn at any time, including the collateral a liquidation leaves behind. With debt open, the market allows it only while the position stays healthy afterwards.",
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "The health check",
            text: "the health factor decides whether collateral can be withdrawn; a withdrawal that would leave it below 1 is refused.",
            sources: morphoSources("Market mechanics"),
          },
          {
            bold: "Liquidation comes closer",
            text: "less collateral means a higher LTV and a lower health factor, so a smaller fall in the collateral's price reaches the liquidation line.",
            sources: morphoSources("Collateral, LTV & Health"),
          },
          {
            bold: "The owner or an authorised account",
            text: "only the owner, or an account the owner has authorised on chain, can withdraw collateral.",
            sources: morphoSources("Morpho Blue contract, setAuthorization"),
          },
        ],
        links: [MORPHO_LINKS.mechanics, MORPHO_LINKS.health, MORPHO_LINKS.contract],
      };
    case "borrow":
      return {
        title: "How Borrowing Works",
        intro:
          "Borrowing draws the market's loan asset against the collateral in the same market, up to the market's liquidation LTV (LLTV).",
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "One line",
            text: "a position can borrow up to the LLTV, and becomes liquidatable once its LTV passes it.",
            sources: morphoSources("Morpho markets", "Liquidation on Morpho"),
          },
          {
            bold: "Debt as shares",
            text: "a borrow is recorded as borrow shares; interest raises the market's total borrowed assets, so each share owes more over time.",
            sources: morphoSources("Market mechanics"),
          },
          {
            bold: "The rate",
            text: "the market's interest rate model sets the borrow rate from utilization, the share of the market's supplied loan asset that is lent out, and moves it to keep utilization near 90%, faster the further utilization is from that target.",
            sources: morphoSources("Interest rate model"),
          },
          {
            bold: "No borrowing fee",
            text: "the cost of a borrow is its interest; the contract charges nothing to open it.",
            sources: morphoSources("Morpho Blue contract, borrow"),
          },
          {
            bold: "The owner or an authorised account",
            text: "only the owner, or an account the owner has authorised on chain, can borrow against the position.",
            sources: morphoSources("Morpho Blue contract, setAuthorization"),
          },
        ],
        links: [
          MORPHO_LINKS.markets,
          MORPHO_LINKS.liquidation,
          MORPHO_LINKS.mechanics,
          MORPHO_LINKS.irm,
          MORPHO_LINKS.contract,
        ],
      };
    case "repay":
      return {
        title: "How Repaying Works",
        intro:
          "Repaying returns the loan asset to the market and burns borrow shares, which lowers the debt and raises the health factor.",
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Interest included",
            text: "the debt is one balance of shares that grows with interest, so it has no separate principal and interest, and a full repay returns more than was borrowed.",
            sources: morphoSources("Market mechanics"),
          },
          {
            bold: "Partial or full",
            text: "a repay names an amount of the loan asset or a number of shares; repaying all the shares closes the debt without leaving dust.",
            sources: morphoSources("Market mechanics"),
          },
          {
            bold: "Collateral stays",
            text: "repaying returns no collateral; taking it out is a separate withdrawal.",
            sources: morphoSources("Market mechanics"),
          },
          {
            bold: "Anyone can repay",
            text: "repaying another address's debt needs no permission from it.",
            sources: morphoSources("Morpho Blue contract, repay"),
          },
        ],
        links: [MORPHO_LINKS.mechanics, MORPHO_LINKS.health, MORPHO_LINKS.contract],
      };
  }
}

export function morphoLiquidationContent(): LearnMoreContent {
  return {
    title: "How Morpho Liquidation Works",
    intro:
      "A Morpho position can be liquidated once its LTV passes the market's LLTV, which is a health factor below 1. Anyone can then repay some or all of the debt and seize collateral worth more than they repaid.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The incentive",
        text: "the collateral seized is the debt repaid × the market's incentive factor, min(1.15, 1 ÷ (0.3 × LLTV + 0.7)) at the oracle price: 4.38% extra on an 86% LLTV market.",
        sources: morphoSources("Liquidation on Morpho"),
      },
      {
        bold: "All of it to the liquidator",
        text: "Morpho takes no fee; the whole incentive goes to the liquidator. To the borrower it is the collateral value given up beyond the debt cleared.",
        sources: morphoSources("Liquidation on Morpho"),
      },
      {
        bold: "Up to the whole debt",
        text: "a liquidator can repay up to 100% of the debt in one transaction.",
        sources: morphoSources("Liquidation on Morpho"),
      },
      {
        bold: "The price it runs on",
        text: "the health check and the seized amount use the market oracle's price at the moment of the call.",
        sources: morphoSources("Morpho Blue contract, liquidate"),
      },
      {
        bold: "Bad debt",
        text: "if the collateral runs out before the debt is covered, the rest is written off against this market's lenders in the same call.",
        sources: morphoSources("Morpho Blue contract, liquidate"),
      },
    ],
    links: [MORPHO_LINKS.liquidation, MORPHO_LINKS.health, MORPHO_LINKS.contract],
  };
}

export function morphoEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Morpho Blue Works",
    intro:
      "Morpho Blue is a minimal, immutable lending contract: many isolated markets, each pairing one loan asset with one collateral asset under a fixed liquidation LTV, its own oracle and its own rate model.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Isolated markets",
        text: "each market's risk is self-contained — its collateral backs only its loan asset, and bad debt falls only on its lenders.",
      },
      {
        bold: "Immutable core",
        text: "the contract has no admin upgrade path; governance only enables new LLTV values and rate models for market creators to pick from.",
      },
    ],
    links: [{ label: `${MORPHO_DOCS_HOST} — Overview`, url: MORPHO_DOC_URLS.OVERVIEW }],
  };
}

// ── MakerDAO (MCD vaults) ─────────────────────────────────────────────────────
// Every URL verified live 2026-07-14 (the docs kept the makerdao.com domain
// through the Sky rebrand; re-verify on the next touch).

const MAKER_DOCS = {
  VAT: "https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation",
  RATES: "https://docs.makerdao.com/smart-contract-modules/rates-module",
  LIQUIDATIONS: "https://docs.makerdao.com/smart-contract-modules/dog-and-clipper-detailed-documentation",
  OVERVIEW: "https://docs.makerdao.com/",
} as const;

export function makerdaoVaultContent(kind: "open" | "adjust" = "adjust"): LearnMoreContent {
  return {
    title: kind === "open" ? "How Opening a Maker Vault Works" : "How Maker Vault Adjustments Work",
    intro:
      "A Maker vault holds one collateral type (its ilk — ETH-A, ETH-C, WSTETH-B, …) and mints DAI debt against it. Every change goes through one Vat operation, frob: a signed collateral delta (dink) and a signed debt delta (dart) in a single call.",
    stepsHeading: "The mechanics:",
    steps: [
      "Depositing collateral or repaying DAI raises the vault's collateral ratio; withdrawing collateral or drawing DAI lowers it.",
      "The Vat only allows a frob that leaves the vault safe: collateral value (at the ilk's liquidation-adjusted price) must cover the debt.",
      "Debt is stored normalized (art); the DAI figure is art × the ilk's rate accumulator, which grows at the stability fee.",
      "Each ilk enforces a minimum debt (dust) — a repayment may not leave a smaller remainder (only exactly zero) — and a per-ilk ceiling (line).",
    ],
    extraParagraphs: [
      "The vault's ilk decides its terms: the liquidation ratio (mat), the stability fee (duty) and the dust floor are all per-ilk governance parameters, read live from the chain on this page.",
    ],
    links: [
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
      { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
      { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
    ],
  };
}

export function makerdaoLiquidationContent(): LearnMoreContent {
  return {
    title: "How Maker Liquidations Work",
    intro:
      "When a vault's collateral value falls below its ilk's liquidation ratio (mat), anyone can trigger a liquidation (Dog.bark). The Vat seizes the vault's collateral and debt in one operation — grab — and the collateral is auctioned for DAI.",
    stepsHeading: "What happens to the vault:",
    steps: [
      "The grab removes the seized collateral (dink < 0) and the seized normalized debt (dart < 0) from the urn in one step.",
      "The seized collateral goes to a Dutch auction (Clipper); proceeds cover the debt plus a liquidation penalty.",
      "Any auction surplus is returned to the vault owner; a shortfall becomes system bad debt handled by the protocol's buffer.",
      "The vault itself survives — a partially liquidated vault can be topped up and used again.",
    ],
    extraParagraphs: [
      "The price Maker acts on is the OSM price — delayed by one hour by design, so vault owners always have a window to react before a price move becomes liquidatable.",
    ],
    links: [
      { label: "Liquidations 2.0 (Dog & Clipper)", url: MAKER_DOCS.LIQUIDATIONS },
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
    ],
  };
}

// ── Fluid (Instadapp) ─────────────────────────────────────────────────────────
// Vault positions as factory-minted NFTs, one vault per (collateral, debt)
// pair. ONE composite operate event moves either or both legs; liquidations
// sweep price-band ticks with NO position id on the event — the explorer's
// attribution rows recover each position's exact impact from the vault's own
// settlement views, and these explainers say why that is trustworthy.

const FLUID_DOC_URL = "https://docs.fluid.io";

export function fluidOperateContent(kind: "deposit" | "borrow" | "composite"): LearnMoreContent {
  const intro =
    kind === "deposit"
      ? "A deposit adds collateral to a Fluid position and a withdrawal takes it out; the collateral is what the position borrows against. Anyone can add collateral to any position, but only the holder of the position's NFT can withdraw."
      : kind === "borrow"
        ? "A borrow draws the vault's debt token against the position's collateral and a repay pays it back; the debt grows with interest until it is repaid. Anyone can repay a position's debt, but only the holder of its NFT can borrow more."
        : "One Fluid operation can move a position's collateral and its debt together, such as depositing and borrowing in a single step. Each side is recorded as its own signed amount.";
  return {
    title:
      kind === "deposit"
        ? "How Collateral Moves Work"
        : kind === "borrow"
          ? "How Debt Moves Work"
          : "How Composite Operations Work",
    intro,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are NFTs",
        text: "every Fluid position is an ERC-721 minted by the vault factory — ownership can move wallets, so this explorer keys the timeline by the NFT id and tracks the owner per event.",
      },
      {
        bold: "Signed deltas, one event",
        text: "LogOperate(user, nftId, colAmt, debtAmt, to) is the only action event — positive amounts deposit/borrow, negative amounts withdraw/repay; either leg can be zero.",
      },
      {
        bold: "Interest accrues between events",
        text: "running balances replayed from events exclude interest accrued since the last touch; the position card's settled figures come from the vault's own resolver at the current block.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidLiquidationContent(absorbed: boolean): LearnMoreContent {
  return {
    title: absorbed ? "How Absorption Works" : "How Fluid Liquidations Work",
    intro: absorbed
      ? "When a position sinks past the vault's maximum liquidation limit, the vault takes over its remaining debt and collateral, leaving the position empty. No event of the position's own records it."
      : "When a position's debt grows too large against its collateral, a liquidator repays part of the debt and takes collateral worth a little more in return. Fluid does this for a whole price band of positions at once, so the on-chain event names no single position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The event carries no position id",
        text: "LogLiquidate reports only the totals (collateral seized, debt repaid) for the whole sweep — which positions were hit is not recoverable from any event.",
      },
      {
        bold: "Attribution from the vault's own math",
        text: "these per-position figures come from fetchLatestPosition — the vault contract's own settlement view — read at the blocks before and after the liquidation. The diff IS this position's exact impact, including partial liquidations.",
      },
      {
        bold: "Partial by design",
        text: "a swept position usually keeps most of its collateral and debt — Fluid liquidates only enough to restore the band's health, so 'liquidated' rarely means emptied. A fully liquidated position is flagged explicitly.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidMintContent(): LearnMoreContent {
  return {
    title: "How Opening a Position Works",
    intro:
      "Opening a Fluid position mints an NFT that is the position: it holds one vault's collateral and debt, and whoever holds the NFT controls them.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One vault, one pair",
        text: "each vault lends one debt token against one collateral token, and a position lives in exactly one vault.",
      },
      {
        bold: "Funded in the same step",
        text: "the vault factory mints the NFT in the same transaction as the position's first deposit or borrow, and the timeline draws the two as one Open row.",
      },
      {
        bold: "What the holder controls",
        text: "only the NFT's holder can withdraw collateral or borrow more; anyone can add collateral or repay debt.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidTransferContent(): LearnMoreContent {
  return {
    title: "How Ownership Transfers Work",
    intro:
      "A Fluid position is an NFT, and transferring the NFT hands the whole position, collateral, debt and liquidation exposure, to the new holder. The balances stay as they were.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Era ownership",
        text: "each timeline event shows the owner AT that event — a position sold mid-life shows its history under the owner who lived it.",
      },
      {
        bold: "Round trips",
        text: "an NFT can leave its holder and come back within one transaction; when it does, the holder at the end is the holder at the start.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidEventFallbackContent(): LearnMoreContent {
  return {
    title: "About This Event",
    intro:
      "Every change to a Fluid position is an operation on its vault that moves the collateral, the debt, or both.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Chain-read",
        text: "amounts come from the event log; running balances are the replayed sum of the position's own events plus attributed liquidation impacts.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

// ─────────────────────────── Maple Finance (syrup pools) ───────────────────────────

const MAPLE_DOC_URL = "https://docs.maple.finance";

export function mapleDepositWithdrawContent(eventType: "deposit" | "withdraw"): LearnMoreContent {
  const depositing = eventType === "deposit";
  return {
    title: depositing ? "How Lending to Maple Works" : "How Withdrawing Works",
    intro: depositing
      ? "Depositing lends an asset into a Maple syrup pool and mints pool shares (an ERC-4626 vault token) in exchange. The pool lends the money onward to Maple's institutional borrowers; the share's value tracks that loan book."
      : "Withdrawing burns pool shares and returns the funds asset at the pool's EXIT rate. In the syrup pools, exits normally travel through the withdrawal queue — a direct withdraw is the final settlement leg of a processed request.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Shares & the exit rate",
        text: "the share is a claim on the pool: shares × convertToExitAssets = what a withdrawal pays. The rate rises as loans accrue interest at their posted rates, and falls only when the pool delegate marks an impairment (unrealizedLosses) — which exiting lenders realize first.",
      },
      {
        bold: "Where the money actually is",
        text: "only a small liquid buffer sits in the pool contract itself (about 1% in mid-2026). The rest is deployed to loans whose collateral — BTC, ETH, stables — is held by custodians (BitGo, Copper, Anchorage, Hex Trust) under off-chain tri-party agreements. The chain records the bookkeeping; the collateral itself is not on-chain.",
      },
      {
        bold: "What the chain proves",
        text: "every deposit and withdrawal is self-priced by its own log (assets and shares both emitted), share balances replay exactly from transfers, and the accrual arithmetic is event-anchored. What the chain cannot prove is the loan book's off-chain backing — that rests on Maple's custodians, legal agreements, and third-party attestations.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}

export function mapleQueueContent(
  eventType: "request" | "request_decrease" | "request_cancel" | "request_fill",
): LearnMoreContent {
  return {
    title: "How the Withdrawal Queue Works",
    intro:
      "Syrup-pool withdrawals are queued: requesting a withdrawal escrows the shares with the WithdrawalManager and takes a place in a first-in-first-out line. Requests fill as pool liquidity allows — typically within minutes when the liquid buffer covers them; the contract permits up to 30 days.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Escrow, not exit",
        text: "requested shares leave the wallet's balance but remain the position's — they sit at the WithdrawalManager until processed or cancelled. Cancelling (fully or partly) returns them.",
      },
      {
        bold: "Priced at fill time",
        text:
          "a processed request redeems at the exit rate at the moment of processing, not the moment of request — the proceeds arrive in the same transaction that processes it. " +
          (eventType === "request_fill" ? "This event is that fill." : ""),
      },
      {
        bold: "Who processes",
        text: "the pool delegate's operational machinery calls processRedemptions as cash allows; it can also cancel requests (Maple documents this for abuse and congestion cases). The queue's depth against the pool's liquid cash — shown on the pool band — is the live health of this pipeline.",
      },
    ],
    links: [{ label: "Maple docs — withdrawals", url: MAPLE_DOC_URL }],
  };
}

export function mapleTransferContent(eventType: "transfer_in" | "transfer_out"): LearnMoreContent {
  return {
    title: "Transferable Pool Shares",
    intro:
      eventType === "transfer_in"
        ? "Syrup-pool shares are ordinary ERC-20 tokens: receiving them moves the pool claim into this wallet with no pool event."
        : "Syrup-pool shares are ordinary ERC-20 tokens: sending them moves the pool claim to another wallet with no pool event.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The claim moves with the token",
        text: "whoever holds the shares holds the deposit and its accrued interest — positions routinely arrive via DEX buys, Pendle, or exchange distributions.",
      },
      {
        bold: "Deposit principal stays behind",
        text: "a transferred-in position has no deposit history in this wallet, so its replayed principal reads zero — the share lane (exact, equal to balanceOf) is the truthful basis, and the current value comes from shares × the exit rate.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}

export function mapleEventFallbackContent(): LearnMoreContent {
  return {
    title: "Maple Syrup Pools",
    intro:
      "Maple's syrup pools are ERC-4626 lending vaults over an institutional credit book: deposits mint transferable shares, withdrawals travel a FIFO queue, and the share price is the pool's own on-chain accounting of loans whose collateral is custodied off-chain.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "On-chain bookkeeping, off-chain assets",
        text: "the chain proves what Maple's contracts recorded — principal deployed, a posted interest rate, impairment marks. It cannot prove the custodied collateral behind the loans; that rests on Maple's custodians and attestations.",
      },
      {
        bold: "What lenders control",
        text: "the shares themselves (freely transferable), the withdrawal request, and the queue position. The liquid buffer in the pool bounds what can exit instantly — the pool band shows it live.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}

// ─── Liquity V2 forks (Ebisu / Asymmetry) ─────────────────────────────────────
//
// Shared, parameterized content for the fork explorers: the mechanics are the
// V2 architecture's (user-set interest, rate-ordered redemptions, per-branch
// MCR, batch delegation); what differs — the protocol name, the stablecoin,
// the docs links — is passed in.
//
// Quick Links, as Liquity V2's own modals carry them (liquityRedemptionContent
// etc., above): one link per QUESTION the card raises, not one link for the
// whole protocol. `docsByTopic` carries those, read and verified against
// Ebisu's (ebisu.gitbook.io/ebisu-money) and Asymmetry's (docs.asymmetry.finance)
// own docs sites 2026-09-28 (Miles's OK; read-only) — every URL below resolves.
// A fork with no topic set for a card (Basedollar, whose docs are unread) falls
// back to `docsLink`, the one general link every fork still carries.
export interface LiquityForkLearnMoreParams {
  /** Display name ("Ebisu" | "Asymmetry"). */
  protocolName: string;
  /** The fork's stablecoin ("ebUSD" | "USDaf"). */
  stablecoin: string;
  /** One live-verified link (site or docs root) — the fallback below. */
  docsLink?: { label: string; url: string };
  /** Question-level docs links, keyed by the card topic that wants them. */
  docsByTopic?: {
    trove?: { label: string; url: string }[];
    open?: { label: string; url: string }[];
    adjust?: { label: string; url: string }[];
    close?: { label: string; url: string }[];
    rate?: { label: string; url: string }[];
    redemption?: { label: string; url: string }[];
    liquidation?: { label: string; url: string }[];
    batch?: { label: string; url: string }[];
  };
}

const forkLinks = (
  p: LiquityForkLearnMoreParams,
  topic?: keyof NonNullable<LiquityForkLearnMoreParams["docsByTopic"]>,
) => {
  const byTopic = topic ? p.docsByTopic?.[topic] : undefined;
  if (byTopic && byTopic.length > 0) return byTopic;
  return p.docsLink ? [p.docsLink] : undefined;
};

export function liquityForkBorrowingContent(
  p: LiquityForkLearnMoreParams,
  eventType: "openTrove" | "adjustTrove" | "closeTrove" = "adjustTrove",
): LearnMoreContent {
  const Art = indefiniteArticle(p.protocolName);
  const art = Art === "An" ? "an" : "a";

  if (eventType === "openTrove") {
    return {
      title: "How Opening a Trove Works",
      intro: `${Art} ${p.protocolName} Trove holds one branch's collateral and mints ${p.stablecoin} against it, at an interest rate the borrower sets themselves — the Liquity V2 architecture. Interest accrues continuously into the debt from the moment the Trove opens.`,
      stepsHeading: "The mechanics:",
      steps: [
        "Each collateral branch is its own market with its own minimum collateral ratio — below it, anyone can liquidate the Trove.",
        `The chosen interest rate is also the Trove's place in the redemption queue: redemptions sweep the LOWEST rates first, so a higher rate buys ${p.stablecoin} peg protection at a carrying cost.`,
        `Drawing ${p.stablecoin} pays an upfront fee (a week of average branch interest) added straight to the debt, and a fixed liquidation reserve is set aside apart from the collateral.`,
      ],
      links: forkLinks(p, "open"),
    };
  }

  if (eventType === "closeTrove") {
    return {
      title: "How Closing a Trove Works",
      intro: `Closing ${art} ${p.protocolName} Trove repays its debt in full and hands the collateral back to the owner — the Trove's last act.`,
      stepsHeading: "The mechanics:",
      steps: [
        "The owner repays the entire outstanding debt, interest included — there is no partial close.",
        "All remaining collateral, plus the liquidation reserve set aside when the Trove opened, returns to the owner.",
        "The Trove NFT is burned: the position stops accruing interest and drops out of the redemption queue for good.",
      ],
      links: forkLinks(p, "close"),
    };
  }

  return {
    title: "How Trove Adjustments Work",
    intro: `An adjustment changes ${art} ${p.protocolName} Trove's collateral or debt without closing it — adding or withdrawing collateral, drawing more ${p.stablecoin}, or repaying some of what's owed.`,
    stepsHeading: "The mechanics:",
    steps: [
      "The collateral ratio moves with whichever side changed; it must stay above the branch's minimum or the adjustment reverts.",
      `Drawing new ${p.stablecoin} pays the same upfront fee opening one does (a week of average branch interest); repaying does not.`,
      "The interest rate itself is untouched by an adjustment — changing it is its own, separate action.",
    ],
    links: forkLinks(p, "adjust"),
  };
}

export function liquityForkRateContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How the User-Set Interest Rate Works",
    intro: `${p.protocolName} borrowers set their own annual interest rate (the V2 model). Interest accrues continuously into the debt — the emitted figure grows between events — and the rate doubles as the Trove's redemption-queue position.`,
    stepsHeading: "What the rate controls:",
    steps: [
      "Carrying cost: interest accrues on the debt at the chosen annual rate, second by second.",
      `Redemption order: when ${p.stablecoin} trades below $1, holders redeem it against the system at face value, sweeping the lowest-rate Troves first. A higher rate pushes the Trove later in that queue.`,
      "Adjusting the rate shortly after the last adjustment pays an upfront fee (rate-change spam protection); otherwise it is free.",
    ],
    links: forkLinks(p, "rate"),
  };
}

export function liquityForkRedemptionContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Redemptions Work",
    intro: `Any ${p.stablecoin} holder can redeem it against the system at $1 face value — the peg mechanism. Redemptions are routed across branches by their unbacked portions and, within a branch, sweep the LOWEST user-set interest rates first (not the lowest collateral ratio — the V1 difference).`,
    stepsHeading: "What happens to a redeemed Trove:",
    steps: [
      "It gives up collateral at the branch oracle price and sheds exactly the same value of debt — net value is preserved.",
      "Its collateral ratio RISES as a result.",
      `A partial redemption that leaves the Trove below the minimum debt makes it a "zombie": outside the rate-ordered queue, redeemed first the next time redemptions route through the branch.`,
    ],
    links: forkLinks(p, "redemption"),
  };
}

export function liquityForkLiquidationContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro: `A Trove whose collateral ratio falls below its branch minimum — at the branch's own oracle price — can be liquidated by anyone. The debt is absorbed by the branch's Stability Pool (${p.stablecoin} deposits), or redistributed to the branch's other Troves when the pool runs short.`,
    stepsHeading: "The mechanics:",
    steps: [
      "Liquidation closes the whole Trove — collateral is seized, debt cleared.",
      "Stability Pool depositors buy the collateral at a discount; redistributed portions land on other Troves as pending gains (collateral AND debt), settled on their next touch.",
      "The Stability Pool and the other Troves take collateral worth at most the debt plus the branch's liquidation penalty. Any collateral above that is the owner's surplus, credited to them in the branch's CollSurplusPool to claim.",
      "Each branch sets its own minimum ratio, so the same price move can liquidate one branch's Troves and not another's.",
    ],
    links: forkLinks(p, "liquidation"),
  };
}

export function liquityForkBatchContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Interest-Rate Batches Work",
    intro: `A Trove can delegate its interest rate to a batch manager (the V2 delegation model): the manager sets one rate for every Trove in the batch, adjusting it as market conditions move — active peg management without the owner touching the Trove.`,
    stepsHeading: "What batching changes:",
    steps: [
      "The batch manager (within owner-approved bounds) controls the rate — and with it the batch's redemption-queue position.",
      `A batched Trove's debt is tracked as a share of the batch total, so the exact ${p.stablecoin} figure is derived from batch shares.`,
      "Leaving the batch returns the rate to self-management.",
    ],
    links: forkLinks(p, "batch"),
  };
}

export function liquityForkEventFallbackContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: `How ${p.protocolName} Troves Work`,
    intro: `${p.protocolName} runs the Liquity V2 architecture: per-branch Troves minting ${p.stablecoin} at a user-set interest rate, redemptions at $1 face sweeping the lowest rates first, per-branch minimum collateral ratios, and Stability Pools absorbing liquidations.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Per-Trove interest",
        // The never-empty floor: this modal backs any event the explainer has
        // no specific mechanic for, on a Trove that may well be batched. A
        // batched Trove's rate is its manager's, so the rate's author is
        // stated as either route rather than asserted to be the borrower.
        text: "each Trove carries its own annual rate — set by the borrower, or by the interest-batch manager the borrower delegates to; interest accrues continuously into the debt, and the rate doubles as the redemption-queue position.",
      },
      {
        bold: "Per-branch risk",
        text: "every collateral branch has its own TroveManager, oracle and minimum collateral ratio — one branch's stress does not liquidate another's Troves.",
      },
      {
        bold: "Redemption queue",
        text: `${p.stablecoin} holders can redeem at $1 face against the lowest-rate Troves — a peg mechanism, not a penalty.`,
      },
    ],
    links: forkLinks(p, "trove"),
  };
}

// ── PWN ──────────────────────────────────────────────────────────────────────
// Peer-to-peer fixed-term loans: two parties strike every term at origination
// (no oracle, no health factor), the SimpleLoan contract escrows the
// collateral, and the LOAN note (an ERC-721) is the lender's transferable
// claim. A loan that expires unpaid defaults by the clock — the lender claims
// the collateral; nothing is liquidated.

const PWN_DOC_URL = "https://docs.pwn.xyz";

export function pwnLoanCreatedContent(): LearnMoreContent {
  return {
    title: "How a PWN Loan Is Struck",
    intro:
      "PWN loans are peer-to-peer on fixed terms: the lender and borrower agree the collateral, the credit, the repayment total and the deadline between themselves — no pool, no oracle, no floating rate. The SimpleLoan contract records those terms on-chain and enforces them.",
    stepsHeading: "What happens at origination:",
    steps: [
      "The borrower's collateral (an ERC-20 amount, an NFT, or a PWN Token Bundler wrapping several assets into one) is transferred into the loan contract's escrow.",
      "The lender's credit is transferred to the borrower, and the fixed repayment total (principal + fixed interest) plus the deadline are locked into the loan's terms.",
      "A LOAN note — an ERC-721 — is minted to the lender: the transferable claim on this loan's repayment (or, on default, its collateral).",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Fixed by construction",
        text: "nothing accrues and nothing floats — the repayment owed on the last day is the number struck on the first.",
      },
      {
        bold: "The parties set the price",
        text: "there is no protocol oracle and no health factor; whether the terms are fair is the parties' own judgment, made when they signed.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnNoteLifecycleContent(eventType: "minted" | "burned"): LearnMoreContent {
  const minted = eventType === "minted";
  return {
    title: minted ? "How the LOAN Note Works" : "How a Loan Is Retired",
    intro: minted
      ? "The LOAN note is an ERC-721 minted to the lender when the loan is struck. Whoever holds it is entitled to the loan's repayment — or, if the borrower defaults, to the escrowed collateral."
      : "Burning the LOAN note is the loan's final act: the claim it represented has been settled — repayment collected or collateral claimed — and the note is retired on-chain.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "A transferable claim",
        text: "the note is an ordinary NFT — the lender can sell or move the claim while the loan runs, and the loan pays out to whoever holds the note at settlement.",
      },
      {
        bold: "One note per loan",
        text: "the note's token id IS the loan id: one discrete loan, one claim, one holder at a time.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnRepaymentContent(eventType: "paid_back" | "claimed"): LearnMoreContent {
  const paying = eventType === "paid_back";
  return {
    title: paying ? "How Repayment Works" : "How Claiming Works",
    intro: paying
      ? "The borrower repays the fixed total struck at origination — principal plus fixed interest, in the credit token. Repaying before the deadline releases the escrowed collateral back to the borrower."
      : "Claiming is the note holder collecting what the loan settled to: the repayment if the borrower paid, or the escrowed collateral if the loan defaulted. Claiming burns the LOAN note.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The amount was never in question",
        text: "the repayment total is a term of the loan, fixed when it was struck — repaying early doesn't discount it and repaying late isn't possible past the deadline.",
      },
      {
        bold: "Escrow does the settling",
        text: "the loan contract holds the repayment until the note holder claims it — the two legs (borrower pays in, lender collects) are separate transactions.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnDefaultContent(): LearnMoreContent {
  return {
    title: "How a PWN Default Works",
    intro:
      "A PWN default is a clock event, not a price event. If the deadline passes with the loan unpaid, the lender claims the escrowed collateral in place of the repayment — that is the whole mechanism.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Nothing is liquidated",
        text: "no oracle watched the collateral's value, no liquidator was involved and no auction ran — the loan simply expired, and the escrow changed hands as the terms always said it would.",
      },
      {
        bold: "The risk was priced at origination",
        text: "the lender accepted this collateral against this credit knowing default hands them the collateral; whether that trade was good is decided by the parties.",
      },
      {
        bold: "Defaults are visible in advance",
        text: "the deadline is an on-chain term from day one — a loan's path to default is public the whole way.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnExtensionContent(): LearnMoreContent {
  return {
    title: "How Loan Extensions Work",
    intro:
      "The parties can renegotiate the deadline while the loan runs: an extension moves the default timestamp later, giving the borrower more time under the same economics.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Terms otherwise unchanged",
        text: "the collateral, the credit and the repayment total stay exactly as struck — only the clock moves.",
      },
      {
        bold: "Both sides sign",
        text: "an extension is a new agreement between the same parties, recorded on-chain like the original terms.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnEventFallbackContent(): LearnMoreContent {
  return {
    title: "How PWN Loans Work",
    intro:
      "PWN is a peer-to-peer lending protocol for fixed-term loans: two parties strike every term at origination, the SimpleLoan contract escrows the collateral, and an ERC-721 LOAN note carries the lender's claim.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Fixed terms",
        text: "principal, interest and deadline are set when the loan is struck — nothing accrues, nothing floats, no oracle is consulted.",
      },
      {
        bold: "Escrowed collateral",
        text: "the borrower's collateral sits with the loan contract for the loan's life — released on repayment, claimed by the lender on default.",
      },
      {
        bold: "The LOAN note",
        text: "the lender's claim is a transferable NFT whose token id is the loan id — the loan settles to whoever holds it.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

// ── Frankencoin (ZCHF) ───────────────────────────────────────────────────────
// One modal per kind of event, each with the docs pages it rests on.

const FRANKENCOIN_DOC_URL = "https://docs.frankencoin.com";
const FC_PAGE = {
  positions: `${FRANKENCOIN_DOC_URL}/positions`,
  open: `${FRANKENCOIN_DOC_URL}/positions/open`,
  clone: `${FRANKENCOIN_DOC_URL}/positions/clone`,
  adjust: `${FRANKENCOIN_DOC_URL}/positions/adjust`,
  auctions: `${FRANKENCOIN_DOC_URL}/positions/auctions`,
  reserve: `${FRANKENCOIN_DOC_URL}/reserve`,
  governance: `${FRANKENCOIN_DOC_URL}/governance`,
  risks: `${FRANKENCOIN_DOC_URL}/risks`,
} as const;
/** One source per claim, each labelled by what it backs up. */
const fcSource = (label: string, page: keyof typeof FC_PAGE): LearnMoreLink => ({ label, url: FC_PAGE[page] });

/** Mint, repay, a combined adjust, a close — the ZCHF side of a position. */
export function frankencoinMintingContent(): LearnMoreContent {
  return {
    title: "How Minting and Repaying Work",
    intro:
      "A Frankencoin position mints new ZCHF against the collateral it holds; nothing is lent out of a pool. The debt is the gross amount minted, and the owner can mint more, repay, add or withdraw collateral whenever the position's limits allow.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Gross debt",
        text: "a mint adds its whole amount to the debt. The wallet receives it less the position's reserve share and the interest for the remaining term.",
        sources: [fcSource("what a mint pays out", "adjust")],
      },
      {
        bold: "Interest up front",
        text: "the annual rate in force when the mint is made (the system base rate plus the position's risk premium) is charged for the time left to expiry, and is not returned. It goes to the system reserve as equity, owned by FPS holders. Nothing accrues afterwards, so the debt changes only when the owner mints or repays. The base rate moves with governance, so two mints on one position can pay different rates.",
        sources: [fcSource("interest on positions", "positions")],
      },
      {
        bold: "Reserve share",
        text: "a percentage set in the terms of the family's original stays in the system reserve against the position's debt; the reserve is the buffer that covers losses from challenge sales. Repaying releases it: in full while the reserve covers every position's share, in proportion when losses have drawn it down.",
        sources: [fcSource("the reserve", "reserve")],
      },
      {
        bold: "The limit",
        text: "the debt may not exceed collateral × the declared liquidation price, and a clone shares its family's minting limit.",
        sources: [fcSource("the minting limit", "clone")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** The system page's minting book: what each count is out of. */
export function frankencoinBookContent(b: {
  total: number;
  v1: number;
  v2: number;
  open: number;
  clones: number;
  denied: number;
  challengesStarted: number;
  challengesSucceeded: number;
  challengedPositions: number;
  forcedSalePositions: number;
}): LearnMoreContent {
  const originals = b.total - b.clones;
  const n = (x: number) => x.toLocaleString("en-US");
  return {
    title: "What the Minting Book Counts",
    intro: `The book is every position Frankencoin's two MintingHubs have opened: ${n(b.total)} of them. Each count below names what it is out of.`,
    detailsHeading: "The counts:",
    details: [
      {
        bold: "Positions ever",
        text: `${n(b.total)} positions, ${n(b.v1)} opened on Hub V1 (2023) and ${n(b.v2)} on Hub V2 (2024).`,
        sources: [fcSource("positions and the hubs", "positions")],
      },
      {
        bold: "Originals and clones",
        text: `${n(b.clones)} of the ${n(b.total)} are clones, which copy an accepted original's terms and share its minting limit. The other ${n(originals)} are originals: each proposed its own terms, paid the opening fee and faced a veto window.`,
        sources: [fcSource("opening an original", "open"), fcSource("cloning a position", "clone")],
      },
      {
        bold: "Open at head",
        text: `${n(b.open)} of the ${n(b.total)} are open now; the others have closed or were denied.`,
        sources: [fcSource("a position's life", "positions")],
      },
      {
        bold: "Denied in the veto window",
        text: `${n(b.denied)} of the ${n(originals)} originals. Only an original can be denied: a clone has no veto window.`,
        sources: [fcSource("the veto", "governance")],
      },
      {
        bold: "Challenges",
        text: `${n(b.challengesStarted)} challenges were started, against ${n(b.challengedPositions)} positions; ${n(b.challengesSucceeded)} of the ${n(b.challengesStarted)} reached a phase-2 sale of position collateral, and the others were averted or are still running.`,
        sources: [fcSource("challenges", "auctions")],
      },
      {
        bold: "Cleared by forced sale",
        text: `${n(b.forcedSalePositions)} positions had collateral bought after expiry through the V2 hub.`,
        sources: [fcSource("expiry and the forced sale", "auctions")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** A declared-price change. */
export function frankencoinPriceContent(): LearnMoreContent {
  return {
    title: "How the Declared Price Works",
    intro:
      "Frankencoin has no price oracle. Each position stores a liquidation price in ZCHF per unit of collateral that its owner declares, and anyone who thinks it too high can challenge it.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "What it limits",
        text: "collateral × the declared price is the most debt the position may carry.",
        sources: [fcSource("the price limit", "adjust")],
      },
      {
        bold: "Lowering",
        text: "applies at once, as long as the debt still fits under the new price.",
        sources: [fcSource("lowering the price", "adjust")],
      },
      {
        bold: "Raising",
        text: "pauses minting and collateral withdrawals for three days, so the new price can be challenged before it backs new ZCHF. Lowering the price again does not end the pause. In a combined adjust the mint runs before the price change, at the old price.",
        sources: [fcSource("the three-day cooldown", "adjust")],
      },
      {
        bold: "Challenges",
        text: "a challenger who thinks the price is too high posts collateral of the same kind and starts a two-phase auction.",
        sources: [fcSource("challenges", "auctions")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** A position's creation — an original, a clone, and the ownership handover
 *  inside the creating transaction. */
export function frankencoinCreationContent(kind: "open" | "clone" | "handover"): LearnMoreContent {
  const handover = {
    bold: "The handover",
    text: "the creating transaction can pass ownership through the MintingHub and a helper contract before it reaches the owner. Each step is its own event; together they are one creation.",
    sources: [fcSource("creating a clone", "clone")],
  };
  return {
    title: "How a Position Is Created",
    intro:
      "Every Frankencoin position is its own contract with its own owner, collateral and debt. It starts either as a new original, which proposes new terms, or as a clone of a position in an accepted family.",
    detailsHeading: "Key concepts:",
    details: [
      ...(kind === "handover" ? [handover] : []),
      {
        bold: "Original",
        text: "proposes its own collateral, price, rate and limits, costs a 1,000 ZCHF opening fee, and waits out a veto window of at least three days before it can mint.",
        sources: [fcSource("opening an original", "open")],
      },
      {
        bold: "Veto",
        text: "in that window, holders of more than 1% of the governance votes (FCS, or the FPS it wraps) can deny the new original.",
        sources: [fcSource("the veto", "governance")],
      },
      {
        bold: "Clone",
        text: "a new position cloned from any position of an accepted family. It starts at that position's declared price and takes the family original's other terms (rate, reserve share, challenge period, an expiry no later than the original's). It skips the veto window, can deposit and mint in the same transaction, and shares the family's minting limit.",
        sources: [fcSource("cloning a position", "clone")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** An ownership transfer after creation. */
export function frankencoinOwnershipContent(): LearnMoreContent {
  return {
    title: "Position Ownership",
    intro:
      "A position is a contract, and its owner is whoever holds it now. Ownership can be transferred like any contract's; the new owner takes over the collateral, the debt and the right to adjust the position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Only the owner acts",
        text: "minting, repaying, moving collateral and changing the declared price are the owner's alone. A challenge or an expiry sale needs no owner.",
        sources: [fcSource("adjusting a position", "adjust")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** A phase-2 sale on the position the modal is opened from, for a worked
 *  example. Structurally the page's FrankencoinSaleExample. */
interface FrankencoinModalSale {
  number: string;
  symbol: string;
  liqPrice: number;
  phase: number;
  startedAt: number;
  soldAt: number;
  bid: number;
  sold: number;
}

const fcNum = (n: number, max = 2, min = 0): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
const fcDays = (seconds: number): string => {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const h = Math.round(seconds / 3600);
  return `${h} h`;
};
const fcMinutes = (seconds: number): string => {
  const m = Math.round(seconds / 60);
  return m >= 120 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export function frankencoinChallengeContent(
  opts: { phase?: number | null; example?: FrankencoinModalSale | null } = {},
): LearnMoreContent {
  const phase = opts.phase ?? null;
  const len = phase != null && phase > 0 ? ` (${fcDays(phase)} on this position)` : "";
  const ex = opts.example ?? null;
  const example: string[] = [];
  if (ex) {
    const into = ex.soldAt - (ex.startedAt + ex.phase);
    const unit = ex.bid / ex.sold;
    example.push(
      `On this position: challenge #${ex.number} ran into phase 2, because nobody bought the challenger's ${ex.symbol} at the declared ${fcNum(ex.liqPrice)} ZCHF per ${ex.symbol} in phase 1's ${fcDays(ex.phase)}. In phase 2 the price fell from ${fcNum(ex.liqPrice)} toward zero over ${fcDays(ex.phase)}; ${fcMinutes(into)} in, it stood at ${fcNum(unit)} ZCHF per ${ex.symbol} (${fcNum((unit / ex.liqPrice) * 100)}% of the declared price), and a bidder bought ${fcNum(ex.sold, 8)} ${ex.symbol} for ${fcNum(ex.bid, 2, 2)} ZCHF. The Challenge Succeeded row shows where that ZCHF went.`,
    );
  }
  return {
    title: "How Frankencoin Challenges Work",
    intro:
      "Frankencoin has no oracle and no liquidation threshold. A challenger who thinks a position's declared price is too high posts collateral of the same kind (not ZCHF) and starts a two-phase auction against it. Each phase lasts the position's challenge period.",
    stepsHeading: "The two phases:",
    steps: [
      `Phase 1, fixed price${len}: the challenger's posted collateral is on offer at the position's declared liquidation price. Anyone can buy it, the owner included. A purchase averts the challenge: the position keeps its collateral and debt, and its minting pauses for one day.`,
      `Phase 2, falling price${len}: if nobody bought, the position's collateral is sold at a price that starts at the declared price and falls in a straight line to zero by the end of the phase. The first bid buys at that moment's price.`,
      "Where the bid goes: 2% of it is the challenger's reward, and the challenger gets back the collateral it posted. The rest repays the debt on the collateral sold. A shortfall is paid from the reserve, first out of the position's reserve share, then from equity; an excess is shared between the reserve, at the position's reserve percentage, and the owner.",
      "One challenge can settle in several slices: each phase-2 bid is its own settlement under the same challenge number, and a position left with collateral stays open.",
    ],
    extraParagraphs: example,
    links: [
      { label: "Challenges and auctions (Frankencoin docs)", url: FC_PAGE.auctions },
      { label: "How the reserve covers losses (Frankencoin docs)", url: FC_PAGE.reserve },
    ],
  };
}

/** A forced sale on the position the modal is opened from, for a worked
 *  example: the receipt's figures and the terms read one block earlier. */
export interface FrankencoinModalForcedSale {
  symbol: string;
  /** Unix seconds. */
  expiration: number;
  /** One challenge period, seconds. */
  period: number;
  soldAt: number;
  /** Price per unit and the declared price, ZCHF. */
  unit: number;
  declared: number | null;
  sold: number;
  cost: number;
  /** The buyer, shortened. */
  buyer: string | null;
  branch: "full" | "partial" | "shortfall" | "noDebt";
  debt: number;
  reserveBack: number;
  owner: number;
  loss: number;
}

const fcDateTime = (unix: number): string => {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/** An expired position's collateral bought through the V2 hub. */
export function frankencoinForcedSaleContent(
  opts: { phase?: number | null; example?: FrankencoinModalForcedSale | null } = {},
): LearnMoreContent {
  const phase = opts.phase ?? null;
  const len = phase != null && phase > 0 ? ` (${fcDays(phase)} on this position)` : "";
  const ex = opts.example ?? null;
  const example: string[] = [];
  if (ex) {
    const since = ex.soldAt - ex.expiration;
    const stage = since <= ex.period ? "first" : since < 2 * ex.period ? "second" : "zero";
    const days = Math.floor(since / 86400);
    const when = since < 86400 * 2 ? fcMinutes(since) : `${days} days`;
    const priceText =
      stage === "zero" || ex.unit === 0
        ? `${when} later, past both periods, the price was zero`
        : `${when} later, in the ${stage} period, the price stood at ${fcNum(ex.unit)} ZCHF per ${ex.symbol}${
            ex.declared ? ` (${fcNum(ex.unit / ex.declared)}× the declared ${fcNum(ex.declared)})` : ""
          }`;
    const money =
      ex.branch === "full"
        ? `${ex.reserveBack > 0 ? `The reserve sent the buyer the position's ${fcNum(ex.reserveBack, 2, 2)} ZCHF reserve share, the ` : "The "}${fcNum(ex.debt, 2, 2)} ZCHF debt was burned from the buyer, and the owner received the other ${fcNum(ex.owner, 2, 2)} ZCHF.`
        : ex.branch === "shortfall"
          ? `The payment fell short of the ${fcNum(ex.debt, 2, 2)} ZCHF debt, so the reserve paid ${fcNum(ex.loss, 2, 2)} ZCHF and the owner received nothing.`
          : ex.branch === "partial"
            ? `The payment repaid ${fcNum(ex.debt, 2, 2)} ZCHF of the debt and the owner received nothing.`
            : ex.cost > 0
              ? `The position had no debt, so the owner received all ${fcNum(ex.owner, 2, 2)} ZCHF.`
              : "The position had no debt, so no ZCHF moved.";
    example.push(
      `On this position: it expired on ${fcDateTime(ex.expiration)}. ${priceText}, and ${ex.buyer ?? "a buyer"} bought ${fcNum(ex.sold, 8)} ${ex.symbol} for ${ex.cost > 0 ? `${fcNum(ex.cost, 2, 2)} ZCHF` : "nothing"}. ${money}`,
    );
  }
  return {
    title: "How a Forced Sale Works",
    intro:
      "Once a Minting Hub V2 position passes its expiration, anyone can buy its collateral through the hub at a price set by the time since expiry. The owner does not need to act, and no challenge is involved.",
    stepsHeading: "The price and the money:",
    steps: [
      `First challenge period after expiry${len}: the price starts at 10× the declared liquidation price and falls in a straight line to 1× the declared price.`,
      `Second challenge period${len}: the price falls from the declared price to zero. After that the collateral goes for nothing.`,
      "Who may buy: anyone, the owner included, any amount up to all the collateral, at that moment's price. No forced sale can run while a challenge on the position is open.",
      "Where the money goes: the payment repays the debt first. When the payment and the position's reserve share together cover the debt, the reserve sends that share to the buyer, the whole debt is burned from the buyer, and the rest of the price goes to the owner. When they fall short and the last collateral is sold, the reserve pays the difference (out of the position's reserve share first, then equity) and the owner receives nothing; while collateral remains, the payment repays what it can. A position with no debt pays the whole price to the owner.",
    ],
    extraParagraphs: example,
    links: [
      { label: "Expiry and the forced sale (Frankencoin docs)", url: FC_PAGE.risks },
      { label: "How the reserve covers losses (Frankencoin docs)", url: FC_PAGE.reserve },
    ],
  };
}

export function frankencoinLifecycleContent(): LearnMoreContent {
  return {
    title: "A Frankencoin Position's Lifecycle",
    intro:
      "A position is a contract with clocks: a veto window before an original may mint, an expiration after which no position may, and cooldowns in between.",
    detailsHeading: "The lifecycle edges:",
    details: [
      {
        bold: "Veto window",
        text: "a new original position waits an owner-chosen period (3 days minimum) before its first mint; holders of more than 1% of the governance votes (FCS, or the FPS it wraps) can deny it in that window, which disables minting for good.",
        sources: [fcSource("the veto window", "governance")],
      },
      {
        bold: "Cooldown",
        text: "raising the declared liquidation price pauses minting for 3 days, the window in which anyone can challenge the new price before it backs new ZCHF.",
        sources: [fcSource("the price-raise cooldown", "adjust")],
      },
      {
        bold: "Expiration",
        text: "past its expiration a position cannot mint, and on MintingHub V2 anyone can buy its collateral through the hub at a declining price, the proceeds repaying the debt.",
        sources: [fcSource("expiry and the forced sale", "risks")],
      },
      {
        bold: "Closing",
        text: "a position closes when its collateral and debt are both gone; the final repayment releases its reserve share, in full while the reserve covers every position's share.",
        sources: [fcSource("the reserve on repayment", "reserve")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

export function frankencoinEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Frankencoin Works",
    intro:
      "Frankencoin (ZCHF) is an oracle-free Swiss-franc stablecoin. Borrowers mint ZCHF against collateral they price themselves; challenge auctions test the declared prices, and a system reserve absorbs shortfalls.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are contracts",
        text: "every borrower owns a Position contract; its address is its identity, and its owner can change by transfer.",
        sources: [fcSource("positions", "positions")],
      },
      {
        bold: "Native units",
        text: "debt is ZCHF, collateral is the position's own token, and the one price on any card is the owner's declared liquidation price. The protocol values nothing in dollars, and neither does this explorer.",
      },
      {
        bold: "No health factor",
        text: "risk is challenge status, the declared price, the expiry countdown and the cooldown.",
        sources: [fcSource("the risks", "risks")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

// ── Market notes ─────────────────────────────────────────────────────────────
// The "?" behind a market note row (components/shared/market-note-row.tsx).
// Layer 2 only: how this KIND of note is read, never this note's figures — the
// figures live on the row and their receipts in the inspector. One modal per
// note kind, taking the protocol the note was built for where a kind has more
// than one home: the modal teaches that protocol's mechanism and links that
// protocol's docs. A new kind adds a function here; a new home adds a case.

export function marketNoteShareRateContent(): LearnMoreContent {
  return {
    title: "About share-rate notes",
    intro:
      "A market note is a row in a position's timeline that states something which happened to the market while this account transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown. This kind states a step in a Moonwell market's share rate between two observations.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Share rate",
        text: "how much underlying one mToken redeems for. It is not read from a contract: every Mint and Redeem in the market emits the underlying amount and the mTokens exchanged, and their quotient is the rate at that block.",
      },
      {
        bold: "A step",
        text: "a change between two adjacent observations larger than interest alone could have produced over those blocks — the note is only stated where the move exceeds ten times what the market's own supply rate could have accrued. Nothing between the two observations is drawn, because nothing between them was observed.",
      },
      {
        bold: "This account's slice",
        text: "the mTokens the account held across the step, replayed from every mToken transfer touching it, valued at each end's rate. The units did not move; what they were worth did.",
      },
      {
        bold: "A live note",
        text: "the same idea, but the later end runs to the chain head: this account's own last Mint or Redeem in the market against its own exchange rate read right now, holding the account's CURRENT mToken holding fixed and moving only the rate. Shown for any entered market the account still holds, whatever the move — nothing having changed since is the fact it states.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

/** The sentence every market-note modal opens on, naming what the page calls
 *  the position. */
function marketNoteLead(noun: string): string {
  return `A market note is a row in a ${noun}'s timeline that states something which happened to the market while this ${noun} transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown.`;
}

/** The protocols a price-gap note is built for; the modal is that protocol's
 *  price move, with that protocol's own docs. */
export type PriceGapProtocol =
  | "liquity-v2"
  | "liquity-fork"
  | "polaris"
  | "aave-v4"
  | "aave-v3"
  | "spark"
  | "alchemix-v3";

export function marketNotePriceGapContent(protocol: PriceGapProtocol): LearnMoreContent {
  switch (protocol) {
    case "polaris":
      return {
        title: "How a price move reaches a CDP",
        intro: `${marketNoteLead("CDP")} This kind states how the market's own price feed moved between two of the CDP's own touches, and what that move alone did to its collateral ratio.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "every priced touch carries the market's own price feed at that block, in the market's own unit (USDp or GOLDp) rather than in dollars. The two ends of a note are two such touches; no price is read for the note itself, and none is drawn between them.",
          },
          {
            bold: "Collateral ratio",
            text: "the pETH collateral's value at that price divided by the debt. The same collateral at a lower price covers less of the debt, so a fall lowers the ratio with nothing else moving.",
          },
          {
            bold: "The liquidation line",
            text: "the market's normal-mode MCR(). A CDP below it can be liquidated. A defensive-mode minimum can be in force at a past block, but it is not indexed here, so the note always names the normal-mode one.",
          },
          {
            bold: "Runway",
            text: "how far the price could fall from the earlier touch before the collateral ratio reached that line, at the debt and collateral the CDP's own log recorded there.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the price move used at least a quarter of that runway, in either direction, and always when it ends in a liquidation. Polaris has no redemption row of its own, so a stretch ends only in a liquidation or an adjustment.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this CDP's newest priced touch against the market's price feed read right now. Shown on any open CDP, whatever the move.",
          },
        ],
        links: [POLARIS_DOC_LINKS.oracles, POLARIS_DOC_LINKS.liquidations, POLARIS_DOC_LINKS.defensiveMode],
      };
    case "aave-v4":
      return {
        title: "How a price move reaches an Aave V4 position",
        intro: `${marketNoteLead("position")} This kind states how one asset's price, as the spoke's oracle gives it, moved between two of the position's own rows, and what that move alone did to the health factor.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "the price the spoke's Aave oracle states for an asset, recorded on the position's own rows. A live note reads the same oracle at the chain head and at the block of the row it runs from.",
          },
          {
            bold: "One asset at a time",
            text: "a position holds a basket of collaterals and debts in one spoke, and their prices move independently. A note moves one asset's price and holds every other amount and price as the earlier row recorded them.",
          },
          {
            bold: "Health factor",
            text: "the collateral, each asset weighted by its liquidation threshold, divided by the debt. A collateral's price falling lowers it, and so does a debt's price rising. The thresholds are the ones the spoke reports now: the threshold in force at a past block is not indexed.",
          },
          {
            bold: "The liquidation line",
            text: "a health factor of 1.00. Below it, a liquidator can repay part of the debt and take collateral worth more than it repaid.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the move used at least a quarter of the runway, how far this asset's price alone could move before the health factor reaches 1.00, and always when it ends in a liquidation, for the asset that liquidation seized. Where a row does not price the whole basket, the note states the price alone and only a liquidation-ended stretch is shown.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this position's newest priced row against the oracle price read right now. Shown on any open position, whatever the move.",
          },
        ],
        links: [
          { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
          { label: "Liquidations in Aave V4", url: AAVE_FAQ_URLS.V4_LIQUIDATIONS },
          { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
        ],
      };
    case "aave-v3":
    case "spark": {
      const spark = protocol === "spark";
      const brand = spark ? "SparkLend" : "Aave V3";
      return {
        title: `How a price move reaches ${spark ? "a SparkLend" : "an Aave V3"} account`,
        intro: `${marketNoteLead("account")} This kind states how the price of the asset a liquidation seized moved before that liquidation, as ${brand}'s oracle gives it.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "each row carries the oracle price of the one reserve it touched. A note takes the seized asset's price at the account's last row that touched it, and at the liquidation. Rows touching other reserves can sit between the two.",
          },
          {
            bold: "Health factor",
            text: "the collateral, each asset weighted by its liquidation threshold, divided by the debt, across the whole account. A collateral's price falling lowers it, and so does a debt's price rising.",
          },
          {
            bold: "The liquidation line",
            text: "a health factor of 1.0. Below it, a liquidator can repay part of the debt and take any of the account's collateral plus a bonus.",
          },
          {
            bold: "What the note states",
            text: "the seized asset's move alone. No runway or health factor is stated, because the rest of the account is not priced at the earlier block. The debt side moves too, and a seized asset's price can rise into its liquidation.",
          },
        ],
        links: spark
          ? [
              { label: "Liquidations", url: SPARK_DOC_URLS.LIQUIDATIONS },
              { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
              { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
            ]
          : [
              { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
              { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
            ],
      };
    }
    case "alchemix-v3":
      return {
        title: "How the vault share price reaches a position",
        intro: `${marketNoteLead("position")} This kind states how the vault's share price moved between two readings of the position, and what that move alone did to its collateralisation.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Share price",
            text: "what one vault share is worth in the asset underneath (mixUSDC in USDC, mixWETH in WETH), stored with each reading of the position. It can fall as well as rise.",
          },
          {
            bold: "Collateralisation",
            text: "the shares' value in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. The share count does not change across a note; what the shares are worth does.",
          },
          {
            bold: "The liquidation line",
            text: "at the line's liquidation line or below, anyone can liquidate the position. The note reads against the line as the Alchemist reports it now.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the move used at least a quarter of the runway, how far the share price could fall before collateralisation reached the liquidation line. A share price that rises a little between readings draws no note, and a line redemption is held to the same rule as any other end.",
          },
        ],
        links: [ALCHEMIX_DOCS.liquidations, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.selfRepayingLoans],
      };
    case "liquity-fork":
      return {
        title: "How a price move reaches a Trove",
        intro: `${marketNoteLead("Trove")} This kind states how the branch's oracle price moved between two of the Trove's events, and what that move alone did to its collateral ratio.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "each priced event on a Trove carries the price the branch's PriceFeed held at the end of that event's block, which every operation updates before it acts; a redemption carries the price its log emitted. The two ends of a note are two such events; no price is read for the note, and none is drawn between them.",
          },
          {
            bold: "Collateral ratio",
            text: "the collateral's value at that price divided by the debt. The same collateral at a lower price covers less of the debt, so a fall lowers the ratio with nothing else moving.",
          },
          {
            bold: "The liquidation line",
            text: "the branch's minimum collateral ratio. A Trove below it can be liquidated.",
          },
          {
            bold: "Runway",
            text: "how far the price could fall from the earlier event before the collateral ratio reached that minimum, at the debt and collateral the Trove's log recorded there.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the price move used at least a quarter of that runway, in either direction, and always when it ends in a liquidation or a redemption. A stretch with a folder of the Trove's rows inside it is not shown, since those rows are not on the page.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this Trove's newest priced event against the branch's price read right now. Shown on any open Trove whose move clears a small floor.",
          },
        ],
      };
    case "liquity-v2":
      return {
        title: "How a price move reaches a trove",
        intro: `${marketNoteLead("trove")} This kind states how the branch's oracle price moved between two of the trove's own events, and what that move alone did to its collateral ratio.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "every event on a trove carries the collateral price Liquity's own PriceFeed stated at that event's block. The two ends of a note are two such events; no price is read for the note itself, and none is drawn between them.",
          },
          {
            bold: "Collateral ratio",
            text: "the collateral's value at that price divided by the debt. The same collateral at a lower price covers less of the debt, so a fall lowers the ratio with nothing else moving.",
          },
          {
            bold: "The liquidation line",
            text: "the branch's minimum collateral ratio. A trove below it can be liquidated.",
          },
          {
            bold: "Runway",
            text: "how far the price could fall from the earlier event before the collateral ratio reached that minimum, at the debt and collateral the trove's own log recorded there.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the price move used at least a quarter of that runway, in either direction, and always when it ends in a liquidation or a redemption. Quieter stretches stay silent.",
          },
          {
            bold: "The two ratios",
            text: "the earlier event's debt and collateral, valued at each end's price. The later figure is what that state came to be worth, while interest kept accruing across the stretch.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this trove's newest event against the branch's oracle price read right now. Shown on any open trove, whatever the move.",
          },
        ],
        links: [
          { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
          { label: "How do liquidations work?", url: FAQ_URLS.LIQUIDATIONS },
          { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
        ],
      };
  }
}

// ── Polaris (Sepolia testnet) ───────────────────────────────────────────────
// Layer-2 content: the protocol's rules, true of every CDP. Instance figures
// belong in the Layer-1 panes (lib/polaris/explainer-clauses.tsx and the
// position explanation), never here.

/** The vault surfaces' own note: a change to the VAULT's terms, which happened
 *  to every holder at once and so is not one holder's event. */
export function marketNoteVaultTermsContent(): LearnMoreContent {
  return {
    title: "About vault-terms notes",
    intro:
      "A note is a row in a timeline that states something which happened while this address transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown. This kind states a change to the VAULT's own terms — its fee, its name, the rate it targets, the cooldown it imposes — read from the vault's own configuration log.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Why it is a note and not a row",
        text: "a row in a holder's vault timeline is something that holder did — a share transfer the vault emitted about that address. A configuration event was emitted about the vault, and it moved every holder's terms at the same moment. Placing it among the rows by block is what shows when the terms moved relative to this address's own events; keeping it out of every count is what stops it being read as one of them.",
      },
      {
        bold: "The words are the contract's",
        text: "each figure here is a non-indexed word of the log, raw, in the units the contract stores it in. Nothing is converted into a rate, a yield or a currency, and nothing is read from between one note and the next — the vault emitted a log at one block, and that block is the whole of what this states.",
      },
      {
        bold: "What the terms are now",
        text: "a note says what was set THEN. What the vault's terms are at the block this page read at is stated in the sections above it, which are calls answered at that block.",
      },
    ],
  };
}

/** The protocols a rate-step note is built for. */
export type RateStepProtocol = "polaris" | "makerdao" | "aave-v3" | "spark";

export function marketNoteRateStepContent(protocol: RateStepProtocol): LearnMoreContent {
  switch (protocol) {
    case "makerdao":
      return {
        title: "How the stability fee moves a vault",
        intro: `${marketNoteLead("vault")} This kind states a step in the collateral type's stability fee between two of the vault's own touches.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Stability fee",
            text: "the yearly rate a collateral type's debt compounds at, set by governance as the duty on the Jug.",
          },
          {
            bold: "Fee in force at a touch",
            text: "a vault's rows carry no fee, and the spell that set it is not indexed. So the fee in force at a touch is read off the Vat's own fold series (every Jug.drip's delta encodes the duty it compounded at) and then confirmed by reading the Jug's duty at that drip's own block, which is the figure the note states.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the fee moved by at least one percentage point between the vault's two touches, in either direction. Consecutive moves in the same direction are stated as one note.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: the Jug's base plus duty for this collateral type, compounded over a year and read right now.",
          },
        ],
        links: [
          { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
          { label: "Vat, the core accounting", url: MAKER_DOCS.VAT },
          { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
        ],
      };
    case "aave-v3":
    case "spark": {
      const spark = protocol === "spark";
      return {
        title: `How ${spark ? "SparkLend" : "Aave V3"} rates move an account`,
        intro: `${marketNoteLead("account")} This kind states a step in one reserve's rate, on one side of it, between two of the account's own touches.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Two rates per reserve",
            text: "the supply rate an account earns and the variable borrow rate it pays. They move independently, so a note reads one of them.",
          },
          {
            bold: "Where the rate is read",
            text: "the reserve's own ReserveDataUpdated log around the account's own transactions: at or before its earlier action, and before its next touch but never from inside that touch's transaction, so a move the account caused is not stated as the market's.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the rate moved by at least one percentage point between the two touches, in either direction.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the Pool's getReserveData for the reserve, read at the chain head.",
          },
        ],
        links: spark
          ? [
              { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
              { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
            ]
          : [
              { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
              { label: "Borrowing assets", url: AAVE_FAQ_URLS.BORROWING },
              { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
            ],
      };
    }
    case "polaris":
      return {
        title: "How the primary rate moves a CDP",
        intro: `${marketNoteLead("CDP")} This kind states a step in the market's primary rate between two of the CDP's own touches; both ends are this CDP's own events.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Primary rate",
            text: "the market's Peg Stability Rate, set algorithmically on the market's own PSM mints and redemptions. It is on every touch as the rate in force at that block.",
          },
          {
            bold: "Rate in force at a touch",
            text: "the market's last PrimaryRateSet at or before the touch's block. Nothing is read for the note itself: the rate is the figure the touch's own row states.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the rate moved by at least one percentage point between the CDP's two touches, in either direction. Consecutive moves in the same direction are stated as one note, from the first touch to the last; the receipt lists each step it took in, and a move too small to be stated on its own never breaks a run. A move the other way ends the run and begins the next note. A stretch ending in a liquidation has no exception, because the primary rate does not cause one.",
          },
          {
            bold: "The figure in the header",
            text: "the rate at the later end: what the market charged by the end of the stretch, or charges now on a live note. The panel sets the two rates side by side.",
          },
          {
            bold: "The interest figure",
            text: "the yearly interest the CDP's debt at the earlier touch would cost at each end's rate, holding that debt fixed and moving only the rate. The secondary, utilisation-driven rate is added on top by the protocol and is not on this log.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this CDP's last touch against the cdpManager's primary rate read right now. Shown on any open CDP, whatever the move.",
          },
        ],
        links: [POLARIS_DOC_LINKS.interestRates, POLARIS_APP_LINK],
      };
  }
}

export function polarisCdpContent(): LearnMoreContent {
  return {
    title: "How Polaris CDPs Work",
    intro:
      "Polaris is a Liquity-lineage CDP protocol on the Sepolia testnet. A borrower posts pETH — the protocol's bonding-curve wrapper of ETH — into a CDP in one of two markets and mints that market's stablecoin against it: USDp tracks the dollar, GOLDp tracks gold. The CDP is an NFT, so the position can change hands without being closed.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Algorithmic rates",
        text: "the market sets a primary rate on nearly every touch and adds a utilisation-driven secondary rate. Nobody chooses a rate; the rate in force is a fact of the market at that moment.",
      },
      {
        bold: "Interest charged at each touch",
        text: "interest accrues continuously and is written into the debt whenever the CDP is touched — the touch's own figure states how much.",
      },
      {
        bold: "Shared PSM adjustments",
        text: "when the market's PSM mints or redeems, every CDP takes a pro-rata share of the collateral and debt that moved, credited or debited at its next touch.",
      },
      {
        bold: "Stability-pool rewards",
        text: "a share of the market's revenue is credited against each CDP's debt, and reward pETH is added to its collateral, both applied at the next touch.",
      },
      {
        bold: "Minimum collateral ratio",
        text: "a CDP must hold collateral worth at least 115% of its debt at the protocol's own price; in defensive mode the floor rises to 150%.",
      },
      {
        bold: "Equity at the feed",
        text: "an open CDP's collateral valued at the protocol's own price for pETH, minus its debt — a valuation at the block the three figures were read at, not a profit. Turning it into a realised profit or loss needs a price for each of the holder's own deposits, which is a decision about basis rather than a fact the chain states.",
      },
    ],
    links: [
      POLARIS_DOC_LINKS.passetMarkets,
      POLARIS_DOC_LINKS.interestRates,
      POLARIS_DOC_LINKS.defensiveMode,
      POLARIS_DOC_LINKS.peth,
      POLARIS_APP_LINK,
    ],
  };
}

export function polarisLiquidationContent(): LearnMoreContent {
  return {
    title: "How Polaris Liquidations Work",
    intro:
      "A CDP whose collateral ratio falls below the market's minimum can be liquidated by anyone. The market's stability pool absorbs the debt where it can, taking the collateral in exchange; what the pool cannot cover is redistributed across the other CDPs in the market.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Pool absorption",
        text: "the stability pool's deposits repay the liquidated debt and the pool receives the collateral — the common case on this deployment.",
      },
      {
        bold: "Redistribution",
        text: "debt and collateral the pool cannot absorb are spread pro rata across every other CDP in the market, arriving at each one's next touch.",
      },
      {
        bold: "Gas compensation",
        text: "the liquidator receives the fixed gas compensation the CDP escrowed at open plus a share of its collateral.",
      },
      {
        bold: "Collateral surplus",
        text: "collateral left over after the debt is covered is set aside for the CDP's owner to claim.",
      },
    ],
    links: [
      POLARIS_DOC_LINKS.liquidations,
      POLARIS_DOC_LINKS.recoveryMode,
      POLARIS_DOC_LINKS.oracles,
      POLARIS_APP_LINK,
    ],
  };
}

export function polarisTransferContent(): LearnMoreContent {
  return {
    title: "Transferring a Polaris CDP",
    intro:
      "A Polaris CDP is an NFT. Transferring it hands the whole position — its collateral, its debt and every pending adjustment — to a new owner, without opening or closing anything. The explorer names the current holder from the last such transfer.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Custody, not an action on the position",
        text: "nothing about the CDP's balances moves in a transfer; only who may act on it changes.",
      },
      {
        bold: "The mint and the burn",
        text: "the NFT is minted when the CDP opens and burned when it closes or is liquidated — those two transfers are the open and the close themselves, not custody events.",
      },
    ],
    links: [POLARIS_DOC_LINKS.passetMarkets, POLARIS_DOC_LINKS.polaris101, POLARIS_APP_LINK],
  };
}

// ── Aave's vault layer on Ethereum ───────────────────────────────────────────
// The two "?" cells of the position page: the card that states what an address
// holds, and the tower that states what moved over its whole life. Facts only —
// what each figure is a reading OF, and what the section refuses to state.

/** A short account of what one FAMILY's share token is, in the terms its own
 *  contract uses. Kept beside the two cells rather than in either, because both
 *  of them need it and neither owns it.
 *
 *  EVERY FAMILY THE CENSUS WRITES, on both chains. The cell below is the vault
 *  position card's, and that card is the same component on Ethereum and on
 *  Base — so the note has to cover MetaMorpho too, or the Base card is the one
 *  position card in the product with no "?" behind it. */
const AAVE_VAULT_FAMILY_NOTE: Record<VaultPositionFamily, string> = {
  sgho: "Savings GHO is a vault over GHO: depositing GHO mints sGHO, and the vault's own convertToAssets says what a balance of sGHO is worth in GHO at the block it is asked at.",
  stata:
    "A Static aToken wraps an Aave V3 aToken, whose balance rebases. The wrapper's own balance does not: it holds a fixed number of shares and the growth shows up in what a share converts to, which is what makes a balance comparable between two blocks.",
  "umbrella-stake":
    "An Umbrella stake token holds a Static aToken and can be slashed to cover a deficit in the Aave market it backs. Redemption runs through a cooldown: the holder starts one, waits it out, and then has a window in which maxRedeem() answers something other than zero.",
  morpho:
    "A MetaMorpho vault is an ERC-4626 vault over Morpho Blue: its curator allocates the deposits across a set of Blue markets, and the vault's own convertToAssets says what a balance of its shares is worth in the asset at the block it is asked at. There is no cooldown: a withdrawal is limited only by what the markets in the vault's withdraw queue can pay at that block, which is what maxWithdraw answers.",
};

/** The "?" on the position card — the three headline figures and the two lanes
 *  behind them. */
export function aaveVaultPositionContent(
  family: VaultPositionFamily,
  assetSymbol: string,
  shareSymbol: string | null,
): LearnMoreContent {
  const shares = shareSymbol ?? "the share token";
  // The vaults themselves are Aave's on chain 1 and MetaMorpho's on Base, so
  // the opening sentence names the catalogue the position is in rather than one
  // issuer. Everything under it is true of both: the figures are ERC-4626 reads
  // at a block the card names.
  const catalogue =
    family === "morpho" ? "one of the MetaMorpho vaults catalogued on Base" : "one of Aave's own ERC-4626 vaults";
  return {
    title: "What a vault position is",
    intro: `A position here is one pair: an address, and ${catalogue}. Holding ${shares} is holding a share of that vault, and every figure on this card is a reading of a contract at a block the card names. ${AAVE_VAULT_FAMILY_NOTE[family]}`,
    detailsHeading: "What each figure on the card is:",
    details: [
      {
        bold: "Shares",
        text: `the vault's own balanceOf for this address, in ${shares}'s own units. Share units, not ${assetSymbol}.`,
      },
      {
        bold: "Claim",
        text: `the vault's own convertToAssets of exactly that balance, in ${assetSymbol}. It is the contract's answer at one block, never the shares multiplied by a price.`,
      },
      {
        bold: "Share of the vault",
        text: "that balance over the share token's totalSupply at the same block — two integers in the same units, divided.",
      },
      {
        bold: "The activity count and the dates",
        text: "the census: one whole-Transfer sweep of the vault, proven complete by Σ balanceOf equalling totalSupply wei-exact, run daily. The card names the block it swept to, separately from the block the figures above were read at.",
      },
      {
        bold: "Value · USD",
        text: "the census's one priced figure: the balance at the census block through the vault's own convertToAssets and the chain's Aave V3 oracle (IAaveOracle.getAssetPrice) at that block, the oracle and the block named on its receipt. Computed once by the daily census, never read for the page — what the position was worth then, nothing about now. A vault that oracle does not price is stated as not priced, never guessed from another feed.",
      },
    ],
    extraParagraphs: [
      "Nothing here is annualised. A vault's share price moves, but a rate of return over it would be a line drawn between two blocks nobody read, so no figure spans the gap between one reading and the next.",
      "A zero is a reading. A call that did not answer is stated as unread instead — the two are different facts and the card never prints one as the other.",
    ],
  };
}

/** The "?" on the lifetime-flows tower. */
export function aaveVaultFlowsContent(assetSymbol: string, shareSymbol: string): LearnMoreContent {
  return {
    title: "How the lifetime flows are counted",
    intro: `The tower sums this address's own events in this vault — every Transfer of ${shareSymbol} the vault emitted about it, and the ERC-4626 Deposit and Withdraw events that were emitted beside them. It is a sum over the whole history, not over the rows currently drawn below it.`,
    detailsHeading: "The two sides:",
    details: [
      {
        bold: `The share side, in ${shareSymbol}`,
        text: "minted, transferred in, burned and transferred out. It closes: minted plus transferred in, less burned and transferred out, is the balance the vault's own balanceOf reports at the page's block, wei-exact.",
      },
      {
        bold: `The asset side, in ${assetSymbol}`,
        text: "the assets word of the ERC-4626 events themselves, and the vault's own convertToAssets of the balance held now. A mint or a burn that carried no such event is in the share totals and in no asset total at all — the page says how many.",
      },
      {
        bold: "Why the two heights are not comparable",
        text: `${shareSymbol} and ${assetSymbol} are different tokens with their own decimals. The bars are drawn in each token's own units and nothing converts one side into the other.`,
      },
    ],
    extraParagraphs: [
      "No rate, no yield and no profit or loss is drawn. A cost basis over a pooled fungible share is not something any chain read supplies, and the difference between two share prices read at two blocks the holder happened to transact in is not a return.",
      "The tower is drawn under exactly the condition the rows are: a history that could not be reconciled against the vault's own balanceOf, and one too large to draw whole, both leave it off the page rather than summing part of a life.",
    ],
  };
}

// ── Liquity family — claiming a collateral surplus ───────────────────────────

/** The "?" on a Trove's "Claim collateral" row: what the CollSurplusPool holds
 *  and what claimCollateral() pays. Shared by Liquity V2, its forks and
 *  Liquity V1; each passes its own name and links. */
export function liquityCollSurplusClaimContent(
  p:
    | { family: "liquity-v2"; protocolName: string }
    | { family: "liquity-v1"; protocolName: string }
    | { family: "fork"; fork: LiquityForkLearnMoreParams },
): LearnMoreContent {
  const v1 = p.family === "liquity-v1";
  const name = p.family === "fork" ? p.fork.protocolName : p.protocolName;
  const links =
    p.family === "liquity-v1"
      ? [V1_SRC.liquidations, V1_SRC.redemptions, V1_SRC.bo]
      : p.family === "fork"
        ? forkLinks(p.fork, "liquidation")
        : [
            {
              label: "How do liquidations work?",
              url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
            },
          ];
  return {
    title: "How Claiming Collateral Works",
    intro: v1
      ? `When a liquidation in Recovery Mode takes less than all of a Trove's ETH, or redemptions cancel its whole debt, the ETH left over does not go back to the owner's wallet. ${name} credits it to the owner in a surplus pool, which holds it until the owner claims it.`
      : `When a liquidation takes less collateral than the Trove holds, the rest does not go back to the owner's wallet. ${name} credits it to the owner in the collateral branch's CollSurplusPool, which holds it until the owner calls claimCollateral() on BorrowerOperations.`,
    stepsHeading: "How the pool pays out:",
    steps: [
      v1
        ? "The pool keeps one balance per owner. Each Trove that closes this way adds its leftover ETH to it."
        : "The pool keeps one balance per owner on each branch. Each Trove liquidated with collateral to spare adds its leftover to it.",
      "claimCollateral() pays the whole balance to the owner in one transaction, so one claim can cover several Troves.",
      "The balance does not change while it waits: it earns nothing and nobody else can take it.",
    ],
    links,
  };
}
