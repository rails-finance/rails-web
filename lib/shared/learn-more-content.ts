import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { POLARIS_APP_LINK, POLARIS_DOC_LINKS } from "@/lib/polaris/docs-links";
import type { CurveEventType } from "@/lib/shared/types/protocols/curve";
import type { UniswapEventType } from "@/lib/shared/types/protocols/uniswap";
import { getSpokeMeta, ARCHETYPE_LABEL } from "@/lib/aave-v4/spoke-meta";
import { SEAMLESS_DOCS_URL, v3Brand, v3Possessive, type V3Protocol } from "@/lib/aave-v3/protocol-name";
import { FAQ_URLS, AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import type { VaultPositionFamily } from "@/lib/aave-vaults/vault-position";

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
          text: "repaying all debt returns the collateral above the liquidation reserve to the owner and burns the trove NFT.",
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
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
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
        text: "how much can be borrowed depends on the collateral's value weighted by each asset's risk parameters.",
      },
      {
        bold: "Health factor",
        text: "borrowing lowers the health factor; if it falls below 1.0 the position can be liquidated.",
      },
      {
        bold: "Borrow interest",
        text: "debt accrues interest continuously at the asset's borrow rate until it's repaid.",
      },
    ],
    links: [
      { label: "Borrowing assets", url: AAVE_FAQ_URLS.BORROWING },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
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
export function aaveV4EconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section traces a position's supply and borrow flows over its lifetime and shows how much price cushion each collateral asset has before liquidation.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Lifetime flows",
        text: "the towers show every supply, withdrawal, borrow, and repayment over the position's life — not just the current balance.",
      },
      {
        bold: "Price runway",
        text: "for a borrowing position, how far each collateral asset's price can fall before it reaches the liquidation price.",
      },
      {
        bold: "Health factor",
        text: "the single safety number for the whole spoke; a runway is exhausted when the position's health factor would hit 1.0. A position with no borrows has no health factor or liquidation risk to track.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
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

  const sameHub = meta.collateralHub === meta.borrowHub;
  const hubMapping = sameHub
    ? `Collateral and borrows both sit in the ${meta.collateralHub} Hub.`
    : `Collateral sits in the ${meta.collateralHub} Hub, while borrows are drawn from the ${meta.borrowHub} Hub.`;
  const archetype = ARCHETYPE_LABEL[meta.archetype];

  const extraParagraphs = [...meta.narrative];
  if (meta.rateNote) extraParagraphs.push(meta.rateNote);

  return {
    title: `How the ${meta.name} Spoke Works`,
    intro: `${archetype} — ${meta.name} on Aave V4's Hub & Spoke model. ${hubMapping}`,
    extraParagraphs,
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
      "A liquidator repays part of the outstanding debt and, in return, receives an equivalent value of the borrower's collateral plus a liquidation bonus — so the collateral seized is worth more than the debt cleared. That bonus is the liquidator's incentive and the borrower's effective penalty." +
        marketNote,
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
        text: "a market users interact with, drawing from a Hub. One spoke can draw from more than one — Bluechip keeps collateral in Prime but borrows from Core.",
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
  const supplying = eventType === "supply";
  const pool = `${v3Possessive(protocol, "'")} Pool`;
  return {
    title: supplying ? "How Supplying Works" : "How Withdrawing Works",
    intro: supplying
      ? `Supplying deposits an asset into ${pool}, where it earns the variable supply rate and — unless turned off — backs borrowing as collateral. Withdrawing reverses it.`
      : `Withdrawing returns supplied assets from ${pool} to the wallet. It can only go as far as the remaining collateral keeps any outstanding debt covered.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supplied balance",
        text: "the deposit, which accrues supply interest continuously and stays withdrawable unless it's needed to keep a borrow covered.",
      },
      {
        bold: "Cross-collateralisation",
        text: `${protocol} pools every supplied asset into one account per wallet — all of it backs all of the account's borrowing, under one shared health factor.`,
      },
      {
        bold: supplying ? "As collateral" : "Effect on health",
        text: supplying
          ? "supplied assets count as collateral unless explicitly disabled; only collateral-enabled supply raises borrowing power."
          : "withdrawing removes collateral, so the account's health factor falls — the Pool blocks any withdrawal that would push it below 1.0.",
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
        text: "debt accrues interest continuously at the reserve's variable borrow rate, which moves with pool utilisation, until repaid.",
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
  const account = protocol === "Aave V3" ? "An Aave V3 account" : `A ${protocol} account`;
  return {
    title: "How Liquidations Work",
    intro: `${account} becomes eligible for liquidation when its health factor falls below 1.0 — the point where its borrowed value, measured against each collateral asset's liquidation threshold, is no longer sufficiently covered. Once eligible, anyone (in practice, automated liquidator bots) can step in.`,
    extraParagraphs: [
      "A liquidator repays part of the account's outstanding debt and, in return, receives an equivalent value of its collateral plus a liquidation bonus — so the collateral seized is worth more than the debt cleared. That bonus is the liquidator's incentive and the borrower's effective penalty. Because V3 pools everything into one cross-collateralised account, the liquidator can take any of the account's collateral assets, not just one in isolation.",
      `${v3Brand(protocol)} liquidates only partially — enough to nudge the health factor back above 1.0 — rather than closing the whole position at once. Health factor = (collateral value × each asset's liquidation threshold) ÷ total debt; keep it comfortably above 1.0 by holding more collateral or carrying less debt.`,
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
        text: "aTokens are interest-bearing: the amount shown is the underlying the transferred aTokens were worth at that moment, and it keeps earning the supply rate in the new account.",
      },
    ],
    links: v3ModalLinks(protocol, [
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ]),
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
        text:
          protocol === "Aave V3"
            ? "all of a wallet's supply and debt share one account and one health factor — there's no per-market isolation like V4's spokes."
            : "all of a wallet's supply and debt share one account and one health factor — there's no per-market isolation.",
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
      ? "Borrowing draws an asset against the account's supplied collateral, accruing interest continuously — Moonwell accrues per second (per-timestamp), not per block like the original Compound v2."
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
          : "a wallet can exit by sending its mTokens rather than redeeming — the position continues under the new owner.",
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
          : "a wallet can exit by sending its cTokens rather than redeeming — the position continues under the new owner. Nothing stops a send to the cToken contract itself or to the zero address either; such tokens are simply gone from the sender.",
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
      "Liquidation is partial and repeatable, and borrowers commonly survive it: Compound V2's 26,639 liquidations land on 5,864 distinct borrowers — about 4.5 each. An account liquidated years ago can still be open today; the timeline shows each liquidation as one event in the account's life, not its end.",
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
        text: "the close factor caps each liquidation at half of one borrowed market, so an account often survives — seizures appear alongside continued activity, not as an ending.",
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
      "Liquidation is partial and repeatable: it clears what the liquidator chooses to repay, and the account continues with whatever remains. The timeline shows each liquidation as an event in the account's life, not its end.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Vaporization",
        text: "an account can run out of collateral before its debt is cleared, leaving a shortfall no liquidation can seize against. Vaporization writes that remaining debt off, covered by the core's own excess token balances rather than by the account.",
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
// converts collateral to the borrowed token continuously while the price is
// inside the band (a state, reversible, no event) — then HARD — a one-shot
// Liquidate once health goes negative.

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

export function llamalendBorrowContent(kind: "borrow" | "add_collateral"): LearnMoreContent {
  const borrowing = kind === "borrow";
  return {
    title: borrowing ? "How Borrowing Works" : "How Adding Collateral Works",
    intro: borrowing
      ? "Borrowing deposits collateral into the market's LLAMMA AMM — spread across a chosen number of price bands (N, 4–50) — and draws the borrowed token against it. The band placement follows from the loan size: more debt pushes the band closer to the current price."
      : "Adding collateral deposits more of the collateral token into the position's bands without changing the debt — the same Borrow event with a zero loan amount. The extra collateral pushes the band further below the current price.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral lives in an AMM",
        text: "the collateral is not parked in a vault — it is liquidity in the market's LLAMMA AMM, placed across N adjacent price bands. That placement is what makes soft-liquidation possible.",
      },
      {
        bold: "The band is the risk line",
        text: "soft-liquidation begins at the band's top price (p_oracle_up(n1)) and completes at its bottom (p_oracle_down(n2)) — a range, not a single liquidation price.",
      },
      {
        bold: "Isolated markets",
        text: "each Controller is one market (one collateral, one borrowed token) — positions in different markets never share margin and liquidate independently.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendRepayContent(kind: "repay" | "remove_collateral"): LearnMoreContent {
  const repaying = kind === "repay";
  return {
    title: repaying ? "How Repaying Works" : "How Removing Collateral Works",
    intro: repaying
      ? "Repaying returns borrowed tokens to the Controller, reducing the debt (to zero on a full close, which also withdraws the collateral from the AMM). Less debt moves the position's band further below the current price."
      : "Removing collateral withdraws part of the position's collateral from the AMM's bands. It is only possible while the position is NOT in soft-liquidation, and it moves the band closer to the current price.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Debt accrues per second",
        text: "the market's monetary policy sets a per-second rate; the debt figure in any event is the accrued total at that block.",
      },
      {
        bold: "Bands re-place on every change",
        text: "each borrow/repay/collateral change re-computes the band ticks (n1, n2) — the position's own UserState after-image records them.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendLiquidationContent(self: boolean): LearnMoreContent {
  return {
    title: self ? "How Self-Liquidation Works" : "How Hard Liquidation Works",
    intro: self
      ? "A borrower whose position is partly converted can settle it themselves: self-liquidation repays the debt using the already-converted borrowed tokens plus a top-up, and withdraws whatever collateral remains — a normal close from soft-liquidation, not a loss to a third party."
      : "Hard liquidation is the terminal stage: once soft-liquidation losses push a position's health below zero, anyone may liquidate it — repaying its debt (partly from the position's own already-converted tokens) and taking the remaining collateral at the market's liquidation discount.",
    extraParagraphs: [
      "Before any hard liquidation comes SOFT-liquidation: while the oracle price is inside the position's band, the AMM converts its collateral to the borrowed token continuously — in place, reversibly, with no event and no liquidator. Every hard liquidation therefore carries its soft-liquidation history in state: the converted amount is readable from user_state right up to the liquidating block.",
      "The Controller emits a paired Repay alongside every Liquidate with identical amounts — the index de-duplicates that pair, so the timeline shows one liquidation event, counted once.",
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendEventFallbackContent(): LearnMoreContent {
  return {
    title: "How LlamaLend Positions Work",
    intro:
      "LlamaLend is Curve's LLAMMA lending. A position is a (market, user) pair: each Controller is an isolated market whose collateral sits in a price-band AMM, so liquidation is a band the price moves through, not a line it crosses.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Soft-liquidation is a state",
        text: "inside the band the AMM converts collateral to the borrowed token continuously (and back on recovery). The converted amount appears in no event — it is read live from user_state.",
      },
      {
        bold: "Hard liquidation is an event",
        text: "once health goes negative, one Liquidate transaction settles the position — debt cleared, remaining balances taken.",
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

export function fxOperateContent(kind: "open" | "adjust" | "close"): LearnMoreContent {
  const intro =
    kind === "open"
      ? "Opening a position deposits collateral into one of f(x)'s pools (wstETH or WBTC) and mints fxUSD debt against it, creating a leveraged long held as an ERC-721 position NFT."
      : kind === "close"
        ? "Closing repays the position's remaining fxUSD debt and withdraws its collateral, emptying the position. The final repay amount settles whatever the debt really was at that block — including every socialized adjustment accrued since the last touch."
        : "Adjusting moves a position's collateral and/or fxUSD debt in one operation — deposits, withdrawals, borrows and repays are all the same Operate call with signed deltas.";
  return {
    title: kind === "open" ? "How Opening Works" : kind === "close" ? "How Closing Works" : "How Adjusting Works",
    intro,
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
      "f(x) defends fxUSD with two mechanisms. Rebalances trim whole ticks of positions back to a safer debt ratio when the price moves against them — socialized across every position in the tick, with no per-position event. Liquidations close individual positions whose debt ratio breaches the liquidation threshold.",
    extraParagraphs: [
      "A liquidation event records the collateral seized and the debt actually repaid by the liquidator. When a position's collateral runs out before its debt, the difference is written off against the protocol's reserve — that write-off appears in no event, which is why the explorer reconciles every position against the pool's own settled reading rather than trusting event arithmetic.",
      "Because rebalances and redemptions socialize across ticks, a position's collateral and debt can shrink between its own transactions. The dashboard's reconciliation line quantifies exactly how much of the position's history arrived this way.",
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

export function fxTransferContent(): LearnMoreContent {
  return {
    title: "How Position Ownership Works",
    intro:
      "f(x) V2 positions are ERC-721 tokens minted by the pool contract itself — the pool is the NFT. Holding the token IS owning the position: the holder alone can adjust or close it, and can transfer it like any NFT.",
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
// Docs live under docs.liquity.org/liquity-v1 (URLs verified 2026-07).

const LIQUITY_V1_FAQ = {
  BORROWING: "https://docs.liquity.org/liquity-v1/faq/borrowing",
  REDEMPTIONS: "https://docs.liquity.org/liquity-v1/faq/lusd-redemptions",
  LIQUIDATIONS: "https://docs.liquity.org/liquity-v1/faq/stability-pool-and-liquidations",
  RECOVERY_MODE: "https://docs.liquity.org/liquity-v1/faq/recovery-mode",
  GENERAL: "https://docs.liquity.org/liquity-v1/faq/general",
} as const;

export function liquityV1BorrowingContent(
  eventType: "openTrove" | "adjustTrove" | "closeTrove" = "adjustTrove",
): LearnMoreContent {
  const title =
    eventType === "openTrove"
      ? "How Opening a Trove Works"
      : eventType === "closeTrove"
        ? "How Closing a Trove Works"
        : "How Trove Adjustments Work";
  return {
    title,
    intro:
      "A Liquity V1 Trove holds ETH collateral and mints LUSD debt against it — interest-free. The debt never grows on its own: it changes only when the owner draws or repays, or when a redemption or liquidation touches the Trove.",
    stepsHeading: "The mechanics:",
    steps: [
      "Opening requires a minimum debt of 2,000 LUSD and sets aside a 200 LUSD gas-compensation reserve (refunded in full when the Trove closes normally).",
      "Each LUSD draw pays a one-time borrowing fee of 0.5%–5% (usually at the 0.5% floor; 0% while the system is in recovery mode), added to the debt.",
      "The Trove must keep its collateral ratio above the 110% minimum — below it, anyone can trigger a liquidation.",
      "Closing repays the remaining LUSD and returns all ETH collateral plus the gas reserve.",
    ],
    extraParagraphs: [
      "Because there is no ongoing interest, the emitted debt figure is the Trove's exact obligation — drawn LUSD plus the one-time fees and the gas reserve.",
    ],
    links: [
      { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
      { label: "What is the borrowing fee?", url: LIQUITY_V1_FAQ.BORROWING },
      { label: "Liquity V1 overview", url: LIQUITY_V1_FAQ.GENERAL },
    ],
  };
}

export function liquityV1RedemptionContent(): LearnMoreContent {
  return {
    title: "How Redemptions Work",
    intro:
      "Any LUSD holder can redeem LUSD against the system for ETH at $1 face value. Redemptions repay the troves with the LOWEST collateral ratio first — this is the arbitrage loop that holds LUSD's dollar peg from below.",
    stepsHeading: "What happens to a redeemed Trove:",
    steps: [
      "The redeemer's LUSD cancels the Trove's debt at face value, and ETH of equal dollar value (at the protocol's oracle price) leaves the Trove.",
      "The Trove's collateral ratio actually RISES — it loses debt and collateral in equal value, keeping the surplus.",
      "A fully redeemed Trove is closed; any collateral surplus stays claimable by the owner.",
    ],
    extraParagraphs: [
      "Being redeemed is not a penalty: net value is preserved at the oracle price. The exposure it removes is the ETH upside on the redeemed portion. Keeping a higher collateral ratio than other troves moves a Trove back in the queue.",
      "The redeemer pays a redemption fee (base rate + 0.5% floor, decaying over time) — the fee comes out of the ETH the redeemer receives, not out of the Trove.",
    ],
    links: [
      { label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS },
      { label: "How is the redemption order decided?", url: LIQUITY_V1_FAQ.REDEMPTIONS },
    ],
  };
}

export function liquityV1LiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro:
      "A Trove becomes liquidatable when its collateral ratio falls below the 110% minimum (or below 150% while the system is in recovery mode). Anyone can trigger the liquidation.",
    stepsHeading: "What happens:",
    steps: [
      "The Stability Pool's LUSD deposits absorb the Trove's debt, and the Trove's ETH is distributed to the pool's depositors — usually at a discount that rewards them.",
      "If the pool can't absorb it all, the remaining debt and collateral are redistributed proportionally across all other active troves (arriving as 'pending rewards' applied on their next operation).",
      "The liquidator receives the Trove's 200 LUSD gas-compensation reserve plus 0.5% of its collateral.",
    ],
    extraParagraphs: [
      "Liquidation in V1 is total — the whole Trove is closed, unlike the partial liquidations of pooled-lending protocols.",
    ],
    links: [
      { label: "Stability Pool & liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
      { label: "Recovery mode", url: LIQUITY_V1_FAQ.RECOVERY_MODE },
    ],
  };
}

export function liquityV1EventFallbackContent(): LearnMoreContent {
  return {
    title: "How Liquity V1 Troves Work",
    intro:
      "Liquity V1 is an interest-free borrowing protocol: one Trove per address holds ETH collateral and mints LUSD, governed by a 110% minimum collateral ratio, redemptions that repay the lowest-ratio troves first, and a Stability Pool that absorbs liquidations.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Interest-free debt",
        text: "the debt never grows on its own — only draws, repayments, redemptions and liquidations change it. A one-time 0.5%–5% fee applies to each draw.",
      },
      {
        bold: "110% minimum ratio",
        text: "below it the Trove can be liquidated; below 150% system-wide the protocol enters recovery mode and tightens conditions.",
      },
      {
        bold: "Redemption queue",
        text: "LUSD holders can redeem at $1 face value against the lowest-ratio troves — a peg mechanism, not a penalty.",
      },
    ],
    links: [
      { label: "Liquity V1 FAQ", url: LIQUITY_V1_FAQ.GENERAL },
      { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
    ],
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
      "On absorb, the protocol seizes the account's collateral and clears its entire base debt in one step. The account is credited the collateral's oracle value minus each asset's liquidation penalty (1 − liquidationFactor), paid in the base asset — so an absorbed account can come out of liquidation holding a small positive base balance rather than owing anything.",
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
        text: "a transfer is a change of custody, not new capital arriving or leaving — so this explorer counts it on its own line rather than merging it into deposited/withdrawn, which stay true to real supplies.",
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
        text: "the page reads the address's own code at the same block and states what it found: no code at all (an externally owned account), a Safe, an ERC-4626 vault, or a proxy to another contract, whose address is printed rather than named. A contract holding shares holds them for its own holders, and the figures are attributed to the address either way.",
      },
      {
        bold: "An address is not a person",
        text: "a computed stake belongs to an address. Nothing on this page identifies who controls it unless the address carries a name of its own.",
      },
    ],
    links: [
      { label: "MetaMorpho vaults", url: MORPHO_DOC_URLS.VAULT },
      { label: "Morpho markets", url: MORPHO_DOC_URLS.MARKET },
      { label: "Morpho docs", url: MORPHO_DOC_URLS.OVERVIEW },
    ],
  };
}

export function morphoMarketContent(
  eventType: "borrow" | "repay" | "supply_collateral" | "withdraw_collateral",
): LearnMoreContent {
  const debtSide = eventType === "borrow" || eventType === "repay";
  return {
    title: debtSide ? "How Borrowing in a Morpho Market Works" : "How Morpho Collateral Works",
    intro: debtSide
      ? "Morpho Blue is one immutable contract holding many isolated markets. A market is a fixed five-part recipe — one loan asset, one collateral asset, an oracle, a rate model and a liquidation LTV (LLTV) — and a loan in it is backed only by that market's collateral."
      : "Collateral in a Morpho market is a single asset held at its exact amount — it earns nothing and backs only this market's loan asset. Nothing outside the market can touch it.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One line, not two",
        text: "the LLTV is both the borrow limit and the liquidation threshold — a position can borrow right up to it, and becomes liquidatable past it. The same on-chain health check gates both.",
      },
      {
        bold: "The market's own oracle",
        text: "prices quote the collateral asset in loan-asset terms (not USD); the liquidation check reads exactly this oracle, chosen when the market was created.",
      },
      debtSide
        ? {
            bold: "Debt as shares",
            text: "a loan is recorded as borrow shares against the market's totals, so interest accrues to every borrower at once as the totals grow — a repayment therefore covers principal plus the interest accrued on it.",
          }
        : {
            bold: "Exact amounts",
            text: "collateral doesn't accrue or rebase inside the market, so its running balance replays exactly from the position's own deposit and withdrawal events.",
          },
      {
        bold: "Adaptive interest",
        text: "the rate model steers utilization toward a target by adjusting the borrow rate continuously; lenders earn the borrow interest net of the market fee.",
      },
    ],
    links: [
      { label: "Morpho markets", url: MORPHO_DOC_URLS.MARKET },
      { label: "Interest rate model", url: MORPHO_DOC_URLS.IRM },
    ],
  };
}

export function morphoLiquidationContent(): LearnMoreContent {
  return {
    title: "How Morpho Liquidation Works",
    intro:
      "A Morpho position is liquidatable the moment its debt exceeds LLTV × the collateral's value at the market's own oracle price. Anyone can then repay some or all of the debt and seize collateral in exchange, at a discount fixed by the market's LLTV.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The incentive",
        text: "the liquidator seizes collateral worth more than the debt repaid — a discount of min(1.15, 1 ÷ (1 − 0.3 × (1 − LLTV))). Higher-LLTV markets carry smaller discounts.",
      },
      {
        bold: "Up to the whole debt",
        text: "unlike protocols with fixed close factors, a Morpho liquidation may repay the full debt in one call if the position is unhealthy enough.",
      },
      {
        bold: "Bad debt is socialized",
        text: "if the seized collateral runs out before the debt is cleared, the shortfall is written off against this market's lenders immediately — no protocol-wide backstop.",
      },
      {
        bold: "Isolated blast radius",
        text: "only this market's collateral and lenders are involved; positions in other markets are untouched.",
      },
    ],
    links: [
      { label: "Liquidation on Morpho", url: MORPHO_DOC_URLS.LIQUIDATION },
      { label: "Morpho markets", url: MORPHO_DOC_URLS.MARKET },
    ],
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
    links: [{ label: "Morpho docs", url: MORPHO_DOC_URLS.OVERVIEW }],
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
      ? "Deposits and withdrawals move the position's collateral leg. Fluid routes every token through its central Liquidity layer, but the vault's LogOperate event carries the exact signed amount for this position."
      : kind === "borrow"
        ? "Borrows and repays move the position's debt leg. The emitted amount is the resolved actual token amount — a max-repay sentinel is resolved to the true figure before the event fires."
        : "One Fluid operation can move BOTH legs — deposit-and-borrow in a single transaction is the protocol's native shape, not a batched pair of actions. The event carries one signed amount per leg.";
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
      ? "When a position falls beyond the maximum liquidation limit, Fluid absorbs its remaining debt and collateral into vault-level reserves — the position is zeroed without its own on-chain event."
      : "Fluid liquidates price-band 'ticks', not individual positions — one liquidation sweeps every position in the affected band at once, and the on-chain event names no position.",
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

export function fluidTransferContent(): LearnMoreContent {
  return {
    title: "How Ownership Transfers Work",
    intro:
      "Fluid positions are ERC-721 NFTs — the position itself can change wallets. A transfer moves the whole position (collateral, debt, liquidation exposure) to the new owner; balances are untouched.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Mint = position created",
        text: "the factory mints the NFT in the same transaction as the position's first operate; the mint row marks where the position began.",
      },
      {
        bold: "Era ownership",
        text: "each timeline event shows the owner AT that event — a position sold mid-life shows its history under the owner who lived it.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidEventFallbackContent(): LearnMoreContent {
  return {
    title: "About This Event",
    intro:
      "An on-chain action on a Fluid vault position, decoded from the vault's own events and replayed into the position's running balances.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Chain-read, not modeled",
        text: "amounts come from the event log itself; running balances are the replayed sum of the position's own events plus attributed liquidation impacts.",
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
        text: "whoever holds the shares holds the deposit and its accrued interest — positions routinely arrive via DEX buys, Pendle, or exchange distributions rather than a direct deposit.",
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
// the one live-verified docs link — is passed in. Only the root URLs verify
// live from this machine (deep doc paths 404), so each protocol carries a
// single link.

export interface LiquityForkLearnMoreParams {
  /** Display name ("Ebisu" | "Asymmetry"). */
  protocolName: string;
  /** The fork's stablecoin ("ebUSD" | "USDaf"). */
  stablecoin: string;
  /** One live-verified link (site or docs root); omit rather than guess. */
  docsLink?: { label: string; url: string };
}

const forkLinks = (p: LiquityForkLearnMoreParams) => (p.docsLink ? [p.docsLink] : undefined);

export function liquityForkBorrowingContent(
  p: LiquityForkLearnMoreParams,
  eventType: "openTrove" | "adjustTrove" | "closeTrove" = "adjustTrove",
): LearnMoreContent {
  const title =
    eventType === "openTrove"
      ? "How Opening a Trove Works"
      : eventType === "closeTrove"
        ? "How Closing a Trove Works"
        : "How Trove Adjustments Work";
  return {
    title,
    intro: `A ${p.protocolName} Trove holds one branch's collateral and mints ${p.stablecoin} against it, at an interest rate the borrower sets themselves — the Liquity V2 architecture. Interest accrues continuously into the debt; the rate can be changed at any time.`,
    stepsHeading: "The mechanics:",
    steps: [
      `Each collateral branch is its own market with its own minimum collateral ratio — below it, anyone can liquidate the Trove.`,
      `The chosen interest rate is also the Trove's place in the redemption queue: redemptions sweep the LOWEST rates first, so a higher rate buys ${p.stablecoin} peg protection at a carrying cost.`,
      `Drawing ${p.stablecoin} pays an upfront fee (a week of average branch interest) added to the debt; closing repays the remaining debt, interest included, and returns all collateral.`,
    ],
    links: forkLinks(p),
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
    links: forkLinks(p),
  };
}

export function liquityForkRedemptionContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Redemptions Work",
    intro: `Any ${p.stablecoin} holder can redeem it against the system at $1 face value — the peg mechanism. Redemptions are routed across branches by their unbacked portions and, within a branch, sweep the LOWEST user-set interest rates first (not the lowest collateral ratio — the V1 difference).`,
    stepsHeading: "What happens to a redeemed Trove:",
    steps: [
      "It gives up collateral at the branch oracle price and sheds exactly the same value of debt — net value is preserved; a forced deleveraging, not a penalty.",
      "Its collateral ratio RISES as a result.",
      `A partial redemption that leaves the Trove below the minimum debt makes it a "zombie": outside the rate-ordered queue, redeemed first the next time redemptions route through the branch.`,
    ],
    links: forkLinks(p),
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
      "Each branch sets its own minimum ratio, so the same price move can liquidate one branch's Troves and not another's.",
    ],
    links: forkLinks(p),
  };
}

export function liquityForkBatchContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Interest-Rate Batches Work",
    intro: `A Trove can delegate its interest rate to a batch manager (the V2 delegation model): the manager sets one rate for every Trove in the batch, adjusting it as market conditions move — active peg management without the owner touching the Trove.`,
    stepsHeading: "What batching changes:",
    steps: [
      "The batch manager (within owner-approved bounds) controls the rate — and with it the batch's redemption-queue position.",
      `A batched Trove's debt is tracked as a share of the batch total, so the exact ${p.stablecoin} figure is derived from batch shares rather than emitted per-Trove.`,
      "Leaving the batch returns the rate to self-management.",
    ],
    links: forkLinks(p),
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
    links: forkLinks(p),
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
        text: "the lender accepted this collateral against this credit knowing default hands them the collateral; whether that trade was good is decided by the parties, not the protocol.",
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

const FRANKENCOIN_DOC_URL = "https://docs.frankencoin.com";

export function frankencoinMintingContent(): LearnMoreContent {
  return {
    title: "How Frankencoin Minting Positions Work",
    intro:
      "Frankencoin (ZCHF) is an oracle-free Swiss-franc stablecoin. Every borrower owns a Position contract of their own: they post collateral, DECLARE the liquidation price themselves, and mint ZCHF against it. No price feed exists anywhere in the system — the declared price is kept honest by challenge auctions, not an oracle.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Owner-declared price",
        text: "the liquidation price is a value the owner sets and can adjust. Raising it starts a 3-day cooldown on minting; anyone who thinks it too high can challenge it.",
      },
      {
        bold: "Interest up front",
        text: "Frankencoin charges interest at minting time, not as an ongoing rate — each mint deducts the fee for the remaining term, so the debt figure never grows on its own.",
      },
      {
        bold: "Reserve contribution",
        text: "a fixed share of every mint is held back in the system reserve and returned on repayment — it absorbs shortfalls first if a challenge ends badly.",
      },
      {
        bold: "Clones",
        text: "a new original position waits out a veto window (3 days minimum) in which FPS holders can deny it; a clone reuses an already-vetted original's terms and limit, and skips the wait.",
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

export function frankencoinChallengeContent(): LearnMoreContent {
  return {
    title: "How Frankencoin Challenges Work",
    intro:
      "Frankencoin has no oracle, so liquidation is a bet anyone can place: a challenger who thinks a position's declared price is too high posts COLLATERAL (not ZCHF) and starts a two-phase auction against it.",
    stepsHeading: "The two phases:",
    steps: [
      "Phase 1 — fixed price: the challenger's own posted collateral is offered at the position's declared liquidation price. If someone buys it, the price was evidently fair, the challenge is AVERTED, the position survives, and the challenger's bet lost.",
      "Phase 2 — declining auction: if nobody bought, the POSITION's collateral goes to a Dutch auction. Bidders pay ZCHF at a falling price; the proceeds repay the position's debt, the challenger earns the protocol's reward, and any shortfall is absorbed by the reserve, then by FPS equity.",
      "One challenge can settle in several slices — a multi-bid auction emits one settlement per bid, all under the same challenge number.",
    ],
    extraParagraphs: [
      "Challenge outcome and lifecycle are two different axes: a challenged position can survive — averted outright, or left standing after a partial phase-2 sale.",
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

export function frankencoinLifecycleContent(): LearnMoreContent {
  return {
    title: "A Frankencoin Position's Lifecycle",
    intro:
      "A position is a contract with clocks: an init window before it may mint, an owner-set expiration after which it may not, and cooldowns in between. Each edge is a chain fact the explorer renders as-is.",
    detailsHeading: "The lifecycle edges:",
    details: [
      {
        bold: "Veto window",
        text: "a new original position waits an owner-chosen period (3 days minimum) before its first mint; holders of enough FPS can DENY it in that window — denial disables minting for good.",
      },
      {
        bold: "Cooldown",
        text: "raising the declared liquidation price pauses minting for 3 days — the window in which anyone can challenge the new price before it can back fresh ZCHF.",
      },
      {
        bold: "Expiration",
        text: "past its expiration a position cannot mint, and on MintingHub V2 anyone can clear it through a forced sale of its collateral at a declining price.",
      },
      {
        bold: "Opening fee",
        text: "opening an original position costs a flat fee (OPENING_FEE on the hub — 1000 ZCHF), a spam gate on the veto pipeline.",
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

export function frankencoinEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Frankencoin Works",
    intro:
      "Frankencoin (ZCHF) is a decentralized, oracle-free Swiss-franc stablecoin. Borrowers mint ZCHF against collateral they price themselves; challenge auctions — not a price feed — keep the declared prices honest, and a system reserve absorbs shortfalls.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are contracts",
        text: "every borrower owns a Position clone; its address is its identity, and its owner can change by transfer.",
      },
      {
        bold: "Native units",
        text: "debt is ZCHF, collateral is the position's own token, and the one price on any card is the owner's declared liquidation price — this explorer never converts to dollars because the protocol itself never does.",
      },
      {
        bold: "No health factor",
        text: "risk is challenge status, the declared price, the expiry countdown and the cooldown — nothing else exists on chain, so nothing else is shown.",
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

// ── Market notes ─────────────────────────────────────────────────────────────
// The "?" behind a market note row (components/shared/market-note-row.tsx).
// Layer 2 only: how this KIND of note is read, never this note's figures — the
// figures live on the row and their receipts in the inspector. One modal per
// note kind, so a third kind adds a third function here.

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
        text: "the same idea, but the later end runs to the chain head instead of a second market observation: this account's own last Mint or Redeem in the market against its own exchange rate read right now, holding the account's CURRENT mToken holding fixed and moving only the rate. Shown for any entered market the account still holds, whatever the move — nothing having changed since is itself the fact it states.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

export function marketNotePriceGapContent(): LearnMoreContent {
  return {
    title: "About price-gap notes",
    intro:
      "A market note is a row in a position's timeline that states something which happened to the market while this position transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown. This kind states how the market's own oracle price moved between two of the position's own events — a Liquity V2 trove's branch, or a Polaris CDP's price feed.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Oracle price",
        text: "every event on a trove carries the collateral price Liquity's own PriceFeed stated at that event's block, and every priced Polaris touch carries the market's own price feed at that block. The two ends of a note are two such events; no price is read for the note itself, and none is drawn between them.",
      },
      {
        bold: "Runway",
        text: "how far the price could fall from the earlier event before the position's collateral ratio reached the minimum, at the debt and collateral its own log recorded there.",
      },
      {
        bold: "Which stretches are stated",
        text: "a stretch is shown when the price move used at least a quarter of that runway, in either direction, and always when it ends in a liquidation or (Liquity V2 only) a redemption. Quieter stretches stay silent.",
      },
      {
        bold: "The two ratios",
        text: "the earlier event's debt and collateral, valued at each end's price. The later figure is what that state came to be worth, not a second reading of the position — interest kept accruing across the stretch.",
      },
      {
        bold: "On a Polaris CDP",
        text: "the minimum named is always the market's own normal-mode MCR() — a defensive-mode minimum can be in force at a past block, but it is not indexed here, and Polaris has no redemption row of its own, so a stretch here ends only in a liquidation or an adjustment.",
      },
      {
        bold: "On an Aave V4 spoke position",
        text: "a position holds a basket, so a note states ONE asset's price and what that move alone did to the whole basket's health factor — every other amount and price held as the earlier row recorded them, each collateral weighted by the liquidation threshold the spoke reports now, against liquidation at 1.00. A stretch ending in a liquidation is drawn only for the asset that liquidation seized.",
      },
      {
        bold: "On Aave V3 and SparkLend",
        text: "a row carries the price of the one reserve it touched, so a note here is drawn only before a liquidation, for the asset it seized: that asset's price at the position's last row that touched it, and at the liquidation. Rows touching other reserves can sit between the two. No runway or health factor is stated, because the rest of the account is not priced at the earlier block. The note states the move alone: the debt side moves too, and a seized asset's price can rise into its liquidation.",
      },
      {
        bold: "A live note",
        text: "the same idea, but the later end is the chain head instead of a second event: this position's own newest priced event or touch against the market's oracle price read right now. Shown on any OPEN position, whatever the move — never gated on the runway threshold, because nothing having moved since is itself the fact it states.",
      },
    ],
    links: [
      { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
      { label: "How do liquidations work?", url: FAQ_URLS.LIQUIDATIONS },
      { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
    ],
  };
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
        text: "a note says what was set THEN. What the vault's terms are at the block this page read at is stated in the sections above it, which are calls answered at that block rather than logs.",
      },
    ],
  };
}

export function marketNoteRateStepContent(): LearnMoreContent {
  return {
    title: "About rate-step notes",
    intro:
      "A market note is a row in a position's timeline that states something which happened to the market while this CDP transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown. This kind states a step in the market's primary rate between two of the CDP's OWN touches — unlike the other kinds of note, both ends are this position's own events. On an Aave V3 or SparkLend position the same kind reads one RESERVE and one SIDE of it — the supply rate an account earns or the variable borrow rate it pays, which move independently — and the rate is the reserve's own ReserveDataUpdated read AROUND the position's own transactions: at or before its earlier action, and before its next touch but never from inside that touch's own transaction, so a move the position itself caused is not stated as the market's.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Primary rate",
        text: "the market's Peg Stability Rate, set algorithmically on the market's own PSM mints and redemptions — never chosen by a holder. It is already on every touch as the rate in force at that block.",
      },
      {
        bold: "Rate in force at a touch",
        text: "the market's last PrimaryRateSet at or before the touch's block. Nothing is read for the note itself: the rate is the same figure the touch's own row already states.",
      },
      {
        bold: "Which stretches are stated",
        text: "a stretch is shown when the rate moved by at least one percentage point between the CDP's two touches, in either direction. Consecutive moves in the same direction are stated as one note, from the first touch to the last — the receipt lists each step it took in, and a move too small to be stated on its own never breaks a run. A move the other way ends the run and begins the next note. There is no exception for a stretch ending in a liquidation — the primary rate does not cause one.",
      },
      {
        bold: "The figure in the header",
        text: "the rate at the LATER end — what the market charged by the end of the stretch, or charges now on a live note. The move itself is stated in the panel, where the two rates sit side by side and the derivation says it in words.",
      },
      {
        bold: "The interest figure",
        text: "the yearly interest the CDP's own debt at the earlier touch would cost at each end's rate, holding that debt fixed and moving only the rate. The secondary, utilisation-driven rate is added on top by the protocol and is not on this log.",
      },
      {
        bold: "A live note",
        text: "the same idea, but the later end is the chain head instead of a second touch: this CDP's own last touch against the cdpManager's own primary rate read right now. Shown on any OPEN CDP, whatever the move — there is no percentage-point threshold for a live note, because nothing having moved since is itself the fact it states.",
      },
      {
        bold: "The same note on a MakerDAO vault",
        text: "the quantity there is the collateral type's stability fee, and Maker states it nowhere a row can carry it — governance files a duty on the Jug and the spell's own block is not indexed. So the fee in force at a touch is read off the Vat's own fold series (every Jug.drip's delta encodes the duty it compounded at) and then confirmed by reading the Jug's duty at that drip's own block, which is the figure the note states.",
      },
    ],
    links: [POLARIS_DOC_LINKS.interestRates, POLARIS_APP_LINK],
  };
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
