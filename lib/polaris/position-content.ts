// Position-panel "?" content for the Polaris CDP card — the state explainer
// for the panel that reads the CDP's live figures (or, on a closed or
// liquidated CDP, its lifetime peaks). Distinct from the event-level modals in
// lib/shared/learn-more-content.ts, which explain individual actions.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { POLARIS_APP_LINK, POLARIS_DOC_LINKS } from "@/lib/polaris/docs-links";

export function polarisPositionContent(opts: { status: "open" | "closed" | "liquidated" }): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This CDP",
      intro:
        "This CDP was liquidated: its collateral ratio fell below the market's minimum and a liquidator closed it. The panel above shows what it held at its height — its latest figures are zero, and the NFT is burned.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Pool absorption",
          text: "the market's stability pool repaid the debt and received the collateral, where its deposits allowed; the rest was redistributed across other CDPs.",
        },
        {
          bold: "Gas compensation",
          text: "the liquidator was paid the fixed pETH the CDP escrowed at open plus a share of its collateral.",
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
  if (opts.status === "closed") {
    return {
      title: "About This CDP",
      intro:
        "This CDP has been closed and its debt fully repaid. The panel above shows its lifetime peaks — the most pETH and the most debt it ever held. The NFT is burned; the id will not be reused.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Interest at each touch",
          text: "interest accrued at the market's rate was written into the debt on every touch, including the close.",
        },
        {
          bold: "Settled to zero",
          text: "where the CDP's pending gains exceeded its remaining debt, the protocol minted the difference so the close landed exactly on zero.",
        },
      ],
      links: [POLARIS_DOC_LINKS.interestRates, POLARIS_DOC_LINKS.conversions, POLARIS_APP_LINK],
    };
  }
  return {
    title: "About This CDP",
    intro:
      "This panel explains the CDP's live state in plain language — what backs the debt, how far it sits from the market's minimum ratio, and what is pending against it since its last touch.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral ratio",
        text: "collateral valued at the protocol's own price for pETH, divided by the debt; a CDP below the market's minimum can be liquidated.",
      },
      {
        bold: "Minimum ratio",
        text: "115% in normal mode, 150% when the market is in defensive mode.",
      },
      {
        bold: "Pending legs",
        text: "interest accrued since the last touch, stability gains and reward pETH not yet credited, and the CDP's share of PSM activity — all written in at the next touch.",
      },
      {
        bold: "Algorithmic rate",
        text: "the market sets its primary rate and adds a utilisation-driven secondary rate; the holder does not choose one.",
      },
      {
        // The closed and liquidated intros above already say the NFT is
        // burned; on an open CDP nothing said the position WAS one, which is
        // the fact that explains the holder line, the transfer count and the
        // "View the CDP NFT" link beside the id.
        bold: "The CDP is an NFT",
        text: "an ERC-721 token on the market's own contract. Whoever holds the token holds the position and can transfer it; closing or liquidation burns it, and the number is never reused.",
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
