// The words of Aave V4's Arc pages (rails-ops ui-jobs 577): the front door, a
// wallet's spokes and a spoke account's card. The card's labels follow the
// Ethereum spoke card's (components/protocol/aave-v4/aave-v4-spoke-card.tsx).

import type { ArcInterest, ArcPositionFigures, ArcWalletSpoke } from "./position";

export const LABEL = "Aave V4";

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
  line: "A wallet's Aave V4 accounts on Arc's three spokes, each with what it supplies and borrows in dollars at the spoke's oracle, its health factor and its interest over the last 30 days.",
  heading: "Aave V4 accounts",
  none: "This address supplies and borrows nothing on Aave V4's spokes on Arc.",
  unanswered: "The read of this wallet's accounts did not answer. Try again in a minute.",
  row: (s: ArcWalletSpoke) => `${s.name} spoke`,
  rowSub: (s: ArcWalletSpoke) =>
    [
      s.supplied.length ? `supplies ${s.supplied.map((x) => x.symbol).join(", ")}` : null,
      s.borrowed.length ? `borrows ${s.borrowed.map((x) => x.symbol).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  links: { markets: "Spokes", hubs: "Hubs" },
};

export const POSITION_PAGE = {
  title: (spoke: string) => `${spoke} spoke · Aave V4`,
  sub: "Core hub · Arc",
  unanswered: "The read of this account did not answer. Try again in a minute.",
  empty: (spoke: string) => `This address supplies and borrows nothing on the ${spoke} spoke.`,
};

export const CARD_WORDS = {
  heading: "Position summary",
  supplied: "Supplied",
  suppliedTip: "What the account has supplied to the spoke, in dollars at the spoke's oracle.",
  debt: "Debt",
  debtTip: "What the account owes the spoke, drawn and premium, with interest, in dollars at the spoke's oracle.",
  health: "Health factor",
  healthTip:
    "Collateral counted at each asset's collateral factor, divided by debt, both at the spoke's oracle. Below 1 the account can be liquidated.",
  noDebt: "no debt",
  borrowLimit: "Maximum borrowing power",
  borrowLimitTip:
    "Collateral counted at each asset's collateral factor: the debt at which the health factor reaches 1.",
  supplyRow: (sym: string) => `${sym} supplied`,
  debtRow: (sym: string) => `${sym} borrowed`,
  collateralFlag: "collateral",
  notCollateral: "not collateral",
  borrowRateTip: (premium: number) =>
    `The borrow APY is the hub's borrow rate compounded over a year. This account pays a premium of ${pctText(premium)} of its drawn debt on top, set by its collateral's risk.`,
  interestTip:
    "Interest over 30 days: what the hub's rates added to this balance since the UTC midnight 30 days back, from the balances at the two dates.",
  reserves: "Reserves",
  columns: {
    asset: "Asset",
    amount: "Amount",
    factor: "Collateral factor",
    rate: "Borrow APY",
    interest: "Interest, 30 days",
  },
  withheld: {
    opened: "opened inside the window",
    changed: "changed inside the window",
    unread: "not read",
  } as Record<Exclude<ArcInterest["state"], "ok">, string>,
  unpriced: "no dollar price",
  foot: "Dollar values use each spoke's oracle at the same block.",
};

/** The (i) explanation's groups for one account. */
export function cardExplainer(p: ArcPositionFigures): { title: string; bullets: string[] }[] {
  const groups: { title: string; bullets: string[] }[] = [
    {
      title: "What this account holds",
      bullets: [
        p.supplied.length
          ? `It supplies ${p.supplied.map((x) => `${amount(x.supplied, x.symbol)}${x.isCollateral ? " as collateral" : ""}`).join(", ")} on the ${p.spoke} spoke.`
          : `It supplies nothing on the ${p.spoke} spoke.`,
        p.borrowed.length
          ? `It borrows ${p.borrowed.map((x) => amount(x.debt, x.symbol)).join(", ")} from the Core hub through the spoke.`
          : "It borrows nothing.",
      ],
    },
  ];
  if (p.healthFactor != null)
    groups.push({
      title: "How close it is to liquidation",
      bullets: [
        `Its health factor is ${hfText(p.healthFactor)}: collateral at its collateral factors is ${hfText(p.healthFactor)} times its debt.`,
        "If the health factor falls below 1, anyone can repay part of the debt and take collateral at a bonus.",
      ],
    });
  groups.push({
    title: "Interest over 30 days",
    bullets: [
      "Each balance is held as shares of the hub, which grow as interest accrues. Where the shares are the same at both dates, the interest is the balance now less the balance 30 days back.",
      "Where the account supplied, withdrew, borrowed or repaid inside the 30 days, the figure is withheld.",
    ],
  });
  return groups;
}
