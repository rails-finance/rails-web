"use client";

// A Polaris reserve loan on the shared position card: WETH borrowed from the
// reserve against fpETH (rails-ops TO-DO-polaris-scoping.md §8b).
//
// On its page the headlines are the loans manager's getters at head: the
// fpETH collateral (loans(id)), the debt (getLoanDebt(id)) and the cost so
// far (the debt less the WETH borrowed net of repayments). The loan cannot be
// liquidated, so its one safety fact is the collateral at the floor beside
// the debt, both in WETH (C23·polaris). A listing row states the index's
// figures: the collateral, the debt at the stored index, the cost.

import { useState, type ReactNode } from "react";
import { Check, Copy, Image as ImageIcon, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { PanelFigure } from "@/components/shared/position-card-panel";
import { Prov } from "@/components/shared/provenance";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ListingTag } from "@/components/shared/listing-tag";
import { PositionNameId } from "@/components/shared/position-name-id";
import { positionName, shortPositionId } from "@/lib/shared/position-name";
import { FPETH, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { polarisLoanHref, polarisLoanNftUrl } from "@/lib/polaris/routes";
import { big, type LoanLifetime } from "@/lib/polaris/sp-loan-math";
import { loanAtFloorProv, loanCostProv, loanLiveProv, loanSumProv } from "@/lib/polaris/sp-loan-provenance";
import type { PolarisLoanRow } from "@/lib/sources/api/polaris-sp-loans";
import { RawFigure, tokenIcon } from "./polaris-sp-loan-parts";

const NOUN = "Loan";

/** The live figures the page lays over the index. */
export interface PolarisLoanNow {
  coll: bigint;
  debt: bigint;
  cost: bigint;
  atFloor: bigint;
}

export interface PolarisLoanCardProps {
  row: PolarisLoanRow;
  surface?: "listing" | "detail";
  lifetime?: LoanLifetime | null;
  now?: PolarisLoanNow | null;
  pending?: boolean;
  explanation?: ReactNode;
}

function LoanMenuRows({ row }: { row: PolarisLoanRow }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <>
      <ToolsMenuItem
        icon={copied === "id" ? <Check size={16} /> : <Copy size={16} />}
        title={`${NOUN} ${shortPositionId(row.loan_id)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the loan number"}
        onClick={() => copy("id", row.loan_id)}
      />
      <ToolsMenuItem
        icon={<ImageIcon size={16} />}
        title="Loan NFT"
        subtitle="Open it on Etherscan"
        onClick={() => window.open(polarisLoanNftUrl(row.loan_id), "_blank", "noopener")}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this loan"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${polarisLoanHref(row.loan_id)}`)}
      />
    </>
  );
}

const W = POLARIS_WETH;
const F = FPETH;

