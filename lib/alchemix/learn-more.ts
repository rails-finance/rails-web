// The Alchemix "?" modals: one per act, the way Liquity V2 has one per
// operation, each true of any position on any line (rails-ops
// standards/detail-page-anatomy.md, "The disclosure ladder", T4).
// ----------------------------------------------------------------------------
// WHAT IS SAID HERE IS WHAT RAILS-OPS AND THE CHAIN VERIFY. The links go to
// Alchemix's own documentation for further reading, chosen and checked on
// 2026-09-27; nothing in the copy is taken from those pages. Where a page
// says something rails-ops does not, the copy stays with rails-ops.
//
// A figure about one position belongs at T2 or T3, never here.

import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";

const DOCS = "https://docs.alchemix.fi";

export const ALCHEMIX_DOCS = {
  selfRepayingLoans: { label: "Self-repaying loans", url: `${DOCS}/user/concepts/self-repaying-loans` },
  takeALoan: { label: "Take a loan", url: `${DOCS}/user/tutorials/borrowing-in-alchemix` },
  myt: { label: "The Mix-Yield Token (MYT)", url: `${DOCS}/user/concepts/myt-and-yield` },
  alAssets: { label: "alAssets", url: `${DOCS}/user/concepts/alAssets` },
  repay: { label: "Repay a loan", url: `${DOCS}/user/tutorials/repay-loan` },
  selfLiquidate: {
    label: "Flash repay or self-liquidation",
    url: `${DOCS}/user/tutorials/repay-loan#flash-repay-or-self-liquidation`,
  },
  withdraw: { label: "Withdraw", url: `${DOCS}/user/tutorials/withdraw` },
  liquidations: { label: "Liquidations", url: `${DOCS}/user/concepts/liquidations` },
  borrowerFee: {
    label: "Fees: the borrower redemption fee",
    url: `${DOCS}/user/concepts/fees#borrower-redemption-fee`,
  },
  liquidatorFee: { label: "Fees: the liquidator fee", url: `${DOCS}/user/concepts/fees#liquidator-fee` },
  fees: { label: "Fees", url: `${DOCS}/user/concepts/fees` },
  transmuter: { label: "The Transmuter", url: `${DOCS}/user/concepts/transmuter` },
  redemptionRate: { label: "Redemption rate", url: `${DOCS}/user/concepts/redemption-rate` },
  earmarking: { label: "Earmarking (developer docs)", url: `${DOCS}/dev/alchemist/earmarking` },
  redemptions: { label: "Redemptions (developer docs)", url: `${DOCS}/dev/architecture/redemptions` },
  router: { label: "The AlchemistRouter contract", url: `${DOCS}/dev/alchemist/alchemist-router-contract` },
  positionNft: { label: "The position NFT contract", url: `${DOCS}/dev/alchemist/alchemist-v3-position-contract` },
  v3Migration: { label: "The V2 to V3 migration", url: `${DOCS}/user/v3-migration` },
  contractsEthereum: { label: "Contract addresses on Ethereum", url: `${DOCS}/dev/contracts/ethereum` },
  contractsBase: { label: "Contract addresses on Base", url: `${DOCS}/dev/contracts/base` },
} satisfies Record<string, LearnMoreLink>;

// ── The shared core ─────────────────────────────────────────────────────────
// Three facts every act on a position moves or is checked against. Each
// per-act modal takes the ones its act touches.

const CORE_COLLATERAL = {
  bold: "Collateral",
  text: "vault shares: mixUSDC is a vault over USDC, mixWETH one over WETH. The position holds the shares, and what they are worth in the asset underneath moves with the vault's share price, which can fall as well as rise.",
};

const CORE_SET_ASIDE = {
  bold: "Set aside for repayment",
  text: "the part of the debt the Transmuter has claimed as its stakers' deposits matured. It grows block by block. A line redemption clears it, and so does the holder repaying with vault shares (the set-aside part is paid first, with the line's protocol fee) or closing the position with its collateral.",
};

const CORE_RATIO = {
  bold: "Collateralisation",
  text: "the collateral in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. Minting and withdrawing must leave it above the line's minimum. At the line's liquidation line or below, anyone can liquidate the position.",
};

