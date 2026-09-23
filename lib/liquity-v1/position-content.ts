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

export function liquityV1PositionContent(opts: { status: "open" | "closed" | "liquidated" }): LearnMoreContent {
  const { status } = opts;

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This Trove was liquidated when its collateral ratio fell below the 110% minimum. The panel above reconstructs its final state — the highest ETH collateral and LUSD debt it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "110% minimum ratio",
          text: "below it (or below 150% system-wide, in recovery mode) a Trove can be liquidated by anyone. Liquity V1 liquidates the whole Trove, not a partial slice.",
        },
        {
          bold: "Stability Pool first",
          text: "LUSD deposits in the Stability Pool absorb the debt and receive the collateral at a discount; any shortfall redistributes to other open Troves.",
        },
      ],
      links: [
        { label: "Stability Pool & liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
        { label: "Recovery mode", url: LIQUITY_V1_FAQ.RECOVERY_MODE },
      ],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This Trove has been closed and its LUSD debt fully repaid. The panel above shows its lifetime peaks — the most ETH collateral and LUSD debt it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing a Trove",
          text: "repaying the outstanding LUSD returns the ETH collateral and the 200 LUSD gas-compensation reserve to the owner.",
        },
        {
          bold: "Interest-free debt",
          text: "V1 charges no ongoing interest — the debt only ever moved through draws, repayments, redemptions and liquidations.",
        },
      ],
      links: [
        { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
        { label: "Liquity V1 overview", url: LIQUITY_V1_FAQ.GENERAL },
      ],
    };
  }

  // Open Trove — the live, interactive case.
  return {
    title: "About This Position",
    intro:
      "This panel explains the Trove's live state in plain language — what backs the LUSD debt, and how exposed it is to redemption and liquidation.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral ratio",
        text: "ETH value relative to LUSD debt. Must stay above 110% (150% system-wide during recovery mode) or the Trove can be liquidated.",
      },
      {
        bold: "Redemption queue",
        text: "any LUSD holder can redeem at $1 face value against the trove with the LOWEST collateral ratio first — the opposite of Liquity V2's rate-ordered queue. A redeemed Trove keeps its net value: it loses ETH and LUSD debt in equal dollar amounts, and its ratio rises.",
      },
      {
        bold: "Interest-free debt",
        text: "the emitted debt figure is exact — no ongoing interest accrues, so it changes only when the owner draws, repays, or a redemption/liquidation touches the Trove.",
      },
      {
        bold: "Gas-compensation reserve",
        text: "200 LUSD set aside at opening to pay liquidators; refunded to the owner when the Trove closes normally.",
      },
    ],
    links: [
      { label: "How is the redemption order decided?", url: LIQUITY_V1_FAQ.REDEMPTIONS },
      { label: "Stability Pool & liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
      { label: "Liquity V1 FAQ", url: LIQUITY_V1_FAQ.GENERAL },
    ],
  };
}
