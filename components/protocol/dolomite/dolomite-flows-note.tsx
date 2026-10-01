// The Lifetime flows panel's Explanation lines and "?" for a Dolomite account
// (lib/dolomite/flows.ts, hooks/useDolomiteFlows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Dolomite").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { DolomiteFlowsFacts } from "@/hooks/useDolomiteFlows";
import { DL } from "@/lib/dolomite/flows";

const DOCS = "https://docs.dolomite.io/";

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

/** "a, b and c". */
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** How the rows were priced, in a sentence. */
function pricingWords(f: DolomiteFlowsFacts): string {
  const p = f.pricing;
  const total = p.block + p.day + p.live + p.carried + p.nearest + p.none;
  const parts: string[] = [];
  if (p.block > 0) parts.push(`${n(p.block, "one row is", "rows are")} valued at Dolomite's oracle price at its block`);
  if (p.day > 0)
    parts.push(
      `${p.day === total ? "every row is" : n(p.day, "one row is", "rows are")} valued at Dolomite's oracle price for its market at the end of its day (the last price the core emitted that day), which can differ from the price at its block by how far the price moved within the day`,
    );
  if (p.live > 0) parts.push(`${n(p.live, "one row from today takes", "rows from today take")} today's live price`);
  if (p.carried > 0)
    parts.push(
      `${n(p.carried, "one row has", "rows have")} no price recorded on its day and take the last one before it`,
    );
  if (p.nearest > 0) parts.push(`${n(p.nearest, "one row takes", "rows take")} the nearest priced row's price`);
  if (p.none > 0) parts.push(`${n(p.none, "one row has", "rows have")} no price at all and add nothing in USD`);
  const s = list(parts);
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}.` : "";
}

/** Each line's words in the bars' sentence, in drawing order. */
const COLL_IN: [string, string][] = [
  [DL.deposited, "deposited"],
  [DL.received, "received by transfer"],
  [DL.bought, "bought in trades"],
  [DL.seizedIn, "seized as liquidator"],
];
const COLL_OUT: [string, string][] = [
  [DL.withdrawn, "withdrawn"],
  [DL.sent, "sent"],
  [DL.sold, "sold"],
  [DL.seized, "seized in liquidations"],
  [DL.paidOut, "paid as liquidator"],
];
const DEBT_IN: [string, string][] = [
  [DL.borrowed, "borrowed"],
  [DL.borrowedSent, "borrowed to send by transfer"],
  [DL.borrowedTrade, "borrowed in trades"],
  [DL.borrowedLiq, "borrowed to liquidate"],
];
const DEBT_OUT: [string, string][] = [
  [DL.repaid, "repaid"],
  [DL.repaidTransfer, "repaid by transfers in"],
  [DL.repaidTrade, "repaid by trades"],
  [DL.liquidated, "repaid by liquidators"],
  [DL.writtenOff, "written off by vaporization"],
];

/** Who this account's transfers were with. */
function transferWords(f: DolomiteFlowsFacts): string {
  const t = f.transfers;
  const own = f.ownTransfers;
  if (own === t)
    return t === 1
      ? "Its one transfer was with another account of the same wallet."
      : t === 2
        ? "Both its transfers were with other accounts of the same wallet."
        : `All ${t.toLocaleString("en-US")} of its transfers were with other accounts of the same wallet.`;
  if (own === 0)
    return t === 1 ? "Its one transfer was with another wallet." : "Its transfers were with other wallets.";
  return `${own === 1 ? "One" : own.toLocaleString("en-US")} of its ${t.toLocaleString("en-US")} transfers ${own === 1 ? "was" : "were"} with other accounts of the same wallet, the rest with other wallets.`;
}

export function DolomiteFlowsNote({ facts }: { facts: DolomiteFlowsFacts | null }): ReactNode {
  const borrower = facts?.borrower ?? true;
  const used = new Set(facts?.used ?? []);
  // Deposited, withdrawn and repaid are named whatever the rows hold, as the
  // bars draw them; every other line where a row filled it.
  const words = (lines: [string, string][], always: string[]) =>
    lines.filter(([k]) => always.includes(k) || used.has(k)).map(([, w]) => w);
  const collIn = [...words(COLL_IN, [DL.deposited]), "the interest earned"];
  const collOut = words(COLL_OUT, [DL.withdrawn]);
  const debtIn = [...words(DEBT_IN, [DL.borrowed]), "the interest accrued"];
  const debtOut = words(DEBT_OUT, [DL.repaid]);
  const transfers = (facts?.transfers ?? 0) > 0;
  const trades = (facts?.trades ?? 0) > 0;
  const liquidated = (facts?.liquidations ?? 0) > 0;
  const liquidator = (facts?.asLiquidator ?? 0) > 0;
  const debtByTransfer = [
    used.has(DL.borrowedSent) ? "a transfer out past the balance borrows (Borrowed to send by transfer)" : null,
    used.has(DL.repaidTransfer) ? "a transfer in against a debt repays it (Repaid by a transfer in)" : null,
  ].filter((x): x is string => x != null);
  return (
    <div className="space-y-2" data-dolomite-flows-note="" data-anatomy="F14·dolomite">
      <p>
        A Dolomite account holds one balance per market: above zero it supplies, below zero it owes, and every market
        counts against the account&apos;s one margin line. So each bar adds every market in USD. The collateral bar adds
        up to what the account holds: {list(collIn)}, less what was {list(collOut)}.
        {borrower && ` The debt bar adds up to what it owes: ${list(debtIn)}, less what was ${list(debtOut)}.`} The bars
        cover this account number only; the wallet&apos;s other Dolomite accounts keep their collateral and debt apart.
      </p>
      <p>
        Interest is the dashed part. Every row states its market&apos;s balance just before and after it: the par the
        core stores × the market&apos;s {borrower ? "supply or borrow index" : "supply index"} at that block. The par
        moves only when the account acts, so the interest between two rows on a market is the balance just before the
        later one less the balance after the earlier one, to the base unit. Between events each balance grows with its
        market&apos;s index, in a straight line from one of the account&apos;s rows on the market to the next; after the
        last row, to
        {facts?.live === false ? " the market's rate now" : " today's balances from the live read"}. That growth and the
        change in prices since each flow are the last line of each bar, Market move and interest since the last event.
      </p>
      {facts && (transfers || trades || liquidated || liquidator) && (
        <p>
          {transfers
            ? `Transfers move a balance between Dolomite accounts; no tokens leave Dolomite. ${transferWords(facts)}${
                debtByTransfer.length > 0
                  ? ` ${list(debtByTransfer).charAt(0).toUpperCase()}${list(debtByTransfer).slice(1)}.`
                  : ""
              } `
            : ""}
          {trades
            ? "A trade swaps one market's balance for another's inside the account: what it sold is Sold in trades and what it bought is Bought in trades, each at its market's price. "
            : ""}
          {liquidated
            ? `${n(facts.liquidations, "A liquidation", "liquidations")} repaid debt (Repaid by liquidators) and took collateral worth the debt plus the liquidation spread (Seized in liquidations). `
            : ""}
          {liquidator
            ? `Where this account was the liquidator, it paid the liquidated account's debt (Paid as liquidator${used.has(DL.borrowedLiq) ? ", and Borrowed to liquidate where that took it below zero" : ""}) and took that account's collateral (Seized as liquidator).`
            : ""}
        </p>
      )}
      {facts && (
        <p>
          {pricingWords(facts)}{" "}
          {facts.between === "store"
            ? "Between events each market is valued at Dolomite's oracle price at the end of each day; a day with no price recorded on a market keeps the last one, and today's is the live read's."
            : "The daily oracle prices did not load, so between events each market keeps the price of its latest event, and a price more than 30 days old is stated as such."}
        </p>
      )}
    </div>
  );
}

export function dolomiteFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every Dolomite event of this account, each at Dolomite's oracle price on its day, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, received by transfer, bought in trades and the interest earned, less withdrawn, sent, sold and seized in liquidations, is what the account holds in its markets above zero.",
      "Debt: borrowed (by a withdrawal or a transfer out past the balance) and the interest accrued, less repaid and repaid by liquidators, is what it owes in its markets below zero.",
      "The last line of each bar is the change in prices since each flow, with the interest since each market's last event.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Par and index",
        text: "the core stores each balance as a par; the token balance is the par × the market's supply or borrow index, which rises as interest accrues, so a balance grows between its events.",
      },
      {
        bold: "One balance per market",
        text: "Dolomite has no borrow action: a withdrawal or a transfer that takes a market below zero borrows it, and a deposit into a negative balance repays it.",
      },
      {
        bold: "Accounts",
        text: "one wallet can hold many account numbers, each with a separate margin line; a transfer between them moves a balance without leaving Dolomite.",
      },
      {
        bold: "Liquidation",
        text: "a liquidator repays part or all of the debt and takes collateral worth the repaid debt plus the liquidation spread.",
      },
    ],
    links: [{ label: "Dolomite docs", url: DOCS }],
  };
}
