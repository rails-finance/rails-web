// Compound V3 (Comet) — the tower's Explanation pane + "?" FAQ. Narrates the
// same `ChainTruthTowerData` computeCompoundEconomics builds, in the
// Liquity V2 / Aave V4 grammar (a status lead + bullets derived from the
// data, then a LearnMore FAQ) — see chain-truth-tower.tsx's `explanation`/
// `learnMore` props.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

const COMPOUND_DOC_URLS = {
  OVERVIEW: "https://docs.compound.finance/",
  COLLATERAL_BORROWING: "https://docs.compound.finance/collateral-and-borrowing/",
  LIQUIDATION: "https://docs.compound.finance/liquidation/",
  INTEREST_RATES: "https://docs.compound.finance/interest-rates/",
} as const;

export interface CompoundEconomicsOpts {
  /** Names the Base deployment ("Compound V3 on Base") rather than Ethereum's. */
  onBase?: boolean;
}

function protocolName(opts?: CompoundEconomicsOpts): string {
  return opts?.onBase ? "Compound V3 on Base" : "Compound V3";
}

function sumUsd(lines: TowerLine[]): number | null {
  if (lines.length === 0 || !lines.every((l) => l.usd != null)) return null;
  return lines.reduce((s, l) => s + (l.usd ?? 0), 0);
}

function oneSymbol(lines: TowerLine[]): string | null {
  const syms = new Set(lines.map((l) => l.symbol));
  return syms.size === 1 ? [...syms][0] : null;
}

/** Text for a group of lines — the USD sum when valued, else a token amount
 *  when the group speaks one symbol, else the assets it names. Lines below
 *  one token-millionth are dust: named as such, never counted as an asset. */