const CORE_NO_INTEREST = {
  bold: "Interest",
  text: "none accrues on the debt. It changes only when the holder mints, burns or repays, or when a line redemption clears part of it.",
};

const CORE_ROUTER = {
  bold: "The router",
  text: "a contract on each line that can do several steps for the holder in one transaction. The position NFT can pass through it and come back inside that transaction, and nobody's ownership changes.",
};

// ── One modal per act ───────────────────────────────────────────────────────

const OPENING =
  "An Alchemix position is opened by depositing vault shares into the line's Alchemist, which mints an NFT that is the position.";

/** An opening that deposited and minted nothing. */
export const ALCHEMIX_OPEN_DEPOSIT: LearnMoreContent = {
  title: "Opening a position",
  intro: `${OPENING} A position opened this way starts with collateral and no debt; minting against it comes later.`,
  detailsHeading: "Key concepts",
  details: [CORE_COLLATERAL, CORE_RATIO, CORE_ROUTER],
  links: [ALCHEMIX_DOCS.selfRepayingLoans, ALCHEMIX_DOCS.takeALoan, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.router],
};

/** An opening that also minted in the same transaction. */
export const ALCHEMIX_OPEN_MINT: LearnMoreContent = {
  title: "Opening a position and minting",
  intro: `${OPENING} The same transaction can also mint the line's synthetic against that deposit, so the position starts with a debt as well as collateral. The debt is the synthetic minted, one for one, and the Alchemist refuses a mint beyond what the line's minimum collateralisation allows.`,
  detailsHeading: "Key concepts",
  details: [CORE_COLLATERAL, CORE_RATIO, CORE_NO_INTEREST, CORE_ROUTER],
  links: [ALCHEMIX_DOCS.takeALoan, ALCHEMIX_DOCS.selfRepayingLoans, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.router],
};

/** A deposit into a position that already exists, with nothing else moved. */
export const ALCHEMIX_DEPOSIT: LearnMoreContent = {
  title: "Depositing collateral",
  intro:
    "A deposit adds vault shares to a position that already exists. It moves the collateral only; the debt stays where it was, so collateralisation rises.",
  detailsHeading: "Key concepts",
  details: [CORE_COLLATERAL, CORE_RATIO, CORE_ROUTER],
  links: [ALCHEMIX_DOCS.takeALoan, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.router],
};

/** A deposit and a mint in one transaction, on a position that already exists. */
export const ALCHEMIX_DEPOSIT_MINT: LearnMoreContent = {
  title: "Depositing and minting in one step",
  intro:
    "A holder can add vault shares and mint the line's synthetic against them in one transaction. The collateral rises by the shares deposited and the debt by the synthetic minted, one for one. The Alchemist checks collateralisation once both have landed and refuses a mint beyond what the line's minimum allows, so a holder minting as much as the deposit allows ends each step at about that minimum.",
  detailsHeading: "Key concepts",
  details: [CORE_COLLATERAL, CORE_RATIO, CORE_NO_INTEREST, CORE_ROUTER],
  links: [ALCHEMIX_DOCS.takeALoan, ALCHEMIX_DOCS.alAssets, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.router],
};

export const ALCHEMIX_MINT: LearnMoreContent = {
  title: "Minting debt",
  intro:
    "Minting draws the line's synthetic (alUSD, alETH or alUSDb) against the position's collateral, and adds the amount minted to the debt one for one. The synthetic goes to an address the holder names.",
  detailsHeading: "Key concepts",
  details: [CORE_RATIO, CORE_NO_INTEREST, CORE_SET_ASIDE],
  links: [ALCHEMIX_DOCS.takeALoan, ALCHEMIX_DOCS.alAssets, ALCHEMIX_DOCS.selfRepayingLoans],
};

