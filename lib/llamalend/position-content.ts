// Position-panel "?" content for the LlamaLend position card — Curve's LLAMMA
// lending: each Controller is an isolated market, and the collateral sits in
// a price-band AMM rather than a vault.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

const LINKS: LearnMoreContent["links"] = [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }];

export function llamalendPositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  inSoftLiq?: boolean;
  /** The position's band count, where the live read states it. */
  bands?: number | null;
  liquidationCount?: number;
}): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This position was hard-liquidated after its health fell below 0. The panel above shows its collateral and debt after its last event.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Soft, then hard",
          text: "while the oracle price sits inside the position's bands, the AMM converts collateral to the borrowed token, with no event. Health falls as the price moves down through the bands, as interest adds to the debt, and with each loss on the AMM's sales; below 0 anyone may liquidate the position, in full or in part.",
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
      text: `the collateral is not parked in a vault — it is liquidity in the market's LLAMMA AMM, placed across ${
        opts.bands != null ? `${opts.bands} adjacent price bands` : "a set of adjacent price bands chosen at opening"
      }. That placement is what makes soft-liquidation possible.`,
    },
    {
      bold: "The band is the risk line",
      text: "soft-liquidation begins at the band's top price and completes at its bottom — a range, not a single liquidation price.",
    },
    opts.inSoftLiq
      ? {
          bold: "Soft-liquidation is live",
          text: "the oracle price sits inside this position's bands right now: the AMM sells its collateral for the borrowed token as the price falls and buys it back as the price rises, with no event marking it. The swap reverses; the losses do not.",
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
