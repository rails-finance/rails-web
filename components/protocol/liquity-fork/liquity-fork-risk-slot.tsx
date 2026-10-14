"use client";

// The fork Trove card's panel rows (Ebisu, Asymmetry, Basedollar) from the
// live branch read, in Liquity V2's panel order (rails-ops
// TO-DO-position-card 322): Debt in front and Troves in front on the left;
// Costs per year and the room to borrow on the right, where the shared card
// adds Liquidates at. The rows sit inside the card's receipts scope, so each
// figure keeps its receipt. A zombie Trove sits outside the redemption queue
// and has no queue rows.

import type { ReactNode } from "react";
import type { PositionPanelColumns, PositionPanelRow } from "@/components/shared/position-card";
import { forkLiveVocab, FORK_DEBT_SYMBOL } from "@/lib/shared/liquity-fork-live-provenance";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenFigure } from "@/components/shared/token-figure";
import { pct } from "@/components/shared/ratio-bar";
import { formatApproximate, formatExact, formatPrice } from "@/lib/utils/format";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";

// A debt-token figure: the figure, then the token's icon.
const amount = (figure: ReactNode, symbol: string) => <TokenFigure symbol={symbol}>{figure}</TokenFigure>;

export function liquityForkPanelColumns(chain: LiquityForkTroveChainResponse): PositionPanelColumns {
  if (chain.chainStale || (chain.status !== "active" && chain.status !== "zombie")) return [[], []];
  const debtSym = FORK_DEBT_SYMBOL[chain.protocol] ?? "";
  const vocab = forkLiveVocab(chain.protocol);
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];

  if (chain.status === "active" && chain.debtInFront != null) {
    left.push({
      id: "debt-in-front",
      label: "Debt in front",
      value: amount(
        <Prov info={vocab.debtInFrontProv(chain.symbol)} value={formatExact(chain.debtInFront)} symbol={debtSym}>
          {formatApproximate(chain.debtInFront)}
        </Prov>,
        debtSym,
      ),
    });
    if (chain.trovesAhead != null) {
      left.push({
        id: "troves-in-front",
        label: "Troves in front",
        value: (
          <Prov info={vocab.trovesAheadProv(chain.symbol)} value={String(chain.trovesAhead)}>
            {chain.trovesAhead}
          </Prov>
        ),
      });
    }
  }

  const annualCost = (chain.recordedDebt * chain.annualInterestRatePct) / 100;
  if (annualCost > 0) {
    const costsProv: Provenance = {
      kind: "derived",
      summary:
        "Estimated interest cost per year — the recorded debt times the annual interest rate, both read live. It is a year's interest at today's rate; the rate can change.",
      formula: "recorded debt × rate ÷ 100",
      inputs: [
        {
          label: "recorded debt",
          value: `${formatExact(chain.recordedDebt)} ${debtSym}`,
          kind: "chain",
          note: "TroveManager.getLatestTroveData()",
        },
        {
          label: "rate",
          value: `${formatExact(chain.annualInterestRatePct)}%`,
          kind: "chain",
          note: "TroveManager.getLatestTroveData()",
        },
      ],
    };
    right.push({
      id: "costs",
      label: "Costs per year",
      value: amount(
        <Prov info={costsProv} value={formatExact(annualCost)}>
          ~{formatPrice(annualCost)}
        </Prov>,
        debtSym,
      ),
    });
  }

  if (chain.entireDebt > 0 && chain.icr != null && chain.priceUsd != null) {
    const room = Math.max(0, (chain.entireColl * chain.priceUsd) / chain.mcr - chain.entireDebt);
    const roomProv: Provenance = {
      kind: "derived",
      summary: `Room to borrow — the further ${debtSym} debt this Trove could carry before its collateral ratio reaches the ${chain.symbol} branch's ${pct(chain.mcr)} minimum (MCR), at today's price: the collateral's worth divided by the minimum, less the debt.`,
      formula: "collateral × price ÷ MCR − debt",
      inputs: [
        {
          label: "collateral",
          value: `${formatExact(chain.entireColl)} ${chain.symbol}`,
          kind: "chain",
          pclass: "state",
        },
        { label: "price", value: `$${formatExact(chain.priceUsd)}`, kind: "chain", pclass: "oracle" },
        { label: "MCR", value: pct(chain.mcr), kind: "chain", pclass: "indexed", note: "branch constant" },
        { label: "debt", value: `${formatExact(chain.entireDebt)} ${debtSym}`, kind: "chain", pclass: "state" },
      ],
    };
    right.push({
      id: "room-to-borrow",
      label: "Room to borrow",
      tip: `How much more ${debtSym} this Trove could borrow before its collateral ratio falls to the branch's ${pct(chain.mcr)} minimum, at today's price. Below that minimum it can be liquidated.`,
      value: amount(
        <Prov info={roomProv} value={formatExact(room)} symbol={debtSym}>
          {formatApproximate(room)}
        </Prov>,
        debtSym,
      ),
    });
  }

  return [left, right];
}
