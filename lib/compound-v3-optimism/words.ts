// The words of Compound V3's Optimism pages (rails-ops ui-jobs 578): the front
// door, the wallet page and a Comet account's card. The card's labels follow the
// other chains' Compound V3 card (components/protocol/compound/
// compound-position-card.tsx, compound-risk-slot.tsx).

import type { OpcAccountFigures, OpcInterest, OpcPositionFigures } from "./position";

export const LABEL = "Compound V3";

const num = (x: number) =>
  x.toLocaleString("en-US", {
    maximumFractionDigits: x >= 1000 ? 0 : x >= 1 ? 4 : 8,
    maximumSignificantDigits: x < 1 ? 4 : undefined,
  });

/** One amount in its unit. */
export const amount = (x: number, unit: string) => `${num(x)} ${unit}`;
export const usd = (x: number) =>
  x !== 0 && Math.abs(x) < 0.01
    ? `${x < 0 ? "−" : ""}<$0.01`
    : x.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2,
      });
export const pctText = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;

export const FRONT_DOOR = {
  line: "A wallet's Compound V3 accounts on Optimism: what it lends, borrows and puts up as collateral in each Comet, in dollars at the Comet's price feeds, its borrowing capacity and its interest over the last 30 days.",
  links: { markets: "Market overview" },
};

export const WALLET_PAGE = {
  title: "Compound V3 accounts",
  sub: "Three Comets · Optimism",
  unanswered: "The read of this wallet did not answer. Try again in a minute.",
  empty: "This address lends, borrows and holds nothing in Compound V3 on Optimism.",
  open: (label: string) => `Open the ${label} account`,
};

export const POSITION_PAGE = {
  title: (label: string) => `${label} account`,
  sub: "Comet · Optimism",
  unanswered: "The read of this account did not answer. Try again in a minute.",
  empty: (label: string) => `This address lends, borrows and holds nothing in ${label} on Optimism.`,
  wallet: "All of this wallet's Comets",
};

export const NOT_INDEXED =
  "Not indexed yet on Optimism: this account's history and absorptions arrive when Rails indexes Compound V3 there.";

export const CARD_WORDS = {
  heading: "Position summary",
  collateral: "Collateral",
  collateralTip: (base: string) =>
    `The collateral supplied to the ${base} market, in dollars at its price feeds. Collateral earns no interest and backs borrowing of ${base}.`,
  lent: "Supplied",
  lentTip: (base: string) =>
    `The ${base} supplied to the market, with the interest it has earned, in dollars at its price feed.`,
  debtTip: (base: string) => `The ${base} borrowed from the market, including the interest accrued at its Borrow APR.`,
  limit: "Borrowing capacity used",
  limitTip:
    "The borrow balance as a share of the account's borrowing capacity, which each collateral's Borrow CF (borrow collateral factor) sets. The account becomes liquidatable at a higher level, set by the Liquidation CFs (liquidation collateral factors).",
  noDebt: "no borrow balance",
  room: "Room to borrow",
  roomTip:
    "How much more of the base the account can borrow before it reaches its borrowing capacity, from the Comet's collateral balances, price feeds and Borrow CFs.",
  absorbedAt: "Liquidation point",
  absorbedAtTip:
    "Liquidation point is Rails's name; Compound's docs name no such level. It is the borrow balance at which the account becomes liquidatable: each collateral's value at the Comet's price feed times its Liquidation CF (liquidation collateral factor), in base tokens.",
  lineReached: "Liquidation point reached",
  lineReachedTip:
    "The borrow balance as a share of the liquidation point, Rails's name for the level. The Comet's isLiquidatable says whether the account is liquidatable.",
  drop: "Liquidates on a drop of",
  dropTip:
    "How far the collateral's value can fall, every asset together, before the borrow balance reaches the liquidation point.",
  past: "liquidatable",
  reached: "reached",
  collateralRow: (sym: string) => `${sym} collateral`,
  columns: { asset: "Asset", amount: "Amount", factors: "Borrow CF / Liquidation CF" },
  baseRow: (sym: string, lend: boolean) => `${sym} ${lend ? "supplied" : "borrowed"}`,
  supplyRateLabel: "Supply APR",
  borrowRateLabel: "Borrow APR",
  rateTip:
    "The Comet's rate at its utilization now, a year, without compounding. The 30-day line is the interest added over the last 30 days.",
  interest30: "Interest, 30 days:",
  withheld: {
    opened: "opened inside the window",
    changed: "changed inside the window",
    unread: "not read",
  } as Record<Exclude<OpcInterest["state"], "ok">, string>,
  unpriced: "no price",
  rewards: "COMP to claim",
  rewardsTip:
    "COMP the account can claim from CometRewards. Every Optimism Comet's reward speed is zero, so nothing new accrues, and no Optimism Comet prices COMP.",
  foot: (eth: boolean) =>
    eth
      ? "Dollar values use the Comet's price feeds at the same block; this Comet prices in ETH, turned into dollars at the USDC Comet's WETH price."
      : "Dollar values use the Comet's price feeds at the same block.",
};

/** The (i) explanation's groups for one account. */
export function cardExplainer(p: OpcPositionFigures): { title: string; bullets: string[] }[] {
  const lend = p.supplied > 0;
  const groups: { title: string; bullets: string[] }[] = [
    {
      title: "What this account holds",
      bullets: [
        lend
          ? `It supplies ${amount(p.supplied, p.baseSymbol)} to the ${p.label} market.`
          : p.borrowed > 0
            ? `It borrows ${amount(p.borrowed, p.baseSymbol)} from the ${p.label} market.`
            : `It neither lends nor borrows ${p.baseSymbol}.`,
        p.collateral.length
          ? `It holds ${p.collateral.map((c) => amount(c.amount, c.symbol)).join(", ")} as collateral.`
          : "It holds no collateral.",
        "A Comet lends one base asset. An account either lends it or borrows it against collateral, never both.",
      ],
    },
  ];
  if (p.limitUsed != null)
    groups.push({
      title: "How close it is to liquidation",
      bullets: [
        `It uses ${pctText(p.limitUsed, 0)} of its borrowing capacity, set by each collateral's Borrow CF.`,
        `At ${pctText(p.lineReached ?? 0, 0)} of the liquidation point, set by the Liquidation CFs, ${p.isLiquidatable ? "it is liquidatable now" : "it is not liquidatable"}.`,
        "When the debt passes the liquidation point, anyone can call absorb: the Comet takes the collateral and the debt, and pays the account each collateral's liquidation factor of its value.",
      ],
    });
  groups.push({
    title: "Interest over 30 days",
    bullets: [
      "The Comet holds each account's base as a principal that grows into base through the market's supply or borrow index. Where the principal is the same at both dates, the interest is the balance now less the balance 30 days back.",
      "Where the account supplied, withdrew, borrowed or repaid base inside the 30 days, the figure is withheld.",
    ],
  });
  return groups;
}

/** A wallet page card's one line on an account. */
export function accountLine(f: OpcAccountFigures): string {
  const side =
    f.supplied > 0
      ? `supplies ${amount(f.supplied, f.baseSymbol)}`
      : f.borrowed > 0
        ? `borrows ${amount(f.borrowed, f.baseSymbol)}`
        : null;
  const coll = f.collateral.length
    ? `${f.collateral.length} collateral ${f.collateral.length === 1 ? "asset" : "assets"}`
    : null;
  return [side, coll].filter(Boolean).join(" · ");
}
