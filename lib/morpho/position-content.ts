// Position-panel "?" content for the Morpho Blue position card — serves both
// Morpho on Ethereum and Morpho Blue on Base through the same card component
// (the `session` prop names which listing the wallet pill belongs to).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MORPHO_DOC_URLS = {
  OVERVIEW: "https://docs.morpho.org/",
  MARKET: "https://docs.morpho.org/learn/concepts/market/",
  LIQUIDATION: "https://docs.morpho.org/learn/concepts/liquidation/",
} as const;

const LINKS: LearnMoreContent["links"] = [
  { label: "Morpho markets", url: MORPHO_DOC_URLS.MARKET },
  { label: "Liquidation on Morpho", url: MORPHO_DOC_URLS.LIQUIDATION },
];

export type MorphoPositionDeployment = "morpho" | "morpho-base";

export function morphoPositionContent(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  deployment?: MorphoPositionDeployment;
  hasDebt?: boolean;
}): LearnMoreContent {
  const onBase = opts.deployment === "morpho-base";
  const deploymentDetail: { bold: string; text: string } = {
    bold: "One immutable contract, many markets",
    text: onBase
      ? "Morpho Blue on Base is a separate deployment of the same immutable contract as Morpho on Ethereum — each market is isolated, and markets never share collateral or lenders across the two chains."
      : "Morpho Blue is one immutable contract holding every market; each market is isolated, sharing no collateral or lenders with any other.",
  };

  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This position was liquidated once its debt exceeded its market's LLTV × the collateral's oracle value. The panel above reconstructs its final state — the highest recorded collateral and borrowed principal it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "One line, not two",
          text: "the LLTV is both the borrow limit and the liquidation threshold for the market — the same on-chain health check gates both.",
        },
        {
          bold: "Isolated blast radius",
          text: "only this market's collateral and lenders were involved; positions in other markets were untouched.",
        },
        deploymentDetail,
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This position has repaid its debt and withdrawn its collateral. The panel above shows its lifetime peaks — the highest collateral and borrowed principal it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text: "the peaks are the maximum of the running balances, replayed from the position's own events — principal only, not the interest-bearing current debt.",
        },
        {
          bold: "One line, not two",
          text: "the LLTV is both the borrow limit and the liquidation threshold for the market — the same on-chain health check gates both.",
        },
        deploymentDetail,
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "One line, not two",
      text: "the LLTV is both the borrow limit and the liquidation threshold — a position can borrow right up to it, and becomes liquidatable past it.",
    },
    {
      bold: "The market's own oracle",
      text: "prices quote the collateral asset in loan-asset terms; the liquidation check reads exactly this oracle, chosen when the market was created.",
    },
    opts.hasDebt
      ? {
          bold: "Debt as shares",
          text: "a loan is recorded as borrow shares against the market's totals, so interest accrues to every borrower at once as the totals grow — a repayment covers principal plus the interest accrued on it.",
        }
      : {
          bold: "Collateral only",
          text: "with no debt, the position carries no LLTV check or liquidation risk — the collateral simply sits, earning nothing.",
        },
    deploymentDetail,
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the position's live state in plain language — the collateral it holds, what's borrowed against it in this isolated market, and how the market's own LLTV and oracle cover the debt.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
