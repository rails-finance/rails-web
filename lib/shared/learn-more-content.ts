import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import type { CurveEventType } from "@/lib/shared/types/protocols/curve";
import type { UniswapEventType } from "@/lib/shared/types/protocols/uniswap";
import { getSpokeMeta, ARCHETYPE_GLOSS, SPOKE_DOC_LINKS } from "@/lib/aave-v4/spoke-meta";
import { HUB_TIER_LABEL, type HubTier } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { SEAMLESS_DOCS_URL } from "@/lib/aave-v3/protocol-name";
import { FAQ_URLS, AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { ALCHEMIX_DOCS } from "@/lib/alchemix/learn-more";
import type { VaultPositionFamily } from "@/lib/aave-vaults/vault-position";
import { indefiniteArticle } from "@/lib/utils/format";

// ── Lifetime flows: how to read the charts ───────────────────────────────────

/** The "?" on every Lifetime flows header (rails-ops TO-DO-ui-jobs §264): how
 *  to read the panel on any explorer. One text, no protocol and no figures;
 *  what is specific to a protocol's position is its (i). The colours are the
 *  chart's tokens: collateral blue-500, debt green-400, liquidation red-500,
 *  caution orange, a delegate's rate change pink-500. Each behaviour was
 *  checked on desktop and at 390 by touch, 5 Oct 2026. */
export function lifetimeFlowsReadingContent(): LearnMoreContent {
  return {
    title: "How to read these charts",
    intro:
      "The panel draws the position's whole life: a bar for what it holds and one for what it owes, and a line of both over time, moved by one cursor.",
    detailsHeading: "The parts:",
    details: [
      {
        bold: "The bars",
        text: "Blue is the collateral, green the debt. The solid part is what is held or owed on the cursor's day, the figure above it. The hatched parts are what left: withdrawn, repaid, redeemed, liquidated. On an earlier day, a dashed outline marks where the bar ends today. Click or tap a part for its name, value and share of the bar. A very busy position draws each bar at the scale of what is held.",
      },
      {
        bold: "The line",
        text: "Collateral and debt at the close of each day, week or month since the position opened. The line is in USD, each point valued at that close's price; where the two sides share no price it is in their tokens, as the (i) says. A dotted stretch rests on an old or missing price. The marks under it are days with events: a red triangle for a liquidation, an orange one for a redemption or a change the owner did not make, a pink dot for a delegate's rate change, a ring for the owner's, otherwise a dot in the side's colour.",
      },
      {
        bold: "The cursor",
        text: "Press the line and drag to move it; it stops at each close, on each day with events and at today. The figures and the bars follow it. A click or tap holds it on a day and dims the line after it; the last of the buttons under the line lets go and returns to today. The buttons between step through the days with events or play the life through.",
      },
      {
        bold: "Show timeline to [day]",
        text: "Cuts the transaction list below at the close of the cursor's day, and the page's link keeps that day. The × on the chip above the list removes the cut.",
      },
      {
        bold: "The chart button on an event",
        text: "Each day's last event in the list carries one. It moves the cursor to that day and holds it there.",
      },
    ],
  };
}

// ── CoW Protocol ─────────────────────────────────────────────────────────────

// ── Liquity — Live position panel (the trove summary's "?" FAQ) ──────────────
//
// Panel-scoped FAQ for the live trove position card. It consolidates the
// per-bullet "learn more" chain icons that used to sit inline on each
// explanation row into a single standardised "?" modal. Content is keyed to
// what THIS panel surfaces — collateral ratio, interest/delegation, redemption
// exposure, and trove-NFT ownership — so the questions answer the obvious
// "what does this number mean?" without repeating the borrowing/liquidation/
// redemption EVENT modals. Quick Links point at the canonical Liquity docs.
export function liquityPositionContent(opts: {
  collateralType: string;
  status: "open" | "closed" | "liquidated";
  isBatched?: boolean;
}): LearnMoreContent {
  const { collateralType, status, isBatched } = opts;
  const isETH = collateralType === "WETH" || collateralType === "ETH";
  const minCR = isETH ? "110%" : "120%";

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This trove was liquidated when its collateral ratio fell below the minimum threshold. The panel above reconstructs its final state — peak debt, collateral, and how long it stayed open.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Liquidation threshold",
          text: `a trove is liquidated once its collateral ratio drops below ${minCR} for ${collateralType}. Anyone can trigger the liquidation.`,
        },
        {
          bold: "Trove NFT",
          text: "ownership of a trove is an ERC-721 NFT. One address can hold many troves, each a separate position.",
        },
      ],
      links: [
        { label: "How do liquidations work?", url: FAQ_URLS.LIQUIDATIONS },
        { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
      ],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This trove has been closed and its debt fully repaid. The panel above shows its lifetime peaks — the most debt and collateral it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing a trove",
          text: "repaying all debt returns all the collateral to the owner, refunds the 0.0375 ETH liquidation reserve paid apart from it at open, and burns the trove NFT.",
        },
        {
          bold: "Trove NFT",
          text: "ownership of a trove is an ERC-721 NFT. One address can hold many troves, each a separate position.",
        },
      ],
      links: [
        { label: "What is a Trove?", url: FAQ_URLS.WHAT_IS_TROVE },
        { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
      ],
    };
  }

  // Open trove — the live, interactive case.
  const details: LearnMoreContent["details"] = [
    {
      bold: "Collateral ratio",
      text: `the collateral's USD value relative to the debt. It must stay above ${minCR} for ${collateralType} or the trove can be liquidated.`,
    },
  ];
  if (isBatched) {
    details.push({
      bold: "Interest delegation",
      text: "a batch manager sets this trove's rate and charges a management fee on top of the interest, both accruing to the debt.",
    });
  } else {
    details.push({
      bold: "Interest rate",
      text: "the borrower sets the rate. Lower rates cost less but sit earlier in the redemption queue.",
    });
  }
  details.push(
    {
      bold: "Redemption exposure",
      text: "a redemption exchanges BOLD for collateral at $1 of face value per BOLD, sweeping each branch's queue from the lowest user-set interest rate upward. Debt at the same or lower rate is redeemed first — the debt-in-front figure is how much shields this trove. A redeemed trove gives up collateral worth the debt it sheds: it deleverages, but its net value is preserved.",
    },
    {
      bold: "Branch scoping",
      text: `each collateral type is its own branch with its own redemption queue. A redemption is split across branches in proportion to each branch's unbacked debt, so the queue this trove stands in is the ${collateralType} branch's own.`,
    },
    {
      bold: "Trove NFT",
      text: "ownership of a trove is an ERC-721 NFT. One address can hold many troves, each a separate position.",
    },
  );

  const links: LearnMoreContent["links"] = [
    { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
  ];
  if (isBatched) {
    links.push({ label: "What is interest-rate delegation?", url: FAQ_URLS.DELEGATION });
  } else {
    links.push({ label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES });
  }
  links.push(
    { label: "What happens if my trove gets redeemed?", url: FAQ_URLS.REDEMPTION_SELECTION },
    { label: "How many troves can I open with the same address?", url: FAQ_URLS.NFT_TROVES },
  );

  return {
    title: "About This Position",
    intro:
      "This panel explains the trove's live state in plain language — what backs the debt, what it costs to hold, and how exposed it is to redemption.",
    detailsHeading: "Key concepts:",
    details,
    links,
  };
}

// ── Liquity — Lifetime flows panel ───────────────────────────────────────────
//
// State-explainer for the trove's Lifetime flows panel (carry cost + lifetime
// debt/collateral flows). Scoped to what that panel shows, distinct from the
// position panel's "About this position".
export function liquityLifetimeFlowsContent(opts: { isBatched?: boolean } = {}): LearnMoreContent {
  return {
    title: "About Lifetime flows",
    intro:
      "This panel breaks down what the trove costs to carry and traces every unit of debt and collateral that has flowed through it over its lifetime.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Carrying cost",
        text: opts.isBatched
          ? "the interest plus the delegate's management fee that accrue to the debt each day and year."
          : "the interest that accrues to the debt each day and year at the trove's chosen rate.",
      },
      {
        bold: "Upfront fee",
        text: "a one-time borrowing fee taken when debt is drawn, equivalent to about 7 days of average interest.",
      },
      {
        bold: "Lifetime flows",
        text: "the towers decompose everything that ever moved through the trove — deposited, withdrawn, borrowed, repaid, redeemed, liquidated.",
      },
      {
        bold: "Redemption outcome",
        text: "a redemption clears debt at $1 face and takes collateral for it at the oracle price of that moment. The first figure sets the debt cleared against the collateral's value at each redemption's own price; the second reprices the same collateral at the latest block's price. A rise in the collateral since makes the second figure larger, a fall makes it smaller.",
      },
      {
        bold: "Liquidation reserve",
        text: "0.0375 ETH held back at open to pay liquidators, refunded when the trove closes.",
      },
    ],
    links: [
      { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
      { label: "Are there other borrowing fees?", url: FAQ_URLS.BORROWING_FEES },
      { label: "What is the liquidation reserve?", url: FAQ_URLS.LIQUIDATION_RESERVE },
      opts.isBatched
        ? { label: "What is interest-rate delegation?", url: FAQ_URLS.DELEGATION }
        : { label: "How do user-set interest rates work?", url: FAQ_URLS.USER_SET_RATES },
    ],
  };
}

// ── Liquity V2 — Event-card modals ───────────────────────────────────────────
// Moved to content/liquity-v2/event-prose.yaml (`L5`), with the rest of an
// event's strings.