export const ALCHEMIX_BURN_REPAY: LearnMoreContent = {
  title: "Paying debt down",
  intro:
    "Debt can be paid down at any time, in two ways. A burn returns the synthetic, one for one against the debt. A repay pays with vault shares instead.",
  detailsHeading: "Key concepts",
  details: [
    {
      bold: "Burn",
      text: "takes the synthetic out of circulation and lowers the debt by the same amount. The collateral does not move.",
    },
    {
      bold: "Repay",
      text: "pays the debt with vault shares. Each share counts at its value in the asset underneath at that block, one synthetic per unit, and the line keeps a protocol fee in shares on the part that pays off debt set aside for repayment (0.25% on Ethereum, 0.1% on Base).",
    },
    CORE_SET_ASIDE,
  ],
  links: [ALCHEMIX_DOCS.repay, ALCHEMIX_DOCS.borrowerFee, ALCHEMIX_DOCS.earmarking],
};

export const ALCHEMIX_WITHDRAW: LearnMoreContent = {
  title: "Withdrawing collateral",
  intro:
    "A withdrawal takes vault shares out of the position to an address the holder names. The debt does not move, so collateralisation falls, and the Alchemist refuses a withdrawal that would not leave it above the line's minimum.",
  detailsHeading: "Key concepts",
  details: [CORE_RATIO, CORE_ROUTER, CORE_COLLATERAL],
  links: [ALCHEMIX_DOCS.withdraw, ALCHEMIX_DOCS.router, ALCHEMIX_DOCS.liquidations],
};

export const ALCHEMIX_SELF_LIQUIDATE: LearnMoreContent = {
  title: "Closing a position with its collateral",
  intro:
    "The holder can close a position in one step without bringing the synthetic back: the position's vault shares pay off all of its debt, and the collateral left over goes to an address the holder names. Alchemix calls this a self-liquidation. The holder chooses it, so no liquidator takes part.",
  detailsHeading: "What the close does",
  details: [
    {
      bold: "Debt set aside for repayment",
      text: "is paid first, as a force repay in the same transaction, whose event states the shares used and the fee.",
    },
    {
      bold: "The fee",
      text: "is the line's protocol fee on those set-aside shares (0.25% on Ethereum, 0.1% on Base), paid to Alchemix's fee receiver. The rest of the debt is paid without a fee, and no liquidator fee applies.",
    },
    {
      bold: "Shares used",
      text: "are in the close's own event, which counts every share that paid debt, the set-aside part included.",
    },
    {
      bold: "Collateral returned",
      text: "is what is left once the debt is paid. No event states it: the card measures it from the reading before the close.",
    },
    { bold: "Debt and collateral after", text: "are both zero: the position is closed." },
  ],
  links: [ALCHEMIX_DOCS.selfLiquidate, ALCHEMIX_DOCS.router, ALCHEMIX_DOCS.borrowerFee],
};

/** The protocol's central idea, the one a reader has to own to read an
 *  Alchemix timeline: Transmuter stakes maturing are what set debt aside and
 *  what redemptions clear. Opened from every redemption card. */
