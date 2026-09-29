// Position-panel "?" content for the Liquity V1 Trove card — the state
// explainer for the panel that reads the Trove's live figures (or, on a
// closed/liquidated Trove, its lifetime peaks). Distinct from the event-level
// modals in lib/shared/learn-more-content.ts (liquityV1BorrowingContent etc.),
// which explain individual actions rather than the card's current state.
//
// V1 is the frozen, interest-free original: one Trove per address, a single
// ETH collateral and LUSD debt, a fixed 110% minimum ratio, and redemptions
// that sweep the LOWEST collateral ratio first — the opposite of V2's
// rate-ordered queue. URLs match the ones already verified in
// lib/shared/learn-more-content.ts's LIQUITY_V1_FAQ (docs.liquity.org/liquity-v1).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const LIQUITY_V1_FAQ = {
  BORROWING: "https://docs.liquity.org/liquity-v1/faq/borrowing",
  REDEMPTIONS: "https://docs.liquity.org/liquity-v1/faq/lusd-redemptions",
  LIQUIDATIONS: "https://docs.liquity.org/liquity-v1/faq/stability-pool-and-liquidations",
  RECOVERY_MODE: "https://docs.liquity.org/liquity-v1/faq/recovery-mode",
  GENERAL: "https://docs.liquity.org/liquity-v1/faq/general",
} as const;

const RESERVE_DETAIL = {
  bold: "Liquidation reserve",
  text: "200 LUSD of the debt is minted to a gas pool when the Trove opens. Closing repays the debt less 200 LUSD and the reserve is burned; a full redemption burns it too; a liquidation pays it to the liquidator.",
  sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
};

const LIQUIDATION_DETAIL = {
  bold: "Liquidation and Recovery Mode",
  text: "below 110% anyone can liquidate the whole Trove: the Stability Pool's LUSD cancels the debt and its depositors receive the ETH; debt the pool cannot cover is shared out to the other Troves. When the total ratio of all Troves falls below 150%, the system enters Recovery Mode, where a Trove below that total ratio can be liquidated even above 110%. The Explanation's “?” beside the system ratio opens the full account.",
  sources: [
    { label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
    { label: "Recovery Mode FAQ", url: LIQUITY_V1_FAQ.RECOVERY_MODE },
  ],
};

export function liquityV1PositionContent(opts: { status: "open" | "closed" | "liquidated" }): LearnMoreContent {
  const { status } = opts;

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro: "This Trove was liquidated. The card shows the most ETH and LUSD debt it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Liquidation",
          text: "below 110% (or, in Recovery Mode, below the system's total ratio) anyone can liquidate a Trove. The whole Trove closes and the owner keeps the LUSD borrowed.",
          sources: [{ label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS }],
        },
        {
          bold: "Stability Pool first",
          text: "LUSD deposited in the Stability Pool cancels the debt, and its depositors receive the ETH; any shortfall is shared out to the other open Troves.",
          sources: [{ label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS }],
        },
        {
          bold: "Recovery Mode",
          text: "a liquidation in Recovery Mode of a Trove above 110% takes collateral worth 110% of its debt and leaves the rest in the CollSurplusPool for the owner.",
          sources: [{ label: "Recovery Mode FAQ", url: LIQUITY_V1_FAQ.RECOVERY_MODE }],
        },
      ],
      links: [
        { label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
        { label: "Recovery Mode FAQ", url: LIQUITY_V1_FAQ.RECOVERY_MODE },
      ],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This Trove is closed: its owner repaid it, or a redemption cancelled the last of its debt. The card shows the most ETH and LUSD debt it held, or, when a redemption left ETH the owner has not claimed, that ETH.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing",
          text: "the owner repays the debt less the 200 LUSD reserve, the reserve is burned, and all the ETH returns to the owner.",
          sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
        },
        {
          bold: "Full redemption",
          text: "when redemptions cancel the whole debt, the Trove closes and the ETH left over moves to the CollSurplusPool, where the owner claims it.",
          sources: [{ label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS }],
        },
        RESERVE_DETAIL,
      ],
      links: [
        { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
        { label: "Liquity V1 FAQ", url: LIQUITY_V1_FAQ.GENERAL },
      ],
    };
  }

  // Open Trove.
  return {
    title: "About This Position",
    intro: "The card states what backs the LUSD debt now, and how close the Trove is to redemption and to liquidation.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral ratio",
        text: "the ETH's value at the protocol's price, divided by the LUSD debt. It must stay at 110% or more.",
        sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
      },
      LIQUIDATION_DETAIL,
      {
        bold: "Redemption queue",
        text: "any LUSD holder can swap LUSD for ETH at $1, and the LUSD cancels debt in the lowest-ratio Troves first. A redeemed Trove loses ETH and debt of equal dollar value, so its ratio rises. The queue bar shows how much of all the debt would be redeemed before this Trove.",
        sources: [{ label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS }],
      },
      {
        bold: "No interest",
        text: "the debt changes only when the owner borrows or repays, or a redemption or liquidation reaches the Trove.",
        sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
      },
      RESERVE_DETAIL,
    ],
    links: [
      { label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS },
      { label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
      { label: "Recovery Mode FAQ", url: LIQUITY_V1_FAQ.RECOVERY_MODE },
    ],
  };
}
