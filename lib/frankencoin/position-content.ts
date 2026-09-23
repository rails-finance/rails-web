// Position-panel "?" content for the Frankencoin position card — the state
// explainer for the panel that reads the position's live figures (or, on a
// closed/denied/expired position, its lifetime peaks). Distinct from the
// event-level modals in lib/shared/learn-more-content.ts
// (frankencoinMintingContent, frankencoinChallengeContent), which explain
// individual actions rather than the card's current state.
//
// Frankencoin's status is two-axis (lifecycle × challenge history — see the
// card's own header comment), and its lifecycle has FOUR terminal shapes, not
// the usual two: closed (repaid), denied (never minted — vetoed in the FPS
// window), and expired (deadline passed, unclaimed). Each gets its own copy.
//
// URL matches the one already verified in lib/shared/learn-more-content.ts's
// FRANKENCOIN_DOC_URL (docs.frankencoin.com).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const FRANKENCOIN_DOC_URL = "https://docs.frankencoin.com";

export function frankencoinPositionContent(opts: {
  status: "open" | "closed" | "denied" | "expired";
}): LearnMoreContent {
  const { status } = opts;

  if (status === "denied") {
    return {
      title: "About This Position",
      intro:
        "This position was denied: FPS holders vetoed it during its veto window, before it ever minted ZCHF. It never became a live position — there is no collateral or debt history to show.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Veto window",
          text: "a new original position waits an owner-chosen period (3 days minimum) before its first mint; enough FPS held against it in that window disables minting for good.",
        },
        {
          bold: "Clones skip the wait",
          text: "only original positions carry a veto window — a clone reuses an already-vetted original's terms and limit, and can mint immediately.",
        },
      ],
      links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
    };
  }

  if (status === "expired") {
    return {
      title: "About This Position",
      intro:
        "This position passed its owner-set expiration with debt still outstanding. Past expiry it can no longer mint, and on MintingHub V2 anyone can force-sell its collateral at a declining price to clear it.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Owner-set expiration",
          text: "expiration is a term the owner sets, not a challenge outcome — the panel above shows what it held at its height, since the current figures may still be settling.",
        },
        {
          bold: "Owner-declared price",
          text: "Frankencoin has no oracle; the liquidation price shown is the value the owner themselves set, held to the market by challenge auctions rather than a price feed.",
        },
      ],
      links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This position has been closed and its ZCHF debt fully repaid. The panel above shows its lifetime peaks — the most collateral and minted ZCHF it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Interest up front",
          text: "Frankencoin charges interest at minting time, not as an ongoing rate — the minted figure never grew on its own between mints.",
        },
        {
          bold: "Reserve contribution",
          text: "a fixed share of every mint was held back in the system reserve and returned as the position repaid.",
        },
      ],
      links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
    };
  }

  // Open position — the live, interactive case.
  return {
    title: "About This Position",
    intro:
      "This panel explains the position's live state in plain language — what backs the minted ZCHF, how its liquidation price is set, and what a challenge would mean for it.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Owner-declared price",
        text: "Frankencoin has no oracle: the liquidation price is a value the owner sets and can adjust. Raising it starts a 3-day cooldown; anyone who thinks it too high can challenge it.",
      },
      {
        bold: "Interest up front",
        text: "each mint deducts interest for the remaining term at mint time — the minted figure only moves when the owner mints or repays, never on its own.",
      },
      {
        bold: "Reserve contribution",
        text: "a fixed share of every mint is held back in the system reserve and returned on repayment; it absorbs shortfalls first if a challenge ends badly.",
      },
      {
        bold: "Challenges",
        text: "anyone who thinks the declared price is too high can post collateral and start a two-phase auction against the position — a survived challenge (averted, or left standing after a partial sale) still counts against the caution marker above, without ending the position.",
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}