export const ALCHEMIX_HOW_IT_WORKS: LearnMoreContent = {
  title: "How Alchemix repays a loan",
  intro:
    "Every Alchemix line has two halves. The Alchemist holds borrowers' positions: vault shares in, a synthetic token such as alUSD out. The Transmuter takes that synthetic back from anyone who holds it and, over time, turns it into the vault shares borrowers put up. The second half is what repays the first.",
  stepsHeading: "How a redemption happens",
  steps: [
    "Someone holding alUSD deposits it in the line's Transmuter, where it matures over a period measured in blocks.",
    "As those deposits mature, the Alchemist sets aside a matching amount of debt across every open position on the line, in proportion to what each position owes. That is each position's Set aside for repayment figure, and it grows block by block.",
    "When a staker claims, the Transmuter redeems: every open position's set-aside debt is cleared by the same ratio, and the Alchemist takes collateral for it. Vault shares worth one unit of the asset underneath (USDC, or WETH on alETH) for each unit of debt cleared go to the Transmuter, and the line's redemption fee, 0.25% on top of those shares on Ethereum and 0.1% on Base, goes to Alchemix's fee receiver.",
    "The Transmuter pays the staker in those vault shares (mixUSDC on the alUSD line) for the part of the deposit that has matured, and hands back the rest as alUSD.",
  ],
  // The staker's side, which a borrower reading a redemption also needs: a
  // claim can come before maturity, and what that costs.
  extraParagraphs: [
    "A stake converts a little every block, in equal parts from the block it is made to its maturity block. The staker can claim at any time. A claim before maturity converts only the part whose blocks have passed, hands the rest back as alUSD and keeps an early exit fee on that rest (1% on every early claim so far). So claiming early gives up converting the rest and pays the fee; to convert it, the staker stakes it again and waits a new full term.",
  ],
  detailsHeading: "What it means for a borrower",
  details: [
    {
      bold: "The loan is repaid over time without the holder acting.",
      text: "Each redemption lowers the debt by what it clears and the collateral by that much plus the redemption fee, so the position's collateral less its debt falls by about the fee each time. Each redemption card states the difference for that position as its net and the fee inside it.",
    },
    {
      bold: "The vault's share price decides what is left over.",
      text: "A rising share price grows the collateral while the debt stays put. A share price can also fall, and then the collateral shrinks.",
    },
    {
      bold: "A redemption row is the line's event.",
      text: "It names no position. The explorer reads each position before and after it to state what it cleared and took from that one.",
    },
    {
      bold: "The holder can still repay directly",
      text: "by burning the synthetic or repaying with vault shares, or close out with a self-liquidation, which pays the debt from the collateral.",
    },
    {
      bold: "A position that falls too low can be liquidated by anyone.",
      text: "Its collateralisation is the collateral in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. Minting more or withdrawing must leave it above the line's minimum. If a falling share price takes it to the line's liquidation line or below, anyone can liquidate the position: the Alchemist uses its collateral to repay debt until the ratio is back above the minimum, and pays the liquidator 1.5% of the collateral above the debt, in shares from the position. Where the collateral no longer covers the debt, or the whole line is below its global minimum, the entire debt is cleared from the collateral and the liquidator's fee, 1.5% of the debt, comes from the line's fee vault in the asset underneath. The position card states both lines, read from the Alchemist.",
    },
  ],
  links: [
    ALCHEMIX_DOCS.selfRepayingLoans,
    ALCHEMIX_DOCS.transmuter,
    ALCHEMIX_DOCS.redemptionRate,
    ALCHEMIX_DOCS.earmarking,
    ALCHEMIX_DOCS.borrowerFee,
    ALCHEMIX_DOCS.liquidations,
  ],
};

export const ALCHEMIX_LIQUIDATION: LearnMoreContent = {
  title: "When a position is liquidated",
  intro:
    "A position whose collateralisation reaches the line's liquidation line or falls below it can be liquidated by anyone: shares are taken from it and put against the debt, and the liquidator is paid a fee.",
  detailsHeading: "What the event states",
  details: [
    { bold: "Shares taken", text: "are in the log, so they are shown." },
    { bold: "Debt cleared", text: "shows in the card's before and after figures." },
    {
      bold: "The fee",
      text: "is 1.5% of the collateral above the debt, paid to the liquidator in shares from the position. Where the collateral no longer covers the debt, or the whole line is below its global minimum, the entire debt is cleared and the fee, 1.5% of the debt, is paid in the asset underneath from the line's fee vault. If the vault holds less, a fee shortfall event records what was owed and what was paid.",
    },
  ],
  links: [ALCHEMIX_DOCS.liquidations, ALCHEMIX_DOCS.liquidatorFee],
};

export const ALCHEMIX_LINE_WIDE: LearnMoreContent = {
  title: "Events that belong to the whole line",
  intro:
    "Some events on this timeline name no position at all. They are here because they fell inside this position's life, and the holder did none of them.",
  detailsHeading: "The kinds",
  details: [
    {
      bold: "Redemption",
      text: "clears every open position's set-aside debt on the line at once, by one ratio, and takes shares from each one's collateral: shares worth the debt cleared for the Transmuter, and the line's redemption fee on top for Alchemix's fee receiver.",
    },
    {
      bold: "Batch liquidation",
      text: "carries the list of positions as a single hash, so which ones were in it cannot be recovered.",
    },
    { bold: "Fee shortfall", text: "records a liquidator being paid less than they were owed." },
  ],
  links: [ALCHEMIX_DOCS.redemptions, ALCHEMIX_DOCS.liquidations],
};

