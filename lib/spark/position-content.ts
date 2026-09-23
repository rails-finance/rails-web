// Position-panel "?" content for the SparkLend position card — an Aave V3
// fork with the same single-Pool, cross-collateralised account model, so the
// mechanics mirror Aave V3's — reworded for Spark's own sDAI-centric
// collateral set and its Sky-governed DAI borrow rate.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const SPARK_DOC_URLS = {
  SPARKLEND: "https://docs.spark.fi/products/sparklend",
  LIQUIDATIONS: "https://docs.spark.fi/products/sparklend/guides/liquidations",
  FAQ: "https://docs.spark.fi/faq",
} as const;

const LINKS: LearnMoreContent["links"] = [
  { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
  { label: "Liquidations", url: SPARK_DOC_URLS.LIQUIDATIONS },
  { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
];

export function sparkPositionContent(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  hasDebt?: boolean;
}): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This account was liquidated when its health factor fell below 1.0. The panel above reconstructs its final state — the highest recorded supply and debt for each reserve it held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Health factor",
          text: "the account's single safety number across every reserve; once it drops below 1.0, a liquidator can step in.",
        },
        {
          bold: "Cross-collateralisation",
          text: "SparkLend pools every supplied reserve into one account — all of it backed all of the borrowing, under one shared health factor.",
        },
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This account has repaid all its debt and withdrawn its collateral. The panel above shows its lifetime peaks — the highest supply and debt each reserve ever reached.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text: "each reserve's peak is the maximum of its running balance, replayed from the account's own events — not a snapshot at one moment.",
        },
        {
          bold: "Cross-collateralisation",
          text: "SparkLend pools every supplied reserve into one account — all of it backs all of the borrowing, under one shared health factor.",
        },
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "Cross-collateralisation",
      text: "SparkLend pools every supplied reserve into one account per wallet — all of it backs all of the account's borrowing, under one shared health factor.",
    },
    {
      bold: "Health factor",
      text: "measures how safely the debt is covered against the collateral's liquidation thresholds; below 1.0 the account can be liquidated.",
    },
    opts.hasDebt
      ? {
          bold: "Liquidation price",
          text: "for a single-reserve collateral, the oracle price at which the health factor would hit 1.0 — the figure the panel above restates beneath the health factor; with several collateral reserves it shows the combined-value drop instead.",
        }
      : {
          bold: "Supply only",
          text: "with no debt, the account carries no health factor or liquidation risk — supplied reserves simply earn interest.",
        },
    {
      bold: "sDAI, not DAI",
      text: "raw DAI's liquidation threshold is set to an on-chain epsilon (0.01%), so DAI supply earns interest but effectively doesn't back borrowing — sDAI does.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the account's live state in plain language — what's supplied across each SparkLend reserve, what's borrowed against it, and how safely the debt is covered, all read from SparkLend's own Pool at the block this card names.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
