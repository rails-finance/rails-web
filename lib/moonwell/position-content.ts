// Position-panel "?" content for the Moonwell position card — a Compound v2
// fork, cross-collateralised through one Comptroller. Serves both Moonwell on
// Ethereum (four markets) and Moonwell on Base (twenty-one markets).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

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
}): LearnMoreContent {
  const deployment = opts.deployment ?? "ethereum";

  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This account was liquidated when the Comptroller's account liquidity turned to shortfall. The panel above reconstructs its final state — the highest recorded supply and debt for each market it held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Account liquidity",
          text: "the Comptroller tracks one liquidity figure across the whole account; once it turns to shortfall, the account becomes liquidatable.",
        },
        {
          bold: "Partial and repeatable",
          text: "each liquidation clears at most half the debt (the close factor, 50%) and seizes mTokens in a collateral market worth that plus a 10% incentive.",
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
          text: "the Comptroller tracks one liquidity figure across the whole account; when it turns to shortfall, the account can be liquidated.",
        }
      : {
          bold: "Supply only",
          text: "supplying alone does not enter a market or carry liquidation risk — that requires borrowing against the collateral factor.",
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
