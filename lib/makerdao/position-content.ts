// Position-panel "?" content for the MakerDAO vault card — the state
// explainer for the panel that reads the vault's live figures (or, on a
// closed/liquidated vault, its lifetime peaks). Distinct from the event-level
// modals in lib/shared/learn-more-content.ts (makerdaoVaultContent,
// makerdaoLiquidationContent), which explain individual actions.
//
// URLs match the ones already verified in lib/shared/learn-more-content.ts's
// MAKER_DOCS constant (docs.makerdao.com, live as of 2026-07-14).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MAKER_DOCS = {
  VAT: "https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation",
  RATES: "https://docs.makerdao.com/smart-contract-modules/rates-module",
  LIQUIDATIONS: "https://docs.makerdao.com/smart-contract-modules/dog-and-clipper-detailed-documentation",
  OVERVIEW: "https://docs.makerdao.com/",
} as const;

export function makerdaoPositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  ilk: string;
  /** DAI for CdpManager vaults, USDS for LockStake urns (ilkDebtSymbol). */
  debtSymbol: string;
  lse?: boolean;
}): LearnMoreContent {
  const { status, ilk, debtSymbol, lse } = opts;
  const noun = lse ? "urn" : "vault";

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro: `This ${noun} was liquidated when its collateral value fell below the minimum ratio of ${ilk}, its collateral type (Maker calls it an ilk). The panel above reconstructs its final state — the highest recorded collateral and ${debtSymbol} debt it ever held.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Liquidation ratio",
          text: `each collateral type sets a minimum ratio (mat), checked against the type's oracle price (the OSM, Oracle Security Module), delayed by one hour by design, so owners have a window to react before a price move becomes liquidatable.`,
        },
        {
          bold: "Seizure, not closure",
          text: "a liquidation (grab) removes the vault's collateral and debt in one step; the collateral is auctioned to cover the debt plus a penalty, and any surplus returns to the owner.",
        },
      ],
      links: [
        { label: "Liquidations 2.0 (Dog & Clipper)", url: MAKER_DOCS.LIQUIDATIONS },
        { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
      ],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro: `This ${noun} has been closed and its ${debtSymbol} debt fully repaid. The panel above shows its lifetime peaks — the most collateral and debt it ever held.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing a vault",
          text: "repaying the normalized debt (art) to zero and withdrawing the collateral (ink) empties the vault; it stays reusable.",
        },
        {
          bold: "Normalized debt",
          text: `the ${debtSymbol} figure is the vault's art × the rate accumulator of ${ilk} (its collateral type, which Maker calls an ilk), which grows at the stability fee; it was measured at each recorded event.`,
        },
      ],
      links: [
        { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
        { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
      ],
    };
  }

  // Open vault — the live, interactive case.
  return {
    title: "About This Position",
    intro: `This panel explains the ${ilk} ${noun}'s live state in plain language — what backs the ${debtSymbol} debt, what it costs to carry, and how close it sits to liquidation.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral ratio",
        text: `collateral value relative to ${debtSymbol} debt. It must stay above the minimum ratio (mat) of ${ilk}, the vault's collateral type (Maker calls a collateral type an ilk). Governance sets the minimum per type; this card reads it live.`,
      },
      {
        bold: "Stability fee",
        text: `debt is stored normalized (art); the ${debtSymbol} figure is art × the collateral type's rate accumulator, which compounds continuously at the stability fee.`,
      },
      {
        bold: "Collateral types",
        text: `every collateral type (${ilk} and each other) has a separate oracle, minimum ratio and debt ceiling; stress in one type does not liquidate another type's vaults.`,
      },
      {
        bold: "Debt ceiling",
        text: `the most all ${ilk} vaults together may owe. At the ceiling no ${ilk} vault can draw more until the ceiling is raised; repaying and adding collateral still work.`,
      },
      {
        bold: "Dust floor",
        text: "each collateral type sets a minimum debt (dust): a repayment may not leave a smaller remainder, only zero.",
      },
    ],
    links: [
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
      { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
      { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
    ],
  };
}