// Generic Aave V4 fallback — the "never empty" floor for any Aave event without
// a dedicated modal (supply / withdraw / borrow / repay / collateral_toggle).
// P2 will replace these with mechanic-specific content.
export function aaveV4EventFallbackContent(): LearnMoreContent {
  return {
    title: "How Aave V4 Positions Work",
    intro:
      "Aave V4 lets a user supply assets as collateral and borrow against them inside an isolated spoke, where one shared health factor governs the whole position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supply & collateral",
        text: "supplied assets earn interest and, when enabled, back the borrowing.",
      },
      {
        bold: "Borrowing & health factor",
        text: "borrowing draws against the collateral; the health factor measures how safely the debt is covered.",
      },
      {
        bold: "Hub & spoke",
        text: "each spoke isolates risk — one shared health factor inside, fully independent between spokes.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

// ── Aave V4 — Event-card modals (process events) ─────────────────────────────
//
// Mechanic-specific content mapped from event types by the event explainer's
// resolver. Same slot grammar as the Liquity event modals.

export function aaveV4SupplyContent(): LearnMoreContent {
  return {
    title: "How Supplying Works",
    intro:
      "Supplying deposits an asset into a spoke, where it earns interest and — if enabled as collateral — can back borrowing. Withdrawing reverses it.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supplied balance",
        text: "the deposit, which accrues supply interest continuously and stays withdrawable unless it's backing a borrow.",
      },
      {
        bold: "Collateral toggle",
        text: "each supplied asset can be switched on or off as collateral; only collateral-enabled supply supports borrowing.",
      },
      {
        bold: "Withdrawing",
        text: "any supply not currently needed to keep borrows covered can be withdrawn.",
      },
      {
        bold: "Position managers",
        text: "contracts an owner can approve to act on a position for them. A manager that supplies or repays pays with its own funds, so it needs only that approval; one that withdraws or borrows sends the tokens to itself, so it also needs an allowance the owner grants per asset. Governance activates each manager, and the owner can revoke one at any time.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

export function aaveV4WithdrawContent(): LearnMoreContent {
  return {
    title: "How Withdrawing Works",
    intro:
      "Withdrawing takes supplied assets, with the interest they have earned, out of a spoke and back to the wallet. A withdrawal can name an amount or take the whole balance.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Health factor",
        text: "with a borrow open, withdrawing collateral lowers the health factor. The spoke allows it while the factor stays at or above 1; a factor close to 1 leaves the position near liquidation.",
      },
      {
        bold: "Supply with no debt against it",
        text: "a supply that backs no borrow, or one not enabled as collateral, can be withdrawn in full.",
      },
      {
        bold: "Risk premium",
        text: "withdrawing collateral while a borrow is open is a risk-increasing action, so the spoke recalculates the position's risk premium.",
      },
      {
        bold: "Paused reserves",
        text: "a reserve that governance has paused cannot be withdrawn from until it is unpaused.",
      },
      {
        bold: "Position managers",
        text: "a manager the owner has approved can withdraw for them; because the tokens go to the manager, it also needs an allowance the owner grants for that asset.",
      },
    ],
    links: [
      { label: "Withdrawing on Aave V4", url: "https://aave.com/docs/aave-v4/positions/withdraw" },
      { label: "Position managers", url: "https://aave.com/docs/aave-v4/positions/managers" },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}

export function aaveV4BorrowContent(): LearnMoreContent {
  return {
    title: "How Borrowing Works",
    intro:
      "Borrowing draws an asset against the supplied collateral within a spoke. Repaying returns the asset and frees up that collateral.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Borrowing power",
        text: "each collateral counts at its collateral factor, one figure per asset that sets both how much can be borrowed and where liquidation starts, so a borrow can take the health factor down to 1.",
      },
      {
        bold: "Health factor",
        text: "borrowing lowers the health factor; if it falls below 1 the position can be liquidated.",
      },
      {
        bold: "Borrow interest",
        text: "debt accrues interest continuously at the asset's borrow rate until it's repaid.",
      },
      {
        bold: "What moves the rate",
        text: "the hub that lends the asset sets its borrow rate from how much of its supply is borrowed: the rate rises slowly up to a target share and steeply past it, so every borrow, repay, supply and withdrawal on that hub moves it. Aave V4 can add a per-user risk premium on top, scaled by the quality of the collateral, recalculated on each borrow and withdrawal; the position page shows the premium when the position carries one.",
      },
      {
        bold: "Position managers",
        text: "a contract the owner has approved can borrow for them. Because the borrowed tokens go to the manager, it also needs an allowance the owner grants for that asset; governance activates each manager, and the owner can revoke one at any time.",
      },
    ],
    links: [
      { label: "Borrowing on Aave V4", url: "https://aave.com/docs/aave-v4/positions/borrow" },
      { label: "Position managers", url: "https://aave.com/docs/aave-v4/positions/managers" },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}

export function aaveV4RepayContent(): LearnMoreContent {
  return {
    title: "How Repaying Works",
    intro:
      "Repaying returns borrowed tokens to the spoke, which lowers the debt, raises the health factor and frees collateral for withdrawal or further borrowing.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Partial or full",
        text: "any amount can be repaid at any time; repaying the full amount clears that asset's debt, including the interest it has accrued.",
      },
      {
        bold: "Interest",
        text: "debt grows with interest every block, so the amount owed at repayment is more than was borrowed. Whatever is left after a partial repay keeps accruing at the asset's borrow rate.",
      },
      {
        bold: "Repaying for someone else",
        text: "a position manager the owner has approved can repay the owner's debt with its own tokens. It needs no per-asset allowance, since no value leaves the position.",
      },
      {
        bold: "Token approval",
        text: "the repaying account first approves the spoke to take the tokens, in a separate transaction or with a signed permit.",
      },
    ],
    links: [
      { label: "Repaying on Aave V4", url: "https://aave.com/docs/aave-v4/positions/repay" },
      { label: "Position managers", url: "https://aave.com/docs/aave-v4/positions/managers" },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}

export function aaveV4CollateralToggleContent(): LearnMoreContent {
  return {
    title: "How Collateral Works",
    intro:
      "Each supplied asset can be enabled or disabled as collateral. Only enabled assets back borrowing and count toward the health factor.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral toggle",
        text: "turning an asset on lets it back borrows; turning it off removes it from borrowing power.",
      },
      {
        bold: "Health-factor impact",
        text: "disabling collateral lowers the health factor, so it's blocked if doing so would leave the position unsafe.",
      },
      {
        bold: "Isolated per spoke",
        text: "collateral only backs borrows within the same spoke — spokes never share risk.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

// Generic Aave position-panel fallback — the "never empty" floor for the spoke
// position panel when a spoke has no editorial metadata. State-explainer, so
// titled "About this position".
export function aaveV4PositionFallbackContent(): LearnMoreContent {
  return {
    title: "About This Position",
    intro:
      "This panel explains an Aave V4 position in plain language — what's supplied as collateral, what's borrowed against it, and how safely the debt is covered.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Supply & collateral",
        text: "supplied assets earn interest and, when enabled, back the borrowing.",
      },
      {
        bold: "Health factor",
        text: "measures how safely the debt is covered; below 1.0 the position can be liquidated.",
      },
      {
        bold: "Hub & spoke",
        text: "each spoke isolates risk — one shared health factor inside, fully independent between spokes.",
      },
    ],
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
      { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
    ],
  };
}

// ── Aave V4 — Economics panel ────────────────────────────────────────────────
//
// State-explainer for the spoke economics section (lifetime towers + price
// runways + health factor). Scoped to that section, distinct from the position
// panel's "About this position".
//
// Layer-2 modal: it explains how the economics section works *in general* and
// must read identically on every position — so it takes no per-position arguments
// and never branches on live state (e.g. whether this wallet currently carries
// debt). A supply-only position simply doesn't render the runway sub-section; the
// modal still teaches what it shows. See learn-more-modal-grammar.md §1.
/** The Lifetime flows modal. Rows the panel can show only when the position
 *  has them (supply interest, liquidations) are named only then. */
export function aaveV4EconomicsContent(
  has: { supplyInterest?: boolean; liquidations?: boolean } = {},
): LearnMoreContent {
  const details: LearnMoreContent["details"] = [
    {
      bold: "Collateral tower",
      text: `what was deposited${has.supplyInterest ? " plus the interest it earned" : ""}, set against what left: withdrawals${has.liquidations ? " and collateral seized in liquidations" : ""}. What remains is the collateral held today.`,
    },
    {
      bold: "Debt tower",
      text: `what was borrowed plus the interest it accrued, set against what was repaid${has.liquidations ? " and what liquidators repaid" : ""}. What remains is the debt owed today.`,
    },
    {
      bold: "Interest",
      text: "no event moves it: balances grow every block, so interest is what a balance holds beyond the amounts its events moved.",
    },
  ];
  if (has.liquidations) {
    details.push({
      bold: "Liquidation cost",
      text: "a liquidator takes collateral worth more than the debt it repays. The difference is the liquidation bonus, and it is what a liquidation costs the borrower.",
    });
  }
  return {
    title: "About Lifetime Flows",
    intro:
      "This panel totals every token that has moved into and out of a position over its life, as two towers: collateral on one side, debt on the other.",
    detailsHeading: "Key concepts:",
    details,
    links: [
      { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
      { label: "Liquidations in Aave V4", url: "https://aave.com/docs/aave-v4/positions/liquidations" },
    ],
  };
}

// ── Aave V4 — Spoke architecture ─────────────────────────────────────────────

// Generic, per-spoke-type explainer for the Aave V4 Hub & Spoke model. The copy
// is keyed purely by spoke name (archetype, hub mapping, narrative) and carries
// nothing about the wallet's position, so it belongs in the shared Learn-More
// modal rather than inline on the card. Returns null for spokes without
// editorial metadata so the caller can omit the "?" affordance.
export function aaveV4SpokeContent(spokeName: string): LearnMoreContent | null {
  const meta = getSpokeMeta(spokeName);
  if (!meta) return null;

  const hub = (h: HubTier) => HUB_TIER_LABEL[h];
  const sameHub = meta.borrowHubs.length === 1 && meta.borrowHubs[0] === meta.collateralHub;
  const hubMapping = sameHub
    ? `Here ${hub(meta.collateralHub)} is the hub and ${meta.name} the spoke: collateral supplied to ${meta.name} and what it lends both sit in the ${hub(meta.collateralHub)} hub.`
    : `Here ${meta.name} is the spoke: its collateral sits in the ${hub(meta.collateralHub)} hub, and it borrows from the ${meta.borrowHubs.map(hub).join(" and ")} hub${meta.borrowHubs.length > 1 ? "s" : ""}.`;

  const extraParagraphs = [ARCHETYPE_GLOSS[meta.archetype], ...meta.narrative];
  if (meta.rateNote) extraParagraphs.push(meta.rateNote);

  return {
    title: `How the ${meta.name} Spoke Works`,
    intro: `Aave V4 splits lending in two. A hub holds the pooled tokens and sets their interest rates; a spoke is the market you use, with its own list of collateral, its own risk settings and its own health factor, and it draws tokens from a hub up to a limit the hub sets. ${hubMapping}`,
    extraParagraphs,
    links: meta.links ?? SPOKE_DOC_LINKS,
  };
}

// ── Aave V4 — Liquidations ───────────────────────────────────────────────────

// Generic explainer for Aave V4 liquidations. The mechanism is identical across
// every spoke and hub, so this carries nothing wallet-specific; an optional
// spokeName only adds the shared "which spoke this touched" framing (still the
// same for every wallet on that spoke). Reused by every liquidation event card.
export function aaveV4LiquidationContent(spokeName?: string): LearnMoreContent {
  const meta = spokeName ? getSpokeMeta(spokeName) : null;
  const marketNote = meta
    ? ` This liquidation happened on the ${meta.name} spoke — under Aave V4's Hub & Spoke model it only touches collateral and debt inside that spoke, so positions on other spokes are unaffected.`
    : " Under Aave V4's Hub & Spoke model a liquidation only touches collateral and debt inside the affected spoke, so positions on other spokes are unaffected.";

  return {
    title: "How Liquidations Work",
    intro:
      "An Aave V4 position becomes eligible for liquidation when its health factor falls below 1.0 — the point where the borrowed value, measured against each collateral asset's liquidation threshold, is no longer sufficiently covered. Once eligible, anyone (in practice, automated liquidator bots) can step in.",
    extraParagraphs: [
      "A liquidator repays part of the outstanding debt and, in return, receives the same value of the borrower's collateral plus a liquidation bonus, so the collateral seized is worth more than the debt repaid. The bonus follows a Dutch auction: the lower the health factor, the higher the bonus, up to a maximum each Spoke sets per collateral asset. It is the liquidator's incentive and the borrower's penalty." +
        marketNote,
      "A liquidator repays only enough to bring the health factor back to a healthy level, with one exception: if a partial liquidation would leave less than $1,000 of debt in the reserve being repaid, the liquidator must repay all of that reserve's debt.",
      "Health factor = (collateral value × each asset's liquidation threshold) ÷ total debt. To stay safe, keep it comfortably above 1.0 by holding more collateral or carrying less debt; falling collateral prices or rising debt both push it down.",
    ],
    links: [
      { label: "Health factor & liquidations", url: "https://aave.com/help/borrowing/liquidations" },
      { label: "Liquidations in Aave V4", url: "https://aave.com/docs/aave-v4/positions/liquidations" },
      { label: "Aave FAQ", url: "https://aave.com/faq" },
    ],
  };
}

// ── Curve ────────────────────────────────────────────────────────────────────

// ── Uniswap V3 ───────────────────────────────────────────────────────────────

// ── Stability Pool ──────────────────────────────────────────────────────────

// ── Governance ───────────────────────────────────────────────────────────────

// ── Vaults ───────────────────────────────────────────────────────────────────

// Page-level explainer for the cross-hub comparison surface (/aave-v4/hubs).
// Layer-2 mechanic only — no snapshot numbers, so it reads identically on any
// block. Concepts mirror what the band + table actually show: hubs, spokes,
// credit lines / utilisation, and the LT range.
export function aaveV4HubsContent(): LearnMoreContent {
  return {
    title: "How hubs and spokes work",
    intro:
      "Aave V4 splits lending into Liquidity Hubs — the shared pools that hold supplied assets and set each market's caps and rates — and Spokes, the markets people supply to and borrow from. A Spoke draws liquidity from a Hub over a credit line, and can hold lines to more than one Hub.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Liquidity Hub",
        text: "the pool that custodies supplied assets and backs borrowing. Separate hubs (Core, Plus, Prime, Global Dollar) don't co-mingle liquidity.",
      },
      {
        bold: "Spoke",
        text: "a market users interact with, drawing from a Hub. One spoke can draw from more than one — Bluechip keeps its collateral in Prime and borrows from both Prime and Core.",
      },
      {
        bold: "Credit line & utilisation",
        text: "the cap a Hub grants a Spoke to draw an asset; utilisation is how much of that line is currently drawn.",
      },
      {
        bold: "Liquidation threshold (LT)",
        text: "the share of an asset's value borrowable against it before liquidation; shown as a range when spokes set it differently.",
      },
    ],
    links: [
      { label: "Aave V4 architecture", url: AAVE_FAQ_URLS.V4_ARCHITECTURE },
      { label: "Hubs & liquidity model", url: AAVE_FAQ_URLS.V4_LIQUIDITY_MODEL },
      { label: "Aave V4 docs", url: AAVE_FAQ_URLS.V4_DOCS },
    ],
  };
}

// Page-level explainer for Aave V4 on Base's hub page (/base/aave-v4/hubs):
// one hub, one spoke, the reserves' parameters and the stock feeds' hours.
// Mechanics only, no snapshot numbers.
export function aaveV4BaseHubContent(): LearnMoreContent {
  return {
    title: "How the Equities hub works",
    intro:
      "Aave V4 on Base has one Liquidity Hub, the Equities hub, holding one USDC reserve, and one Spoke drawing from it, Mag7. Seven Coinbase tokenized stocks are supplied to the Spoke as collateral and USDC is borrowed against them; the stocks cannot themselves be borrowed.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral factor",
        text: "the share of a stock's value that counts toward the health factor. A position's health factor is its collateral, each asset weighted by its factor, divided by its debt; below 1.0 it can be liquidated.",
      },
      {
        bold: "Supply cap and credit line",
        text: "the hub caps how much of each asset the Spoke may add (the supply cap) and how much USDC it may draw (the credit line), in whole tokens.",
      },
      {
        bold: "Stock prices",
        text: "each stock's price is a Chainlink feed that publishes from Sunday 20:00 ET to Friday 20:00 ET and holds its last value outside those hours; the Aave market itself stays open, so a weekend price can be days old. Rails states when each price was published.",
      },
      {
        bold: "Paused reserve",
        text: "a split or other corporate action pauses the stock's reserve until the token's multiplier is updated. Dividends are reinvested into the token. Coinbase can also pause a stock at its token registry, which holds the stock's price feed at its last value; the Spoke does not read that flag, so the reserve stays open at the held price. Rails reads both and states each.",
      },
    ],
    links: [
      { label: "Coinbase tokenized stocks on Aave V4", url: "https://aave.com/blog/coinbase-tokenized-stocks" },
      { label: "Aave V4 docs", url: "https://aave.com/docs/aave-v4" },
      { label: "ARFC: deploy Aave V4 on Base", url: "https://governance.aave.com/t/arfc-deploy-aave-v4-on-base/25427" },
    ],
  };
}

// ── Spark (SparkLend) — doc links of the Lifetime flows modals ───────────────
//
// The event, position and market modals are content/spark/event-prose.yaml's.
// These links serve the economics modals below (Z3, still TSX).

const SPARK_DOC_URLS = {
  SPARKLEND: "https://docs.spark.fi/products/sparklend",
  LIQUIDATIONS: "https://docs.spark.fi/products/sparklend/guides/liquidations",
  FAQ: "https://docs.spark.fi/faq",
} as const;

// ── Moonwell — doc link of the Lifetime flows modal ──────────────────────────
//
// The event and position modals are content/moonwell/event-prose.yaml's; this
// link serves the flows modal below (Z3, still TSX).

const MOONWELL_DOC_URL = "https://docs.moonwell.fi";

// ── Dolomite (Ethereum L1) — Event-card modals ───────────────────────────────
//
// A hard fork of dYdX Solo Margin: one core contract, markets keyed by
// numeric id, and the position grain is Account.Info = (owner, accountNumber)
// — cross-margin within an account number, isolated across them. The core has
// no Borrow action (a negative balance IS debt), interest accrues per second
// into a per-market index (par × index = tokens), and liquidations move four
// balances in one event across the borrower's and the liquidator's accounts.

const DOLOMITE_DOC_URL = "https://docs.dolomite.io/";

export function dolomiteDepositWithdrawContent(eventType: "deposit" | "withdraw"): LearnMoreContent {
  const depositing = eventType === "deposit";
  return {
    title: depositing ? "How Depositing Works" : "How Withdrawing Works",
    intro: depositing
      ? "Depositing moves tokens into one of the account's Dolomite balances. If the balance was negative — a negative balance IS debt here — the deposit repays it first; past zero it becomes a lending balance earning the market's rate."
      : "Withdrawing moves tokens out of a Dolomite balance. A withdrawal can push a balance BELOW zero — that is how borrowing happens: there is no separate Borrow action, only balances allowed to go negative against the account's collateral.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Par and the index",
        text: "par is the balance the protocol stores; the token amount is par × the market's index, which grows with interest, so par stays still between the account's events while the token amount grows (on the debt side, the amount owed grows).",
      },
      {
        bold: "One account, one risk pool",
        text: "every balance under one account number cross-margins: positive balances back negative ones, judged together against the margin requirement. Different account numbers of the same owner are fully isolated.",
      },
      {
        bold: depositing ? "Repay by depositing" : "Borrow by withdrawing",
        text: depositing
          ? "a deposit into a negative balance is a repayment — the timeline shows one deposit whose balance crosses toward zero."
          : "a withdrawal past zero opens debt at the market's borrow rate; markets flagged as closing accept no new debt.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteTransferContent(direction: "transfer_in" | "transfer_out"): LearnMoreContent {
  const incoming = direction === "transfer_in";
  return {
    title: incoming ? "How Receiving a Transfer Works" : "How Sending a Transfer Works",
    intro:
      "Transfers move balances between two Dolomite accounts — Account.Info pairs — without any tokens leaving the protocol. Most commonly the two sides are the SAME owner: the Dolomite Balance (account 0) funding an isolated Borrow Position, or a position paying back out.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Opening a Borrow Position",
        text: "an isolated position starts life as a transfer from the owner's Dolomite Balance into a fresh account number — collateral first, then a withdrawal or trade takes the balance negative.",
      },
      {
        bold: "Isolation moves with the balance",
        text: incoming
          ? "once received, the balance counts toward THIS account's collateral and margin — and only this account's."
          : "once sent, the balance stops backing this account's debt; the core blocks any transfer that would leave the sender under-collateralised.",
      },
      {
        bold: "Two legs, one log",
        text: "one transfer event carries both accounts' balance updates; each account's timeline shows its own leg.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteTradeContent(): LearnMoreContent {
  return {
    title: "How Trades Work",
    intro:
      "A trade (the core's Sell action) swaps one of the account's balances for another through an exchange wrapper — two markets move in one event: the taker side leaves the account, the maker side arrives.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Leverage in one step",
        text: "a trade can push the taker balance below zero — selling borrowed funds. That is how a leveraged position opens here: no Borrow event, just a balance crossing zero inside a trade.",
      },
      {
        bold: "Two legs, one log",
        text: "the event carries a balance update per market; the timeline shows each as its own row (spent / received), both traced to the same transaction.",
      },
      {
        bold: "Margin checked after",
        text: "whatever the trade does, the account must end above its margin requirement or the operation reverts.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteLiquidationContent(): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro:
      "An account becomes liquidatable when its adjusted collateral value falls below the margin requirement times its adjusted debt — the requirement being the global 117.65% minimum scaled up by each market's margin premium (multiplicatively), or the account's own risk override (111.11% on the LST/ETH category) where one applies.",
    extraParagraphs: [
      "A liquidator repays half or all of the account's debt from their own Dolomite balances and takes collateral worth that repayment plus the liquidation spread. The spread is a 5% base multiplied by (1 + the spread premium) of the collateral market and of the debt market: collateral with a 200% premium against a debt with none is seized at 5% × 3 = 15%. An account with a risk override is seized at the override's own spread instead. The opened liquidation row states the spread that applied and its parts. One liquidation event moves FOUR balances: the borrower's debt and collateral, and the liquidator's payout and receipt — each account's timeline shows its own two legs.",
      "How much is repaid is set by the protocol: when the account's health factor (adjusted collateral ÷ (margin requirement × adjusted debt)) is 0.95 or above and the collateral market allows partial liquidation, a liquidation clears half the debt; otherwise it clears all of it. The account continues with whatever remains and can be liquidated again.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Vaporization",
        text: "an account can run out of collateral before its debt is cleared, leaving a shortfall no liquidation can seize against. Vaporization writes that remaining debt off, covered by the core's excess token balances.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

export function dolomiteEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Dolomite Positions Work",
    intro:
      "Dolomite on Ethereum is a hard fork of dYdX Solo Margin: one core contract holds every market, and a position is an account — an (owner, account number) pair. Balances may go negative, and a negative balance IS the debt; there is no separate Borrow action.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Par × index",
        text: "balances are stored scaled (par); the per-market interest index — accruing per second — carries all interest. Par × index is the token amount.",
      },
      {
        bold: "Cross-margin within, isolated across",
        text: "all balances under one account number back each other; different account numbers of one owner are independently margined and independently liquidated. Account 0 is the owner's Dolomite Balance; other numbers are isolated Borrow Positions.",
      },
      {
        bold: "The risk ladder",
        text: "the global 117.65% minimum collateralisation scales up multiplicatively with each market's margin premium — and some accounts (LST/ETH pairs) instead carry the protocol's own override: 111.11%, premiums skipped.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }],
  };
}

// ── LlamaLend (Curve, Ethereum) — Event-card modals ──────────────────────────
//
// Curve's LLAMMA lending: each Controller is an isolated market (one
// collateral, one borrowed token), and the collateral sits in the market's
// AMM across a BAND of prices. Liquidation is two-stage: SOFT — the AMM
// converts collateral to the borrowed token while the price is inside the
// bands (a state, no event; the swaps reverse and their losses stay) — then
// HARD — a Liquidate, in full or in part, once health goes negative.

const LLAMALEND_DOC_URL = "https://docs.curve.finance/lending/overview/";

export function llamalendBorrowContent(kind: "borrow" | "add_collateral"): LearnMoreContent {
  const borrowing = kind === "borrow";
  return {
    title: borrowing ? "How Borrowing Works" : "How Adding Collateral Works",
    intro: borrowing
      ? "Borrowing deposits collateral into the market's AMM, spread across a number of price bands the borrower picks (4 to 50), and draws the borrowed token against it. The more debt against the collateral, the closer the bands sit below the current price."
      : "Adding collateral deposits more of the collateral token into the position's bands without changing the debt. The extra collateral moves the bands further below the current price.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Collateral lives in an AMM",
        text: "the collateral is liquidity in the market's AMM (LLAMMA), placed across a set of adjacent price bands whose number the borrower chose at opening. That placement is what makes soft-liquidation possible.",
      },
      {
        bold: "The bands are the risk range",
        text: "soft-liquidation begins at the top price of the highest band and completes at the bottom price of the lowest.",
      },
      {
        bold: "Band prices rise with interest",
        text: "each band's price is scaled by the same multiplier that grows the debt, so the same bands price higher as time passes.",
      },
      {
        bold: "A",
        text: "the market's band width: each band spans about 1/A of its price (1% at A = 100).",
      },
      {
        bold: "Loan discount",
        text: "sets how much can be borrowed: the most a loan may draw is what its bands would hold with the price through their bottom, less this discount.",
      },
      {
        bold: "Liquidation discount",
        text: "sets when health reaches 0: health takes this smaller discount off the same value before comparing it with the debt, so a new loan starts above 0.",
      },
      {
        bold: "Isolated markets",
        text: "each market has one collateral and one borrowed token; positions in different markets never share collateral and are liquidated independently.",
      },
    ],
    extraParagraphs: [
      "If the price falls into the bands, soft-liquidation starts: the AMM sells collateral for the borrowed token as the price falls and buys it back as the price rises, and the owner keeps the position. If health falls below 0, hard liquidation becomes possible: a liquidator repays the debt and takes what the position holds. The owner receives nothing from a hard liquidation and keeps the tokens they borrowed.",
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendRepayContent(kind: "repay" | "remove_collateral"): LearnMoreContent {
  const repaying = kind === "repay";
  return {
    title: repaying ? "How Repaying Works" : "How Removing Collateral Works",
    intro: repaying
      ? "Repaying returns borrowed tokens to the market and lowers the debt; a full repay closes the loan and returns the collateral. Outside soft-liquidation, less debt moves the bands further below the current price; inside it, the bands stay where they are."
      : "Removing collateral withdraws part of the position's collateral from its bands. It is only possible while the position is not in soft-liquidation, and it moves the bands closer to the current price.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Debt accrues per second",
        text: "the market's rate policy sets a per-second rate; the debt figure in any event is the total owed at that block, interest included.",
      },
      {
        bold: "Bands move on every change",
        text: "each borrow, repay or collateral change outside soft-liquidation places the bands again, and the event records where. Band prices also rise over time with the market's interest.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

/** `approvals`: whether this controller answers `approval(address,address)`
 *  (the position's live read); the approved-address clause appears only where
 *  it does. */
export function llamalendLiquidationContent(self: boolean, approvals: boolean | null = null): LearnMoreContent {
  const anyHealth =
    approvals === true
      ? "The owner, or an address the owner approved, may liquidate at any health."
      : approvals === false
        ? "Only the owner may liquidate at any health."
        : "The owner may liquidate at any health.";
  return {
    title: self ? "How Self-Liquidation Works" : "How Hard Liquidation Works",
    intro: self
      ? "A borrower whose position is partly converted can settle it themselves: self-liquidation repays the debt using the already-converted borrowed tokens plus a top-up, and withdraws whatever collateral remains. It is a normal close from soft-liquidation, with no third party."
      : `Hard liquidation needs health below 0. Health falls as the price moves down through the bands, as interest adds to the debt, and with each loss on the AMM's sales. Anyone may then liquidate the position, in full or in part: the position's converted tokens go toward the debt, the liquidator pays the rest and receives the collateral, and any converted tokens above the debt. The owner receives nothing and keeps what they borrowed. ${anyHealth}`,
    extraParagraphs: [
      "Soft-liquidation comes first: while the oracle price is inside the position's bands, the AMM sells its collateral for the borrowed token as the price falls and buys it back as the price rises, with no event and no liquidator. The swap reverses; the losses do not. The converted amount can be read from the chain up to the liquidating block.",
      "The market logs a repay alongside every liquidation with the same amounts; the timeline shows the pair as one liquidation event.",
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

export function llamalendEventFallbackContent(): LearnMoreContent {
  return {
    title: "How LlamaLend Positions Work",
    intro:
      "LlamaLend is Curve's lending system. A position is one borrower in one market; each market is isolated, and its collateral sits in an AMM across a range of price bands, so liquidation is a range the price moves through.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Soft-liquidation is a state",
        text: "inside the bands the AMM converts collateral to the borrowed token, and back as the price recovers; each round trip loses a little collateral. The converted amount appears in no event; it is read from the chain.",
      },
      {
        bold: "Hard liquidation is an event",
        text: "once health goes negative, a liquidation clears the debt, in full or in part, and takes the balances it covers.",
      },
      {
        bold: "Most markets borrow crvUSD",
        text: "a $-pegged stable, so those markets' figures read as dollars; a few markets borrow WETH, tBTC or other tokens and stay in their own units.",
      },
    ],
    links: [{ label: "Curve lending docs", url: LLAMALEND_DOC_URL }],
  };
}

// ── f(x) Protocol V2 ─────────────────────────────────────────────────────────
// Leveraged xPOSITIONs against wstETH/WBTC, minting fxUSD. Positions live as
// shares in a tick tree; funding and socialized rebalances reshape them with
// no per-position events — the explorer's settled lane (the pool's own
// getPosition view) carries current state, and these explainers say why.

// docs.fx.aladdin.club stopped resolving (checked 2026-08-09); the protocol's
// docs live on its GitBook now.
const FX_DOC_URL = "https://fxprotocol.gitbook.io/fx-docs";

export function fxOperateContent(kind: "open" | "reopen" | "adjust" | "close"): LearnMoreContent {
  const intro =
    kind === "open" || kind === "reopen"
      ? "Opening a position deposits collateral into one of f(x)'s pools (wstETH or WBTC) and mints fxUSD debt against it, creating a leveraged long held as an ERC-721 position NFT."
      : kind === "close"
        ? "Closing repays the position's remaining fxUSD debt and withdraws its collateral, emptying the position. The final repay amount settles whatever the debt really was at that block — including every socialized adjustment accrued since the last touch."
        : "Adjusting moves a position's collateral and/or fxUSD debt in one operation: deposits, withdrawals, borrows and repays are one call to the pool manager with a signed amount for each side.";
  return {
    title:
      kind === "open" || kind === "reopen"
        ? "How Opening Works"
        : kind === "close"
          ? "How Closing Works"
          : "How Adjusting Works",
    intro,
    ...(kind === "reopen"
      ? {
          extraParagraphs: [
            "Closing or liquidating a position empties it but does not burn the NFT: the owner keeps it, and the pool still records them as its holder. A later deposit to the same id funds it again, as a new loan on the same NFT. The timeline numbers the loans, and this row starts the next one; nothing from the previous loan carries into it.",
          ],
        }
      : {}),
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are tick-tree shares",
        text: "a position's stored value is a share count in the pool's tick tree, not a fixed amount; the pool converts the shares through its tick and its debt and collateral indexes into the collateral and debt at any block.",
      },
      {
        bold: "Funding costs",
        text: "leverage is financed through Aave: the pool passes Aave's borrow rate through as a continuous funding charge on collateral, with no per-position event — it simply shows up in the settled reading.",
      },
      {
        bold: "Two unit systems",
        text: "operation amounts are in the collateral token as transferred (wstETH / WBTC); the pool's settled amounts are rate-normalized (stETH-equivalent for the wstETH pool). The receipts name which is which.",
      },
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

/** `expenseRatio`: the manager's share of each bonus at the latest read of
 *  the pool's terms (/api/chain/fx/terms); unread, the sentence names no
 *  figure. */
export function fxLiquidationContent(expenseRatio?: number | null): LearnMoreContent {
  return {
    title: "How Liquidations & Rebalances Work",
    intro:
      "f(x) positions sit in ticks: buckets of positions with nearly the same debt ratio. When a tick's debt ratio reaches the pool's rebalance line, a keeper can rebalance it; when it reaches the higher liquidation line, a keeper can liquidate. The pool judges both at the oracle's min price, which is at or below the anchor price the rows' ratios are read at. Keepers are any address that calls the manager; they are paid by the bonus. Since March 2025 a liquidation runs from the pool's top tick down, and the manager logs one event for the whole run; a rebalance can target one tick or run the same way.",
    extraParagraphs: [
      "A rebalance repays part of the tick's fxUSD debt and takes collateral worth that debt plus the rebalance bonus, bringing the tick back to the rebalance line. Every position in the tick loses collateral and debt in proportion and stays open. The position has no event of its own for it; the timeline places the rebalance on its history and reads the position before and after.",
      "A liquidation repays the position's debt and takes collateral worth it plus the liquidation bonus. Collateral beyond that stays in the position for the owner. When the collateral cannot cover the debt and the bonus, the liquidator takes all of it, and the debt it did not cover is added to every other position in the pool through the pool's debt index.",
      `Of each bonus the protocol keeps a share${expenseRatio != null ? `, ${Math.round(expenseRatio * 100)}% at the latest read` : ""}, so the collateral the keeper receives is less than what the position lost. The owner keeps the fxUSD they borrowed.`,
      "A redemption is the third way a position changes without its owner: anyone may pay fxUSD into the manager for collateral at the oracle's max price, taken from the highest-ratio ticks first, at most 20% of a tick per pass. Today the manager opens it only while fxUSD trades below its peg; six redemptions have run, all on the wstETH pool in March 2025.",
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

export function fxTransferContent(): LearnMoreContent {
  return {
    title: "How Position Ownership Works",
    intro:
      "f(x) V2 positions are ERC-721 tokens minted by the pool contract — the pool is the NFT. Holding the token is owning the position: only the account holding it when the manager is called can withdraw collateral or borrow against it (anyone may add collateral or repay), and it transfers like any NFT. A contract the holder approves, such as f(x)'s router or limit-order manager, can hold it for one transaction and hand it back.",
    extraParagraphs: [
      "A Transfer log moves only the holder record — the position's collateral, debt and tick are untouched. The explorer replays these logs into ownership eras, so each historic event is judged against the owner in force at its block, not the current holder.",
      "The mint (a transfer from the zero address) is the position's birth record. A handful of positions were minted by a path that logs no deposit or borrow; for those, the mint is the only dated record of their creation, and the pool's current reading is all there is of their state.",
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

export function fxEventFallbackContent(): LearnMoreContent {
  return {
    title: "How f(x) Positions Work",
    intro:
      "f(x) V2 splits yield-bearing collateral into fxUSD (a stable token) and leveraged long positions. A position deposits wstETH or WBTC, mints fxUSD against it, and pays a funding rate that follows Aave's borrow rate.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The tick tree",
        text: "positions are grouped by debt ratio into ticks; protocol-level rebalances and redemptions operate on whole ticks at once, socializing the adjustment across every position inside.",
      },
      {
        bold: "Settled state",
        text: "because changes shared across a tick log no event for the position, current collateral and debt are read from the pool contract, with the same arithmetic the protocol uses, at a named block.",
      },
      {
        bold: "fxUSD",
        text: "the debt token positions mint; its peg is defended by the rebalance machinery and the stability pool, and the explorer renders amounts in fxUSD, not assumed dollars.",
      },
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}

// ── Morpho — the vault-exposure modal (the event and position modals are in
// content/morpho/event-prose.yaml) ────────────────────────────────────────

const MORPHO_DOC_URLS = {
  OVERVIEW: "https://docs.morpho.org/",
  MARKET: "https://docs.morpho.org/learn/concepts/market/",
  VAULT: "https://docs.morpho.org/learn/concepts/vault/",
} as const;

/** What the vault-exposure lookup on /base/morpho/vaults/<vault> computes, and —
 *  the reason this modal exists — what it does NOT. The page's central figure is
 *  an attribution, and an attribution presented without its own definition reads
 *  as a statement about where one depositor's money went. It is not one. */
export function morphoVaultExposureContent(): LearnMoreContent {
  return {
    title: "About attributed exposure",
    intro:
      "A MetaMorpho vault pools its depositors' assets and a curator allocates the pool across Morpho Blue markets. This page takes one address's share of the vault and applies it to each market the vault supplies, at one block read from chain.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Proportional, not fund-tracing",
        text: "vault shares are fungible and the deposits were pooled before the curator allocated them, so no on-chain fact ties a particular deposit to a particular market. Two addresses holding equal shares carry equal figures here, whatever they deposited and whenever.",
      },
      {
        bold: "What each row is",
        text: "the address's shares over the vault's total shares, applied to the assets the vault's own supply position in that market converts to, floored to whole units of the asset.",
      },
      {
        bold: "Two readings of the same holdings",
        text: "the vault's own total extrapolates each market's interest to the block's timestamp; the market totals the rows are built from are what Morpho Blue last settled, because Blue accrues only when a market is touched. The difference between them is stated on the page as its own figure.",
      },
      {
        bold: "One block",
        text: "every figure is read at the block the page names. A share balance, a curator's allocation and a market's totals all move; nothing here is a running total or a projection past that block.",
      },
      {
        bold: "What the address is",
        text: "the page reads the address's own code at the same block and states what it found: no code at all (an externally owned account), a Safe, an ERC-4626 vault, or a proxy to another contract, whose address is printed. A contract holding shares holds them for its own holders, and the figures are attributed to the address either way.",
      },
      {
        bold: "An address is not a person",
        text: "a computed stake belongs to an address. Nothing on this page identifies who controls it unless the address carries a name of its own.",
      },
    ],
    links: [
      { label: "docs.morpho.org — Vaults", url: MORPHO_DOC_URLS.VAULT },
      { label: "docs.morpho.org — Markets", url: MORPHO_DOC_URLS.MARKET },
      { label: "docs.morpho.org — Overview", url: MORPHO_DOC_URLS.OVERVIEW },
    ],
  };
}

// ── MakerDAO (MCD vaults) ─────────────────────────────────────────────────────
// Every URL verified live 2026-07-14 (the docs kept the makerdao.com domain
// through the Sky rebrand; re-verify on the next touch).

const MAKER_DOCS = {
  VAT: "https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation",
  RATES: "https://docs.makerdao.com/smart-contract-modules/rates-module",
  LIQUIDATIONS: "https://docs.makerdao.com/smart-contract-modules/dog-and-clipper-detailed-documentation",
  OVERVIEW: "https://docs.makerdao.com/",
} as const;

/** The act a Maker vault row performs, for its "?" modal. */
export type MakerVaultAct =
  | "open"
  | "deposit"
  | "withdraw"
  | "generate"
  | "repay"
  | "adjust"
  | "returned"
  | "ownership";

/** Where the on-chain names go: one closing paragraph, so the modal's body
 *  stays in plain terms. */
const MAKER_FROB_SOURCE =
  "On chain every one of these acts is one call to the Vat, frob, which carries a change to the collateral (dink) and a change to the debt (dart); the debt is stored divided by the rate accumulator (art).";

export function makerdaoVaultContent(
  kind: MakerVaultAct = "adjust",
  opts: { debtSym?: string; ilk?: string } = {},
): LearnMoreContent {
  // DAI on CdpManager vaults, USDS on LockStake urns.
  const d = opts.debtSym ?? "DAI";
  const links = [
    { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
    { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
    { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
  ];
  switch (kind) {
    case "open":
      return {
        title: "How Opening a Maker Vault Works",
        intro: `A vault holds one type of collateral (${opts.ilk ? `this vault's type is ${opts.ilk}` : "ETH-A, ETH-C and WSTETH-B are types"}, each with its own terms) and lets its owner draw ${d} against it. Opening one is usually a deposit and a first draw in the same transaction.`,
        stepsHeading: "What to watch from the start:",
        steps: [
          "The collateral ratio: the collateral's value divided by the debt. It must stay above the type's minimum; below it the vault can be liquidated.",
          "The price it is judged at: Maker's oracle price, which lags the market by an hour, so a sharp fall reaches the vault an hour later.",
          "The stability fee: a yearly rate that governance sets for the type and can change at any time. It is added to the debt continuously; nothing is billed.",
          "The minimum debt: a vault that owes anything must owe at least the type's floor.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links,
      };
    case "deposit":
      return {
        title: "How Depositing Collateral Works",
        intro: `A deposit locks more collateral in the vault. It raises the collateral ratio, which lowers the price at which the vault could be liquidated and leaves room to draw more ${d}.`,
        stepsHeading: "What it changes:",
        steps: [
          "Nothing is charged for a deposit, and the debt does not change.",
          "The added value counts at Maker's oracle price at the time, so the same deposit buys more room when the price is high.",
          "Anyone can add collateral to a vault directly at the Vat; through the CDP manager the owner has to have authorised them first.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links,
      };
    case "withdraw":
      return {
        title: "How Withdrawing Collateral Works",
        intro:
          "A withdrawal takes collateral out of the vault. It lowers the collateral ratio, so Maker only allows it while the vault stays above its type's minimum at the oracle price.",
        stepsHeading: "What it changes:",
        steps: [
          "A vault with debt can release only the collateral above what the minimum ratio needs; the rest stays locked until the debt is repaid.",
          "A vault with no debt can withdraw everything, which leaves it empty. The vault number stays with its owner and can take a new deposit later.",
          "Only the owner, or an address the owner authorised, can take collateral out.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links,
      };
    case "generate":
      return {
        title: `How Drawing ${d} Works`,
        intro: `Drawing (generating) ${d} mints new ${d} to the owner and adds it to the vault's debt. It lowers the collateral ratio, and Maker refuses a draw that would take the vault under its type's minimum.`,
        stepsHeading: "What it changes:",
        steps: [
          "The debt grows by the amount drawn, and from then on by the stability fee on it, until it is repaid.",
          "The fee is not a separate bill: it is added to the debt continuously, so repaying costs more than was drawn.",
          "The fee reaches the debt in lumps: Maker adds it when someone updates the collateral type's rate (a call to Jug.drip). A draw or a repayment makes that call first, a deposit or a withdrawal does not, so the fee a row shows since the previous event can include fee that built up before it.",
          "After a draw the debt must be at least the type's minimum debt.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links,
      };
    case "repay":
      return {
        title: `How Repaying ${d} Works`,
        intro: `Repaying returns ${d} to the vault, which burns it and reduces the debt. It raises the collateral ratio and frees collateral to withdraw.`,
        stepsHeading: "What it changes:",
        steps: [
          `The ${d} owed includes the stability fee added since the draws, so clearing a debt takes more ${d} than was drawn.`,
          `Maker keeps one debt figure. This page splits it into principal (${d} drawn less ${d} repaid) and fee (the rest), so a repayment counts against principal first and against fee only once principal reaches zero.`,
          "A repayment must leave either no debt or at least the type's minimum debt; a smaller remainder is refused.",
          "Anyone can repay a vault's debt directly at the Vat; the collateral stays the owner's.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links,
      };
    case "ownership":
      return {
        title: "How Vault Ownership Works",
        intro:
          "Every vault opened through Maker's CDP manager has a number (the cdp id) and an owner recorded against it. Handing a vault to another address, a give, changes that record and nothing else: the collateral and the debt stay where they are.",
        stepsHeading: "Who the owner is:",
        steps: [
          "The recorded owner is usually a DSProxy, a small contract wallet each user deploys once and controls from their own address. The page names the address behind the proxy as the owner.",
          "The CDP manager makes whoever opens a vault its owner, so a contract that opens a vault for someone gives it to them in the same transaction.",
          "Some tools hold a vault in a contract for part of a transaction (a migration contract, an automation account) and hand it on or back before the transaction ends.",
          "Only the owner, or an address the owner allowed on this vault, can give it away.",
        ],
        detailsHeading: "What the owner can do:",
        details: [
          { bold: "Borrow and withdraw", text: `draw ${d} and take collateral out, within the minimum ratio.` },
          {
            bold: "Allow others",
            text: "let another address act on the vault, and withdraw that permission at any time.",
          },
          { bold: "Give", text: "hand the vault, with its collateral and debt, to another address." },
        ],
        links: [
          { label: "CDP manager source (dss-cdp-manager)", url: "https://github.com/makerdao/dss-cdp-manager" },
          { label: "DSProxy source (ds-proxy)", url: "https://github.com/dapphub/ds-proxy" },
          { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
        ],
      };
    case "returned":
      return {
        title: "How Auction Leftovers Come Back",
        intro:
          "When a liquidation auction has raised the debt and the penalty, it stops selling and sends the collateral left over back to the vault's address. It arrives as free collateral, outside the vault's balance.",
        stepsHeading: "How the owner takes it:",
        steps: [
          "The owner moves the returned collateral into the vault and then out again to their own address; the two steps show as a deposit and a withdrawal.",
          "It is the owner's own collateral coming back, so it adds nothing to what they put in.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links: [
          { label: "Liquidations 2.0 (Dog & Clipper)", url: MAKER_DOCS.LIQUIDATIONS },
          { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
        ],
      };
    default:
      return {
        title: "How Maker Vault Adjustments Work",
        intro: `A vault can take collateral in or out and draw or repay ${d}, one or several of these at once. Adding collateral or repaying raises the collateral ratio; withdrawing or drawing lowers it.`,
        stepsHeading: "The rules every change meets:",
        steps: [
          "The vault must stay above its type's minimum collateral ratio at Maker's oracle price, unless the change only adds collateral or repays.",
          "The debt includes the stability fee added since the draws.",
          "The fee reaches the debt in lumps: Maker adds it when someone updates the collateral type's rate (a call to Jug.drip). A draw or a repayment makes that call first, a deposit or a withdrawal does not, so the fee a row shows since the previous event can include fee that built up before it.",
          "A vault's debt is either zero or at least the type's minimum debt.",
        ],
        extraParagraphs: [MAKER_FROB_SOURCE],
        links,
      };
  }
}

export function makerdaoLiquidationContent(): LearnMoreContent {
  return {
    title: "How Maker Liquidations Work",
    intro:
      "When a vault's collateral value falls below its ilk's liquidation ratio (mat), anyone can trigger a liquidation (Dog.bark). The Vat seizes the vault's collateral and debt in one operation — grab — and the collateral is auctioned for DAI.",
    stepsHeading: "What happens to the vault:",
    steps: [
      "The grab removes the seized collateral (dink < 0) and the seized normalized debt (dart < 0) from the urn in one step.",
      "The seized collateral goes to a Dutch auction (Clipper); proceeds cover the debt plus a liquidation penalty.",
      "Once the auction has raised the debt plus the penalty it stops, and the collateral left over goes back to the vault's address, where the owner can take it; a shortfall becomes system bad debt handled by the protocol's buffer.",
      "The vault itself survives — a partially liquidated vault can be topped up and used again.",
    ],
    extraParagraphs: [
      "The price Maker acts on is the OSM price — delayed by one hour by design, so vault owners always have a window to react before a price move becomes liquidatable.",
    ],
    links: [
      { label: "Liquidations 2.0 (Dog & Clipper)", url: MAKER_DOCS.LIQUIDATIONS },
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
    ],
  };
}

// ── Fluid (Instadapp) ─────────────────────────────────────────────────────────
// Vault positions as factory-minted NFTs, one vault per (collateral, debt)
// pair. ONE composite operate event moves either or both legs; liquidations
// sweep price-band ticks with NO position id on the event — the explorer's
// attribution rows recover each position's exact impact from the vault's own
// settlement views, and these explainers say why that is trustworthy.

const FLUID_DOC_URL = "https://docs.fluid.io";

export function fluidOperateContent(kind: "deposit" | "borrow" | "composite"): LearnMoreContent {
  const intro =
    kind === "deposit"
      ? "A deposit adds collateral to a Fluid position and a withdrawal takes it out; the collateral is what the position borrows against. Anyone can add collateral to any position, but only the holder of the position's NFT can withdraw."
      : kind === "borrow"
        ? "A borrow draws the vault's debt token against the position's collateral and a repay pays it back; the debt grows with interest until it is repaid. Anyone can repay a position's debt, but only the holder of its NFT can borrow more."
        : "One Fluid operation can move a position's collateral and its debt together, such as depositing and borrowing in a single step. Each side is recorded as its own signed amount.";
  return {
    title:
      kind === "deposit"
        ? "How Collateral Moves Work"
        : kind === "borrow"
          ? "How Debt Moves Work"
          : "How Composite Operations Work",
    intro,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are NFTs",
        text: "every Fluid position is an ERC-721 minted by the vault factory — ownership can move wallets, so this explorer keys the timeline by the NFT id and tracks the owner per event.",
      },
      {
        bold: "Signed deltas, one event",
        text: "LogOperate(user, nftId, colAmt, debtAmt, to) is the only action event — positive amounts deposit/borrow, negative amounts withdraw/repay; either leg can be zero.",
      },
      {
        bold: "Interest accrues between events",
        text: "running balances replayed from events exclude interest accrued since the last touch; the position card's settled figures come from the vault's own resolver at the current block.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidLiquidationContent(absorbed: boolean): LearnMoreContent {
  return {
    title: absorbed ? "How Absorption Works" : "How Fluid Liquidations Work",
    intro: absorbed
      ? "When a position sinks past the vault's maximum liquidation limit, the vault takes over its remaining debt and collateral, leaving the position empty. No event of the position's own records it."
      : "When a position's debt grows too large against its collateral, a liquidator repays part of the debt and takes collateral worth a little more in return. Fluid does this for a whole price band of positions at once, so the on-chain event names no single position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The event carries no position id",
        text: "LogLiquidate reports only the totals (collateral seized, debt repaid) for the whole sweep — which positions were hit is not recoverable from any event.",
      },
      {
        bold: "Attribution from the vault's own math",
        text: "these per-position figures come from fetchLatestPosition — the vault contract's own settlement view — read at the blocks before and after the liquidation. The diff IS this position's exact impact, including partial liquidations.",
      },
      {
        bold: "Partial by design",
        text: "a swept position usually keeps most of its collateral and debt — Fluid liquidates only enough to restore the band's health, so 'liquidated' rarely means emptied. A fully liquidated position is flagged explicitly.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidMintContent(): LearnMoreContent {
  return {
    title: "How Opening a Position Works",
    intro:
      "Opening a Fluid position mints an NFT that is the position: it holds one vault's collateral and debt, and whoever holds the NFT controls them.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "One vault, one pair",
        text: "each vault lends one debt token against one collateral token, and a position lives in exactly one vault.",
      },
      {
        bold: "Funded in the same step",
        text: "the vault factory mints the NFT in the same transaction as the position's first deposit or borrow, and the timeline draws the two as one Open row.",
      },
      {
        bold: "What the holder controls",
        text: "only the NFT's holder can withdraw collateral or borrow more; anyone can add collateral or repay debt.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidTransferContent(): LearnMoreContent {
  return {
    title: "How Ownership Transfers Work",
    intro:
      "A Fluid position is an NFT, and transferring the NFT hands the whole position, collateral, debt and liquidation exposure, to the new holder. The balances stay as they were.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Era ownership",
        text: "each timeline event shows the owner AT that event — a position sold mid-life shows its history under the owner who lived it.",
      },
      {
        bold: "Round trips",
        text: "an NFT can leave its holder and come back within one transaction; when it does, the holder at the end is the holder at the start.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

export function fluidEventFallbackContent(): LearnMoreContent {
  return {
    title: "About This Event",
    intro:
      "Every change to a Fluid position is an operation on its vault that moves the collateral, the debt, or both.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Chain-read",
        text: "amounts come from the event log; running balances are the replayed sum of the position's own events plus attributed liquidation impacts.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}

// ─────────────────────────── Maple Finance (syrup pools) ───────────────────────────

const MAPLE_DOC_URL = "https://docs.maple.finance";

export function mapleDepositWithdrawContent(eventType: "deposit" | "withdraw"): LearnMoreContent {
  const depositing = eventType === "deposit";
  return {
    title: depositing ? "How Lending to Maple Works" : "How Withdrawing Works",
    intro: depositing
      ? "Depositing lends an asset into a Maple syrup pool and mints pool shares (an ERC-4626 vault token) in exchange. The pool lends the money onward to Maple's institutional borrowers; the share's value tracks that loan book."
      : "Withdrawing burns pool shares and returns the funds asset at the pool's EXIT rate. In the syrup pools, exits normally travel through the withdrawal queue — a direct withdraw is the final settlement leg of a processed request.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Shares & the exit rate",
        text: "the share is a claim on the pool. The exit rate is what one share pays out on withdrawal, so shares × the exit rate = what a withdrawal pays. It rises as borrowers pay interest, and falls only when the pool delegate, the manager that runs the pool's lending, marks a loan as impaired; a lender who exits while that mark stands takes the loss for good.",
      },
      {
        bold: "Where the money actually is",
        text: "only a small liquid buffer sits in the pool contract (a few percent of the pool; the pool band shows it live). The rest is deployed to loans whose collateral — BTC, ETH, stables — is held by custodians, firms that keep the borrowers' collateral in safekeeping and release it only on the agreed terms (BitGo, Copper, Anchorage, Hex Trust). The chain records the bookkeeping; the collateral itself is not on-chain.",
      },
      {
        bold: "What the chain proves",
        text: "every deposit and withdrawal is self-priced by its own log (assets and shares both emitted), share balances replay exactly from transfers, and the accrual arithmetic is event-anchored. What the chain cannot prove is the loan book's off-chain backing — that rests on Maple's custodians, legal agreements, and third-party attestations.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}

export function mapleQueueContent(
  eventType: "request" | "request_decrease" | "request_cancel" | "request_fill",
): LearnMoreContent {
  return {
    title: "How the Withdrawal Queue Works",
    intro:
      "Syrup-pool withdrawals are queued: a request moves the shares into the queue and takes a place in a first-in, first-out (FIFO) line, paid from the pool's liquid cash. Maple's docs say most withdrawals are processed in under 24 hours and some can take up to 30 days. The page has no record of the pool's cash at past requests, so it cannot say why a given fill waited.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Held in the queue, not paid out",
        text: "requested shares leave the wallet's balance but remain the position's: the queue's contract holds them for the wallet until they are paid out or the request is cancelled. Cancelling (fully or partly) returns them.",
      },
      {
        bold: "Priced at fill time",
        text:
          "a processed request redeems at the exit rate at the moment of processing, not the moment of request — the proceeds arrive in the same transaction that processes it. " +
          (eventType === "request_fill" ? "This event is that fill." : ""),
      },
      {
        bold: "Who processes",
        text: "the pool delegate or Maple's admins process requests as cash allows, earliest first; if the cash does not cover every request, only the earliest are paid and the rest wait. The pool band shows the queue against the pool's liquid cash.",
      },
    ],
    links: [
      { label: "Maple docs: withdrawals", url: `${MAPLE_DOC_URL}/syrupusdc-usdt-usdg-for-lenders/risk` },
      {
        label: "Maple docs: the queue",
        url: `${MAPLE_DOC_URL}/technical-resources/withdrawal-managers/withdrawal-manager-queue`,
      },
    ],
  };
}

export function mapleTransferContent(eventType: "transfer_in" | "transfer_out"): LearnMoreContent {
  return {
    title: "Transferable Pool Shares",
    intro:
      eventType === "transfer_in"
        ? "Syrup-pool shares move between wallets like any token: receiving them moves the pool claim into this wallet with no pool event."
        : "Syrup-pool shares move between wallets like any token: sending them moves the pool claim to another wallet with no pool event.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The claim moves with the token",
        text: "whoever holds the shares holds the claim on the pool, interest included. A wallet can receive them from another lender, or buy them from one.",
      },
      {
        bold: "Interest counts from arrival",
        text: "the wallet paid nothing into the pool for shares it received, so the page starts from what they were worth when they arrived. Their claim now is the shares times the exit rate, and the interest is the rise since arrival.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}

export function mapleEventFallbackContent(): LearnMoreContent {
  return {
    title: "Maple Syrup Pools",
    intro:
      "Maple's syrup pools are ERC-4626 lending vaults over an institutional credit book: deposits mint transferable shares, withdrawals travel a FIFO queue, and the share price is the pool's own on-chain accounting of loans whose collateral is custodied off-chain.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "On-chain bookkeeping, off-chain assets",
        text: "the chain proves what Maple's contracts recorded — principal deployed, a posted interest rate, impairment marks. It cannot prove the custodied collateral behind the loans; that rests on Maple's custodians and attestations.",
      },
      {
        bold: "What lenders control",
        text: "the shares themselves (freely transferable), the withdrawal request, and the queue position. The liquid buffer in the pool bounds what can exit instantly — the pool band shows it live.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}

// ─── Liquity V2 forks (Ebisu / Asymmetry) ─────────────────────────────────────
//
// Shared, parameterized content for the fork explorers: the mechanics are the
// V2 architecture's (user-set interest, rate-ordered redemptions, per-branch
// MCR, batch delegation); what differs — the protocol name, the stablecoin,
// the docs links — is passed in.
//
// Quick Links, as Liquity V2's modals carry them (content/liquity-v2/event-prose.yaml
// `L5`): one link per QUESTION the card raises, not one link for the
// whole protocol. `docsByTopic` carries those, read and verified against
// Ebisu's (ebisu.gitbook.io/ebisu-money) and Asymmetry's (docs.asymmetry.finance)
// own docs sites 2026-09-28 (Miles's OK; read-only) — every URL below resolves.
// A fork with no topic set for a card (Basedollar, whose docs are unread) falls
// back to `docsLink`, the one general link every fork still carries.
export interface LiquityForkLearnMoreParams {
  /** Display name ("Ebisu" | "Asymmetry"). */
  protocolName: string;
  /** The fork's stablecoin ("ebUSD" | "USDaf"). */
  stablecoin: string;
  /** The branch minimum debt, in the stablecoin (MIN_DEBT) — below it a
   *  redeemed Trove is a zombie. */
  minDebt?: number;
  /** One live-verified link (site or docs root) — the fallback below. */
  docsLink?: { label: string; url: string };
  /** Question-level docs links, keyed by the card topic that wants them. */
  docsByTopic?: {
    trove?: { label: string; url: string }[];
    open?: { label: string; url: string }[];
    adjust?: { label: string; url: string }[];
    close?: { label: string; url: string }[];
    rate?: { label: string; url: string }[];
    redemption?: { label: string; url: string }[];
    liquidation?: { label: string; url: string }[];
    batch?: { label: string; url: string }[];
  };
}

const forkLinks = (
  p: LiquityForkLearnMoreParams,
  topic?: keyof NonNullable<LiquityForkLearnMoreParams["docsByTopic"]>,
) => {
  const byTopic = topic ? p.docsByTopic?.[topic] : undefined;
  if (byTopic && byTopic.length > 0) return byTopic;
  return p.docsLink ? [p.docsLink] : undefined;
};

export function liquityForkBorrowingContent(
  p: LiquityForkLearnMoreParams,
  eventType: "openTrove" | "adjustTrove" | "closeTrove" = "adjustTrove",
): LearnMoreContent {
  const Art = indefiniteArticle(p.protocolName);
  const art = Art === "An" ? "an" : "a";

  if (eventType === "openTrove") {
    return {
      title: "How Opening a Trove Works",
      intro: `${Art} ${p.protocolName} Trove holds one branch's collateral and mints ${p.stablecoin} against it, at an interest rate the borrower sets themselves — the Liquity V2 architecture. Interest accrues continuously into the debt from the moment the Trove opens.`,
      stepsHeading: "The mechanics:",
      steps: [
        "Each collateral branch is its own market with its own minimum collateral ratio — below it, anyone can liquidate the Trove.",
        `The chosen interest rate is also the Trove's place in the redemption queue: redemptions sweep the LOWEST rates first, so a higher rate buys ${p.stablecoin} peg protection at a carrying cost.`,
        `Drawing ${p.stablecoin} pays an upfront fee (a week of average branch interest) added straight to the debt, and a fixed liquidation reserve is set aside apart from the collateral.`,
      ],
      links: forkLinks(p, "open"),
    };
  }

  if (eventType === "closeTrove") {
    return {
      title: "How Closing a Trove Works",
      intro: `Closing ${art} ${p.protocolName} Trove repays its debt in full and hands the collateral back to the owner — the Trove's last act.`,
      stepsHeading: "The mechanics:",
      steps: [
        "The owner repays the entire outstanding debt, interest included — there is no partial close.",
        "All remaining collateral, plus the liquidation reserve set aside when the Trove opened, returns to the owner.",
        "The Trove NFT is burned: the position stops accruing interest and drops out of the redemption queue for good.",
      ],
      links: forkLinks(p, "close"),
    };
  }

  return {
    title: "How Trove Adjustments Work",
    intro: `An adjustment changes ${art} ${p.protocolName} Trove's collateral or debt without closing it — adding or withdrawing collateral, drawing more ${p.stablecoin}, or repaying some of what's owed.`,
    stepsHeading: "The mechanics:",
    steps: [
      "The collateral ratio moves with whichever side changed; it must stay above the branch's minimum or the adjustment reverts.",
      `Drawing new ${p.stablecoin} pays the same upfront fee opening one does (a week of average branch interest); repaying does not.`,
      "The interest rate itself is untouched by an adjustment — changing it is its own, separate action.",
    ],
    links: forkLinks(p, "adjust"),
  };
}

export function liquityForkRateContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How the User-Set Interest Rate Works",
    intro: `${p.protocolName} borrowers set their own annual interest rate (the V2 model). Interest accrues continuously into the debt — the emitted figure grows between events — and the rate doubles as the Trove's redemption-queue position.`,
    stepsHeading: "What the rate controls:",
    steps: [
      "Carrying cost: interest accrues on the debt at the chosen annual rate, second by second.",
      `Redemption order: when ${p.stablecoin} trades below $1, holders redeem it against the system at face value, sweeping the lowest-rate Troves first. A higher rate pushes the Trove later in that queue.`,
      "Adjusting the rate shortly after the last adjustment pays an upfront fee (rate-change spam protection); otherwise it is free.",
    ],
    links: forkLinks(p, "rate"),
  };
}

export function liquityForkRedemptionContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Redemptions Work",
    intro: `Any ${p.stablecoin} holder can redeem it against the system at $1 face value — the peg mechanism. Redemptions are routed across branches by their unbacked portions and, within a branch, sweep the LOWEST user-set interest rates first (not the lowest collateral ratio — the V1 difference).`,
    stepsHeading: "What happens to a redeemed Trove:",
    steps: [
      "It gives up collateral at the branch oracle price and sheds exactly the same value of debt — net value is preserved.",
      "Its collateral ratio RISES as a result.",
      `A partial redemption that leaves the Trove below the minimum debt makes it a "zombie": outside the rate-ordered queue, redeemed first the next time redemptions route through the branch.`,
    ],
    links: forkLinks(p, "redemption"),
  };
}

export function liquityForkLiquidationContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Liquidations Work",
    intro: `A Trove whose collateral ratio falls below its branch minimum — at the branch's own oracle price — can be liquidated by anyone. The debt is absorbed by the branch's Stability Pool (${p.stablecoin} deposits), or redistributed to the branch's other Troves when the pool runs short.`,
    stepsHeading: "The mechanics:",
    steps: [
      "Liquidation closes the whole Trove — collateral is seized, debt cleared.",
      "Stability Pool depositors buy the collateral at a discount; redistributed portions land on other Troves as pending gains (collateral AND debt), settled on their next touch.",
      "The Stability Pool and the other Troves take collateral worth at most the debt plus the branch's liquidation penalty. Any collateral above that is the owner's surplus, credited to them in the branch's CollSurplusPool to claim.",
      "Each branch sets its own minimum ratio, so the same price move can liquidate one branch's Troves and not another's.",
    ],
    links: forkLinks(p, "liquidation"),
  };
}

export function liquityForkBatchContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: "How Interest-Rate Batches Work",
    intro: `A Trove can delegate its interest rate to a batch manager (the V2 delegation model): the manager sets one rate for every Trove in the batch, adjusting it as market conditions move — active peg management without the owner touching the Trove.`,
    stepsHeading: "What batching changes:",
    steps: [
      "The batch manager (within owner-approved bounds) controls the rate — and with it the batch's redemption-queue position.",
      `A batched Trove's debt is tracked as a share of the batch total, so the exact ${p.stablecoin} figure is derived from batch shares.`,
      "Leaving the batch returns the rate to self-management.",
    ],
    links: forkLinks(p, "batch"),
  };
}

export function liquityForkEventFallbackContent(p: LiquityForkLearnMoreParams): LearnMoreContent {
  return {
    title: `How ${p.protocolName} Troves Work`,
    intro: `${p.protocolName} runs the Liquity V2 architecture: per-branch Troves minting ${p.stablecoin} at a user-set interest rate, redemptions at $1 face sweeping the lowest rates first, per-branch minimum collateral ratios, and Stability Pools absorbing liquidations.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Per-Trove interest",
        // The never-empty floor: this modal backs any event the explainer has
        // no specific mechanic for, on a Trove that may well be batched. A
        // batched Trove's rate is its manager's, so the rate's author is
        // stated as either route rather than asserted to be the borrower.
        text: "each Trove carries its own annual rate — set by the borrower, or by the interest-batch manager the borrower delegates to; interest accrues continuously into the debt, and the rate doubles as the redemption-queue position.",
      },
      {
        bold: "Per-branch risk",
        text: "every collateral branch has its own TroveManager, oracle and minimum collateral ratio — one branch's stress does not liquidate another's Troves.",
      },
      {
        bold: "Redemption queue",
        text: `${p.stablecoin} holders can redeem at $1 face against the lowest-rate Troves — a peg mechanism, not a penalty.`,
      },
    ],
    links: forkLinks(p, "trove"),
  };
}

// ── PWN ──────────────────────────────────────────────────────────────────────
// Peer-to-peer fixed-term loans: two parties strike every term at origination
// (no oracle, no health factor), the SimpleLoan contract escrows the
// collateral, and the LOAN note (an ERC-721) is the lender's transferable
// claim. A loan that expires unpaid defaults by the clock — the lender claims
// the collateral; nothing is liquidated.

const PWN_DOC_URL = "https://docs.pwn.xyz";

/** `accruing`: the loan's terms state interest as a yearly rate (SimpleLoan
 *  v1.2/v1.3), so nothing about its total is fixed at origination. */
export function pwnLoanCreatedContent(accruing = false): LearnMoreContent {
  return {
    title: "How a PWN Loan Is Struck",
    intro: accruing
      ? "PWN loans are peer-to-peer on terms the two parties agree: the collateral, the credit, the interest rate and the deadline — no pool, no oracle, no floating rate. The SimpleLoan contract records those terms on-chain and enforces them."
      : "PWN loans are peer-to-peer on fixed terms: the lender and borrower agree the collateral, the credit, the repayment total and the deadline between themselves — no pool, no oracle, no floating rate. The SimpleLoan contract records those terms on-chain and enforces them.",
    stepsHeading: "What happens at origination:",
    steps: [
      "The borrower's collateral (an ERC-20 amount, an NFT, or a PWN Token Bundler wrapping several assets into one) is transferred into the loan contract's escrow.",
      accruing
        ? "The lender's credit is transferred to the borrower, and the yearly interest rate plus the deadline are locked into the loan's terms."
        : "The lender's credit is transferred to the borrower, and the fixed repayment total (principal + fixed interest) plus the deadline are locked into the loan's terms.",
      "A LOAN note — an ERC-721 — is minted to the lender: the transferable claim on this loan's repayment (or, on default, its collateral).",
    ],
    detailsHeading: "Key concepts:",
    details: [
      accruing
        ? {
            bold: "Interest by the minute",
            text: "the rate is fixed; the interest is the principal times that rate for each whole minute from origination to repayment, so the total is known when the borrower repays.",
          }
        : {
            bold: "Fixed by construction",
            text: "nothing accrues and nothing floats — the repayment owed on the last day is the number struck on the first.",
          },
      {
        bold: "The parties set the price",
        text: "there is no protocol oracle and no health factor; whether the terms are fair is the parties' own judgment, made when they signed.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnNoteLifecycleContent(eventType: "minted" | "burned"): LearnMoreContent {
  const minted = eventType === "minted";
  return {
    title: minted ? "How the LOAN Note Works" : "How a Loan Is Retired",
    intro: minted
      ? "The LOAN note is an ERC-721 minted to the lender when the loan is struck. Whoever holds it is entitled to the loan's repayment — or, if the borrower defaults, to the escrowed collateral."
      : "Burning the LOAN note is the loan's final act: the claim it represented has been settled — repayment collected or collateral claimed — and the note is retired on-chain.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "A transferable claim",
        text: "the note is an ordinary NFT — the lender can sell or move the claim while the loan runs, and the loan pays out to whoever holds the note at settlement.",
      },
      {
        bold: "One note per loan",
        text: "the note's token id IS the loan id: one discrete loan, one claim, one holder at a time.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnRepaymentContent(eventType: "paid_back" | "claimed", accruing = false): LearnMoreContent {
  const paying = eventType === "paid_back";
  return {
    title: paying ? "How Repayment Works" : "How Claiming Works",
    intro: paying
      ? accruing
        ? "The borrower repays the principal plus the interest accrued to that minute, in the credit token. Repaying before the deadline releases the escrowed collateral back to the borrower."
        : "The borrower repays the fixed total struck at origination — principal plus fixed interest, in the credit token. Repaying before the deadline releases the escrowed collateral back to the borrower."
      : "Claiming is the note holder collecting what the loan settled to: the repayment if the borrower paid, or the escrowed collateral if the loan defaulted. Claiming burns the LOAN note.",
    detailsHeading: "Key concepts:",
    details: [
      accruing
        ? {
            bold: "The rate was agreed, the total follows the clock",
            text: "interest is the principal times the terms' yearly rate for each whole minute the loan ran. The deadline is the last minute to repay: the contract refuses a repayment after it, so the interest never runs past it.",
          }
        : {
            bold: "The amount was never in question",
            text: "the repayment total is a term of the loan, fixed when it was struck — it does not change with the day it is paid. The contract refuses a repayment once the deadline has passed; only an extension moves that deadline.",
          },
      {
        bold: "Escrow does the settling",
        text: accruing
          ? "the loan contract passes the repayment straight to the note holder when it can, in the same transaction; otherwise it holds it until the holder claims."
          : "the loan contract holds the repayment until the note holder claims it — the two legs (borrower pays in, lender collects) are usually separate transactions.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnDefaultContent(): LearnMoreContent {
  return {
    title: "How a PWN Default Works",
    intro:
      "A PWN default is a clock event, not a price event. If the deadline passes with the loan unpaid, the lender claims the escrowed collateral in place of the repayment — that is the whole mechanism.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Nothing is liquidated",
        text: "no oracle watched the collateral's value, no liquidator was involved and no auction ran — the loan simply expired, and the escrow changed hands as the terms always said it would.",
      },
      {
        bold: "The risk was priced at origination",
        text: "the lender accepted this collateral against this credit knowing default hands them the collateral; whether that trade was good is decided by the parties.",
      },
      {
        bold: "Defaults are visible in advance",
        text: "the deadline is an on-chain term from day one — a loan's path to default is public the whole way.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnExtensionContent(): LearnMoreContent {
  return {
    title: "How Loan Extensions Work",
    intro:
      "An extension moves a loan's deadline later, giving the borrower more time to repay under the same terms. How it is agreed depends on the loan contract's version.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Terms otherwise unchanged",
        text: "the collateral, the credit and the repayment total stay exactly as struck — only the clock moves.",
      },
      {
        bold: "Version 1.1: the note holder acts alone",
        text: "only the holder of the LOAN note can extend, to a date at most 30 days after the day it acts, and it can do so again. Nothing is paid for it. It can extend a loan whose deadline has already passed, as long as nobody has claimed it.",
      },
      {
        bold: "Versions 1.2 and 1.3: a proposal",
        text: "one party proposes an extension of 1 to 90 days and the other accepts it; the proposal can carry a compensation the borrower pays the note holder.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

export function pwnEventFallbackContent(): LearnMoreContent {
  return {
    title: "How PWN Loans Work",
    intro:
      "PWN is a peer-to-peer lending protocol for fixed-term loans: two parties strike every term at origination, the SimpleLoan contract escrows the collateral, and an ERC-721 LOAN note carries the lender's claim.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Fixed terms",
        text: "principal, interest and deadline are set when the loan is struck — a total on the oldest contract, a yearly rate that accrues by the minute on the newer two; nothing floats and no oracle is consulted.",
      },
      {
        bold: "Escrowed collateral",
        text: "the borrower's collateral sits with the loan contract for the loan's life — released on repayment, claimed by the lender on default.",
      },
      {
        bold: "The LOAN note",
        text: "the lender's claim is a transferable NFT whose token id is the loan id — the loan settles to whoever holds it.",
      },
    ],
    links: [{ label: "PWN docs", url: PWN_DOC_URL }],
  };
}

// ── Frankencoin (ZCHF) ───────────────────────────────────────────────────────
// One modal per kind of event, each with the docs pages it rests on.

const FRANKENCOIN_DOC_URL = "https://docs.frankencoin.com";
const FC_PAGE = {
  positions: `${FRANKENCOIN_DOC_URL}/positions`,
  open: `${FRANKENCOIN_DOC_URL}/positions/open`,
  clone: `${FRANKENCOIN_DOC_URL}/positions/clone`,
  adjust: `${FRANKENCOIN_DOC_URL}/positions/adjust`,
  auctions: `${FRANKENCOIN_DOC_URL}/positions/auctions`,
  reserve: `${FRANKENCOIN_DOC_URL}/reserve`,
  governance: `${FRANKENCOIN_DOC_URL}/governance`,
  risks: `${FRANKENCOIN_DOC_URL}/risks`,
} as const;
/** One source per claim, each labelled by what it backs up. */
const fcSource = (label: string, page: keyof typeof FC_PAGE): LearnMoreLink => ({ label, url: FC_PAGE[page] });

/** Mint, repay, a combined adjust, a close — the ZCHF side of a position. The
 *  interest rule differs by hub: V1's rate is fixed at opening with a 4-week
 *  minimum (PositionV1.calculateCurrentFee), V2's follows the base rate. */
export function frankencoinMintingContent(hub?: "v1" | "v2"): LearnMoreContent {
  const interest =
    hub === "v1"
      ? "the position's annual rate, fixed when it opened, is charged for the time left to expiry and for at least 4 weeks: a mint in the last 28 days before expiry pays 28 days of interest. It is not returned, and goes to the system reserve as equity, owned by FPS holders. Nothing accrues afterwards, so the debt changes only when the owner mints or repays."
      : "the annual rate in force when the mint is made (the system base rate plus the position's risk premium) is charged for the time left to expiry, and is not returned. It goes to the system reserve as equity, owned by FPS holders. Nothing accrues afterwards, so the debt changes only when the owner mints or repays. The base rate moves with governance, so two mints on one position can pay different rates.";
  return {
    title: "How Minting and Repaying Work",
    intro:
      "A Frankencoin position mints new ZCHF against the collateral it holds; nothing is lent out of a pool. The debt is the gross amount minted, and the owner can mint more, repay, add or withdraw collateral whenever the position's limits allow.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Gross debt",
        text: "a mint adds its whole amount to the debt. The wallet receives it less the position's reserve share and the interest for the remaining term.",
        sources: [fcSource("what a mint pays out", "adjust")],
      },
      {
        bold: "Interest up front",
        text: interest,
        sources: [fcSource("interest on positions", "positions")],
      },
      {
        bold: "Reserve share",
        text: "a percentage set in the terms of the family's original stays in the system reserve against the position's debt; the reserve is the buffer that covers losses from challenge sales. Repaying releases it: in full while the reserve covers every position's share, in proportion when losses have drawn it down.",
        sources: [fcSource("the reserve", "reserve")],
      },
      {
        bold: "The limit",
        text: "the debt may not exceed collateral × the declared liquidation price, and a clone shares its family's minting limit.",
        sources: [fcSource("the minting limit", "clone")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** The system page's minting book: what each count is out of. */
export function frankencoinBookContent(b: {
  total: number;
  v1: number;
  v2: number;
  open: number;
  clones: number;
  denied: number;
  challengesStarted: number;
  challengesSucceeded: number;
  challengedPositions: number;
  forcedSalePositions: number;
}): LearnMoreContent {
  const originals = b.total - b.clones;
  const n = (x: number) => x.toLocaleString("en-US");
  return {
    title: "What the Minting Book Counts",
    intro: `The book is every position Frankencoin's two MintingHubs have opened: ${n(b.total)} of them. Each count below names what it is out of.`,
    detailsHeading: "The counts:",
    details: [
      {
        bold: "Positions ever",
        text: `${n(b.total)} positions, ${n(b.v1)} opened on Hub V1 (2023) and ${n(b.v2)} on Hub V2 (2024).`,
        sources: [fcSource("positions and the hubs", "positions")],
      },
      {
        bold: "Originals and clones",
        text: `${n(b.clones)} of the ${n(b.total)} are clones, which copy an accepted original's terms and share its minting limit. The other ${n(originals)} are originals: each proposed its own terms, paid the opening fee and faced a veto window.`,
        sources: [fcSource("opening an original", "open"), fcSource("cloning a position", "clone")],
      },
      {
        bold: "Open at head",
        text: `${n(b.open)} of the ${n(b.total)} are open now; the others have closed or were denied.`,
        sources: [fcSource("a position's life", "positions")],
      },
      {
        bold: "Denied in the veto window",
        text: `${n(b.denied)} of the ${n(originals)} originals. Only an original can be denied: a clone has no veto window.`,
        sources: [fcSource("the veto", "governance")],
      },
      {
        bold: "Challenges",
        text: `${n(b.challengesStarted)} challenges were started, against ${n(b.challengedPositions)} positions; ${n(b.challengesSucceeded)} of the ${n(b.challengesStarted)} reached a phase-2 sale of position collateral, and the others were averted or are still running.`,
        sources: [fcSource("challenges", "auctions")],
      },
      {
        bold: "Cleared by forced sale",
        text: `${n(b.forcedSalePositions)} positions had collateral bought after expiry through the V2 hub.`,
        sources: [fcSource("expiry and the forced sale", "auctions")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** A declared-price change. */
export function frankencoinPriceContent(): LearnMoreContent {
  return {
    title: "How the Declared Price Works",
    intro:
      "Frankencoin has no price oracle. Each position stores a liquidation price in ZCHF per unit of collateral that its owner declares, and anyone who thinks it too high can challenge it.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "What it limits",
        text: "collateral × the declared price is the most debt the position may carry.",
        sources: [fcSource("the price limit", "adjust")],
      },
      {
        bold: "Lowering",
        text: "applies at once, as long as the debt still fits under the new price.",
        sources: [fcSource("lowering the price", "adjust")],
      },
      {
        bold: "Raising",
        text: "pauses minting and collateral withdrawals for three days, so the new price can be challenged before it backs new ZCHF. Lowering the price again does not end the pause. In a combined adjust the mint runs before the price change, at the old price.",
        sources: [fcSource("the three-day cooldown", "adjust")],
      },
      {
        bold: "Challenges",
        text: "a challenger who thinks the price is too high posts collateral of the same kind and starts a two-phase auction.",
        sources: [fcSource("challenges", "auctions")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** A position's creation — an original, a clone, and the ownership handover
 *  inside the creating transaction. */
export function frankencoinCreationContent(kind: "open" | "clone" | "handover"): LearnMoreContent {
  const handover = {
    bold: "The handover",
    text: "the creating transaction can pass ownership through the MintingHub and a helper contract before it reaches the owner. Each step is its own event; together they are one creation.",
    sources: [fcSource("creating a clone", "clone")],
  };
  return {
    title: "How a Position Is Created",
    intro:
      "Every Frankencoin position is its own contract with its own owner, collateral and debt. It starts either as a new original, which proposes new terms, or as a clone of a position in an accepted family.",
    detailsHeading: "Key concepts:",
    details: [
      ...(kind === "handover" ? [handover] : []),
      {
        bold: "Original",
        text: "proposes its own collateral, price, rate and limits, costs a 1,000 ZCHF opening fee, and waits out a veto window of at least three days before it can mint.",
        sources: [fcSource("opening an original", "open")],
      },
      {
        bold: "Veto",
        text: "in that window, holders of more than 1% of the governance votes (FCS, or the FPS it wraps) can deny the new original.",
        sources: [fcSource("the veto", "governance")],
      },
      {
        bold: "Clone",
        text: "a new position cloned from any position of an accepted family. It starts at that position's declared price and takes the family original's other terms (rate, reserve share, challenge period, an expiry no later than the original's). It skips the veto window, can deposit and mint in the same transaction, and shares the family's minting limit.",
        sources: [fcSource("cloning a position", "clone")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** An ownership transfer after creation. */
export function frankencoinOwnershipContent(): LearnMoreContent {
  return {
    title: "Position Ownership",
    intro:
      "A position is a contract, and its owner is whoever holds it now. Ownership can be transferred like any contract's; the new owner takes over the collateral, the debt and the right to adjust the position.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Only the owner acts",
        text: "minting, repaying, moving collateral and changing the declared price are the owner's alone. A challenge or an expiry sale needs no owner.",
        sources: [fcSource("adjusting a position", "adjust")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

/** A phase-2 sale on the position the modal is opened from, for a worked
 *  example. Structurally the page's FrankencoinSaleExample. */
interface FrankencoinModalSale {
  number: string;
  symbol: string;
  liqPrice: number;
  phase: number;
  startedAt: number;
  soldAt: number;
  bid: number;
  sold: number;
}

const fcNum = (n: number, max = 2, min = 0): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
const fcDays = (seconds: number): string => {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const h = Math.round(seconds / 3600);
  return `${h} h`;
};
const fcMinutes = (seconds: number): string => {
  const m = Math.round(seconds / 60);
  return m >= 120 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export function frankencoinChallengeContent(
  opts: { phase?: number | null; example?: FrankencoinModalSale | null } = {},
): LearnMoreContent {
  const phase = opts.phase ?? null;
  const len = phase != null && phase > 0 ? ` (${fcDays(phase)} on this position)` : "";
  const ex = opts.example ?? null;
  const example: string[] = [];
  if (ex) {
    const into = ex.soldAt - (ex.startedAt + ex.phase);
    const unit = ex.bid / ex.sold;
    example.push(
      `On this position: challenge #${ex.number} ran into phase 2, because nobody bought the challenger's ${ex.symbol} at the declared ${fcNum(ex.liqPrice)} ZCHF per ${ex.symbol} in phase 1's ${fcDays(ex.phase)}. In phase 2 the price fell from ${fcNum(ex.liqPrice)} toward zero over ${fcDays(ex.phase)}; ${fcMinutes(into)} in, it stood at ${fcNum(unit)} ZCHF per ${ex.symbol} (${fcNum((unit / ex.liqPrice) * 100)}% of the declared price), and a bidder bought ${fcNum(ex.sold, 8)} ${ex.symbol} for ${fcNum(ex.bid, 2, 2)} ZCHF. The Challenge Succeeded row shows where that ZCHF went.`,
    );
  }
  return {
    title: "How Frankencoin Challenges Work",
    intro:
      "Frankencoin has no oracle and no liquidation threshold. A challenger who thinks a position's declared price is too high posts collateral of the same kind (not ZCHF) and starts a two-phase auction against it. Each phase lasts the position's challenge period.",
    stepsHeading: "The two phases:",
    steps: [
      `Phase 1, fixed price${len}: the challenger's posted collateral is on offer at the position's declared liquidation price. Anyone can buy it, the owner included. A purchase averts the challenge: the position keeps its collateral and debt, and its minting pauses for one day.`,
      `Phase 2, falling price${len}: if nobody bought, the position's collateral is sold at a price that starts at the declared price and falls in a straight line to zero by the end of the phase. The first bid buys at that moment's price.`,
      "Where the bid goes: 2% of it is the challenger's reward, and the challenger gets back the collateral it posted. The rest repays the debt on the collateral sold. A shortfall is paid from the reserve, first out of the position's reserve share, then from equity; an excess is shared between the reserve, at the position's reserve percentage, and the owner.",
      "One challenge can settle in several slices: each phase-2 bid is its own settlement under the same challenge number, and a position left with collateral stays open.",
    ],
    extraParagraphs: example,
    links: [
      { label: "Challenges and auctions (Frankencoin docs)", url: FC_PAGE.auctions },
      { label: "How the reserve covers losses (Frankencoin docs)", url: FC_PAGE.reserve },
    ],
  };
}

/** A forced sale on the position the modal is opened from, for a worked
 *  example: the receipt's figures and the terms read one block earlier. */
export interface FrankencoinModalForcedSale {
  symbol: string;
  /** Unix seconds. */
  expiration: number;
  /** One challenge period, seconds. */
  period: number;
  soldAt: number;
  /** Price per unit and the declared price, ZCHF. */
  unit: number;
  declared: number | null;
  sold: number;
  cost: number;
  /** The buyer, shortened. */
  buyer: string | null;
  branch: "full" | "partial" | "shortfall" | "noDebt";
  debt: number;
  reserveBack: number;
  owner: number;
  loss: number;
}

const fcDateTime = (unix: number): string => {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/** An expired position's collateral bought through the V2 hub. */
export function frankencoinForcedSaleContent(
  opts: { phase?: number | null; example?: FrankencoinModalForcedSale | null } = {},
): LearnMoreContent {
  const phase = opts.phase ?? null;
  const len = phase != null && phase > 0 ? ` (${fcDays(phase)} on this position)` : "";
  const ex = opts.example ?? null;
  const example: string[] = [];
  if (ex) {
    const since = ex.soldAt - ex.expiration;
    const stage = since <= ex.period ? "first" : since < 2 * ex.period ? "second" : "zero";
    const days = Math.floor(since / 86400);
    const when = since < 86400 * 2 ? fcMinutes(since) : `${days} days`;
    const priceText =
      stage === "zero" || ex.unit === 0
        ? `${when} later, past both periods, the price was zero`
        : `${when} later, in the ${stage} period, the price stood at ${fcNum(ex.unit)} ZCHF per ${ex.symbol}${
            ex.declared ? ` (${fcNum(ex.unit / ex.declared)}× the declared ${fcNum(ex.declared)})` : ""
          }`;
    const money =
      ex.branch === "full"
        ? `${ex.reserveBack > 0 ? `The reserve sent the buyer the position's ${fcNum(ex.reserveBack, 2, 2)} ZCHF reserve share, the ` : "The "}${fcNum(ex.debt, 2, 2)} ZCHF debt was burned from the buyer, and the owner received the other ${fcNum(ex.owner, 2, 2)} ZCHF.`
        : ex.branch === "shortfall"
          ? `The payment fell short of the ${fcNum(ex.debt, 2, 2)} ZCHF debt, so the reserve paid ${fcNum(ex.loss, 2, 2)} ZCHF and the owner received nothing.`
          : ex.branch === "partial"
            ? `The payment repaid ${fcNum(ex.debt, 2, 2)} ZCHF of the debt and the owner received nothing.`
            : ex.cost > 0
              ? `The position had no debt, so the owner received all ${fcNum(ex.owner, 2, 2)} ZCHF.`
              : "The position had no debt, so no ZCHF moved.";
    example.push(
      `On this position: it expired on ${fcDateTime(ex.expiration)}. ${priceText}, and ${ex.buyer ?? "a buyer"} bought ${fcNum(ex.sold, 8)} ${ex.symbol} for ${ex.cost > 0 ? `${fcNum(ex.cost, 2, 2)} ZCHF` : "nothing"}. ${money}`,
    );
  }
  return {
    title: "How a Forced Sale Works",
    intro:
      "Once a Minting Hub V2 position passes its expiration, anyone can buy its collateral through the hub at a price set by the time since expiry. The owner does not need to act, and no challenge is involved.",
    stepsHeading: "The price and the money:",
    steps: [
      `First challenge period after expiry${len}: the price starts at 10× the declared liquidation price and falls in a straight line to 1× the declared price.`,
      `Second challenge period${len}: the price falls from the declared price to zero. After that the collateral goes for nothing.`,
      "Who may buy: anyone, the owner included, any amount up to all the collateral, at that moment's price. No forced sale can run while a challenge on the position is open.",
      "Where the money goes: the payment repays the debt first. When the payment and the position's reserve share together cover the debt, the reserve sends that share to the buyer, the whole debt is burned from the buyer, and the rest of the price goes to the owner. When they fall short and the last collateral is sold, the reserve pays the difference (out of the position's reserve share first, then equity) and the owner receives nothing; while collateral remains, the payment repays what it can. A position with no debt pays the whole price to the owner.",
    ],
    extraParagraphs: example,
    links: [
      { label: "Expiry and the forced sale (Frankencoin docs)", url: FC_PAGE.risks },
      { label: "How the reserve covers losses (Frankencoin docs)", url: FC_PAGE.reserve },
    ],
  };
}

export function frankencoinLifecycleContent(): LearnMoreContent {
  return {
    title: "A Frankencoin Position's Lifecycle",
    intro:
      "A position is a contract with clocks: a veto window before an original may mint, an expiration after which no position may, and cooldowns in between.",
    detailsHeading: "The lifecycle edges:",
    details: [
      {
        bold: "Veto window",
        text: "a new original position waits an owner-chosen period (3 days minimum) before its first mint; holders of more than 1% of the governance votes (FCS, or the FPS it wraps) can deny it in that window, which disables minting for good.",
        sources: [fcSource("the veto window", "governance")],
      },
      {
        bold: "Cooldown",
        text: "raising the declared liquidation price pauses minting for 3 days, the window in which anyone can challenge the new price before it backs new ZCHF.",
        sources: [fcSource("the price-raise cooldown", "adjust")],
      },
      {
        bold: "Expiration",
        text: "past its expiration a position cannot mint, and on MintingHub V2 anyone can buy its collateral through the hub at a declining price, the proceeds repaying the debt.",
        sources: [fcSource("expiry and the forced sale", "risks")],
      },
      {
        bold: "Closing",
        text: "a position closes when its collateral and debt are both gone; the final repayment releases its reserve share, in full while the reserve covers every position's share.",
        sources: [fcSource("the reserve on repayment", "reserve")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

export function frankencoinEventFallbackContent(): LearnMoreContent {
  return {
    title: "How Frankencoin Works",
    intro:
      "Frankencoin (ZCHF) is an oracle-free Swiss-franc stablecoin. Borrowers mint ZCHF against collateral they price themselves; challenge auctions test the declared prices, and a system reserve absorbs shortfalls.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Positions are contracts",
        text: "every borrower owns a Position contract; its address is its identity, and its owner can change by transfer.",
        sources: [fcSource("positions", "positions")],
      },
      {
        bold: "Native units",
        text: "debt is ZCHF, collateral is the position's own token, and the one price on any card is the owner's declared liquidation price. The protocol values nothing in dollars, and neither does this explorer.",
      },
      {
        bold: "No health factor",
        text: "risk is challenge status, the declared price, the expiry countdown and the cooldown.",
        sources: [fcSource("the risks", "risks")],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}

// ── Market notes ─────────────────────────────────────────────────────────────
// The "?" behind a market note row (components/shared/market-note-row.tsx).
// Layer 2 only: how this KIND of note is read, never this note's figures — the
// figures live on the row and their receipts in the inspector. One modal per
// note kind, taking the protocol the note was built for where a kind has more
// than one home: the modal teaches that protocol's mechanism and links that
// protocol's docs. A new kind adds a function here; a new home adds a case.

export function marketNoteShareRateContent(): LearnMoreContent {
  return {
    title: "About share-rate notes",
    intro:
      "A market note is a row in a position's timeline that states something which happened to the market while this account transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown. This kind states a step in a Moonwell market's share rate between two observations.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Share rate",
        text: "how much underlying one mToken redeems for. It is not read from a contract: every Mint and Redeem in the market emits the underlying amount and the mTokens exchanged, and their quotient is the rate at that block.",
      },
      {
        bold: "A step",
        text: "a change between two adjacent observations larger than interest alone could have produced over those blocks — the note is only stated where the move exceeds ten times what the market's own supply rate could have accrued. Nothing between the two observations is drawn, because nothing between them was observed.",
      },
      {
        bold: "This account's slice",
        text: "the mTokens the account held across the step, replayed from every mToken transfer touching it, valued at each end's rate. The units did not move; what they were worth did.",
      },
      {
        bold: "A live note",
        text: "the same idea, but the later end runs to the chain head: this account's own last Mint or Redeem in the market against its own exchange rate read right now, holding the account's CURRENT mToken holding fixed and moving only the rate. Shown for any entered market the account still holds, whatever the move — nothing having changed since is the fact it states.",
      },
    ],
    links: [{ label: "Moonwell docs", url: MOONWELL_DOC_URL }],
  };
}

/** The sentence every market-note modal opens on, naming what the page calls
 *  the position. */
function marketNoteLead(noun: string): string {
  return `A market note is a row in a ${noun}'s timeline that states something which happened to the market while this ${noun} transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown.`;
}

/** The protocols a price-gap note is built for; the modal is that protocol's
 *  price move, with that protocol's own docs. */
export type PriceGapProtocol = "liquity-v2" | "liquity-fork" | "aave-v4" | "aave-v3" | "spark" | "alchemix-v3";

export function marketNotePriceGapContent(protocol: PriceGapProtocol): LearnMoreContent {
  switch (protocol) {
    case "aave-v4":
      return {
        title: "How a price move reaches an Aave V4 position",
        intro: `${marketNoteLead("position")} This kind states how one asset's price, as the spoke's oracle gives it, moved between two of the position's own rows, and what that move alone did to the health factor.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "the price the spoke's Aave oracle states for an asset, recorded on the position's own rows. A live note reads the same oracle at the chain head and at the block of the row it runs from.",
          },
          {
            bold: "One asset at a time",
            text: "a position holds a basket of collaterals and debts in one spoke, and their prices move independently. A note moves one asset's price and holds every other amount and price as the earlier row recorded them.",
          },
          {
            bold: "Health factor",
            text: "the collateral, each asset weighted by its liquidation threshold, divided by the debt. A collateral's price falling lowers it, and so does a debt's price rising. The thresholds are the ones the spoke reports now: the threshold in force at a past block is not indexed.",
          },
          {
            bold: "The liquidation line",
            text: "a health factor of 1.00. Below it, a liquidator can repay part of the debt and take collateral worth more than it repaid.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the move used at least a quarter of the runway, how far this asset's price alone could move before the health factor reaches 1.00, and always when it ends in a liquidation, for the asset that liquidation seized. Where a row does not price the whole basket, the note states the price alone and only a liquidation-ended stretch is shown.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this position's newest priced row against the oracle price read right now. Shown on any open position, whatever the move.",
          },
        ],
        links: [
          { label: "Aave V4 positions", url: AAVE_FAQ_URLS.V4_POSITIONS },
          { label: "Liquidations in Aave V4", url: AAVE_FAQ_URLS.V4_LIQUIDATIONS },
          { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
        ],
      };
    case "aave-v3":
    case "spark": {
      const spark = protocol === "spark";
      const brand = spark ? "SparkLend" : "Aave V3";
      return {
        title: `How a price move reaches ${spark ? "a SparkLend" : "an Aave V3"} account`,
        intro: `${marketNoteLead("account")} This kind states how the price of the asset a liquidation seized moved before that liquidation, as ${brand}'s oracle gives it.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "each row carries the oracle price of the one reserve it touched. A note takes the seized asset's price at the account's last row that touched it, and at the liquidation. Rows touching other reserves can sit between the two.",
          },
          {
            bold: "Health factor",
            text: "the collateral, each asset weighted by its liquidation threshold, divided by the debt, across the whole account. A collateral's price falling lowers it, and so does a debt's price rising.",
          },
          {
            bold: "The liquidation line",
            text: "a health factor of 1.0. Below it, a liquidator can repay part of the debt and take any of the account's collateral plus a bonus.",
          },
          {
            bold: "What the note states",
            text: "the seized asset's move alone. No runway or health factor is stated, because the rest of the account is not priced at the earlier block. The debt side moves too, and a seized asset's price can rise into its liquidation.",
          },
        ],
        links: spark
          ? [
              { label: "Liquidations", url: SPARK_DOC_URLS.LIQUIDATIONS },
              { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
              { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
            ]
          : [
              { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
              { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
            ],
      };
    }
    case "alchemix-v3":
      return {
        title: "How the vault share price reaches a position",
        intro: `${marketNoteLead("position")} This kind states how the vault's share price moved between two readings of the position, and what that move alone did to its collateralisation.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Share price",
            text: "what one vault share is worth in the asset underneath (mixUSDC in USDC, mixWETH in WETH), stored with each reading of the position. It can fall as well as rise.",
          },
          {
            bold: "Collateralisation",
            text: "the shares' value in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. The share count does not change across a note; what the shares are worth does.",
          },
          {
            bold: "The liquidation line",
            text: "at the line's liquidation line or below, anyone can liquidate the position. The note reads against the line as the Alchemist reports it now.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the move used at least a quarter of the runway, how far the share price could fall before collateralisation reached the liquidation line. A share price that rises a little between readings draws no note, and a line redemption is held to the same rule as any other end.",
          },
        ],
        links: [ALCHEMIX_DOCS.liquidations, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.selfRepayingLoans],
      };
    case "liquity-fork":
      return {
        title: "How a price move reaches a Trove",
        intro: `${marketNoteLead("Trove")} This kind states how the branch's oracle price moved between two of the Trove's events, and what that move alone did to its collateral ratio.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "each priced event on a Trove carries the price the branch's PriceFeed held at the end of that event's block, which every operation updates before it acts; a redemption carries the price its log emitted. The two ends of a note are two such events; no price is read for the note, and none is drawn between them.",
          },
          {
            bold: "Collateral ratio",
            text: "the collateral's value at that price divided by the debt. The same collateral at a lower price covers less of the debt, so a fall lowers the ratio with nothing else moving.",
          },
          {
            bold: "The liquidation line",
            text: "the branch's minimum collateral ratio. A Trove below it can be liquidated.",
          },
          {
            bold: "Runway",
            text: "how far the price could fall from the earlier event before the collateral ratio reached that minimum, at the debt and collateral the Trove's log recorded there.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the price move used at least a quarter of that runway, in either direction, and always when it ends in a liquidation or a redemption. A stretch with a folder of the Trove's rows inside it is not shown, since those rows are not on the page.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this Trove's newest priced event against the branch's price read right now. Shown on any open Trove whose move clears a small floor.",
          },
        ],
      };
    case "liquity-v2":
      return {
        title: "How a price move reaches a trove",
        intro: `${marketNoteLead("trove")} This kind states how the branch's oracle price moved between two of the trove's own events, and what that move alone did to its collateral ratio.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Oracle price",
            text: "every event on a trove carries the collateral price Liquity's own PriceFeed stated at that event's block. The two ends of a note are two such events; no price is read for the note itself, and none is drawn between them.",
          },
          {
            bold: "Collateral ratio",
            text: "the collateral's value at that price divided by the debt. The same collateral at a lower price covers less of the debt, so a fall lowers the ratio with nothing else moving.",
          },
          {
            bold: "The liquidation line",
            text: "the branch's minimum collateral ratio. A trove below it can be liquidated.",
          },
          {
            bold: "Runway",
            text: "how far the price could fall from the earlier event before the collateral ratio reached that minimum, at the debt and collateral the trove's own log recorded there.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the price move used at least a quarter of that runway, in either direction, and always when it ends in a liquidation or a redemption. Quieter stretches stay silent.",
          },
          {
            bold: "The two ratios",
            text: "the earlier event's debt and collateral, valued at each end's price. The later figure is what that state came to be worth, while interest kept accruing across the stretch.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is the chain head: this trove's newest event against the branch's oracle price read right now. Shown on any open trove, whatever the move.",
          },
        ],
        links: [
          { label: "How do I decide on my collateral ratio?", url: FAQ_URLS.LTV_COLLATERAL_RATIO },
          { label: "How do liquidations work?", url: FAQ_URLS.LIQUIDATIONS },
          { label: "What are redemptions?", url: FAQ_URLS.REDEMPTIONS },
        ],
      };
  }
}

// ── Vault-terms and rate-step notes ──────────────────────────────────────────

/** The vault surfaces' own note: a change to the VAULT's terms, which happened
 *  to every holder at once and so is not one holder's event. */
export function marketNoteVaultTermsContent(): LearnMoreContent {
  return {
    title: "About vault-terms notes",
    intro:
      "A note is a row in a timeline that states something which happened while this address transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown. This kind states a change to the VAULT's own terms — its fee, its name, the rate it targets, the cooldown it imposes — read from the vault's own configuration log.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Why it is a note and not a row",
        text: "a row in a holder's vault timeline is something that holder did — a share transfer the vault emitted about that address. A configuration event was emitted about the vault, and it moved every holder's terms at the same moment. Placing it among the rows by block is what shows when the terms moved relative to this address's own events; keeping it out of every count is what stops it being read as one of them.",
      },
      {
        bold: "The words are the contract's",
        text: "each figure here is a non-indexed word of the log, raw, in the units the contract stores it in. Nothing is converted into a rate, a yield or a currency, and nothing is read from between one note and the next — the vault emitted a log at one block, and that block is the whole of what this states.",
      },
      {
        bold: "What the terms are now",
        text: "a note says what was set THEN. What the vault's terms are at the block this page read at is stated in the sections above it, which are calls answered at that block.",
      },
    ],
  };
}

/** The protocols a rate-step note is built for. */
export type RateStepProtocol = "makerdao" | "aave-v3" | "spark";

export function marketNoteRateStepContent(protocol: RateStepProtocol): LearnMoreContent {
  switch (protocol) {
    case "makerdao":
      return {
        title: "How the stability fee moves a vault",
        intro: `${marketNoteLead("vault")} This kind states a change in the collateral type's stability fee between two of the vault's events.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Stability fee",
            text: "the yearly rate a collateral type's debt compounds at. Governance sets it, and it is stored on Maker's Jug contract.",
          },
          {
            bold: "Fee in force at an event",
            text: "a vault's rows carry no fee. The fee in force at each of the vault's events is worked out from how fast the collateral type's debt grew around it, then checked against the rate stored on the Jug at that block; the note states the checked figure.",
          },
          {
            bold: "Which changes are stated",
            text: "every change governance made to the fee, of 0.01 percentage points or more, between two of the vault's events.",
          },
          {
            bold: "When the fee is booked",
            text: "the fee reaches the debt when someone updates the collateral type's rate (a call to Jug.drip). A draw or a repayment makes that call first, so the fee since the previous event lands in lumps on those rows.",
          },
          {
            bold: "A live note",
            text: "the same idea, but the later end is now: the collateral type's rate on the Jug, read at the latest block and stated as a yearly figure.",
          },
        ],
        links: [
          { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
          { label: "Vat, the core accounting", url: MAKER_DOCS.VAT },
          { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
        ],
      };
    case "aave-v3":
    case "spark": {
      const spark = protocol === "spark";
      return {
        title: `How ${spark ? "SparkLend" : "Aave V3"} rates move an account`,
        intro: `${marketNoteLead("account")} This kind states a step in one reserve's rate, on one side of it, between two of the account's own touches.`,
        detailsHeading: "Key concepts:",
        details: [
          {
            bold: "Two rates per reserve",
            text: "the supply rate an account earns and the variable borrow rate it pays. They move independently, so a note reads one of them.",
          },
          {
            bold: "Where the rate is read",
            text: "the rate the Pool recorded for the reserve around the account's own transactions: at or before its earlier action, and before its next touch but never from inside that touch's transaction, so a move the account caused is not stated as the market's.",
          },
          {
            bold: "Which stretches are stated",
            text: "a stretch is shown when the rate moved by at least one percentage point between the two touches, in either direction.",
          },
          {
            bold: "A live note",
            text: spark
              ? "the stretch from the account's last touch to now: the later end is the reserve's rate as the Pool gives it at the latest block. It is shown for any move of 0.01 points or more."
              : "the stretch from the account's last touch to now: the later end is the reserve's rate as the Pool gives it at the latest block.",
          },
        ],
        links: spark
          ? [
              { label: "SparkLend overview", url: SPARK_DOC_URLS.SPARKLEND },
              { label: "Spark FAQ", url: SPARK_DOC_URLS.FAQ },
            ]
          : [
              { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
              { label: "Borrowing assets", url: AAVE_FAQ_URLS.BORROWING },
              { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
            ],
      };
    }
  }
}

// ── Aave's vault layer on Ethereum ───────────────────────────────────────────
// The two "?" cells of the position page: the card that states what an address
// holds, and the tower that states what moved over its whole life. Facts only —
// what each figure is a reading OF, and what the section refuses to state.

/** A short account of what one FAMILY's share token is, in the terms its own
 *  contract uses. Kept beside the two cells rather than in either, because both
 *  of them need it and neither owns it.
 *
 *  EVERY FAMILY THE CENSUS WRITES, on both chains. The cell below is the vault
 *  position card's, and that card is the same component on Ethereum and on
 *  Base — so the note has to cover MetaMorpho too, or the Base card is the one
 *  position card in the product with no "?" behind it. */
const AAVE_VAULT_FAMILY_NOTE: Record<VaultPositionFamily, string> = {
  sgho: "Savings GHO is a vault over GHO: depositing GHO mints sGHO, and the vault's own convertToAssets says what a balance of sGHO is worth in GHO at the block it is asked at.",
  stata:
    "A Static aToken wraps an Aave V3 aToken, whose balance rebases. The wrapper's own balance does not: it holds a fixed number of shares and the growth shows up in what a share converts to, which is what makes a balance comparable between two blocks.",
  "umbrella-stake":
    "An Umbrella stake token holds a Static aToken and can be slashed to cover a deficit in the Aave market it backs. Redemption runs through a cooldown: the holder starts one, waits it out, and then has a window in which maxRedeem() answers something other than zero.",
  morpho:
    "A MetaMorpho vault is an ERC-4626 vault over Morpho Blue: its curator allocates the deposits across a set of Blue markets, and the vault's own convertToAssets says what a balance of its shares is worth in the asset at the block it is asked at. There is no cooldown: a withdrawal is limited only by what the markets in the vault's withdraw queue can pay at that block, which is what maxWithdraw answers.",
};

/** The "?" on the position card — the three headline figures and the two lanes
 *  behind them. */
export function aaveVaultPositionContent(
  family: VaultPositionFamily,
  assetSymbol: string,
  shareSymbol: string | null,
): LearnMoreContent {
  const shares = shareSymbol ?? "the share token";
  // The vaults themselves are Aave's on chain 1 and MetaMorpho's on Base, so
  // the opening sentence names the catalogue the position is in rather than one
  // issuer. Everything under it is true of both: the figures are ERC-4626 reads
  // at a block the card names.
  const catalogue =
    family === "morpho" ? "one of the MetaMorpho vaults catalogued on Base" : "one of Aave's own ERC-4626 vaults";
  return {
    title: "What a vault position is",
    intro: `A position here is one pair: an address, and ${catalogue}. Holding ${shares} is holding a share of that vault, and every figure on this card is a reading of a contract at a block the card names. ${AAVE_VAULT_FAMILY_NOTE[family]}`,
    detailsHeading: "What each figure on the card is:",
    details: [
      {
        bold: "Shares",
        text: `the vault's own balanceOf for this address, in ${shares}'s own units. Share units, not ${assetSymbol}.`,
      },
      {
        bold: "Claim",
        text: `the vault's own convertToAssets of exactly that balance, in ${assetSymbol}. It is the contract's answer at one block, never the shares multiplied by a price.`,
      },
      {
        bold: "Share of the vault",
        text: "that balance over the share token's totalSupply at the same block — two integers in the same units, divided.",
      },
      {
        bold: "The activity count and the dates",
        text: "the census: one whole-Transfer sweep of the vault, proven complete by Σ balanceOf equalling totalSupply wei-exact, run daily. The card names the block it swept to, separately from the block the figures above were read at.",
      },
      {
        bold: "Value · USD",
        text: "the census's one priced figure: the balance at the census block through the vault's own convertToAssets and the chain's Aave V3 oracle (IAaveOracle.getAssetPrice) at that block, the oracle and the block named on its receipt. Computed once by the daily census, never read for the page — what the position was worth then, nothing about now. A vault that oracle does not price is stated as not priced, never guessed from another feed.",
      },
    ],
    extraParagraphs: [
      "Nothing here is annualised. A vault's share price moves, but a rate of return over it would be a line drawn between two blocks nobody read, so no figure spans the gap between one reading and the next.",
      "A zero is a reading. A call that did not answer is stated as unread instead — the two are different facts and the card never prints one as the other.",
    ],
  };
}

/** The "?" on the lifetime-flows tower. */
export function aaveVaultFlowsContent(assetSymbol: string, shareSymbol: string): LearnMoreContent {
  return {
    title: "How the lifetime flows are counted",
    intro: `The tower sums this address's own events in this vault — every Transfer of ${shareSymbol} the vault emitted about it, and the ERC-4626 Deposit and Withdraw events that were emitted beside them. It is a sum over the whole history, not over the rows currently drawn below it.`,
    detailsHeading: "The two sides:",
    details: [
      {
        bold: `The share side, in ${shareSymbol}`,
        text: "minted, transferred in, burned and transferred out. It closes: minted plus transferred in, less burned and transferred out, is the balance the vault's own balanceOf reports at the page's block, wei-exact.",
      },
      {
        bold: `The asset side, in ${assetSymbol}`,
        text: "the assets word of the ERC-4626 events themselves, and the vault's own convertToAssets of the balance held now. A mint or a burn that carried no such event is in the share totals and in no asset total at all — the page says how many.",
      },
      {
        bold: "Why the two heights are not comparable",
        text: `${shareSymbol} and ${assetSymbol} are different tokens with their own decimals. The bars are drawn in each token's own units and nothing converts one side into the other.`,
      },
    ],
    extraParagraphs: [
      "No rate, no yield and no profit or loss is drawn. A cost basis over a pooled fungible share is not something any chain read supplies, and the difference between two share prices read at two blocks the holder happened to transact in is not a return.",
      "The tower is drawn under exactly the condition the rows are: a history that could not be reconciled against the vault's own balanceOf, and one too large to draw whole, both leave it off the page rather than summing part of a life.",
    ],
  };
}

/** Where each vault family's documentation explains the vault. Yearn has
 *  no host in content/official-docs.json yet, so its rows link nothing. */
const VAULT_EVENT_LINKS: Record<VaultPositionFamily | "yearn", LearnMoreLink[]> = {
  sgho: [{ label: "Savings GHO (sGHO)", url: "https://aave.com/docs/ecosystem/gho/sgho" }],
  stata: [{ label: "Static aTokens", url: "https://aave.com/docs/aave-v3/smart-contracts/tokenization" }],
  "umbrella-stake": [{ label: "Umbrella", url: "https://aave.com/docs/aave-v3/umbrella" }],
  morpho: [{ label: "Morpho vaults", url: "https://docs.morpho.org/learn/concepts/vault/" }],
  yearn: [],
};

/** The "?" on a vault timeline row (ui-jobs 309): what a row is and what its
 *  figures are, true of any holder of any vault in the family. */
export function vaultEventContent(family: VaultPositionFamily | "yearn"): LearnMoreContent {
  return {
    title: "How vault shares move",
    intro:
      "A vault takes deposits of one asset and issues shares for them. Each row is one log the vault emitted about this address: shares minted, burned or transferred.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Balance",
        text: "the sum of this address's share transfers up to the row. The figure before the arrow is the same sum one log earlier.",
      },
      {
        bold: "Share price at this block",
        text: "what one share converts to in the asset at the row's block, read from the vault. It says nothing about other blocks.",
      },
      {
        bold: "Shares moved",
        text: "the value of the row's Transfer log. A deposit mints shares, a withdrawal burns them, and a transfer passes existing shares on.",
      },
      ...(family === "morpho"
        ? [
            {
              bold: "Share of the vault",
              text: "the balance after the row over every share in existence at its block.",
            },
          ]
        : []),
    ],
    links: VAULT_EVENT_LINKS[family],
  };
}

/** The "?" on an Aave V3-family account's e-mode switch row (ui-jobs 309). */
export function emodeSwitchContent(protocol: "aave" | "spark" | "seamless"): LearnMoreContent {
  const link: LearnMoreLink =
    protocol === "spark"
      ? { label: "E-mode on SparkLend", url: "https://docs.spark.fi/products/sparklend/guides/e-mode" }
      : protocol === "seamless"
        ? { label: "Seamless documentation", url: SEAMLESS_DOCS_URL }
        : { label: "Aave V3 overview: Efficiency Mode", url: "https://aave.com/docs/aave-v3/overview" };
  return {
    title: "How e-mode works",
    intro:
      "E-mode is a setting on the whole account. Choosing a category lets collateral in that category count at the category's limits in place of each asset's own.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Category",
        text: "a group of assets whose prices move together, such as ETH and its staked forms. Its limits are set by governance.",
      },
      {
        bold: "Limits",
        text: "how much of the collateral's value can be borrowed against, and the level at which the account can be liquidated.",
      },
      {
        bold: "Health factor",
        text: "moves with the switch although nothing is supplied or borrowed, because the same collateral now counts at other limits.",
      },
      {
        bold: "Borrowing in e-mode",
        text: "an account in a category may borrow only assets in that category.",
      },
    ],
    links: [link],
  };
}

// ── Liquity family — claiming a collateral surplus ───────────────────────────

/** The "?" on a Trove's "Claim collateral" row: what the CollSurplusPool holds
 *  and what claimCollateral() pays. Shared by Liquity V2, its forks and
 *  Liquity V1; each passes its name and links (Liquity V1 its strings
 *  file's `claim_links`). */
export function liquityCollSurplusClaimContent(
  p:
    | { family: "liquity-v2"; protocolName: string }
    | { family: "liquity-v1"; protocolName: string; links: LearnMoreLink[] }
    | { family: "fork"; fork: LiquityForkLearnMoreParams },
): LearnMoreContent {
  const v1 = p.family === "liquity-v1";
  const name = p.family === "fork" ? p.fork.protocolName : p.protocolName;
  const links =
    p.family === "liquity-v1"
      ? p.links
      : p.family === "fork"
        ? forkLinks(p.fork, "liquidation")
        : [
            {
              label: "How do liquidations work?",
              url: "https://docs.liquity.org/v2-faq/borrowing-and-liquidations#how-do-liquidations-work-in-liquity-v2",
            },
          ];
  return {
    title: "How Claiming Collateral Works",
    intro: v1
      ? `When a liquidation in Recovery Mode takes less than all of a Trove's ETH, or redemptions cancel its whole debt, the ETH left over does not go back to the owner's wallet. ${name} credits it to the owner in a surplus pool, which holds it until the owner claims it.`
      : `When a liquidation takes less collateral than the Trove holds, the rest does not go back to the owner's wallet. ${name} credits it to the owner in the collateral branch's CollSurplusPool, which holds it until the owner calls claimCollateral() on BorrowerOperations.`,
    stepsHeading: "How the pool pays out:",
    steps: [
      v1
        ? "The pool keeps one balance per owner. Each Trove that closes this way adds its leftover ETH to it."
        : "The pool keeps one balance per owner on each branch. Each Trove liquidated with collateral to spare adds its leftover to it.",
      "claimCollateral() pays the whole balance to the owner in one transaction, so one claim can cover several Troves.",
      "The balance does not change while it waits: it earns nothing and nobody else can take it.",
    ],
    links,
  };
}
