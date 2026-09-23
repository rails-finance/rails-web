// Position-panel "?" content for the LlamaLend position card — Curve's LLAMMA
// lending: each Controller is an isolated market, and the collateral sits in
// a price-band AMM rather than a vault.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

const LINKS: LearnMoreContent["links"] = [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }];

export function llamalendPositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  inSoftLiq?: boolean;
}): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This position was hard-liquidated once soft-liquidation losses pushed its health below zero. The panel above shows its final recorded state — LlamaLend's lane carries no lifetime peaks, only the last emitted figures.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Soft, then hard",
          text: "before any hard liquidation comes soft-liquidation: while the oracle price sits inside the position's band, the AMM converts collateral to the borrowed token continuously, reversibly, with no event. Hard liquidation is the one-shot terminal step.",
        },
        {
          bold: "Isolated markets",
          text: "each Controller is one market (one collateral, one borrowed token) — positions in different markets never share margin and liquidate independently.",
        },
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This position has been closed — its debt repaid and its collateral withdrawn. The panel above shows the final recorded collateral and debt, the last amounts LlamaLend's own events emitted; this lane keeps no lifetime peaks.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Final state, not a peak",
          text: "unlike the other explorers, LlamaLend positions are read as the last emitted absolute — not the highest point the position ever reached.",
        },
        {
          bold: "Collateral lives in an AMM",
          text: "the collateral was liquidity in the market's LLAMMA AMM, placed across price bands rather than parked in a vault.",
        },
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "Collateral lives in an AMM",
      text: "the collateral is not parked in a vault — it is liquidity in the market's LLAMMA AMM, placed across N adjacent price bands. That placement is what makes soft-liquidation possible.",
    },
    {
      bold: "The band is the risk line",
      text: "soft-liquidation begins at the band's top price and completes at its bottom — a range, not a single liquidation price.",
    },
    opts.inSoftLiq
      ? {
          bold: "Soft-liquidation is live",
          text: "the oracle price sits inside this position's band right now — the AMM is continuously converting its collateral to the borrowed token, reversibly, with no event marking it.",
        }
      : {
          bold: "Isolated markets",
          text: "each Controller is one market (one collateral, one borrowed token) — positions in different markets never share margin and liquidate independently.",
        },
    {
      bold: "Debt accrues per second",
      text: "the market's monetary policy sets a per-second rate; the debt figure shown is the accrued total at the block this card names.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the position's live state in plain language — the collateral held in the market's AMM, the debt accrued against it, and where the price sits relative to the position's band.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
