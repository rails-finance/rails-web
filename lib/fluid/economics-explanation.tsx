// Prose for the Fluid ChainTruthTower's Explanation pane — the V2/V4 grammar
// (status lead + data-derived bullets) applied to this tier. Fluid never
// prices in USD at this depth (lib/fluid/economics.ts: `valued: false`), so
// every figure here is a token amount in the side's own unit
// (`data.collateralUnit` / `data.debtUnit`) — including a smart-vault leg's
// pool-share unit ("wstETH·ETH shares"), which the mechanism bullet below
// names explicitly.

import type { ReactNode } from "react";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const FLUID_DOC_URL = "https://docs.fluid.io";

const sumAmount = (lines: TowerLine[]): number => lines.reduce((s, l) => s + l.amount, 0);

function fmt(amount: number, unit: string): string {
  return `${formatCompact(amount)} ${unit}`;
}

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

export function fluidEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const collUnit = data.collateralUnit ?? "";
  const debtUnit = data.debtUnit ?? "";
  const isSmartLeg = (unit: string) => unit.includes("shares");

  const deposited = data.collateral.lifetimeInflow;
  const withdrawn = sumAmount(data.collateral.exited);
  const borrowed = data.debt.lifetimeInflow;
  const repaid = sumAmount(data.debt.exited);
  const currentColl = sumAmount(data.collateral.current);
  const currentDebt = sumAmount(data.debt.current);
  const seized = sumAmount(data.collateral.liquidated);
  const cleared = sumAmount(data.debt.liquidated);

  const items: ReactNode[] = [];

  if (deposited > 0) {
    items.push(
      <span key="coll-flow">
        Deposited <Fig>{fmt(deposited, collUnit)}</Fig> of collateral over the vault&apos;s life
        {withdrawn > 0 && (
          <>
            , of which <Fig>{fmt(withdrawn, collUnit)}</Fig> was withdrawn
          </>
        )}
        .
      </span>,
    );
  }
  if (borrowed > 0) {
    items.push(
      <span key="debt-flow">
        Borrowed <Fig>{fmt(borrowed, debtUnit)}</Fig> over the vault&apos;s life
        {repaid > 0 && (
          <>
            , of which <Fig>{fmt(repaid, debtUnit)}</Fig> was repaid
          </>
        )}
        .
      </span>,
    );
  }
  if (currentColl > 0 || currentDebt > 0) {
    items.push(
      <span key="current">
        {currentColl > 0 ? (
          <>
            The vault currently holds <Fig>{fmt(currentColl, collUnit)}</Fig> of collateral
          </>
        ) : (
          "The vault currently holds no collateral"
        )}
        {currentDebt > 0 ? (
          <>
            {" "}
            and owes <Fig>{fmt(currentDebt, debtUnit)}</Fig>, interest already included.
          </>
        ) : (
          ", with no debt outstanding."
        )}
      </span>,
    );
  }
  if (seized > 0) {
    items.push(
      <span key="seized">
        <Fig>{fmt(seized, collUnit)}</Fig> of collateral was seized in liquidation.
      </span>,
    );
  }
  if (cleared > 0) {
    items.push(
      <span key="cleared">
        <Fig>{fmt(cleared, debtUnit)}</Fig> of debt was cleared by liquidation.
      </span>,
    );
  }
  if (isSmartLeg(collUnit) || isSmartLeg(debtUnit)) {
    items.push(
      <span key="smart">
        {isSmartLeg(collUnit) && isSmartLeg(debtUnit)
          ? "Both legs of this vault are smart — collateral and debt are shares of a Fluid liquidity pair rather than a single token, so each side's amount is a share count, not a token balance."
          : isSmartLeg(collUnit)
            ? "The collateral leg of this vault is smart — it is a share of a Fluid liquidity pair rather than a single token, so the amount above is a share count, not a token balance."
            : "The debt leg of this vault is smart — it is a share of a Fluid liquidity pair rather than a single token, so the amount above is a share count, not a token balance."}
      </span>,
    );
  }
  items.push(
    <span key="token-units">
      Fluid prices no side in USD here, so every figure above is shown in the vault&apos;s own token — collateral and
      debt bars are not directly comparable in height.
    </span>,
  );

  if (items.length <= 1 && deposited === 0 && borrowed === 0 && currentColl === 0 && currentDebt === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this vault&apos;s lifetime flows on Fluid across every event in its captured history.
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

export function fluidEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This section traces a vault position's collateral and debt flows over its lifetime, replayed from the vault's own operate and liquidation events.",
    stepsHeading: "How it's built:",
    steps: [
      "Flows are replayed from every deposit, withdraw, borrow and repay the position's own LogOperate events recorded — a single composite operation can move both legs at once.",
      "Liquidation impact is read from the vault's own settlement views at the blocks before and after the sweep, not from the liquidation event itself (which names no position).",
      "Current balances come from the vault's own resolver at the block the page reads, with interest already included; Fluid has no on-chain USD price at this depth, so every figure stays in its own token.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Smart collateral / smart debt",
        text: "a vault leg can be a share of a Fluid liquidity pair rather than a single token — the position then earns or owes in pool shares, not a plain balance.",
      },
      {
        bold: "Interest between events",
        text: "the replayed lifetime totals exclude interest accrued since the position's last touch; the current-state figures come from the vault's own resolver instead, so no principal-versus-interest split is shown.",
      },
    ],
    links: [{ label: "Fluid docs", url: FLUID_DOC_URL }],
  };
}
