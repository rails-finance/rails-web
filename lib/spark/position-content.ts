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

const EMODE_URL = "https://docs.spark.fi/products/sparklend/guides/e-mode";

export function sparkPositionContent(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  hasDebt?: boolean;
}): LearnMoreContent {
  if (opts.status === "liquidated" || opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        opts.status === "liquidated"
          ? "This account was liquidated at least once, when its health factor fell below 1, and holds nothing now. Its card shows the most each reserve ever held or owed."
          : "This account has repaid its debt and withdrawn its collateral. Its card shows the most each reserve ever held or owed.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text: "each reserve's peak is the largest balance it reached at any event, interest to then included; the peaks of different reserves need not have stood at the same time.",
        },
        {
          bold: "One account per wallet",
          text: "SparkLend pools every supplied reserve into one account per wallet, under one health factor. A new supply by the same wallet reopens it.",
        },
        ...(opts.status === "liquidated"
          ? [
              {
                bold: "Liquidated",
                text: "a liquidation repays part of the debt (up to half while the health factor is between 0.95 and 1) and takes collateral worth that plus a bonus, so an account often survives it and is closed by its owner later.",
              },
            ]
          : []),
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "One account per wallet",
      text: "SparkLend pools every supplied reserve into one account per wallet: all of the collateral backs all of the borrowing, under one health factor.",
    },
    opts.hasDebt
      ? {
          bold: "Two limits",
          text: "the account may borrow up to its maximum loan-to-value; its liquidation threshold sits a little higher, and the health factor reaches 1 when the loan-to-value reaches it. Both are each collateral's figure averaged by value.",
        }
      : {
          bold: "Supply only",
          text: "with no debt the account has no health factor and cannot be liquidated; supplied reserves earn interest.",
        },
    {
      bold: "Health factor",
      text: "Σ (collateral value × its liquidation threshold) ÷ debt value, at SparkLend's oracle prices. Below 1 the account can be liquidated.",
    },
    {
      bold: "E-mode",
      text: "an account can choose one category of price-correlated assets (ETH-correlated, or stablecoins); collateral inside it then counts at the category's higher loan-to-value and threshold, and only assets of that category can be borrowed.",
    },
    {
      bold: "sDAI and DAI",
      text: "raw DAI's liquidation threshold is 0.01%, so DAI supply earns interest but backs almost nothing; sDAI is the collateral form.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "A SparkLend position is one wallet's account on the SparkLend Pool: what it has supplied, what it has borrowed against that, and how safely the debt is covered, read from the Pool.",
    detailsHeading: "Key concepts:",
    details,
    links: [...(LINKS ?? []), { label: "E-mode", url: EMODE_URL }],
  };
}