export const ALCHEMIX_CUSTODY: LearnMoreContent = {
  title: "The position is a token that can be sold",
  intro:
    "An Alchemix position is an NFT. It can change hands at any time without the debt or the collateral moving, and without the position closing.",
  extraParagraphs: [
    "So the address holding it today need not be the address that opened it, or the address that did any of what is on this page. Each event says who acted in it.",
  ],
  links: [ALCHEMIX_DOCS.positionNft],
};

/** The position card's "?": what its figures are and how to read the
 *  timeline under it, true of any position on any line. Liquity V2's
 *  `liquityPositionContent` ("About This Position") is the model; this
 *  position's own figures are in the card's Explanation pane. `infoHref` is
 *  the explorer's Info page, where the set-aside entry sends the reader for
 *  the whole repayment cycle. */
export function alchemixPositionContent(status: string, infoHref: string): LearnMoreContent {
  return {
    title: "About this position",
    intro:
      status === "closed"
        ? "An Alchemix position is an NFT holding vault shares as collateral against a debt in the line's synthetic. This one has closed: its debt and collateral are zero, and the timeline below is its whole life."
        : "An Alchemix position is an NFT holding vault shares as collateral against a debt in the line's synthetic. No interest accrues on the debt, and the line's redemptions pay it down over time from the collateral.",
    detailsHeading: "Key concepts",
    details: [
      {
        bold: "Collateral",
        text: "vault shares. mixUSDC is a Morpho Vault V2 over USDC, and mixWETH one over WETH: the vault spreads what is deposited in it across several lending strategies, and what they earn or lose moves its share price, which can fall as well as rise. The card leads with the shares' value in the asset underneath; every Collateral figure on an event card is the share count.",
      },
      {
        bold: "The debt",
        text: "is owed in the line's synthetic (alUSD, alETH or alUSDb), a token the position minted against its collateral. Alchemix counts one synthetic as one unit of the asset underneath.",
      },
      {
        bold: "Set aside for repayment",
        text: "the part of the debt the line's Transmuter has claimed. Holders of the synthetic stake it in the Transmuter, and as those stakes mature the Alchemist sets aside a matching amount of debt across every open position on the line, in proportion to what each owes. The figure grows block by block, so a reading holds at its block. A line redemption clears set-aside debt and takes vault shares worth it from the collateral, plus the line's redemption fee. The holder can also clear it: a repay with vault shares pays the set-aside part first, with the same fee, and closing the position with its collateral pays all of it. The explorer's Info page, linked below, walks through the whole cycle.",
      },
      {
        bold: "Collateralisation",
        text: "the collateral in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. Minting more or withdrawing must leave it above the line's minimum.",
      },
      {
        bold: "What can bring a liquidation",
        text: "only the vault's share price. Debt and collateral are both counted in the asset underneath, so that asset's dollar price does not move collateralisation; a fall in the share price can take a position to its liquidation line.",
      },
      {
        bold: "Liquidation",
        text: "at the line's liquidation line or below, anyone can liquidate the position. The Alchemist uses its collateral to repay debt until the ratio is back above the minimum, and pays the liquidator 1.5% of the collateral above the debt, in shares from the position. Where the collateral no longer covers the debt, or the whole line is below its global minimum, the entire debt is cleared from the collateral and the liquidator's fee, 1.5% of the debt, comes from the line's fee vault in the asset underneath.",
      },
      {
        bold: "Before and after on an event card",
        text: "each card shows debt, collateral and set-aside before and after it. The after figures are the reading at the card's block, and the before figures the reading at the previous card's block.",
      },
      {
        bold: "The position NFT",
        text: "the position is a token that can be sold. It can change hands without the debt or the collateral moving and without closing, so the address shown as its holder is who holds it now and need not be who did any of what is on the timeline. Each event says who acted in it.",
      },
    ],
    links: [
      { label: "How Alchemix works, on this explorer's Info page", url: infoHref },
      ALCHEMIX_DOCS.selfRepayingLoans,
      ALCHEMIX_DOCS.myt,
      ALCHEMIX_DOCS.alAssets,
      ALCHEMIX_DOCS.transmuter,
      ALCHEMIX_DOCS.earmarking,
      ALCHEMIX_DOCS.liquidations,
      ALCHEMIX_DOCS.liquidatorFee,
      ALCHEMIX_DOCS.positionNft,
    ],
  };
}

