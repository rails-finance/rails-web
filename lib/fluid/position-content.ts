// Position-panel "?" content for the Fluid position card — a factory-minted
// NFT living in one vault (one collateral/debt pair). Status here is two-axis:
// the lifecycle is open/closed, and liquidation is an orthogonal flag a card
// can carry even while open (a swept position usually keeps most of its
// collateral and debt).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const FLUID_DOC_URL = "https://docs.fluid.io";

const LINKS: LearnMoreContent["links"] = [{ label: "Fluid docs", url: FLUID_DOC_URL }];

export function fluidPositionContent(opts: {
  status: "open" | "closed";
  wasLiquidated?: boolean;
  hasDebt?: boolean;
  /** Where the closed card's peaks come from (FluidPositionSummary.peakBasis). */
  peakBasis?: "chain" | "replay";
}): LearnMoreContent {
  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro: opts.wasLiquidated
        ? "A Fluid position is an NFT holding collateral and debt in one vault; this one was liquidated and then closed out. The panel above shows the most collateral and debt it ever held."
        : "A Fluid position is an NFT holding collateral and debt in one vault; this one is closed, its debt repaid and its collateral withdrawn. The panel above shows the most collateral and debt it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Positions are NFTs",
          text: "every Fluid position is an ERC-721 minted by the vault factory — ownership can move wallets, and the timeline keys by the NFT id.",
        },
        {
          bold: "Liquidation sweeps a band, not a position",
          text: "Fluid liquidates price-band 'ticks' — one sweep can touch many positions at once, and it usually takes only enough to restore the band's health, so 'liquidated' rarely means emptied outright.",
        },
        {
          bold: "Highest recorded",
          text:
            opts.peakBasis === "chain"
              ? "each peak is the highest balance the vault settled for the position just before or after any of its events, interest included. The collateral peak and the debt peak can come from different dates."
              : "each peak is the highest running balance summed from the position's events. That sum leaves out the interest accrued between events, so the true peak can be higher. The collateral peak and the debt peak can come from different dates.",
        },
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "Positions are NFTs",
      text: "every Fluid position is an ERC-721 minted by the vault factory — ownership can move wallets without touching the collateral or debt.",
    },
    {
      bold: "One vault, one pair",
      text: "each position lives in exactly one vault (one collateral/debt pair); smart-vault legs are shares in a Fluid DEX pool rather than a single token.",
    },
    opts.hasDebt
      ? {
          bold: "Liquidation sweeps a band",
          text: "Fluid liquidates price-band 'ticks', not individual positions — a sweep clears enough of every position in the affected band to restore its health, so a swept position usually keeps most of what it held.",
        }
      : {
          bold: "Collateral only",
          text: "with no debt, this position carries no liquidation exposure — it simply holds its deposited collateral.",
        },
    {
      bold: "Settled vs replayed",
      text: "the figures above prefer the vault's own settled state (liquidations and accrued interest applied) over the replayed sum of events, which excludes interest accrued since the last touch.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "A Fluid position is an NFT that holds collateral in one vault and can borrow that vault's debt token against it. Interest accrues on both sides, and the position is liquidated if its debt grows too large against its collateral.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
