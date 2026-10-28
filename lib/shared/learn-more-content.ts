import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import { SEAMLESS_DOCS_URL } from "@/lib/aave-v3/protocol-name";
import { FAQ_URLS, AAVE_FAQ_URLS } from "@/lib/shared/faq-urls";
import type { VaultPositionFamily } from "@/lib/aave-vaults/vault-position";
import { indefiniteArticle, viewWord } from "@/lib/utils/format";

// ── Lifetime flows: how to read the charts ───────────────────────────────────

/** The Lifetime flows panel's how-to-read, brief: the bars behind their own
 *  "?", and the events row with whatever charts stand over it behind the
 *  "?" on the events heading, so the modal reads only what is on screen.
 *  One text on every explorer (ui-jobs §264). */
export function lifetimeFlowsBarsContent(): LearnMoreContent {
  return {
    title: "How to read the bars",
    intro:
      "Blue is the collateral, green the debt. The solid part is what is held or owed on the cursor's day; the hatched parts are what left. Tap a part for its name, value and share.",
  };
}

/** The events row's marks for one position, in its family's words: each
 *  side's events by the names its timeline gives them, and the marks the
 *  family draws. */
export interface FlowEventsHelp {
  sides: { hue: "Blue" | "Green"; label: string; events: string[] }[];
  /** Both sides' hues, half and half, where the position has both. */
  both: boolean;
  /** The family's names for its warning marks, where it draws them. */
  liquidation?: string;
  redemption?: string;
  caution?: string;
  delegateRate?: boolean;
  ownerRate?: boolean;
}

/** The price chart under the value line: an asset's price, or the health
 *  factor, and whether it draws a liquidation line. */
export interface FlowPriceHelp {
  health: boolean;
  symbol: string;
  level: boolean;
  /** The series' sentence where it is the family's: a ratio view's (Maker's
   *  collateral ratio, Fluid's position ratio, Dolomite's margin ratio), a
   *  Trove's level (Liquity V1's, which names Recovery Mode) or a share
   *  price (Sky's chi), naming its source and its line. */
  help?: string;
  /** The series' name where it is not "{symbol} price" (Sky's share price). */
  name?: string;
}

const listWords = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** What is on screen under the events heading: the events row alone, or the
 *  value line and the price chart over it (`charts`), or the price chart
 *  alone (`events` null). */
