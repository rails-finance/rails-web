// Position-panel "?" content for the Compound V2 position card — the original
// pooled-lending protocol, cross-collateralised through one Comptroller.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const COMPOUND_V2_DOC_URL = "https://docs.compound.finance/v2/";

const LINKS: LearnMoreContent["links"] = [{ label: "Compound V2 docs", url: COMPOUND_V2_DOC_URL }];

export function compoundV2PositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  hasDebt?: boolean;
}): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This account was closed after one or more liquidations cleared its debt. The panel above reconstructs its final state — the highest recorded supply and debt for each market it held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Account liquidity",
          text: "the Comptroller tracks one liquidity figure across the whole account; once it turns to shortfall, the account becomes liquidatable.",
        },
        {
          bold: "Partial by design",
          text: "each liquidation clears at most half the debt in one borrowed market (the close factor) — a liquidated account often survives; this one's history ended some other way.",
        },
        {
          bold: "cTokens & the exchange rate",
          text: "each market's cToken is a receipt: balance × the market's exchange rate = the underlying claim, which only grows as interest accrues.",
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
          text: "each market's cToken is a receipt: balance × the market's exchange rate = the underlying claim, which only grows as interest accrues.",
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
      text: "each market's cToken is a receipt: balance × the market's exchange rate = the underlying claim. The rate only rises as interest accrues, so a fixed cToken balance is worth ever more underlying.",
    },
    {
      bold: "Cross-collateralisation",
      text: "the Comptroller pools every entered market into one account — supplied value across markets backs borrowing across markets, weighted by each market's collateral factor. Eight of the twenty markets have collateral disabled entirely.",
    },
    opts.hasDebt
      ? {
          bold: "Account liquidity",
          text: "the Comptroller tracks one liquidity figure across the whole account; when it turns to shortfall, the account can be liquidated at up to the close factor (50%) per call.",
        }
      : {
          bold: "Supply only",
          text: "supplying alone does not enter a market or carry liquidation risk — that requires borrowing against the collateral factor.",
        },
    {
      bold: "A wound-down roster",
      text: "twenty markets listed across six years, no more coming — governance is winding the protocol down.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the account's live state in plain language — what's supplied across each Compound V2 market, what's borrowed against it, and how the Comptroller's account liquidity covers it.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
