// Every word an Euler V2 page draws (rails-ops reference/read-on-visit-candidates-572.md,
// row 10; standards/language-and-tone.md). Figures come from lib/euler/position.ts;
// receipts from lib/euler/provenance.ts.

import type { EulerPosition, EulerWalletRow, UnitShow } from "./position";
import type { EulerChainId } from "./types";

export const LABEL = "Euler V2";
export const CHAIN_NAME: Record<EulerChainId, string> = { 8453: "Base", 42161: "Arbitrum" };

/** "4,838", "0.5415", "1.2 M". */
export function num(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e9) return `${(x / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 })} bn`;
  if (a >= 1e6) return `${(x / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} M`;
  if (a >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return x.toLocaleString("en-US", { maximumSignificantDigits: sig });
}
/** "4.1%". */
export const rate = (x: number): string => `${(x * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
/** Health to two decimals, or within 0.01 of 1 to three, with a further digit while the rounded
 *  figure would read 1 for a value that is not 1, so a rounded "1.00" cannot hide the side of the line. */
export function healthText(h: number): string {
  if (h < 0.99 || h > 1.01) return h.toFixed(2);
  for (let d = 3; d < 9; d++) {
    const s = h.toFixed(d);
    if (h === 1 || Number(s) !== 1) return s;
  }
  return h.toFixed(9);
}
/** A change over the window: "+0.81% over 30.0 days". */
export const growthText = (g: number, days: number): string =>
  `${g >= 0 ? "+" : "−"}${rate(Math.abs(g))} over ${days.toFixed(1)} days`;
/** "0x96c1…07ae". */
export const short = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A figure in the vault's unit of account: "$2,620", "1.31 WETH", or null where the unit is not a token. */
export function inUnit(x: number | null, u: UnitShow): string | null {
  if (x === null) return null;
  if (u.kind === "usd") return `$${x.toLocaleString("en-US", { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 2 })}`;
  if (u.kind === "token") return `${num(x)} ${u.symbol}`;
  return null;
}

/** "Account 2", "Account 0 (the wallet)". */
export const accountName = (i: number | null): string =>
  i === null ? "Account" : i === 0 ? "Account 0 (the wallet)" : `Account ${i}`;

export const FRONT_DOOR = {
  line: (chain: EulerChainId) =>
    `A wallet's Euler V2 accounts on ${CHAIN_NAME[chain]}: each loan with its collateral and health score, and each deposit over the last 30 days.`,
  heading: "Euler V2 accounts",
  narrowing: "Deposits not used as collateral are read on account 0.",
  none: "This wallet has no Euler V2 loan or collateral on any of its 256 accounts, and no deposit on account 0.",
  unanswered: "Rails could not read this wallet from the chain. Try again in a minute.",
  truncated: "This wallet holds more than Rails reads in one visit; the first 150 holdings are shown.",
  loan: "Borrows",
  deposit: "Supplies",
  collateral: "collateral",
  row: (r: EulerWalletRow) => `${num(r.amount)} ${r.asset.symbol}`,
};

export const POSITION_PAGE = {
  title: (p: EulerPosition) => `${p.kind === "loan" ? "Loan" : "Deposit"} in ${p.vaultSymbol}`,
  sub: (p: EulerPosition) => `${accountName(p.index)} · ${p.asset.symbol} vault`,
  unanswered: "Rails could not read this account from the chain. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Holding explanation",
  supplied: "Supplied",
  suppliedTip: "The asset this account's vault shares redeem for now.",
  earned: "Earned in 30 days",
  earnedTip:
    "What the deposit gained over the last 30 days: what its shares redeem for now less what they redeemed for then.",
  earnedGrowth: (g: number, days: number) => growthText(g, days),
  earnedOpened: "Opened inside the 30 days, so Rails does not state its earnings yet.",
  earnedChanged: "Its shares changed inside the 30 days, so Rails does not state its earnings yet.",
  /** The card cell where no 30-day figure is stated; the (i) says why. */
  windowOpenedShort: "Opened inside the 30 days",
  windowChangedShort: "Changed inside the 30 days",
  collateralFor: "Used as collateral",
  collateralForTip: "Whether a loan on this account counts this deposit as collateral.",
  backs: (list: { vaultSymbol: string }[]) => `For ${list.map((c) => c.vaultSymbol).join(", ")}`,
  backsNone: "Not used",
  enabledNoLoan: "Enabled, no loan",
  borrowed: "Borrowed",
  borrowedTip: "What this account owes the vault now, interest included.",
  collateralValue: "Collateral value",
  collateralValueTip: "The account's collateral, priced by this vault's oracle.",
  health: "Health score",
  healthTip:
    "The collateral's value at each vault's liquidation LTV, over the debt's value. At 1.00 or below the loan can be liquidated.",
  healthSub: "liquidation at 1.00 or below",
  interest: "Interest in 30 days",
  interestTip: "What the debt grew by over the last 30 days: the debt now less the debt then.",
  interestGrowth: (g: number, days: number) => growthText(g, days),
  interestOpened: "Opened inside the 30 days, so Rails does not state its interest yet.",
  interestChanged: "Its debt changed inside the 30 days, so Rails does not state its interest yet.",
  unpriced: "no price",
  band: "Collateral on this account",
  bandAmount: "Amount",
  bandValue: "Value",
  bandBorrowLtv: "Borrow LTV",
  bandLtv: "Liquidation LTV",
  bandTruncated: "The account enables more than 10 collateral vaults; the first 10 are shown.",
  foot: (p: EulerPosition) =>
    p.unit.kind === "off"
      ? "Figures are in each asset."
      : p.unit.kind === "usd"
        ? "Dollar figures are the vault oracle's prices at the head block."
        : p.unit.kind === "token"
          ? `This vault prices in ${p.unit.symbol}, so its values are in ${p.unit.symbol}.`
          : "This vault's unit of account is not a token, so its values are not shown.",
};

