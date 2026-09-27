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
  text: "the part of the debt the Transmuter has claimed as its stakers' deposits matured. It grows block by block, and the line's next redemption clears it. See How Alchemix repays a loan, on a redemption card or the position card.",
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

export const ALCHEMIX_OPEN_DEPOSIT: LearnMoreContent = {
  title: "Opening a position and depositing",
  intro:
    "An Alchemix position is opened by depositing vault shares into the line's Alchemist, which mints an NFT that is the position. A later deposit adds shares to a position that already exists. A deposit moves the collateral only; the debt stays where it was, so collateralisation rises.",
  detailsHeading: "Key concepts",
  details: [CORE_COLLATERAL, CORE_RATIO, CORE_ROUTER],
  links: [ALCHEMIX_DOCS.selfRepayingLoans, ALCHEMIX_DOCS.takeALoan, ALCHEMIX_DOCS.myt, ALCHEMIX_DOCS.router],
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
    "The holder can close a position in one step without bringing the synthetic back: the Alchemist puts enough of the position's vault shares against its debt to repay all of it, and returns the rest of the collateral. Alchemix calls this a self-liquidation. The holder chose it, and no liquidator takes a fee.",
  detailsHeading: "What the event states",
  details: [
    { bold: "Shares used", text: "are in the log: the vault shares that went against the debt." },
    {
      bold: "Debt set aside for repayment",
      text: "is repaid first, as a force repay in the same transaction, with the protocol's fee on that part.",
    },
    { bold: "Debt and collateral after", text: "are both zero: the position is closed." },
  ],
  links: [ALCHEMIX_DOCS.selfLiquidate, ALCHEMIX_DOCS.router, ALCHEMIX_DOCS.borrowerFee],
};

/** The protocol's central idea, the one a reader has to own to read an
 *  Alchemix timeline: Transmuter stakes maturing are what set debt aside and
 *  what redemptions clear. Opened from every redemption card and from the
 *  position card. */
export const ALCHEMIX_HOW_IT_WORKS: LearnMoreContent = {
  title: "How Alchemix repays a loan",
  intro:
    "Every Alchemix line has two halves. The Alchemist holds borrowers' positions: vault shares in, a synthetic token such as alUSD out. The Transmuter takes that synthetic back from anyone who holds it and, over time, turns it into the vault shares borrowers put up. The second half is what repays the first.",
  stepsHeading: "How a redemption happens",
  steps: [
    "Someone holding alUSD deposits it in the line's Transmuter, where it matures over a period measured in blocks.",
    "As those deposits mature, the Alchemist sets aside a matching amount of debt across every open position on the line, in proportion to what each position owes. That is each position's Set aside for repayment figure, and it grows block by block.",
    "When a staker claims, the Transmuter redeems: every open position's set-aside debt is cleared by the same ratio, and a matching slice of its collateral moves to the Transmuter: vault shares worth one unit of the asset underneath (USDC, or WETH on alETH) for each unit of debt cleared.",
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
      text: "Each redemption lowers the debt and the collateral by matching values, so the position's collateral less its debt stays about where it was. Each redemption card states the difference for that position as its net.",
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
      text: "Its collateralisation is the collateral in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. Minting more or withdrawing must leave it above the line's minimum. If a falling share price takes it to the line's liquidation line or below, anyone can liquidate the position: the Alchemist uses its collateral to repay debt until the ratio is back above the minimum, and pays the liquidator a fee from it. The position card states both lines, read from the Alchemist, and how many liquidations the line has had.",
    },
  ],
  links: [
    ALCHEMIX_DOCS.selfRepayingLoans,
    ALCHEMIX_DOCS.transmuter,
    ALCHEMIX_DOCS.redemptionRate,
    ALCHEMIX_DOCS.earmarking,
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
    { bold: "The fee", text: "is paid to whoever did it, in shares and in the asset underneath." },
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
      text: "clears every open position's set-aside debt on the line at once, by one ratio, and takes a matching slice of each one's collateral for the Transmuter.",
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

/** The Lifetime flows "?": what the tower sums, in which unit, and what it
 *  leaves out. Liquity V2's `liquityEconomicsContent` is the model. */
export const ALCHEMIX_LIFETIME_FLOWS: LearnMoreContent = {
  title: "How the lifetime flows are counted",
  intro:
    "The tower sums the position's own events over its whole life, each side in its own unit: vault shares on the collateral side, the line's synthetic on the debt side. Nothing is converted into dollars or into the asset underneath.",
  detailsHeading: "Key concepts",
  details: [
    {
      bold: "Collateral side",
      text: "shares deposited, then shares withdrawn, offered against the debt in a repay, used to close the position or taken by a liquidation, and the shares held now, from the current reading.",
    },
    {
      bold: "Debt side",
      text: "synthetic minted, then synthetic burned and debt cleared by repays, and the debt read now.",
    },
    {
      bold: "What the totals leave out",
      text: "redemptions, which are the line's events rather than the position's, and the protocol fee a repay takes in shares. So the shares deposited less the exits drawn need not equal the shares held now; the Explanation pane states the difference for this position.",
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
      text: "on a repay or a liquidation, where the log carries it. Logs from before 11 May 2022 do not.",
    },
    {
      bold: "The account's figures",
      text: "were read once, when V2 closed, and not at each event.",
    },
  ],
  links: [ALCHEMIX_DOCS.v3Migration],
};