/** The Lifetime flows "?": what the chart sums, in which unit, and what it
 *  leaves out. Liquity V2's `liquityLifetimeFlowsContent` is the model. */
export const ALCHEMIX_LIFETIME_FLOWS: LearnMoreContent = {
  title: "How the lifetime flows are counted",
  intro:
    "The chart sums the position's own events over its whole life, each side in its own unit: vault shares on the collateral side, the line's synthetic on the debt side. Nothing is converted into dollars or into the asset underneath.",
  detailsHeading: "Key concepts",
  details: [
    {
      bold: "Collateral side",
      text: "shares deposited, then shares withdrawn, put against debt set aside for repayment, taken by every line redemption, used to pay the rest of the debt at a close, returned to the holder at a close, or taken by a liquidation, and the shares held now, from the current reading. The shares a repay pays with come from the caller's wallet, so they are not drawn here.",
    },
    {
      bold: "Debt side",
      text: "synthetic minted, then synthetic burned, debt cleared by repays, debt cleared by every line redemption, and debt paid off at a close, and the debt read now.",
    },
    {
      bold: "What a redemption's row is",
      text: "the sum of what every line redemption cleared and took from this position, each a difference of the readings either side of it, never a figure from the redemption's own event. Each redemption still has its own two figures on the timeline.",
    },
    {
      bold: "What the totals leave out",
      text: "the protocol fee a repay takes from the collateral. The (i) under the chart adds it, so its account of the collateral closes on the shares held now.",
    },
    {
      bold: "Interest",
      text: "none accrues on an Alchemix debt, so no carrying cost is drawn.",
    },
  ],
  links: [ALCHEMIX_DOCS.selfRepayingLoans, ALCHEMIX_DOCS.transmuter, ALCHEMIX_DOCS.fees],
};

/** The one modal a V2 row carries on a V3 position's timeline. */
export const ALCHEMIX_V2: LearnMoreContent = {
  title: "Alchemix V2 events",
  intro:
    "Alchemix V2 is the version that ran before V3. It closed on 2 April 2026. Where a V2 account was carried into a V3 position, the V3 position's page shows the V2 events for context and adds no V2 figure to its own: they are one obligation at two points in time.",
  detailsHeading: "What a V2 event records",
  details: [
    {
      bold: "The amount it moved",
      text: "collateral deposited or withdrawn (a withdrawal in the yield token's shares), synthetic minted or burned, or the asset repaid.",
    },
    {
      bold: "The debt it cleared",
      text: "on a Repay or a Liquidate, where the log carries it. Logs from before 11 May 2022 do not.",
    },
    {
      bold: "A V2 Liquidate",
      text: "is the account holder repaying their own debt by selling their own collateral shares. Nobody else is involved.",
    },
    {
      bold: "The account's figures",
      text: "were read once, when V2 closed, and not at each event.",
    },
  ],
  links: [ALCHEMIX_DOCS.v3Migration],
};

/** The "?" on a Transmuter position's event. */
export const ALCHEMIX_TRANSMUTER: LearnMoreContent = {
  title: "How the Transmuter works",
  intro:
    "The Transmuter takes an alAsset and converts it into vault shares over a fixed term. A stake opens a position, held as an NFT, that converts a little every block until it matures.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Stake",
      text: "the alAsset sent in when the position opens. The Transmuter holds it until the claim.",
    },
    {
      bold: "Maturity",
      text: "the block by which the whole stake has converted. Before it, only the part of the term that has passed has converted.",
    },
    {
      bold: "Claim",
      text: "ends the position and burns its NFT. It pays out the converted part in vault shares and hands back the alAsset still to convert.",
    },
    {
      bold: "Early exit fee",
      text: "a claim before maturity gives up part of the alAsset still to convert, which the Transmuter keeps.",
    },
  ],
  links: [ALCHEMIX_DOCS.transmuter],
};
