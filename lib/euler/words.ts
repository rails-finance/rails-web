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
    `A wallet's Euler V2 accounts on ${CHAIN_NAME[chain]}: each loan with its collateral and health, and each deposit over the last 30 days.`,
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
  earnedTip: "What the vault's share price added over the last 30 days to the shares this account holds now.",
  earnedYear: (x: number) => `${rate(x)} a year`,
  earnedChanged: "on the shares held now",
  noWindow: "The vault is younger than 30 days.",
  collateralFor: "Collateral",
  collateralForTip: "Whether a loan on this account counts this deposit as collateral.",
  backs: (list: { vaultSymbol: string }[]) => `For ${list.map((c) => c.vaultSymbol).join(", ")}`,
  backsNone: "Not used",
  enabledNoLoan: "Enabled, no loan",
  borrowed: "Borrowed",
  borrowedTip: "What this account owes the vault now, interest included.",
  collateralValue: "Collateral",
  collateralValueTip: "The account's collateral, priced by this vault's oracle.",
  health: "Health",
  healthTip:
    "The collateral's value at each vault's liquidation LTV, over the debt's value. Below 1.00 the loan can be liquidated.",
  healthSub: "liquidation below 1.00",
  interest: "Interest in 30 days",
  interestTip: "What the vault's interest index added over the last 30 days to the debt this account owes now.",
  interestYear: (x: number) => `${rate(x)} a year`,
  interestChanged: "on the debt owed now",
  unpriced: "no price",
  band: "Collateral on this account",
  bandAmount: "Amount",
  bandValue: "Value",
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
          "Health is ",
          { fig: p.health === null ? "–" : p.health.toFixed(2) },
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
      p.kind === "loan"
        ? ["Interest is the vault's interest index growth over the window, applied to the debt owed now."]
        : ["Earnings are the vault's share price growth over the window, applied to the shares held now."],
      [
        "Rails reads two blocks ",
        { fig: `${p.window.days.toFixed(1)} days` },
        " apart, and the yearly rate is that growth times 365 over those days.",
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
  utilisation: "Utilisation",
  shareGrowth: "Share price",
  borrowRate: "Borrow rate",
  price: "Oracle price",
  none: "–",
  shareGrowthText: (g: number, days: number) =>
    `${g >= 0 ? "+" : "−"}${rate(Math.abs(g))} over ${days.toFixed(1)} days`,
  borrowRateText: (now: number, year: number | null) =>
    year === null ? `${rate(now)} a year now` : `${rate(now)} a year now, ${rate(year)} over the 30 days`,
  priceText: (p: EulerPosition) => inUnit(p.price, p.unit) ?? "not priced",
};

export function vaultExplainer(p: EulerPosition): ExplainGroupWords[] {
  return [
    {
      title: "The vault",
      bullets: [
        ["Supplied is everything depositors' shares redeem for; borrowed is what borrowers owe, interest included."],
        [
          "Utilisation is borrowed over supplied. The borrow rate rises with it, and depositors earn what borrowers pay, less the vault's fee.",
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
