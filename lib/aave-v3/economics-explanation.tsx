// Prose for the Aave-V3-architecture ChainTruthTower's Explanation pane — the
// V2/V4 grammar (status lead + data-derived bullets) applied to this tier.
// Shared by every Aave-V3-shaped market: Aave V3 on Ethereum, Aave V3 on Base
// and Seamless (a fork of the same machine) — only the label in the prose and
// the doc links differ, threaded through `opts.label`.

import type { ReactNode } from "react";
import type { TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { AaveV3TowerData } from "@/lib/aave-v3/chain-truth-tower";
import { fmt2 } from "@/lib/aave-v3/liquidation-fee";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { SEAMLESS_DOCS_URL } from "@/lib/aave-v3/protocol-name";
import { WRITTEN_OFF_KEY } from "@/lib/aave-v3/chain-truth-tower";

/** "67.36 AAVE and 1.2 WETH" — each line's own token amount. */
const tokenList = (lines: TowerLine[]): string =>
  lines.map((l) => `${fmt2(String(l.amount))} ${l.symbol}`).join(" and ");

export interface AaveV3EconomicsOpts {
  /** How the market names itself in the prose — "Aave V3" when unstated. */
  label?: string;
  /** Whose treasury takes a liquidation's fee — "Aave" (or "Seamless") when unstated. */
  treasury?: string;
  /** The modal's words where the market is not an Aave deployment: whose
   *  oracle prices it, its position token's name, whether its history
   *  records swaps, and its links. */
  oracle?: string;
  token?: string;
  swaps?: boolean;
  links?: { label: string; url: string }[];
  /** How the pane words what was withdrawn, where the market says more
   *  (SparkLend: withdrawals as ETH through its WETH gateway are included). */
  withdrawnWords?: string;
  /** The liquidation card states the split, the bonus and the net, so the
   *  pane keeps one line pointing at it (SparkLend). */
  liquidationOnCard?: boolean;
  /** Dollar figures in whole dollars, as the panel's rows print them where
   *  the tower sets `fullUsdAmounts` (SparkLend). */
  fullUsd?: boolean;
  /** Bullets the market adds after the flows (SparkLend: the debts behind
   *  the debt side's price change). */
  extraItems?: ReactNode[];
}

const sumScalar = (lines: TowerLine[], valued: boolean): number =>
  lines.reduce((s, l) => s + (valued ? (l.usd ?? 0) : l.amount), 0);

/** The one symbol a side speaks, when every contributing line agrees — the
 *  condition under which a token-unit figure for that side is meaningful. */
function sideSymbol(side: TowerSideData): string | null {
  const syms = new Set(
    [...side.current, ...side.exited, ...side.liquidated, ...(side.interest ? [side.interest] : [])]
      .filter((l) => l.amount > 0)
      .map((l) => l.symbol),
  );
  return syms.size === 1 ? [...syms][0] : null;
}

/** Whole dollars: "$6,412,345". */
export const wholeUsd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

function fmtWith(full: boolean) {
  return (scalar: number, valued: boolean, symbol: string | null): string =>
    valued
      ? full
        ? wholeUsd(scalar)
        : formatCompactUsd(scalar)
      : symbol
        ? `${formatCompact(scalar)} ${symbol}`
        : formatCompact(scalar);
}

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

export function aaveV3EconomicsExplanation(data: AaveV3TowerData, opts: AaveV3EconomicsOpts = {}): ReactNode {
  const label = opts.label ?? "Aave V3";
  const fmt = fmtWith(opts.fullUsd === true);
  const usdOnly = (n: number) => (opts.fullUsd ? wholeUsd(n) : formatCompactUsd(n));
  const signedUsd = (n: number): string => `${n < 0 ? "−" : "+"}${usdOnly(Math.abs(n))}`;
  const valued = data.valued;
  const collSym = sideSymbol(data.collateral);
  const debtSym = sideSymbol(data.debt);

  const collSupplied = data.collateral.lifetimeInflow;
  const received = data.collateral.received ?? [];
  const collSwappedIn = sumScalar(
    received.filter((l) => l.flowLabel === "Swapped in"),
    valued,
  );
  const collReceived = sumScalar(
    received.filter((l) => l.flowLabel !== "Swapped in"),
    valued,
  );
  const collEarned = sumScalar(data.collateral.earned ?? [], valued);
  const debtBorrowed = data.debt.lifetimeInflow;
  const debtRepaid = sumScalar(data.debt.exited, valued);
  // Of it, what debt swaps repaid (the old debt, and the new debt's unused part).
  const debtRepaidBySwap = sumScalar(
    data.debt.exited.filter((l) => l.flowLabel === "Repaid by a debt swap"),
    valued,
  );
  const interest = data.debt.interest && data.debt.interest.amount > 0 ? data.debt.interest : null;
  // Interest over the life: what is still owed on top of the principal, and
  // what the lanes no longer held (or held beside others) accrued and repaid.
  const debtInterest =
    (interest ? (valued ? (interest.usd ?? 0) : interest.amount) : 0) + sumScalar(data.debt.earned ?? [], valued);
  const collLiquidated = sumScalar(data.collateral.liquidated, valued);
  // The debt side's involuntary bucket holds two mechanics: the cover a
  // liquidator repaid, and the remainder the Pool wrote off. Told apart by key.
  const isWrittenOff = (l: TowerLine) => l.key.startsWith(WRITTEN_OFF_KEY);
  const debtLiquidated = sumScalar(
    data.debt.liquidated.filter((l) => !isWrittenOff(l)),
    valued,
  );
  const debtWrittenOff = sumScalar(data.debt.liquidated.filter(isWrittenOff), valued);

  const currentColl =
    sumScalar(data.collateral.current, valued) +
    (data.collateral.interest ? sumScalar([data.collateral.interest], valued) : 0);
  // Flows at their events' prices, holdings at today's: the difference.
  const collPrice = valued ? (data.collateral.priceChange?.usd ?? 0) : 0;
  const debtPrice = valued ? (data.debt.priceChange?.usd ?? 0) : 0;
  const earnedLines = (data.collateral.earned ?? []).filter((l) => (valued ? (l.usd ?? 0) : l.amount) > 0);
  const currentDebt =
    sumScalar(data.debt.current, valued) + (interest ? (valued ? (interest.usd ?? 0) : interest.amount) : 0);

  // Collateral out, by how it left: each exited row's caption.
  const outBy = new Map<string, number>();
  for (const l of data.collateral.exited) {
    const k = l.flowLabel ?? "Withdrawn";
    outBy.set(k, (outBy.get(k) ?? 0) + (valued ? (l.usd ?? 0) : l.amount));
  }
  const OUT_WORDS: Record<string, string> = {
    Withdrawn: "withdrawn",
    "Sold to repay": "sold to repay debt",
    "Withdrawn and swapped": "withdrawn and swapped to the wallet",
    "Swapped to another asset": "swapped into another asset",
    "Sent to another account": "sent to another account",
  };
  const outParts = [...outBy].filter(([, v]) => v > 0);

  const items: ReactNode[] = [];

  if (collSupplied > 0) {
    // Deposited + received + earned − out = held now, as one sum.
    items.push(
      <span key="coll-flow">
        Supplied <Fig>{fmt(collSupplied, valued, collSym)}</Fig> over the position&apos;s life
        {collSwappedIn > 0 && (
          <>
            , bought <Fig>{fmt(collSwappedIn, valued, collSym)}</Fig> more with collateral swaps
          </>
        )}
        {collReceived > 0 && (
          <>
            , received <Fig>{fmt(collReceived, valued, collSym)}</Fig> more by transfer
          </>
        )}
        {collEarned > 0 && (
          <>
            {" "}
            and earned <Fig>{fmt(collEarned, valued, collSym)}</Fig> of interest on it
            {valued && earnedLines.length > 1 ? (
              <> ({earnedLines.map((l) => `${usdOnly(l.usd ?? 0)} on ${l.symbol}`).join(" and ")})</>
            ) : null}
          </>
        )}
        {outParts.length > 0 && (
          <>
            ; then{" "}
            {outParts.map(([k, v], i) => (
              <span key={k}>
                {i > 0 ? (i === outParts.length - 1 ? " and " : ", ") : null}
                <Fig>{fmt(v, valued, collSym)}</Fig>{" "}
                {k === "Withdrawn" && opts.withdrawnWords ? opts.withdrawnWords : (OUT_WORDS[k] ?? k.toLowerCase())}
              </span>
            ))}
          </>
        )}
        {collLiquidated > 0 && (
          <>
            {outParts.length > 0 ? ", with " : "; then "}
            <Fig>{fmt(collLiquidated, valued, collSym)}</Fig> taken by liquidation
          </>
        )}
        {Math.abs(collPrice) >= 0.5 && (
          <>
            ; price moves while the tokens were held {collPrice > 0 ? "add" : "take away"}{" "}
            <Fig>{usdOnly(Math.abs(collPrice))}</Fig>
          </>
        )}
        {currentColl > 0 ? (
          <>
            , leaving <Fig>{fmt(currentColl, valued, collSym)}</Fig> supplied.
          </>
        ) : outParts.length > 0 || collLiquidated > 0 ? (
          <>, leaving nothing supplied.</>
        ) : (
          "."
        )}
      </span>,
    );
  }
  if (debtBorrowed > 0) {
    // Borrowed + interest − repaid − liquidated = owed now, stated as one sum.
    const liqFirst = debtRepaid > 0 ? " and " : ", then ";
    items.push(
      <span key="debt-flow">
        Borrowed <Fig>{fmt(debtBorrowed, valued, debtSym)}</Fig> over the position&apos;s life
        {debtInterest > 0 && (
          <>
            {" "}
            and <Fig>{fmt(debtInterest, valued, debtSym)}</Fig> of interest accrued on it
            {opts.fullUsd &&
            valued &&
            interest?.symbol &&
            (data.debt.earned ?? []).every((l) => l.flowLabel === "Interest repaid") &&
            debtInterest - (interest.usd ?? 0) > 0.5 ? (
              <>
                {" "}
                ({usdOnly(debtInterest - (interest.usd ?? 0))} paid in repayments of debts no longer held,{" "}
                {usdOnly(interest.usd ?? 0)} on {interest.symbol} over its whole life)
              </>
            ) : null}
          </>
        )}
        {debtRepaid > 0 && (
          <>
            , then <Fig>{fmt(debtRepaid, valued, debtSym)}</Fig> repaid
            {debtRepaidBySwap > 0 ? (
              debtRepaidBySwap >= debtRepaid - 0.005 ? (
                <> by debt swaps, which borrow one asset to pay off another</>
              ) : (
                <>
                  {" "}
                  (<Fig>{fmt(debtRepaidBySwap, valued, debtSym)}</Fig> of it by debt swaps, which borrow one asset to
                  pay off another)
                </>
              )
            ) : null}
          </>
        )}
        {debtLiquidated > 0 && (
          <>
            {liqFirst}
            <Fig>{fmt(debtLiquidated, valued, debtSym)}</Fig> cleared by liquidation
          </>
        )}
        {Math.abs(debtPrice) >= 0.5 && (
          <>
            ; price moves while the debt was owed {debtPrice > 0 ? "add" : "take away"}{" "}
            <Fig>{usdOnly(Math.abs(debtPrice))}</Fig>
          </>
        )}
        {currentDebt > 0 ? (
          <>
            , leaving <Fig>{fmt(currentDebt, valued, debtSym)}</Fig> owed.
          </>
        ) : debtRepaid > 0 || debtLiquidated > 0 ? (
          <>, leaving nothing owed.</>
        ) : (
          "."
        )}
      </span>,
    );
  }
  if (currentColl > 0 && collSupplied <= 0) {
    items.push(
      <span key="current">
        The position currently holds <Fig>{fmt(currentColl, valued, collSym)}</Fig> supplied.
      </span>,
    );
  }
  if (collLiquidated > 0 && debtLiquidated > 0 && valued) {
    const net = debtLiquidated - collLiquidated;
    const treasury = opts.treasury ?? (label === "Seamless" ? "Seamless" : "Aave");
    // The collateral that left, as the liquidation card states it: the
    // liquidator's share plus the treasury's fee.
    const split = data.liquidationSplit ?? [];
    const taken =
      split.length > 0 && split.length === data.collateral.liquidated.length
        ? split
            .map(
              (x) =>
                `${fmt2(String(x.total - x.fee))} ${x.symbol} to the liquidator + ${fmt2(String(x.fee))} ${x.symbol} to the ${treasury} treasury = ${fmt2(String(x.total))} ${x.symbol}`,
            )
            .join(" and ")
        : tokenList(data.collateral.liquidated);
    if (opts.liquidationOnCard)
      items.push(
        <span key="liq-net">
          Liquidations took {tokenList(data.collateral.liquidated)} of collateral to clear{" "}
          {tokenList(data.debt.liquidated.filter((l) => !isWrittenOff(l)))} of debt, a net {signedUsd(net)} to the
          borrower; the liquidation&apos;s card sets out the bonus and the {treasury} treasury&apos;s fee.
        </span>,
      );
    else
      items.push(
        <span key="liq-net">
          Liquidations took {taken} of collateral to clear{" "}
          {tokenList(data.debt.liquidated.filter((l) => !isWrittenOff(l)))} of debt:{" "}
          <Fig>{fmt(collLiquidated, valued, collSym)}</Fig> against <Fig>{fmt(debtLiquidated, valued, debtSym)}</Fig>
          {data.flowsPricedAtEvents ? " at the prices of the day" : ""}, a net {signedUsd(net)} to the borrower: the
          liquidation bonus
          {data.liquidationFeeZero
            ? `, all of it to the liquidator (the ${treasury} protocol fee on the bonus was 0)`
            : split.length > 0
              ? `, part of which went to the ${treasury} treasury`
              : ""}
          .
        </span>,
      );
  } else if (collLiquidated > 0) {
    items.push(
      <span key="coll-liq">
        <Fig>{fmt(collLiquidated, valued, collSym)}</Fig> of collateral was seized in liquidation.
      </span>,
    );
  }
  if (valued && (Math.abs(collPrice) >= 0.5 || Math.abs(debtPrice) >= 0.5)) {
    items.push(
      <span key="price-basis">
        {data.flowsPricedAtEvents
          ? "Each flow is valued at the oracle price at its block, interest and what is held now at today's price"
          : "Flows are valued at the oracle price at their block where the event carries one, the rest, interest and what is held now at today's price"}
        ; the Price change row is the difference, what the tokens gained or lost in value while the position held them.
        In tokens, what came in plus interest less what left equals what is held now.
      </span>,
    );
  }
  if (debtWrittenOff > 0) {
    items.push(
      <span key="debt-written-off">
        <Fig>{fmt(debtWrittenOff, valued, debtSym)}</Fig> of debt was written off as bad debt: a liquidation left no
        collateral to cover it, so the Pool burned it unpaid.
      </span>,
    );
  }
  if (!valued) {
    items.push(
      <span key="token-units">
        Bars are shown in token units rather than USD because {label} has no on-chain price captured for one or more of
        the assets involved.
      </span>,
    );
  }

  items.push(...(opts.extraItems ?? []));

  if (items.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on {label} across every event in its captured history.
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

/** The modal names only the rows the panel shows, where it is given the
 *  panel's data. */
export function aaveV3EconomicsContent(opts: AaveV3EconomicsOpts = {}, data?: AaveV3TowerData): LearnMoreContent {
  const label = opts.label ?? "Aave V3";
  const shows = (flag: boolean) => data == null || flag;
  const exitedLabels = new Set((data?.collateral.exited ?? []).map((l) => l.flowLabel ?? "Withdrawn"));
  const hasPriceChange = !!(data?.collateral.priceChange || data?.debt.priceChange);
  const hasOtherOut = [...exitedLabels].some((l) => l !== "Withdrawn");
  const hasSwapIn = (data?.collateral.received ?? []).some((l) => l.flowLabel === "Swapped in");
  const hasSwapRepaid = (data?.debt.exited ?? []).some((l) => l.flowLabel === "Repaid by a debt swap");
  const hasLiquidated = (data?.collateral.liquidated.length ?? 0) > 0 || (data?.debt.liquidated.length ?? 0) > 0;
  const isSeamless = label === "Seamless";
  const isBase = label === "Aave V3 on Base";
  return {
    title: "About the Economics",
    intro:
      "This section traces a position's supply and borrow flows over its lifetime, replayed from the Pool's own events.",
    stepsHeading: "How it's built:",
    steps: [
      `Flows are replayed from every supply, withdraw, borrow, repay, ${opts.swaps === false ? "" : "swap, "}${opts.token ?? "aToken"} transfer and liquidation the position's history records.`,
      "Current balances come from the Pool at the block the page reads, with interest already included.",
      `Dollar values use ${opts.oracle ?? (isSeamless ? "Seamless" : "Aave")}'s own on-chain oracle — the same price the Pool liquidates with.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Lifetime flows",
        text: "the bars show every supply, withdrawal, borrow and repayment over the position's life. In tokens, what came in plus interest less everything that left equals what is held now.",
      },
      ...(shows(hasPriceChange)
        ? [
            {
              bold: "Price change",
              text: "in dollars, each flow is valued at the oracle price at its block and what is held at today's price. The Price change row is the difference, so deposited plus interest less everything that left, plus the price change, equals what is held now.",
            },
          ]
        : []),
      ...(shows(hasOtherOut)
        ? [
            {
              bold: "Other ways out",
              text: `${opts.swaps === false ? "collateral" : "collateral swapped into another asset, sold in a repay with collateral, withdrawn and swapped, or"} sent to another account as an ${opts.token ?? "aToken"} transfer has a separate row. A transfer to the WETH gateway counts as withdrawn: the gateway withdraws it as ETH in the same transaction.`,
            },
          ]
        : []),
      ...(shows(hasSwapIn || hasSwapRepaid)
        ? [
            {
              bold: "Swaps",
              text: 'a collateral swap is two rows: what it sold leaves as "Swapped to another asset" and what it bought arrives as "Swapped in". A debt swap borrows the new asset (counted in borrowed) and repays the old debt with it, a "Repaid by a debt swap" row with the part of the new debt returned unused.',
            },
          ]
        : []),
      {
        bold: "Interest",
        text: "supplied balances earn interest and debts accrue it without an event. On the supply side each asset's interest is a separate row beside what was deposited, valued at today's price; on the debt side, interest still owed is a segment of the debt bar and interest already repaid is a row beside what was borrowed.",
      },
      ...(shows(hasLiquidated)
        ? [
            {
              bold: "Liquidated",
              text: data?.liquidationFeeZero
                ? "the collateral a liquidation took, all of it to the liquidator (no protocol fee on the bonus), and the debt it cleared, valued at the prices when it happened."
                : "the collateral a liquidation took (the liquidator's share and the treasury's fee) and the debt it cleared, valued at the prices when it happened.",
            },
          ]
        : []),
    ],
    links: opts.links ?? [
      ...(isSeamless ? [{ label: "Seamless docs", url: SEAMLESS_DOCS_URL }] : []),
      ...(isBase ? [{ label: "Aave on Base", url: "https://app.aave.com/markets/?marketName=proto_base_v3" }] : []),
      { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
      { label: "Borrowing", url: AAVE_FAQ_URLS.BORROWING },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ],
  };
}
