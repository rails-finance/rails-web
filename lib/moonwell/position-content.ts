// Position-panel "?" content for the Moonwell position card — a Compound v2
// fork, cross-collateralised through one Comptroller. Serves both Moonwell on
// Ethereum (four markets) and Moonwell on Base (twenty-one markets).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { liquidatedIntro, type LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";

const MOONWELL_DOC_URL = "https://docs.moonwell.fi";

const LINKS: LearnMoreContent["links"] = [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }];

export type MoonwellPositionDeployment = "ethereum" | "base";

function rosterDetail(deployment: MoonwellPositionDeployment): { bold: string; text: string } {
  return deployment === "base"
    ? {
        bold: "Twenty-one markets",
        text: "the Comptroller on Base lists twenty-one markets, governance-gated to grow — a separate deployment from Moonwell on Ethereum.",
      }
    : {
        bold: "Four markets",
        text: "WETH, USDC, USDT and cbBTC — a deliberately small launch set, governance-gated to grow.",
      };
}

export function moonwellPositionContent(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  deployment?: MoonwellPositionDeployment;
  hasDebt?: boolean;
  /** Each liquidation as the rows tell it (the detail page). */
  liquidations?: LiquidationStory[];
  liquidationCount?: number;
}): LearnMoreContent {
  const deployment = opts.deployment ?? "ethereum";

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
          text: "the Comptroller (Moonwell's risk contract) adds up each entered market's collateral × its collateral factor (the borrow limit) and subtracts the debt. When the debt is larger, the gap is a shortfall, and anyone can liquidate the account. A supply in a market the account never entered does not count, but can still be seized.",
        },
        {
          bold: "Partial and repeatable",
          text: "each liquidation repays at most half of one debt (the close factor, 50%) and seizes mTokens in a collateral market worth that plus a 10% incentive; the market keeps 3% of the seized mTokens as reserves and the liquidator gets the rest.",
        },
        {
          bold: "mTokens & the exchange rate",
          text: "each market's mToken is a receipt: balance × the market's exchange rate = the underlying claim, which only grows as interest accrues.",
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
          bold: "mTokens & the exchange rate",
          text: "each market's mToken is a receipt: balance × the market's exchange rate = the underlying claim, which only grows as interest accrues.",
        },
        rosterDetail(deployment),
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "mTokens & the exchange rate",
      text: "each market's mToken is a receipt: balance × the market's exchange rate = the underlying claim. The rate only rises as interest accrues, so a fixed mToken balance is worth ever more underlying.",
    },
    {
      bold: "Cross-collateralisation",
      text: "the Comptroller pools every entered market into one account — supplied value across markets backs borrowing across markets, weighted by each market's collateral factor.",
    },
    opts.hasDebt
      ? {
          bold: "Account liquidity",
          text: "the Comptroller (Moonwell's risk contract) adds up each entered market's collateral × its collateral factor (the borrow limit) and subtracts the debt. When the debt is larger, the gap is a shortfall, and a liquidator can repay up to the close factor (50% of one debt) per call.",
        }
      : {
          bold: "Supply only",
          text: "a supply is not collateral until the wallet enters its market; only entered markets count toward the borrow limit. With no debt there is nothing to liquidate.",
        },
    rosterDetail(deployment),
  ];

  return {
    title: "About This Position",
    intro: `This panel explains the account's live state in plain language — what's supplied across each Moonwell market on ${deployment === "base" ? "Base" : "Ethereum"}, what's borrowed against it, and how the Comptroller's account liquidity covers it.`,
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
