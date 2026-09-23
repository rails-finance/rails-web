// Prose for the Maple ChainTruthTower's Explanation pane — the V2/V4 grammar
// (status lead + data-derived bullets) applied to this tier. A Maple lender
// has one side only — the pool claim, carried on `data.collateral`
// (lib/maple/economics.ts: `debtAxisAbsent: true`, `valued: false`) — so these
// bullets never mention borrowing, and the token-units note names the actual
// reason (a stablecoin $1 pin would hide a depeg), not a missing price.

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MAPLE_DOC_URL = "https://docs.maple.finance";

const sumAmount = (lines: TowerLine[]): number => lines.reduce((s, l) => s + l.amount, 0);

/** The one symbol the claim speaks, when every contributing line agrees. */
function claimSymbol(data: ChainTruthTowerData): string | null {
  const syms = new Set(
    [
      ...data.collateral.current,
      ...data.collateral.exited,
      ...(data.collateral.interest ? [data.collateral.interest] : []),
    ]
      .filter((l) => l.amount > 0)
      .map((l) => l.symbol),
  );
  return syms.size === 1 ? [...syms][0] : null;
}

function fmt(amount: number, symbol: string | null): string {
  return symbol ? `${formatCompact(amount)} ${symbol}` : formatCompact(amount);
}

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

export function mapleEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const sym = claimSymbol(data);
  const deposited = data.collateral.lifetimeInflow;
  const withdrawn = sumAmount(data.collateral.exited);
  const interest = data.collateral.interest && data.collateral.interest.amount > 0 ? data.collateral.interest : null;
  const currentClaim = sumAmount(data.collateral.current);

  const items: ReactNode[] = [];

  if (deposited > 0) {
    items.push(
      <span key="flow">
        Deposited <Fig>{fmt(deposited, sym)}</Fig> into the pool over the position&apos;s life
        {withdrawn > 0 && (
          <>
            , of which <Fig>{fmt(withdrawn, sym)}</Fig> was withdrawn
          </>
        )}
        .
      </span>,
    );
  }
  if (interest) {
    items.push(
      <span key="interest">
        <Fig>{fmt(interest.amount, sym)}</Fig> in interest has been earned on the claim, included in the current value
        below.
      </span>,
    );
  }
  if (currentClaim > 0) {
    items.push(
      <span key="current">
        The position&apos;s pool shares currently redeem for <Fig>{fmt(currentClaim, sym)}</Fig>.
      </span>,
    );
  } else {
    items.push(<span key="current-empty">The position currently holds no pool shares.</span>);
  }
  items.push(
    <span key="mechanism">
      A Maple lender holds shares of the pool rather than a fixed loan — the claim&apos;s value rises with the loan
      book&apos;s accrued interest, and withdrawing normally travels through a first-in-first-out queue rather than
      settling instantly.
    </span>,
  );
  items.push(
    <span key="token-units">
      The claim is shown in the pool&apos;s own asset (USDC or USDT) rather than pinned to a dollar — a $1 pin would
      hide exactly the depeg signal these figures exist to show.
    </span>,
  );

  if (deposited === 0 && currentClaim === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this position&apos;s lifetime flows on Maple across every event in its captured history.
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
      "This section traces a lender position's deposits and withdrawals over its lifetime, replayed from the pool's own events, alongside what the position's shares currently redeem for.",
    stepsHeading: "How it's built:",
    steps: [
      "Flows are replayed from every deposit and processed withdrawal the position's own pool events recorded.",
      "The current claim is the position's shares valued at the pool's own exit rate at the block the page reads.",
      "No dollar price is applied — the funds asset is already a stablecoin, and pinning it to $1 would erase a depeg rather than show it.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Pool shares, not a fixed loan",
        text: "a lender holds an ERC-4626 share of the pool; its value in the underlying asset rises as the loan book accrues interest, and falls only if the pool delegate marks a loss.",
      },
      {
        bold: "Withdrawal queue",
        text: "exiting normally means requesting a withdrawal and waiting for the pool delegate to process it in FIFO order, rather than an instant redemption.",
      },
    ],
    links: [{ label: "Maple docs", url: MAPLE_DOC_URL }],
  };
}