export function lifetimeFlowsStackContent(opts: {
  events: FlowEventsHelp | null;
  charts: { value: boolean; price: FlowPriceHelp | null } | null;
}): LearnMoreContent {
  const { events, charts } = opts;
  const details: { bold: string; text: string }[] = [];
  if (charts?.value) details.push({ bold: "The value line", text: "collateral and debt in USD at each day's close." });
  const price = charts?.price;
  if (price)
    details.push(
      price.health && price.help
        ? { bold: `The ${viewWord(price.symbol)}`, text: price.help }
        : price.help
          ? { bold: `The ${price.name ?? `${price.symbol} price`}`, text: price.help }
          : price.health
            ? {
                bold: "The health factor",
                text: "on the same days; the red line at 1 is where it liquidates. The list in the tip picks it or an asset's price.",
              }
            : {
                bold: `The ${price.symbol} price`,
                text: `on the same days${price.level ? "; the red line is where the position liquidates" : ""}.`,
              },
    );
  if (events) {
    const hues = events.sides
      .filter((s) => s.events.length > 0)
      .map((s) => `${s.hue.toLowerCase()} for ${s.label.toLowerCase()} (${listWords(s.events)})`);
    // A family's mark name ("Liquidation") reads as a noun in the sentence.
    const named = (w: string) => (/^an? /.test(w) ? w : `${indefiniteArticle(w).toLowerCase()} ${w.toLowerCase()}`);
    const marks = [
      events.liquidation && `a red triangle is ${named(events.liquidation)}`,
      events.redemption && `an orange triangle is ${named(events.redemption)}`,
      events.caution && `an orange triangle${events.redemption ? ", also," : " is"} ${events.caution}`,
      events.delegateRate && "a pink dot is the delegate setting the interest rate",
      events.ownerRate && "a ring is the owner changing it",
    ].filter((m): m is string => !!m);
    const sentence = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}.`;
    details.push({
      bold: "The events",
      text: [
        `a mark per day with events: ${listWords(hues)}${events.both ? "; half and half where both moved" : ""}.`,
        "Above the middle, into the position; below, out of it.",
        ...(marks.length ? [sentence(listWords(marks))] : []),
      ].join(" "),
    });
  }
  details.push({
    bold: "The cursor",
    text: `press and drag ${charts ? "a chart or the events" : "the events"} to move it; the date${events ? " under the events" : ""} shows its day, its arrows step between days with events.`,
  });
  return {
    title:
      charts && events
        ? "How to read the events and charts"
        : events
          ? "How to read the events"
          : "How to read the price chart",
    intro: charts
      ? `The ${events ? "charts and the events" : "chart"} share one time axis, oldest at the left, and one cursor.`
      : "The position's life, oldest at the left.",
    detailsHeading: "The parts:",
    details,
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
      "This panel breaks down what the trove costs to carry and traces every unit of debt and collateral that has flowed through it over its lifetime. Debt is valued at BOLD's $1 face.",
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
    title: "About lifetime flows",
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

// ── Stability Pool ──────────────────────────────────────────────────────────

// ── Governance ───────────────────────────────────────────────────────────────

// ── Vaults ───────────────────────────────────────────────────────────────────

// ── Spark (SparkLend) — doc links of the Lifetime flows modals ───────────────
//
// The event, position and market modals are content/spark/event-prose.yaml's.
// These links serve the economics modals below (Z3, still TSX).

const SPARK_DOC_URLS = {
  SPARKLEND: "https://docs.spark.finance/products/sparklend",
  LIQUIDATIONS: "https://docs.spark.finance/products/sparklend/guides/liquidations",
  FAQ: "https://docs.spark.finance/faq",
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

// ── Market notes ─────────────────────────────────────────────────────────────
// The "?" behind a market note row (components/shared/market-note-row.tsx).
// Layer 2 only: how this KIND of note is read, never this note's figures — the
// figures live on the row and their receipts in the inspector. One modal per
// note kind, taking the protocol the note was built for where a kind has more
// than one home: the modal teaches that protocol's mechanism and links that
// protocol's docs. A new kind adds a function here; a new home adds a case.

/** The sentence every market-note modal opens on, naming what the page calls
 *  the position. */
function marketNoteLead(noun: string): string {
  return `A market note is a row in a ${noun}'s timeline that states something which happened to the market while this ${noun} transacted nothing. It is never counted: no total, filter, run or export table moves because a note is shown.`;
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
export type RateStepProtocol = "aave-v3" | "spark";

export function marketNoteRateStepContent(protocol: RateStepProtocol): LearnMoreContent {
  switch (protocol) {
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

/** The "?" on a vault holder's Lifetime flows panel. */
export function vaultFlowsContent(assetSymbol: string, shareSymbol: string): LearnMoreContent {
  return {
    title: "How the lifetime flows are counted",
    intro: `The bar sums this address's events in this vault over its whole history, in ${assetSymbol}: every Transfer of ${shareSymbol} the vault emitted about it, and the ERC-4626 Deposit and Withdraw events emitted beside them.`,
    detailsHeading: "The lines:",
    details: [
      {
        bold: "Deposited and Withdrawn",
        text: "the assets word of each ERC-4626 Deposit and Withdraw. A mint or a burn that carried no such event is valued at the vault's share price at its block.",
      },
      {
        bold: "Received by transfer and Sent to another account",
        text: `a transfer moves ${shareSymbol} and no ${assetSymbol}; its shares are valued at the vault's share price (convertToAssets) at its block.`,
      },
      {
        bold: "Still in the vault",
        text: "at the page's block, the vault's convertToAssets of the balance held; on an earlier day, the shares held after that day's last event at its share price.",
      },
      {
        bold: "Share price change",
        text: "each bar's last line: what is held less every flow above, the change in the vault's share price since each flow on the shares held. No block between the address's events is read.",
      },
    ],
    extraParagraphs: [
      `The share ledger closes: minted plus transferred in, less burned and transferred out, is the balance the vault's balanceOf reports at the page's block, to the wei.`,
      "The panel is drawn under the condition the rows are: a history that could not be reconciled against the vault's balanceOf, and one too large to draw whole, both leave it off the page.",
    ],
  };
}

/** Where each vault family's documentation explains the vault. */
const VAULT_EVENT_LINKS: Record<VaultPositionFamily | "yearn", LearnMoreLink[]> = {
  sgho: [{ label: "Savings GHO (sGHO)", url: "https://aave.com/docs/ecosystem/gho/sgho" }],
  stata: [{ label: "Static aTokens", url: "https://aave.com/docs/aave-v3/smart-contracts/tokenization" }],
  "umbrella-stake": [{ label: "Umbrella", url: "https://aave.com/docs/aave-v3/umbrella" }],
  morpho: [{ label: "Morpho vaults", url: "https://docs.morpho.org/learn/concepts/vault/" }],
  yearn: [{ label: "Yearn documentation", url: "https://docs.yearn.fi/getting-started/intro" }],
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
      ? { label: "E-mode on SparkLend", url: "https://docs.spark.finance/products/sparklend/guides/e-mode" }
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

/** The "?" on an asset page's chart (rails-ops reference/asset-key-map.md):
 *  a line per oracle, the picked one in colour. */
/** The asset chart's how-to-read on Lightweight Charts (anatomy A3.7). */
export function assetLwChartContent(symbol: string): LearnMoreContent {
  return {
    title: "How to read the price chart",
    intro: `${symbol}'s price from each feed a lending protocol reads on this chain, over time in UTC. Protocols reading one feed, directly or through a wrapper that only rescales it, share a line.`,
    detailsHeading: "The parts:",
    details: [
      {
        bold: "The thick blue line",
        text: "the main line: the one the most protocols read, or, opened from a protocol, the one that protocol reads.",
      },
      {
        bold: "The thin lines",
        text: "the other feeds, on the same axis, each in the colour of its key over the chart (dashed where the colours run out).",
      },
      {
        bold: "Picking a line out",
        text: "point at a row over the chart or under it, or at a line, to light that line in both panes; click or tap a row to hide its line or show it again, and the price axis rescales to the lines shown.",
      },
      {
        bold: "Steps",
        text: "a price holds until the next round, or before the stored rounds until the next day's read, so each line moves in steps.",
      },
      {
        bold: "Zoom and pan",
        text: "scroll or pinch to zoom, drag to pan, double-click to go back to the opening view; the buttons over the chart pick a span. Zoomed in on stored rounds, the chart reads every round in the window; zoomed out, each step is the last price of its span.",
      },
      {
        bold: "The readout",
        text: "over the chart: the time under the cursor, each line's price then, and on stored rounds the round, block and transaction behind the main line's price.",
      },
      {
        bold: "The spread pane",
        text: "under the prices, each other line's deviation from the main line, with dashed lines at ±1 %. Where both lines read stored rounds they are compared at the same moment; before that, a day compares two lines only where both were read within ten minutes of each other, or one is a fixed price. Under the chart, a line more than 1 % from the main line names its largest gap, which moves the chart there. A Maker line's gap is named with its cause: Maker prices from the median of an hour before.",
      },
      {
        bold: "Stored rounds",
        text: "the shaded span is the daily store's read of the oracle, a price per UTC day; after it, the lines are the oracle's rounds as stored.",
      },
    ],
  };
}