export type Seg = string | { fig: string };
export interface ExplainGroupWords {
  title: string;
  bullets: Seg[][];
}

/** The 30 days' first bullet: the stated figure, or why none is stated. */
function windowBullet(p: EulerPosition): Seg[] {
  const loan = p.kind === "loan";
  if (p.windowState === "opened") return [loan ? CARD_WORDS.interestOpened : CARD_WORDS.earnedOpened];
  if (p.windowState === "changed") return [loan ? CARD_WORDS.interestChanged : CARD_WORDS.earnedChanged];
  const x = loan ? p.interest : p.earned;
  return loan
    ? [
        "Over the last 30 days the debt grew by ",
        { fig: `${num(x ?? 0)} ${p.asset.symbol}` },
        ", the debt now less the debt then.",
      ]
    : [
        "Over the last 30 days the deposit earned ",
        { fig: `${num(x ?? 0)} ${p.asset.symbol}` },
        ", what its shares redeem for now less what they redeemed for then.",
      ];
}

export function cardExplainer(p: EulerPosition): ExplainGroupWords[] {
  const groups: ExplainGroupWords[] = [];
  if (p.kind === "loan") {
    groups.push({
      title: "The loan",
      bullets: [
        [
          "This account owes ",
          { fig: `${num(p.borrowed)} ${p.asset.symbol}` },
          ` to the ${p.vaultSymbol} vault. The vault is the account's controller: it decides whether the account may withdraw or move its collateral.`,
        ],
        [
          "The health score is ",
          { fig: p.health === null ? "–" : healthText(p.health) },
          ". It is the collateral's value at each vault's liquidation LTV over the debt's value, both priced by this vault's oracle.",
        ],
      ],
    });
  } else {
    groups.push({
      title: "The deposit",
      bullets: [
        [
          "This account holds shares of the ",
          { fig: p.vaultSymbol },
          " vault that redeem for ",
          { fig: `${num(p.supplied)} ${p.asset.symbol}` },
          ". A share redeems for more as borrowers pay interest.",
        ],
        p.collateralFor.length
          ? [
              "The account's loan from ",
              { fig: p.collateralFor.map((c) => c.vaultSymbol).join(", ") },
              " counts this deposit as collateral.",
            ]
          : ["No loan on this account counts this deposit as collateral."],
      ],
    });
  }
  groups.push({
    title: "The 30 days",
    bullets: [
      windowBullet(p),
      [
        "Rails reads two blocks ",
        { fig: `${p.window.days.toFixed(1)} days` },
        p.kind === "loan"
          ? " apart. The percentage under the interest is how much the vault's debts grew between them."
          : " apart. The percentage under the earnings is how much the vault's share price grew between them.",
      ],
    ],
  });
  return groups;
}

export const VAULT_SECTION = {
  title: "The vault",
  sub: "The whole vault, read at the same blocks.",
  explainerLabel: "vault explanation",
  supplied: "Supplied",
  borrowed: "Borrowed",
  utilisation: "Utilization",
  shareGrowth: "Share price",
  borrowApy: "Borrow APY",
  price: "Oracle price",
  none: "–",
  shareGrowthText: (g: number, days: number) => growthText(g, days),
  borrowApyNow: (now: number) => `${rate(now)} now`,
  debtGrowthText: (g: number, days: number) => `debts grew ${rate(g)} over ${days.toFixed(1)} days`,
  priceText: (p: EulerPosition) => inUnit(p.price, p.unit) ?? "not priced",
};

export function vaultExplainer(p: EulerPosition): ExplainGroupWords[] {
  return [
    {
      title: "The vault",
      bullets: [
        ["Supplied is everything depositors' shares redeem for; borrowed is what borrowers owe, interest included."],
        [
          "Utilization is borrowed over supplied. Many utilization-based rate models raise the borrow rate as utilization rises. Depositors earn what borrowers pay, less the vault's fee.",
        ],
        [
          "Borrow APY compounds the vault's per-second rate over a year of 365.2425 days. The 30-day figure is how much the vault's debts grew over the window.",
        ],
        [
          "The vault prices assets in its unit of account through its oracle router. ",
          p.unit.kind === "off"
            ? "Here that unit is US dollars, and Rails states figures in each asset."
            : p.unit.kind === "usd"
              ? "Here that unit is US dollars."
              : p.unit.kind === "token"
                ? `Here that unit is ${p.unit.symbol}.`
                : "Here that unit is not a token, so Rails shows no value.",
        ],
      ],
    },
  ];
}