export function polarisLoanSlots({
  row,
  surface = "detail",
  lifetime,
  now,
  pending = false,
  explanation,
}: PolarisLoanCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const closed = row.status === "closed";
  const name = positionName({ noun: "Reserve loan", id: row.loan_id });
  const counters = {
    lastActivityAt: Number(row.last_timestamp),
    eventCount: row.tx_count,
    liquidationCount: null,
    ...(detail ? { order: "age-last" as const } : {}),
  };
  const status = closed ? { word: "Closed", tone: "muted" as const } : null;

  if (!detail) {
    const coll = big(row.coll_raw);
    const debt = big(row.debt_at_index_raw);
    const cost = big(row.cost_raw);
    const heads: PositionCardHead[] = closed
      ? [
          {
            id: "cost",
            label: "Cost",
            value: <RawFigure raw={cost} symbol={W.symbol} />,
            assets: tokenIcon(W.symbol, W.address, cost),
          },
        ]
      : [
          {
            id: "collateral",
            label: "Collateral",
            value: <RawFigure raw={coll} symbol={F.symbol} />,
            assets: tokenIcon(F.symbol, F.address, coll),
          },
          {
            id: "debt",
            label: "Debt",
            labelTip: "At the last fee index. The fees accrued since are left out.",
            labelTipOnListing: true,
            value: <RawFigure raw={debt} symbol={W.symbol} approx />,
            assets: tokenIcon(W.symbol, W.address, debt),
          },
          {
            id: "cost",
            label: "Cost so far",
            value: <RawFigure raw={cost} symbol={W.symbol} approx />,
            assets: tokenIcon(W.symbol, W.address, cost),
          },
        ];
    return {
      surface: "listing",
      status,
      heads,
      identity: row.holder ? <WalletPill wallet={row.holder} ensName={null} filterProtocol="polaris" bookmark /> : null,
      counters,
      name,
      menu: null,
      tag: <ListingTag market="Reserve loan" id={row.loan_id} />,
    };
  }

  const identity = (
    <span className="flex items-center gap-2">
      <PositionNameId name={name} />
    </span>
  );
  const menu = { leading: () => <LoanMenuRows row={row} />, noun: "loan", exports: null };
  const explainer = { body: explanation ?? null };

  if (closed) {
    const l = lifetime;
    return {
      surface: "detail",
      status,
      heads: [
        {
          id: "borrowed",
          label: "Borrowed",
          labelIcon: tokenIcon(W.symbol, W.address, l?.borrowed ?? BigInt(0), 16),
          value: l ? (
            <Prov info={loanSumProv("borrowed")}>
              <span className="text-rb-500">
                <RawFigure raw={l.borrowed} symbol={W.symbol} />
              </span>
            </Prov>
          ) : null,
        },
        {
          id: "collateral-deposited",
          label: "Collateral deposited",
          labelIcon: tokenIcon(F.symbol, F.address, l?.collDeposited ?? BigInt(0), 16),
          value: l ? (
            <Prov info={loanSumProv("collDeposited")}>
              <span className="text-rb-500">
                <RawFigure raw={l.collDeposited} symbol={F.symbol} />
              </span>
            </Prov>
          ) : null,
        },
      ],
      identity,
      counters,
      name,
      explainer,
      learnMore: null,
      menu,
      outcome: {
        word: "Closed",
        dates: [{ at: Number(row.last_timestamp) }],
        extra: l
          ? {
              label: "Cost",
              value: (
                <Prov info={loanSumProv("fees")}>
                  <RawFigure raw={l.feesAtLegs} symbol={W.symbol} />
                </Prov>
              ),
            }
          : undefined,
      },
    };
  }

  const heads: PositionCardHead[] = [
    {
      id: "collateral",
      label: "Collateral",
      value: now ? (
        <Prov info={loanLiveProv("coll")}>
          <RawFigure raw={now.coll} symbol={F.symbol} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon(F.symbol, F.address, now.coll) : undefined,
    },
    {
      id: "debt",
      label: "Debt",
      value: now ? (
        <Prov info={loanLiveProv("debt")}>
          <RawFigure raw={now.debt} symbol={W.symbol} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon(W.symbol, W.address, now.debt) : undefined,
    },
    {
      id: "cost",
      label: "Cost so far",
      labelTip:
        "The fees the loan has been charged since it opened: the debt less the WETH borrowed net of repayments.",
      value: now ? (
        <Prov info={loanCostProv()}>
          <RawFigure raw={now.cost} symbol={W.symbol} />
        </Prov>
      ) : null,
      pending: now == null && pending,
      assets: now ? tokenIcon(W.symbol, W.address, now.cost) : undefined,
    },
  ];

  const left: PositionPanelRow[] = [];
  if (now)
    left.push({
      id: "at-floor",
      label: "Collateral at the floor",
      asset: { symbol: W.symbol, address: W.address },
      tip: `The ${F.symbol} valued at the bonding curve's floor price, which the protocol only raises. The loans manager has no liquidation.`,
      value: (
        <span data-anatomy="C23·polaris" data-floor-line="">
          <PanelFigure>
            <Prov info={loanAtFloorProv()}>
              <RawFigure raw={now.atFloor} symbol={W.symbol} />
            </Prov>
          </PanelFigure>{" "}
          against{" "}
          <PanelFigure>
            <Prov info={loanLiveProv("debt")} echo>
              <RawFigure raw={now.debt} symbol={W.symbol} />
            </Prov>
          </PanelFigure>{" "}
          debt
        </span>
      ),
    });

  return {
    surface: "detail",
    status,
    heads,
    identity,
    counters,
    name,
    explainer,
    learnMore: null,
    menu,
    panel: [left, []],
  };
}

export function PolarisLoanCard(props: PolarisLoanCardProps) {
  return <PositionCard slots={polarisLoanSlots(props)} />;
}
