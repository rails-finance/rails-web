// Position-panel "?" content for the Compound V2 position card — the original
// pooled-lending protocol, cross-collateralised through one Comptroller.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { liquidatedIntro, type LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";

const COMPOUND_V2_DOC_URL = "https://docs.compound.finance/v2/";

/** The exchange rate, and why it no longer rises. */
const RATE_TEXT =
  "each market's cToken is a receipt: balance × the market's exchange rate = the underlying claim. The rate rose as borrowers paid interest, and has stopped rising since governance set every reserve factor to 100% (the last sixteen markets on 8 Dec 2025): all interest now goes to reserves.";

const LINKS: LearnMoreContent["links"] = [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }];

export function compoundV2PositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  hasDebt?: boolean;
  /** Each liquidation as the rows tell it (the detail page). */
  liquidations?: LiquidationStory[];
  liquidationCount?: number;
}): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro: `${
        opts.liquidations && opts.liquidations.length > 0
          ? liquidatedIntro(opts.liquidations, opts.liquidationCount ?? opts.liquidations.length)
          : "This account was liquidated at least once and has since closed: nothing remains supplied or borrowed."
      } The panel above shows the highest supply and debt each market reached.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Account liquidity",
          text: "the Comptroller (Compound's risk contract) adds up each entered market's collateral × its collateral factor (the borrow limit) and subtracts the debt. When the debt is larger, the gap is a shortfall, and anyone can liquidate the account. A borrow in a deprecated market can be liquidated without one.",
        },
        {
          bold: "Partial by design",
          text: "each liquidation repays at most half the debt in one borrowed market (the close factor, 50%), or the whole borrow in a deprecated market, so a liquidated account often survives it.",
        },
        {
          bold: "cTokens & the exchange rate",
          text: RATE_TEXT,
        },
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This account has repaid all its debt and withdrawn its supply. The panel above shows its lifetime peaks — the highest supply and debt each market ever reached.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text: "each market's peak is the maximum of its running balance, replayed from the account's own events — not a snapshot at one moment.",
        },
        {
          bold: "cTokens & the exchange rate",
          text: RATE_TEXT,
        },
        {
          bold: "Cross-collateralisation",
          text: "the Comptroller pools every entered market into one account — supplied value across markets backs borrowing across markets, weighted by each market's collateral factor.",
        },
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "cTokens & the exchange rate",
      text: RATE_TEXT,
    },
    {
      bold: "Cross-collateralisation",
      text: "the Comptroller pools every entered market into one account — supplied value across markets backs borrowing across markets, weighted by each market's collateral factor. Eight of the twenty markets have collateral disabled entirely.",
    },
    opts.hasDebt
      ? {
          bold: "Account liquidity",
          text: "the Comptroller (Compound's risk contract) adds up each entered market's collateral × its collateral factor (the borrow limit) and subtracts the debt. When the debt is larger, the gap is a shortfall, and a liquidator can repay up to the close factor (50% of one debt, or the whole borrow in a deprecated market) per call.",
        }
      : {
          bold: "Supply only",
          text: "a supply is not collateral until the wallet enters its market; only entered markets count toward the borrow limit. With no debt there is nothing to liquidate.",
        },
    {
      bold: "Reserve factor 100%",
      text: "governance has set every market to keep all the interest borrowers pay as reserves, so supplying earns nothing now.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the account's live state in plain language: what's supplied across each Compound V2 market, what's borrowed against it, and how much borrowing room the Comptroller (Compound's risk contract) leaves it.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
