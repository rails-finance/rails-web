// Prose for the Maple ChainTruthTower's Explanation pane — the V2/V4 grammar
// (status lead + data-derived bullets) applied to this tier. A Maple lender
// has one side only — the pool claim, carried on `data.collateral`
// (lib/maple/economics.ts: `debtAxisAbsent: true`, `valued: false`) — so these
// bullets never mention borrowing. One line per pool, each in its own asset:
// USDC and USDT figures are never summed.

import type { ReactNode } from "react";
import type { ChainTruthTowerData } from "@/lib/shared/chain-truth-economics";
import type { MaplePoolFlowSummary } from "@/lib/maple/economics";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MAPLE_DOC_URL = "https://docs.maple.finance";

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

const amt = (amount: number, symbol: string) => (
  <Fig>
    {formatCompact(amount)} {symbol}
  </Fig>
);

/** One pool's lifetime, in its own asset. */
function poolLine(p: MaplePoolFlowSummary): ReactNode {
  const a = p.assetSymbol;
  const moved: ReactNode[] = [];
  if (p.deposited > 0) moved.push(<>deposited {amt(p.deposited, a)}</>);
  if (p.withdrawn > 0) moved.push(<>withdrew {amt(p.withdrawn, a)}</>);
  const earned = p.earned;
  return (
    <span key={p.pool}>
      <span className="font-medium text-foreground">{p.poolSymbol} pool:</span>{" "}
      {moved.length > 0 && (
        <>
          {moved.map((m, i) => (
            <span key={i}>
              {i > 0 ? " and " : ""}
              {m}
            </span>
          ))}
          .{" "}
        </>
      )}
      {p.received > 0 && (
        <>
          Received{" "}
          {p.receivedShares != null ? (
            <>
              {amt(p.receivedShares, p.poolSymbol)} from other wallets, worth {amt(p.received, a)}
            </>
          ) : (
            <>shares from other wallets worth {amt(p.received, a)}</>
          )}{" "}
          at the pool rate when they arrived.{" "}
        </>
      )}
      {p.sent > 0 && (
        <>
          Sent{" "}
          {p.sentShares != null ? (
            <>
              {amt(p.sentShares, p.poolSymbol)} to other wallets, worth {amt(p.sent, a)}
            </>
          ) : (
            <>shares to other wallets worth {amt(p.sent, a)}</>
          )}{" "}
          at the pool rate when they left.{" "}
        </>
      )}
      {p.held >= 0.01 ? (
        <>
          The claim now is {amt(p.held, a)}
          {earned != null && earned > 0 && (
            <>
              , and {amt(earned, a)} of interest was earned over the position&apos;s life
              {earned <= p.held ? ", all of it inside that claim" : ", part of it since withdrawn"}
            </>
          )}
          .
        </>
      ) : (
        <>
          The wallet holds no shares in this pool now
          {earned != null && earned > 0 && <>; withdrawals took out all {amt(earned, a)} of interest it earned</>}.
        </>
      )}
    </span>
  );
}

export function mapleEconomicsExplanation(data: ChainTruthTowerData, pools: MaplePoolFlowSummary[]): ReactNode {
  const heldNow = data.collateral.current.some((l) => l.amount > 0);
  if (pools.length === 0 && !heldNow) return null;

  const items: ReactNode[] = pools.map(poolLine);
  if (pools.length === 0) {
    items.push(
      <span key="unstated">
        The deposits, withdrawals and interest appear here when a pool&apos;s flows add up to its claim and every share
        transfer into or out of it has a value.
      </span>,
    );
  }
  items.push(
    <span key="yield">
      Where the interest comes from: the pool&apos;s borrowers pay interest on their loans, and that raises the exit
      rate, the amount one share pays out on withdrawal. Nothing is paid out to the lender; the same shares are worth
      more.
    </span>,
  );
  items.push(
    <span key="proof">
      The chain proves every deposit, withdrawal, share transfer, share balance and queue fill here, and the pool rate
      each of them used. Maple&apos;s books record the loan book behind that rate and the borrowers&apos; collateral,
      which custodians hold off-chain; the chain cannot prove those.
    </span>,
  );

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        The position&apos;s whole recorded history, one line per pool. Each pool&apos;s figures stay in its own token,
        USDC or USDT, and are never added together.
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

export function mapleEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section adds up a lender's deposits, withdrawals and share transfers over the position's life, pool by pool, beside what the position's shares pay out today.",
    stepsHeading: "How it's built:",
    steps: [
      "Flows are replayed from every deposit, queue fill and share transfer the pool recorded for this wallet.",
      "The current claim is the position's shares valued at the pool's exit rate, the amount one share pays out on withdrawal, at the block the page reads.",
      "Interest earned over the position's life is what the claim holds now plus everything withdrawn or sent, less everything deposited or received. It equals the interest the timeline rows state one gap at a time, added up, so it stays on the page after withdrawals have taken it out of the claim.",
      "Amounts are in the pool's token, USDC or USDT, with no dollar price: pricing a stablecoin at a fixed $1 would hide the moment it stopped being worth one.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Pool shares",
        text: "a lender holds shares of the pool, a standard vault token (ERC-4626) whose value in USDC or USDT rises as the pool's borrowers pay interest. It falls only if the pool delegate, the manager that runs the pool's lending, marks a loan as impaired.",
      },
      {
        bold: "Withdrawal queue",
        text: "exiting means requesting a withdrawal and waiting for the pool delegate or Maple's admins to process it. Requests are processed first in, first out (FIFO): earlier requests are paid before later ones, as the pool has cash.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}
