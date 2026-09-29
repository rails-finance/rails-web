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

/** The forced sale that ended a position, in the card's modal. */
const FORCED_SALE_DETAIL = {
  bold: "Expiry and the forced sale",
  text: "once a Minting Hub V2 position passes its expiration, anyone can buy its collateral through the hub at a price that starts at 10× the declared price and falls to zero over two challenge periods. The payment repays the debt, the reserve share goes to the buyer toward it, and the rest goes to the owner; a shortfall comes out of the reserve. This position's Forced Sale rows show its sale.",
  sources: [{ label: "expiry and the forced sale", url: `${FRANKENCOIN_DOC_URL}/risks` }],
};

export function frankencoinPositionContent(opts: {
  status: "open" | "closed" | "denied" | "expired";
  /** It ended by a forced sale after expiry. */
  forcedSale?: boolean;
}): LearnMoreContent {
  const { status, forcedSale = false } = opts;

  if (status === "denied") {
    return {
      title: "About This Position",
      intro:
        "This position was denied: a holder of more than 1% of the governance votes vetoed it during its veto window, before it ever minted ZCHF.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Veto window",
          text: "a new original position waits an owner-chosen period (3 days minimum) before its first mint. Holders of more than 1% of the governance votes (FCS, or the FPS it wraps, with delegations) can deny it in that window, which disables minting for good.",
          sources: [{ label: "the veto", url: `${FRANKENCOIN_DOC_URL}/governance` }],
        },
        {
          bold: "Clones skip the wait",
          text: "only original positions carry a veto window. A clone uses an accepted original's terms and limit, and can mint at once.",
          sources: [{ label: "cloning a position", url: `${FRANKENCOIN_DOC_URL}/positions/clone` }],
        },
        ...(forcedSale ? [FORCED_SALE_DETAIL] : []),
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
          text: "Frankencoin has no oracle; the liquidation price shown is the value the owner set, which challenge auctions test.",
        },
      ],
      links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro: forcedSale
        ? "This position is closed: a forced sale after its expiration sold its collateral and cleared its debt. The panel above shows its lifetime peaks — the most collateral and minted ZCHF it ever held."
        : "This position is closed: it holds no collateral and owes no ZCHF. The panel above shows its lifetime peaks — the most collateral and minted ZCHF it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Interest up front",
          text: "each mint paid interest at the rate in force when it was made, for the time left to expiry. The interest went to the system reserve as equity, owned by FPS holders. The minted figure never grew on its own between mints.",
        },
        {
          bold: "Reserve contribution",
          text: "a fixed share of every mint was held in the system reserve and released as the position repaid: in full while the reserve covered every position's share, in proportion when losses had drawn it down. A challenge sale that fell short of the debt was paid out of this share first.",
          sources: [{ label: "the reserve", url: `${FRANKENCOIN_DOC_URL}/reserve` }],
        },
        ...(forcedSale ? [FORCED_SALE_DETAIL] : []),
      ],
      links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
    };
  }

  // Open position — the live, interactive case.
  return {
    title: "About This Position",
    intro:
      "The card reads the position contract now: the collateral it holds, the ZCHF debt it carries, the liquidation price its owner declared, and the terms it runs on.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Owner-declared price",
        text: "Frankencoin has no oracle: the liquidation price is a value the owner sets and can adjust, and collateral × price is the most debt the position may carry. Raising it pauses minting and collateral withdrawals for 3 days.",
        sources: [{ label: "the declared price", url: `${FRANKENCOIN_DOC_URL}/positions/adjust` }],
      },
      {
        bold: "Interest up front",
        text: "each mint pays interest for the remaining term at once, at the rate in force when it is made, so the debt moves only when the owner mints or repays. The interest goes to the system reserve as equity, owned by FPS holders. The rate on the card is today's; an opened mint shows the rate it paid. The debt is gross: the wallet received each mint less the interest and the reserve share.",
        sources: [{ label: "interest on positions", url: `${FRANKENCOIN_DOC_URL}/positions` }],
      },
      {
        bold: "Reserve contribution",
        text: "a fixed share of every mint stays in the system reserve and is released on repayment: in full while the reserve covers every position's share, in proportion when losses have drawn it down. It covers this position's shortfall first if a challenge sells the collateral for less than the debt.",
        sources: [{ label: "the reserve", url: `${FRANKENCOIN_DOC_URL}/reserve` }],
      },
      {
        bold: "Challenges",
        text: "anyone who thinks the declared price is too high can post collateral of the same kind and start a two-phase auction against the position. A challenge can end without harm to the position (averted), or sell some or all of its collateral. The triangle beside the card's counters counts challenges; it does not show when there have been none.",
        sources: [{ label: "challenges", url: `${FRANKENCOIN_DOC_URL}/positions/auctions` }],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}