function describeLines(lines: TowerLine[], valued: boolean): string | null {
  if (lines.length === 0) return null;
  if (valued) {
    const usd = sumUsd(lines);
    if (usd != null) return formatCompactUsd(usd);
  }
  const sym = oneSymbol(lines);
  if (sym) return `${formatCompact(lines.reduce((s, l) => s + l.amount, 0))} ${sym}`;
  const real = [...new Set(lines.filter((l) => l.amount >= 1e-6).map((l) => l.symbol))];
  const dust = lines.some((l) => l.amount < 1e-6);
  if (real.length === 0) return "dust";
  return `${joinNames(real)}${dust ? " and dust" : ""}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The one symbol a side speaks, when every one of its lines agrees — the
 *  condition under which a plain `lifetimeInflow` scalar can carry a symbol. */
function sideSymbol(side: TowerSideData): string | null {
  const syms = new Set(
    [
      ...side.current,
      ...(side.received ?? []),
      ...side.exited,
      ...side.liquidated,
      ...(side.interest ? [side.interest] : []),
    ].map((l) => l.symbol),
  );
  return syms.size === 1 ? [...syms][0] : null;
}

function fmtScalar(value: number, valued: boolean, symbol: string | null): string | null {
  if (value <= 0) return null;
  if (valued) return formatCompactUsd(value);
  if (symbol) return `${formatCompact(value)} ${symbol}`;
  return null;
}

/** A line's value at today's oracle price, where the tower shows the absorb's
 *  own (the line keeps today's only in its token amount). */
function todayUsd(lines: TowerLine[], priceOf: (l: TowerLine) => number | null): number | null {
  let t = 0;
  for (const l of lines) {
    const p = priceOf(l);
    if (p == null) return null;
    t += l.amount * p;
  }
  return t;
}

export function compoundEconomicsExplanation(
  data: ChainTruthTowerData,
  opts?: CompoundEconomicsOpts & {
    todayPrice?: (address: string) => number | null;
    /** The interest inside today's debt (compoundInterestInDebt): the debt
     *  less what was borrowed and repaid since the balance last stood at zero. */
    interestInDebt?: { amount: number; since: number } | null;
  },
): ReactNode {
  const name = protocolName(opts);
  const valued = data.valued;
  const collSymbol = sideSymbol(data.collateral);
  const debtSymbol = sideSymbol(data.debt);
  const baseSym = data.debt.current[0]?.symbol ?? data.debt.exited[0]?.symbol ?? debtSymbol;
  // The base token's own lines sit on the collateral side too (a lent
  // balance, its withdrawals): the collateral sentences leave them out.
  const isBase = (l: TowerLine) => baseSym != null && l.symbol === baseSym;

  const collOnlySymbols = new Set(
    [...data.collateral.current, ...data.collateral.exited, ...data.collateral.liquidated]
      .filter((l) => !(baseSym != null && l.symbol === baseSym))
      .map((l) => l.symbol),
  );
  const suppliedText = fmtScalar(
    data.collateral.lifetimeInflow,
    valued,
    collOnlySymbols.size === 1 ? [...collOnlySymbols][0] : collSymbol,
  );
  const lentInText = describeLines(
    (data.collateral.received ?? []).filter((l) => l.key === "base-lent"),
    valued,
  );
  const collWithdrawn = data.collateral.exited.filter((l) => !isBase(l));
  const baseWithdrawn = data.collateral.exited.filter(isBase);
  const withdrawnText = describeLines(collWithdrawn, valued);
  const baseWithdrawnText = describeLines(baseWithdrawn, valued);
  const borrowedText = fmtScalar(data.debt.lifetimeInflow, valued, debtSymbol);
  const repaidText = describeLines(data.debt.exited, valued);
  const chargedText = describeLines(data.debt.earned ?? [], valued);
  const earnedLifeText = describeLines(data.collateral.earned ?? [], valued);
  const interestText =
    data.debt.interest && data.debt.interest.amount > 0 ? describeLines([data.debt.interest], valued) : null;
  const earnedText =
    data.collateral.interest && data.collateral.interest.amount > 0
      ? describeLines([data.collateral.interest], valued)
      : null;
  const currentCollText = describeLines(data.collateral.current, valued);
  // Today's debt is the principal and the interest together where the tower
  // splits them.
  const currentDebtText = describeLines(
    [...data.debt.current, ...(data.debt.interest ? [data.debt.interest] : [])],
    valued,
  );
  const basePrice =
    data.debt.current[0] && data.debt.current[0].usd != null && data.debt.current[0].amount > 0
      ? data.debt.current[0].usd / data.debt.current[0].amount
      : null;
  const chargedTotal = (data.debt.earned ?? []).reduce((t, l) => t + l.amount, 0);
  // Interest inside today's debt is part of the lifetime interest charged;
  // a larger figure means the walk missed rows, and it is not stated.
  const inDebt =
    opts?.interestInDebt && (chargedTotal <= 0 || opts.interestInDebt.amount <= chargedTotal * 1.0001)
      ? opts.interestInDebt
      : null;
  const inDebtText =
    inDebt && baseSym
      ? valued && basePrice != null
        ? formatCompactUsd(inDebt.amount * basePrice)
        : `${formatCompact(inDebt.amount)} ${baseSym}`
      : null;
  const seized = data.collateral.liquidated;
  const seizedText = describeLines(seized, valued);
  const clearedText = describeLines(data.debt.liquidated, valued);
  const credit = (data.collateral.received ?? []).filter((l) => l.key === "base-credit");
  const creditText = describeLines(credit, valued);
  const atAbsorb = seized.some((l) => l.tipLabel != null);
  const seizedToday =
    valued && atAbsorb && opts?.todayPrice
      ? todayUsd(seized, (l) => opts.todayPrice!(l.key.replace(/^cl-/, "")))
      : null;

  const hasAnything =
    suppliedText ||
    withdrawnText ||
    borrowedText ||
    repaidText ||
    interestText ||
    earnedText ||
    currentCollText ||
    currentDebtText ||
    seizedText ||
    clearedText;
  if (!hasAnything) return null;

  const bullets: string[] = [];

  if (suppliedText) {
    bullets.push(
      `Supplied ${suppliedText} in collateral over its recorded history${withdrawnText ? `, and withdrew ${withdrawnText} of it` : ""}.`,
    );
  } else if (withdrawnText) {
    bullets.push(`Withdrew ${withdrawnText} of collateral over its recorded history.`);
  }

  if (borrowedText) {
    bullets.push(
      `Borrowed ${borrowedText} against it${chargedText ? `${repaidText ? "," : " and"} was charged ${chargedText} of interest over the position's life` : ""}${repaidText ? `, and repaid ${repaidText}` : ""}.`,
    );
  } else if (repaidText) {
    bullets.push(`Repaid ${repaidText} of debt over its recorded history.`);
  }

  if (inDebtText && inDebt) {
    bullets.push(
      `Of today's debt, ${inDebtText} is interest charged since ${formatDate(inDebt.since)}, when the debt last started from zero.`,
    );
  } else if (interestText) {
    bullets.push(`About ${interestText} of the current debt is interest.`);
  }

  if (earnedText) {
    bullets.push(`About ${earnedText} of the current lent balance is interest earned over the position's life.`);
  }

  if (seizedText || clearedText) {
    const priceNote = seizedToday != null ? ` (${formatCompactUsd(seizedToday)} at today's prices)` : "";
    bullets.push(
      `Liquidation seized ${seizedText ?? "no collateral"}${atAbsorb ? " at the absorb's prices" : ""}${priceNote} and cleared ${clearedText ?? "no"} of debt${creditText ? `; ${creditText} was left over after the debt and stayed in the account as a lent balance` : ""}.`,
    );
  }

  if (lentInText || earnedLifeText || baseWithdrawnText) {
    const parts = [
      earnedLifeText ? `earned ${earnedLifeText} of interest on it` : null,
      baseWithdrawnText ? `withdrew ${baseWithdrawnText}` : null,
    ].filter((p): p is string => p != null);
    const tail = parts.length === 0 ? "" : parts.length === 1 ? `, and ${parts[0]}` : `, ${parts[0]}, and ${parts[1]}`;
    bullets.push(
      `${lentInText ? `The account lent ${lentInText} of ${baseSym ?? "base"}` : `The account lent ${baseSym ?? "base"}`}${tail}. Lent ${baseSym ?? "base"} is not collateral, so it sits on separate rows.`,
    );
  }

  if (currentCollText || currentDebtText) {
    bullets.push(`It holds ${currentCollText ?? "no collateral"} against ${currentDebtText ?? "no debt"} now.`);
  }

  bullets.push(
    `${name} lends and borrows one base asset per market${baseSym ? ` (${baseSym} here)` : ""}. A lent balance of it earns interest; the other assets are collateral, which earns nothing and cannot be borrowed.`,
  );

  if (valued) {
    bullets.push(
      atAbsorb
        ? "Dollar figures use Comet's oracle price today, so they move with prices; what the absorb took keeps the absorb's prices, and the price-change row is the difference, so each column adds up."
        : "Dollar figures use Comet's oracle price today, so they move with prices.",
    );
  } else {
    // Only where it is so: name the assets the oracle read left unpriced.
    const allLines = [data.collateral, data.debt].flatMap((side) => [
      ...side.current,
      ...(side.received ?? []),
      ...side.exited,
      ...side.liquidated,
      ...(side.earned ?? []),
      ...(side.interest ? [side.interest] : []),
    ]);
    const unpriced = [...new Set(allLines.filter((l) => l.amount > 0 && l.usd == null).map((l) => l.symbol))];
    if (unpriced.length > 0)
      bullets.push(
        `Figures are in token units because Comet's oracle gave no price for ${joinNames(unpriced)} on this load.`,
      );
  }

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures add up this position&apos;s flows on {name} across every event in its recorded history.
      </p>
      {bullets.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function compoundEconomicsContent(opts?: CompoundEconomicsOpts): LearnMoreContent {
  const name = protocolName(opts);
  return {
    title: "About the Economics",
    intro: `This section replays every ${name} event this position's captured history holds — supplies, withdrawals, borrows and repayments — beside its current base and collateral balances.`,
    stepsHeading: "How this is built:",
    steps: [
      "Flows are replayed from the position's own Comet events, decomposed at the running base balance's zero crossings — a supply into a negative balance repays debt first, and a withdrawal past zero borrows.",
      "Current balances are read from the market's Comet contract, interest included.",
      "Dollar values use Comet's on-chain oracle price for each asset today, the price the market liquidates with, and appear only when every asset is priced. What an absorb took keeps the absorb's prices.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Base asset vs collateral",
        text: "each Comet market borrows exactly one base asset; every other asset held is collateral, which earns nothing and cannot itself be borrowed.",
      },
    ],
    links: [
      { label: "Compound V3 docs", url: COMPOUND_DOC_URLS.OVERVIEW },
      { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
      { label: "Liquidation", url: COMPOUND_DOC_URLS.LIQUIDATION },
    ],
  };
}
