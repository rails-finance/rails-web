// The words of Aave V3's Optimism pages (rails-ops ui-jobs 578): the front door
// and the account card. The card's labels follow Aave V3's position card
// (components/protocol/aave-v3/aave-v3-position-card.tsx) and Aave V4 on Arc's.

import type { OpInterest, OpPositionFigures } from "./position";

export const LABEL = "Aave V3";

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
export const hfText = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const FRONT_DOOR = {
  line: "A wallet's Aave V3 account on Optimism: what it supplies and borrows in dollars at Aave's oracle, its health factor and its interest over the last 30 days.",
  links: { markets: "Market overview" },
};

export const POSITION_PAGE = {
  title: "Aave V3 account",
  sub: "Pool · Optimism",
  unanswered: "The read of this account did not answer. Try again in a minute.",
  empty: "This address supplies and borrows nothing on Aave V3 on Optimism.",
};

export const CARD_WORDS = {
  heading: "Position summary",
  supplied: "Supplied",
  suppliedTip: "What the account has supplied to the Pool, in dollars at Aave's oracle.",
  debt: "Debt",
  debtTip: "What the account owes the Pool, with interest, in dollars at Aave's oracle.",
  health: "Health factor",
  healthTip:
    "Collateral counted at each asset's liquidation threshold, divided by debt, both at Aave's oracle. Below 1 the account can be liquidated.",
  noDebt: "no debt",
  room: "Room to borrow",
  roomTip: "How much more the account can borrow in dollars before its collateral's loan-to-value is used up.",
  supplyRow: (sym: string) => `${sym} supplied`,
  debtRow: (sym: string) => `${sym} borrowed`,
  collateralFlag: "collateral",
  notCollateral: "not collateral",
  reserves: "Reserves",
  columns: { asset: "Asset", amount: "Amount", threshold: "Threshold", rate: "Rate", interest: "Interest, 30 days" },
  rateTip: "The reserve's variable rate, a year, as an APR.",
  interestTip:
    "Interest over 30 days: what the reserve's rate added to this balance since the UTC midnight 30 days back, from the balances at the two dates.",
  withheld: {
    opened: "opened inside the window",
    changed: "changed inside the window",
    unread: "not read",
  } as Record<Exclude<OpInterest["state"], "ok">, string>,
  unpriced: "no dollar price",
  emode: (label: string) => `E-Mode: ${label}`,
  foot: "Dollar values use Aave's oracle at the same block.",
};

/** The (i) explanation's groups for one account. */
export function cardExplainer(p: OpPositionFigures): { title: string; bullets: string[] }[] {
  const groups: { title: string; bullets: string[] }[] = [
    {
      title: "What this account holds",
      bullets: [
        p.supplied.length
          ? `It supplies ${p.supplied.map((x) => `${amount(x.supplied, x.symbol)}${x.isCollateral ? " as collateral" : ""}`).join(", ")}.`
          : "It supplies nothing.",
        p.borrowed.length
          ? `It borrows ${p.borrowed.map((x) => amount(x.debt, x.symbol)).join(", ")}.`
          : "It borrows nothing.",
        ...(p.emode
          ? [
              `It is in the ${p.emode.label} E-Mode category, which lends higher thresholds to the assets it counts and limits borrowing to the assets it allows.`,
            ]
          : []),
      ],
    },
  ];
  if (p.healthFactor != null)
    groups.push({
      title: "How close it is to liquidation",
      bullets: [
        `Its health factor is ${hfText(p.healthFactor)}: collateral at its liquidation thresholds is ${hfText(p.healthFactor)} times its debt.`,
        "If the health factor falls below 1, anyone can repay part of the debt and take collateral at a bonus.",
      ],
    });
  groups.push({
    title: "Interest over 30 days",
    bullets: [
      "The Pool holds each balance as a scaled amount that grows into tokens through the reserve's index. Where the scaled amount is the same at both dates, the interest is the balance now less the balance 30 days back.",
      "Where the account supplied, withdrew, borrowed or repaid inside the 30 days, the figure is withheld.",
    ],
  });
  return groups;
}
